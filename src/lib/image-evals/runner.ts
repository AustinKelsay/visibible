/**
 * The image evaluation runner (#98, S10): fixed cases × arms × repeats through the production
 * prompt builders with injectable providers, a hard provider-spend budget checked before every
 * paid call, a resumable state file so an interrupted run never repeats a completed sample, and
 * missing usage recorded as such (an estimate is charged to the budget, never silently zero).
 * Dry runs produce the costed manifest without any call.
 */
import { buildImagePrompt, buildScenePlannerPrompt, extractJsonObject, normalizeScenePlan, PROMPT_VERSION, STYLE_PROFILES, type ScenePlan } from "../image-prompts";
import type { ImageAspectRatio, ImageResolution } from "../image-models";
import { armsFor, caseUnitId, caseWork, type EvalArm, type EvalCase } from "./cases";
import { assembleForEval, genericStyleOf, isGenericArm, type GenericEvalProvider } from "./generic";
import type { RenderingPacket } from "../engine/prompt";

export type EvalPassage = {
  reference: string;
  verseText: string;
  prevVerse: { number: number; text: string; reference?: string } | null;
  nextVerse: { number: number; text: string; reference?: string } | null;
  chapterTheme: { setting: string; palette: string; elements: string; style: string } | null;
};

export interface EvalImageProvider {
  readonly id: string;
  generate(request: { label: string; prompt: string; model: string; aspectRatio: string; resolution: string; /** Reference images attached after the prompt, in order (generic arms). */ references?: Array<{ bytes: Uint8Array; mimeType: string }> }): Promise<{ bytes: Uint8Array; mimeType: string; costUsd: number | null; elapsedMs: number; providerRequestId?: string | null }>;
}
export interface EvalPlannerProvider {
  readonly id: string;
  plan(request: { label: string; prompt: string }): Promise<{ content: string | null; costUsd: number | null; elapsedMs: number }>;
}
/** Keep the HTTP status so funding failures never depend on matching provider error text. */
export class EvalProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "EvalProviderError";
  }
}
export interface EvalOutputSink {
  /** Store the bytes and return the stable reference (a path or URL) the report will cite. */
  save(key: string, bytes: Uint8Array, mimeType: string): Promise<string>;
}
export type EvalProviders = {
  resolvePassage: (reference: string, translation: string) => Promise<EvalPassage | null>;
  image: EvalImageProvider;
  planner: EvalPlannerProvider | null;
  /** The generic engine's inputs, analysis and text model; required for generic arms. */
  generic?: GenericEvalProvider | null;
  sink: EvalOutputSink;
};

export type EvalSample = {
  caseId: string;
  arm: EvalArm;
  n: number;
  status: "completed" | "failed";
  stage?: "passage" | "planner" | "assemble" | "quote" | "image" | "store";
  error?: string;
  engine: "legacy" | "generic";
  model: string;
  settings: { aspectRatio: string; resolution: string; translation: string; style: string };
  /** Generic arms: the work and unit rendered, whether the look and plan already existed, the exact packet, and the quote against usage. */
  work?: string;
  unitId?: string;
  momentId?: string;
  prepared?: boolean;
  preparationCalls?: number;
  preparationCostUsd?: number;
  /** Preparation spend of earlier failed attempts at this sample, kept so the preparation breakdown matches the ledger after a retry. */
  priorPreparationCostUsd?: number;
  preparationUsageMissing?: boolean;
  packet?: RenderingPacket;
  referencesSent?: number;
  omitStyleReference?: boolean;
  quote?: { credits: number; providerUsd: number; promptTokens: number; referenceImages: number } | null;
  /** Reported usage minus the quoted provider cost; absent when usage was missing or the quote unpriced. */
  varianceUsd?: number;
  promptVersion: string;
  prompt?: string;
  promptChars?: number;
  scenePlan?: ScenePlan | null;
  plannerOutcome?: "planned" | "invalid" | "failed" | "empty" | "not_used";
  plannerCostUsd: number;
  imageCostUsd: number;
  /** The provider reported no usage; the estimate was charged to the budget instead. */
  usageMissing: boolean;
  /** Spend of earlier failed attempts at this sample, kept so report totals still match the ledger after a retry. */
  priorCostUsd?: number;
  latencyMs: { planner: number; image: number; total: number };
  output?: string;
  providerRequestId?: string | null;
  startedAt: number;
};

export type EvalRunState = {
  schemaVersion: 1;
  run: string;
  createdAt: number;
  imageModel: string;
  plannerModel: string | null;
  promptVersion: string;
  samples: Record<string, EvalSample>;
  /** Missing in historical runs means normal reference selection. Immutable once configured or attempted. */
  omitStyleReference?: boolean;
  spentUsd: number;
  stopped?: { reason: "budget_exhausted" | "provider_funding" | "cancelled"; at: number; detail: string };
};

export type EvalManifestEntry = { key: string; caseId: string; reference: string; arm: EvalArm; n: number; estimatedUsd: number; status: "planned" | "done" };
export type EvalManifest = { entries: EvalManifestEntry[]; plannedCalls: number; doneCalls: number; estimatedUsd: number; budgetUsd: number; withinBudget: boolean; omitStyleReference?: boolean };

export type RunImageEvalOptions = {
  cases: readonly EvalCase[];
  arms: readonly EvalArm[];
  repeats: number;
  budgetUsd: number;
  /** What one call is assumed to cost before usage is known, and what a missing usage is charged as. */
  estimateUsd: { image: number; planner: number; /** One look or plan call; charged when a generic sample has to prepare. */ preparation?: number };
  dryRun?: boolean;
  /** Generic evaluation only; production callers retain normal reference selection. */
  omitStyleReference?: boolean;
  providers: EvalProviders;
  state: EvalRunState;
  saveState: (state: EvalRunState) => Promise<void>;
  log?: (line: string) => void;
  now?: () => number;
};

export function sampleKey(caseId: string, arm: EvalArm, n: number) {
  return `${caseId}/${arm}/${n}`;
}

export function emptyEvalState(run: string, imageModel: string, plannerModel: string | null, now = Date.now()): EvalRunState {
  return { schemaVersion: 1, run, createdAt: now, imageModel, plannerModel, promptVersion: PROMPT_VERSION, samples: {}, spentUsd: 0 };
}

/** A new trial needs a new run: never mix controls with completed or failed paid samples. */
export function bindStyleReferenceControl(state: EvalRunState, omitStyleReference: boolean) {
  const configured = state.omitStyleReference !== undefined || Object.keys(state.samples).length > 0 || state.spentUsd > 0;
  if (configured && (state.omitStyleReference ?? false) !== omitStyleReference) {
    throw new Error(`Run "${state.run}" uses ${state.omitStyleReference ? "omitted" : "normal"} style references; use a new --run to change --omit-style-reference`);
  }
  state.omitStyleReference = omitStyleReference;
}

/** Every sample the run still owes, with the cost assumed for it, and what has already been done. */
export function buildManifest(options: Pick<RunImageEvalOptions, "cases" | "arms" | "repeats" | "budgetUsd" | "estimateUsd" | "state">): EvalManifest {
  const entries: EvalManifestEntry[] = [];
  for (const c of options.cases) {
    for (const arm of armsFor(c, options.arms)) {
      for (let n = 1; n <= options.repeats; n++) {
        const key = sampleKey(c.id, arm, n);
        // Only a completed sample is done; a rerun retries failed ones (transient provider, passage or store errors).
        const done = options.state.samples[key]?.status === "completed";
        // A generic sample may have to prepare its look and plan (two owner-funded calls) before the image.
        const estimatedUsd = options.estimateUsd.image + (arm === "planner" ? options.estimateUsd.planner : 0) + (arm.startsWith("generic:") ? 2 * (options.estimateUsd.preparation ?? 0) : 0);
        entries.push({ key, caseId: c.id, reference: c.reference, arm, n, estimatedUsd: done ? 0 : estimatedUsd, status: done ? "done" : "planned" });
      }
    }
  }
  const planned = entries.filter((e) => e.status === "planned");
  const estimatedUsd = planned.reduce((sum, e) => sum + e.estimatedUsd, 0);
  return { entries, plannedCalls: planned.length, doneCalls: entries.length - planned.length, estimatedUsd, budgetUsd: options.budgetUsd, withinBudget: options.state.spentUsd + estimatedUsd <= options.budgetUsd, omitStyleReference: options.state.omitStyleReference };
}

const toVerseId = (reference: string) => reference.toLowerCase().replace(/:/g, "-").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runImageEval(options: RunImageEvalOptions): Promise<{ state: EvalRunState; manifest: EvalManifest }> {
  if (options.omitStyleReference && !options.arms.some(isGenericArm)) throw new Error("--omit-style-reference requires a generic arm");
  bindStyleReferenceControl(options.state, options.omitStyleReference ?? false);
  const { providers, estimateUsd } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});
  const manifest = buildManifest(options);
  if (options.dryRun) return { state: options.state, manifest };
  const state = options.state;
  delete state.stopped;
  const passages = new Map<string, EvalPassage | null>();
  // Persist the stop with the failed sample and its paid work via finish(), before leaving the run.
  const stopForFunding = (error: unknown) => {
    if (!(error instanceof EvalProviderError) || error.status !== 402) return false;
    state.stopped = { reason: "provider_funding", at: now(), detail: message(error) };
    log(`Stopping: ${state.stopped.detail}`);
    return true;
  };

  for (const entry of manifest.entries) {
    if (entry.status === "done") continue;
    const c = options.cases.find((x) => x.id === entry.caseId)!;
    const style = STYLE_PROFILES[c.style ?? "classical"] ?? STYLE_PROFILES.classical;
    const { model, aspectRatio, resolution, translation } = c.resolvedSettings;
    const generic = isGenericArm(entry.arm);
    const estimate = estimateUsd.image + (entry.arm === "planner" && providers.planner ? estimateUsd.planner : 0) + (generic ? 2 * (estimateUsd.preparation ?? 0) : 0);
    if (state.spentUsd + estimate > options.budgetUsd) {
      state.stopped = { reason: "budget_exhausted", at: now(), detail: `spent $${state.spentUsd.toFixed(4)}, next call about $${estimate.toFixed(4)}, budget $${options.budgetUsd.toFixed(2)}` };
      log(`Stopping: ${state.stopped.detail}`);
      await options.saveState(state);
      break;
    }
    const startedAt = now();
    const previous = state.samples[entry.key];
    const priorCostUsd = previous ? previous.imageCostUsd + previous.plannerCostUsd + (previous.priorCostUsd ?? 0) : 0;
    const priorPreparationCostUsd = previous ? (previous.preparationCostUsd ?? 0) + (previous.priorPreparationCostUsd ?? 0) : 0;
    const sample: EvalSample = {
      caseId: c.id, arm: entry.arm, n: entry.n, status: "failed", engine: generic ? "generic" : "legacy", model, promptVersion: PROMPT_VERSION,
      settings: { aspectRatio, resolution, translation, style: generic ? genericStyleOf(entry.arm)! : style.id }, plannerCostUsd: 0, imageCostUsd: 0, usageMissing: false,
      ...(priorCostUsd > 0 ? { priorCostUsd } : {}),
      ...(priorPreparationCostUsd > 0 ? { priorPreparationCostUsd } : {}),
      latencyMs: { planner: 0, image: 0, total: 0 }, startedAt,
    };
    const finish = async (patch: Partial<EvalSample>) => {
      Object.assign(sample, patch);
      sample.latencyMs.total = now() - startedAt;
      state.samples[entry.key] = sample;
      state.spentUsd += sample.plannerCostUsd + sample.imageCostUsd + (sample.preparationCostUsd ?? 0);
      await options.saveState(state);
      log(`${entry.key}: ${sample.status}${sample.error ? ` (${sample.stage}: ${sample.error})` : ""} $${(sample.plannerCostUsd + sample.imageCostUsd + (sample.preparationCostUsd ?? 0)).toFixed(4)}`);
    };

    // Generic arms: the engine's own assembly, then one provider call with the packet's references attached.
    if (generic) {
      if (!providers.generic) { await finish({ status: "failed", stage: "assemble", error: "no generic engine provider configured" }); continue; }
      const styleId = genericStyleOf(entry.arm)!;
      const workId = caseWork(c);
      const unitId = caseUnitId(c);
      sample.work = workId; sample.unitId = unitId; sample.omitStyleReference = options.omitStyleReference ?? false;
      let assembly;
      try {
        const ctx = await providers.generic.context(workId);
        assembly = await assembleForEval(providers.generic, ctx, { workId, unitId, styleId, variationNumber: entry.n > 1 ? entry.n : null, aspectRatio: aspectRatio as "16:9" | "21:9" | "3:2", modelId: model, resolution: resolution as "1K" | "2K" | "4K", preparationEstimateUsd: estimateUsd.preparation ?? 0, omitStyleReference: options.omitStyleReference, now });
      } catch (error) {
        await finish({ status: "failed", stage: "assemble", error: message(error) });
        continue;
      }
      sample.preparationCalls = assembly.preparationCalls; sample.preparationCostUsd = assembly.preparationCostUsd; sample.preparationUsageMissing = assembly.preparationUsageMissing;
      if (!assembly.result.ok) { await finish({ status: "failed", stage: "assemble", error: `${assembly.result.reason}: ${assembly.result.message}` }); continue; }
      // Only an assembled sample is classified: prepared when its look and plan already existed, cold when it had to make them.
      sample.prepared = assembly.preparationCalls === 0;
      const assembled = assembly.result;
      sample.momentId = assembled.momentId; sample.prompt = assembled.prompt; sample.promptChars = assembled.prompt.length; sample.packet = assembled.packet; sample.referencesSent = assembled.sentReferences.length;
      sample.plannerOutcome = "not_used";
      sample.quote = assembly.quote ? { credits: assembly.quote.credits, providerUsd: assembly.quote.providerUsd, promptTokens: assembly.quote.promptTokens, referenceImages: assembly.quote.referenceImages } : null;
      let image: Awaited<ReturnType<EvalImageProvider["generate"]>>;
      try {
        image = await providers.image.generate({ label: entry.key, prompt: assembled.prompt, model, aspectRatio, resolution, references: assembled.sentReferences.map((r) => ({ bytes: r.bytes, mimeType: "image/jpeg" })) });
      } catch (error) {
        const funding = stopForFunding(error);
        await finish({ status: "failed", stage: "image", error: message(error) });
        if (funding) break;
        continue;
      }
      sample.latencyMs.image = image.elapsedMs;
      sample.providerRequestId = image.providerRequestId ?? null;
      if (image.costUsd === null) { sample.usageMissing = true; sample.imageCostUsd = assembly.quote ? assembly.quote.providerUsd : estimateUsd.image; }
      else { sample.imageCostUsd = image.costUsd; if (assembly.quote) sample.varianceUsd = image.costUsd - assembly.quote.providerUsd; }
      try {
        const output = await providers.sink.save(`${c.id}/${entry.arm.replace(":", "-")}-${entry.n}`, image.bytes, image.mimeType);
        await finish({ status: "completed", output, error: undefined });
      } catch (error) {
        await finish({ status: "failed", stage: "store", error: message(error) });
      }
      continue;
    }

    // 1. The canonical passage, from the same resolver the route uses.
    const passageKey = `${translation}:${c.reference}`;
    let passage = passages.get(passageKey);
    if (passage === undefined) {
      try { passage = await providers.resolvePassage(c.reference, translation); }
      catch (error) { passage = null; sample.error = message(error); }
      passages.set(passageKey, passage ?? null);
    }
    if (!passage) { await finish({ status: "failed", stage: "passage", error: sample.error ?? `No single verse for ${c.reference} in ${translation}` }); continue; }

    // 2. The planner arm: ordinary failures continue without a plan; funding rejection stops the run.
    let scenePlan: ScenePlan | null = null;
    let plannerOutcome: EvalSample["plannerOutcome"] = "not_used";
    if (entry.arm === "planner" && providers.planner) {
      const plannerPrompt = buildScenePlannerPrompt({ reference: passage.reference, verseText: passage.verseText, prevVerse: passage.prevVerse, nextVerse: passage.nextVerse, chapterTheme: passage.chapterTheme, styleProfile: style });
      try {
        const result = await providers.planner.plan({ label: `${entry.key}:planner`, prompt: plannerPrompt });
        sample.latencyMs.planner = result.elapsedMs;
        if (result.costUsd === null) { sample.usageMissing = true; sample.plannerCostUsd = estimateUsd.planner; } else sample.plannerCostUsd = result.costUsd;
        if (!result.content) plannerOutcome = "empty";
        else {
          let parsed: unknown = null;
          try { parsed = JSON.parse(extractJsonObject(result.content) || result.content.trim()); } catch { /* invalid plan, not a failed run */ }
          scenePlan = normalizeScenePlan(parsed);
          plannerOutcome = scenePlan ? "planned" : "invalid";
        }
      } catch (error) {
        plannerOutcome = "failed";
        sample.error = `planner: ${message(error)}`;
        if (stopForFunding(error)) {
          await finish({ status: "failed", stage: "planner", plannerOutcome });
          break;
        }
      }
    }

    // 3. The image prompt exactly as the route builds it, then one provider call.
    const { prompt } = buildImagePrompt({
      verseId: toVerseId(passage.reference), translationId: translation, reference: passage.reference, verseText: passage.verseText,
      prevVerse: passage.prevVerse, nextVerse: passage.nextVerse, chapterTheme: passage.chapterTheme, styleProfile: style,
      aspectRatio: aspectRatio as ImageAspectRatio, resolution: resolution as ImageResolution, generationNumber: entry.n > 1 ? entry.n : null,
      scenePlan, scenePlannerUsed: plannerOutcome === "planned", scenePlanFromCache: false,
    });
    sample.prompt = prompt; sample.promptChars = prompt.length; sample.scenePlan = scenePlan; sample.plannerOutcome = plannerOutcome;
    let image: Awaited<ReturnType<EvalImageProvider["generate"]>>;
    try {
      image = await providers.image.generate({ label: entry.key, prompt, model, aspectRatio, resolution });
    } catch (error) {
      const funding = stopForFunding(error);
      await finish({ status: "failed", stage: "image", error: message(error) });
      if (funding) break;
      continue;
    }
    sample.latencyMs.image = image.elapsedMs;
    sample.providerRequestId = image.providerRequestId ?? null;
    if (image.costUsd === null) { sample.usageMissing = true; sample.imageCostUsd = estimateUsd.image; } else sample.imageCostUsd = image.costUsd;
    try {
      const output = await providers.sink.save(`${c.id}/${entry.arm}-${entry.n}`, image.bytes, image.mimeType);
      await finish({ status: "completed", output, error: undefined });
    } catch (error) {
      // The image was paid for: its cost stays on the ledger even though it could not be kept.
      await finish({ status: "failed", stage: "store", error: message(error) });
    }
  }
  return { state, manifest: buildManifest(options) };
}
