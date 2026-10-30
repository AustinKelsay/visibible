/**
 * The regression suite's runner (ADR 0011): the request path's own assembly, check and retry over the suite's cases,
 * with every paid call reserved and ledgered first. It replaces the per-measurement runners copied into release
 * folders. The command (scripts/evals/suite.mts) supplies the snapshot, providers and files; this module only runs.
 *
 * - **Text tier:** each case's section look, scene plan and review are prepared fresh in memory (owner spend in
 *   production) and recorded with the packet the image would have used. No image is made.
 * - **Image tier:** each case is rendered in each of its work's image styles, the first image checked and a faulty one
 *   retried once, as readers get them. Looks and plans come from a text run, so the plans scored there are the plans
 *   drawn here; a case whose plan would change refuses rather than silently re-planning.
 */
import type { SuiteCase, SuiteTier } from "./suite";
import type { EvalImageProvider } from "./runner";
import { assembleRendering, type AssembleDeps, type ReferenceRecord } from "../engine/assemble";
import { createMemoryPreparationStore, type MemoryRecordInput } from "../engine/memory-store";
import type { AnalysisRecord } from "../engine/preparation";
import { checkAndRetry, checkScene, SOFT_EDGE_STYLES, type SceneChecker, type SceneCheckResult } from "../engine/scene-check";
import type { WorkInputs } from "../engine/work-inputs";
import type { TextModel } from "../reading-pass/model";
import { extractOpenRouterUsageUsd } from "../image-response";
import { imageCapabilities, type ImageResolution } from "../image-catalog";

export type CallKind = "text" | "image" | "check";
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type LedgerCall = { phase: string; kind: CallKind; status: string; measuredUsd: number | null };
export type LedgerState = {
  capUsd: number; calls: LedgerCall[]; measuredUsd: number; uncertainUsd: number;
  counts: Record<CallKind, number>; blocked: string | null;
};

/** Replace inline images and long opaque fields with their hashes, and the key with a marker, before anything is logged. */
export function scrubForLog(value: unknown, secret: string, hash: (text: string) => string, inOpaque = false): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[data url sha256 ${hash(value)} chars ${value.length}]`;
    if (inOpaque && value.length > 1000) return `[opaque sha256 ${hash(value)} chars ${value.length}]`;
    return secret ? value.replaceAll(secret, "[redacted]") : value;
  }
  if (Array.isArray(value)) return value.map((v) => scrubForLog(v, secret, hash, inOpaque));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "user_id").map(([k, v]) => [k, scrubForLog(v, secret, hash, inOpaque || k === "reasoning_details")]));
  }
  return value;
}

/** A model's catalog prices (USD per token) and its largest output, from OpenRouter's model list. */
export type ModelPricing = { prompt: number; completion: number; imageOutput: number | null; maxCompletionTokens: number | null; overrides: Array<{ minPromptTokens: number; prompt: number; completion: number }> };

/** A catalog price as a finite, nonnegative number, or null unless it is a number or a numeric string ("0.0000001"). */
const price = (value: unknown): number | null => {
  const n = typeof value === "number" ? value
    : typeof value === "string" && /^\d+(\.\d+)?(e[-+]?\d+)?$/i.test(value) ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** One model's pricing from an OpenRouter `/models` entry; undefined unless its prompt and completion rates (and any override's) are valid. */
export function modelPricing(entry: { pricing?: Record<string, unknown>; top_provider?: { max_completion_tokens?: number | null } } | undefined): ModelPricing | undefined {
  if (!entry?.pricing) return undefined;
  const [prompt, completion] = [price(entry.pricing.prompt), price(entry.pricing.completion)];
  if (prompt === null || completion === null) return undefined;
  const overrides: ModelPricing["overrides"] = [];
  for (const o of Array.isArray(entry.pricing.overrides) ? entry.pricing.overrides as Array<Record<string, unknown>> : []) {
    const [minPromptTokens, p, c] = [price(o.min_prompt_tokens), price(o.prompt), price(o.completion)];
    if (minPromptTokens === null || p === null || c === null) return undefined;
    overrides.push({ minPromptTokens, prompt: p, completion: c });
  }
  const max = entry.top_provider?.max_completion_tokens;
  return { prompt, completion, imageOutput: price(entry.pricing.image_output), maxCompletionTokens: typeof max === "number" && Number.isFinite(max) && max > 0 ? max : null, overrides };
}

/** Tokens an attached image may count for, above any provider's default media resolution. */
const IMAGE_INPUT_TOKEN_BOUND = 5000;

/**
 * The most one request can cost at catalog prices, or null when it cannot be bounded: every character of its text as a
 * token, every attached image at a generous token count, its `max_tokens` (or the model's largest output) as text
 * output, and for an image call the output image tokens at the requested resolution at the model's image price. The
 * ledger reserves this before the call, so the cap holds even when every call in flight costs its most.
 */
export function requestCeilingUsd(kind: CallKind, request: { model?: unknown; messages?: unknown; max_tokens?: unknown; image_config?: { image_size?: unknown } }, pricing: ModelPricing | undefined): number | null {
  if (!pricing || typeof request.model !== "string") return null;
  const text = JSON.stringify(request.messages ?? []);
  const images = (text.match(/data:image\//g) ?? []).length;
  const promptTokens = text.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, "").length + images * IMAGE_INPUT_TOKEN_BOUND;
  const completionTokens = typeof request.max_tokens === "number" && Number.isFinite(request.max_tokens) && request.max_tokens > 0 ? request.max_tokens : pricing.maxCompletionTokens;
  if (completionTokens === null) return null;
  let imageCost = 0;
  if (kind === "image") {
    const resolution = (typeof request.image_config?.image_size === "string" ? request.image_config.image_size : "1K") as ImageResolution;
    const tokens = imageCapabilities(request.model)?.outputTokens[resolution];
    if (!tokens || pricing.imageOutput === null) return null;
    imageCost = tokens * pricing.imageOutput;
  }
  // A long prompt may switch to a dearer override; take the dearest price that could apply.
  const rates = [pricing, ...pricing.overrides.filter((o) => promptTokens >= o.minPromptTokens)];
  const ceiling = promptTokens * Math.max(...rates.map((r) => r.prompt)) + completionTokens * Math.max(...rates.map((r) => r.completion)) + imageCost;
  return Number.isFinite(ceiling) && ceiling >= 0 ? ceiling : null;
}

/**
 * One ledger for every paid call: each call reserves its estimate before it is sent and settles from the provider's
 * reported usage. A call that would pass the cap or a kind's limit is refused, and missing usage, a provider error or
 * an exception blocks every later call, so spend can never silently exceed the owner's grant.
 */
export function createLedger(options: {
  capUsd: number; reserves: Record<CallKind, number>; limits: Record<CallKind, number>; fetch: FetchLike;
  /** The most this request can cost (see requestCeilingUsd), reserved instead of the kind's fixed estimate; null refuses it. */
  ceiling?: (kind: CallKind, request: Record<string, unknown>) => number | null;
  /** Called after every change, so the state on disk is never behind the calls made. */
  save: (state: LedgerState) => void;
  /** One provider exchange, already scrubbed. */
  log: (entry: Record<string, unknown>) => void;
  scrub: (value: unknown) => unknown;
  url?: string;
}) {
  const url = options.url ?? "https://openrouter.ai/api/v1/chat/completions";
  const state: LedgerState = { capUsd: options.capUsd, calls: [], measuredUsd: 0, uncertainUsd: 0, counts: { text: 0, image: 0, check: 0 }, blocked: null };
  const save = () => options.save(state);
  save();
  const fetchFor = (kind: CallKind, phase: () => string): FetchLike => async (target, init) => {
    if (target !== url) throw new Error(`Unexpected provider URL: ${target}`);
    if (state.blocked) throw new Error(`Evaluation stopped: ${state.blocked}`);
    let request: Record<string, unknown> = {};
    try { request = JSON.parse(String(init.body)); } catch { /* an unreadable body has no ceiling */ }
    const reserve = options.ceiling ? options.ceiling(kind, request) : options.reserves[kind];
    if (reserve === null || !Number.isFinite(reserve) || reserve < 0) {
      state.blocked = `No price ceiling for ${String(request.model)}`; save();
      throw new Error(`Evaluation stopped: ${state.blocked}`);
    }
    if (state.measuredUsd + state.uncertainUsd + reserve > options.capUsd || state.counts[kind] >= options.limits[kind]) {
      state.blocked = "Evaluation cap or call limit reached"; save();
      throw new Error(`Evaluation stopped: ${state.blocked}`);
    }
    const call: LedgerCall = { phase: phase(), kind, status: "in-flight", measuredUsd: null };
    state.calls.push(call); state.uncertainUsd += reserve; state.counts[kind]++;
    save();
    try {
      const response = await options.fetch(target, init);
      const body = await response.clone().text();
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(body); } catch { /* a non-JSON body is a provider error below */ }
      // A moderation refusal is that call's failure, as in production, not the run's: the provider charges nothing for it.
      const moderated = response.status === 403 && /moderation|flagged/i.test(JSON.stringify(payload.error ?? ""));
      const cost = moderated ? 0 : extractOpenRouterUsageUsd(payload);
      options.log({ ...call, at: new Date().toISOString(), reservedUsd: reserve, request: options.scrub(Object.keys(request).length ? request : String(init.body).slice(0, 300)),
        status: response.status, response: options.scrub(payload), nonJson: Object.keys(payload).length ? undefined : body.slice(0, 300), measuredUsageUsd: cost });
      call.status = String(response.status); call.measuredUsd = cost;
      if (cost === null) state.blocked = "Missing provider usage";
      // Rounded to a billionth of a dollar, so repeated reservations never leave float residue.
      else { state.uncertainUsd = Math.round((state.uncertainUsd - reserve) * 1e9) / 1e9; state.measuredUsd = Math.round((state.measuredUsd + cost) * 1e9) / 1e9; }
      if (!response.ok && !moderated) state.blocked = `Provider error ${response.status}`;
      else if (cost !== null && options.ceiling && cost > reserve + 1e-9) state.blocked = `A call cost $${cost} against its $${reserve} ceiling`;
      else if (state.measuredUsd > options.capUsd) state.blocked = "Evaluation cap exceeded";
      save();
      return response;
    } catch (error) {
      state.blocked ??= error instanceof Error ? error.message : String(error);
      call.status = "uncertain"; save();
      throw error;
    }
  };
  return { state, fetchFor };
}

/** One work's frozen inputs for a run. */
export type SuiteWork = {
  inputs: WorkInputs;
  /** The work's analysis records from the run's snapshot: sections, moments and canon entries, no looks or plans. */
  records: MemoryRecordInput[];
  /** Looks and plans a text run stored, with their inputs; the image tier draws these instead of re-planning. */
  seeded?: AnalysisRecord[];
  getReference: (kind: "sheet" | "styleReference", recordId: string) => Promise<ReferenceRecord | null>;
  loadReference: (storageId: string) => Promise<Uint8Array>;
};

export type GeneratedImage = Awaited<ReturnType<EvalImageProvider["generate"]>>;
export type SavedAttempt = { file: string; sha256: string };

/** Providers whose calls the ledger labels with `phase()`: the case and style being run. */
export type SuiteProviders = { text: TextModel; image?: EvalImageProvider; checker?: SceneChecker };

export type SuiteRunOptions = {
  tier: SuiteTier;
  cases: readonly SuiteCase[];
  works: ReadonlyMap<string, SuiteWork>;
  /** Made once per case, so concurrent cases label their own calls. */
  providers: (phase: () => string) => SuiteProviders;
  image?: { model: string; resolution: string; checkTimeoutMs?: number };
  aspectRatio: "16:9" | "21:9" | "3:2";
  /** Cases at once within a work. The engine shares in-flight preparation across a process, so works run one at a time. */
  concurrency?: number;
  /** Why the run must stop, if it must: the ledger's block. */
  blocked: () => string | null;
  record: (row: Record<string, unknown>) => void;
  saveImage?: (key: string, attempt: number, image: GeneratedImage) => SavedAttempt;
  log?: (line: string) => void;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, what: string) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timeout`)), ms))]);

/** Run every case of the tier. Rows record each case (text) or each case and style (image); nothing throws past a case. */
export async function runSuite(options: SuiteRunOptions): Promise<void> {
  const log = options.log ?? (() => {});
  const memories = new Map<string, ReturnType<typeof createMemoryPreparationStore>>();
  for (const [workId, work] of options.works) {
    if (!options.cases.some((c) => c.work === workId)) continue;
    const memory = createMemoryPreparationStore(work.records);
    // Seeded looks and plans go in through the store's own write, so their recorded inputs stay current.
    for (const r of work.seeded ?? []) {
      if (r.kind !== "look" && r.kind !== "plan") throw new Error(`Only looks and plans can be seeded, not ${r.kind}`);
      // An owner record is already in the snapshot; rewriting it would make it a generated one and change its policy.
      if (r.source === "owner") continue;
      await memory.store.putDerivedRecord({ kind: r.kind, recordId: r.recordId, payload: r.payload as never, inputs: r.inputs });
    }
    memories.set(workId, memory);
  }
  // Every work's holdout cases before any dev case, so a run stopped by its cap loses dev cases before any the gate
  // reads. Each work keeps one store across both passes.
  for (const split of ["holdout", "dev"] as const) {
    for (const [workId, memory] of memories) {
      const work = options.works.get(workId)!;
      const queue = options.cases.filter((c) => c.work === workId && c.split === split);
      await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 3) }, async () => {
        for (let c = queue.shift(); c; c = queue.shift()) {
          if (options.blocked()) return;
          try { await runCase(options, workId, work, memory, c, log); }
          catch (error) { options.record({ key: `${c.caseId}/*`, tier: options.tier, case: c.unitId, caseId: c.caseId, work: workId, split: c.split, outcome: "error", message: String(error).slice(0, 400) }); }
        }
      }));
    }
  }
}

async function runCase(options: SuiteRunOptions, workId: string, work: SuiteWork, memory: ReturnType<typeof createMemoryPreparationStore>, c: SuiteCase, log: (line: string) => void) {
  const base = { tier: options.tier, case: c.unitId, caseId: c.caseId, work: workId, split: c.split };
  let textCalls = 0;
  let phase = c.caseId;
  const providers = options.providers(() => phase);
  const seeded = Boolean(work.seeded?.length);
  // A seeded image run allows no text call, so one here fails the case locally instead of tripping the ledger's
  // call limit, which would stop every other case.
  const drawsSeeds = seeded && options.tier === "image";
  const model: TextModel = { id: providers.text.id, complete: (request) => {
    textCalls++;
    return drawsSeeds ? Promise.reject(new Error("A seeded image run makes no text call")) : providers.text.complete(request);
  } };
  const styles = options.tier === "text" ? [c.styles[0]] : c.styles;
  for (const [index, style] of styles.entries()) {
    if (options.blocked()) return;
    const key = options.tier === "text" ? `${c.caseId}/text` : `${c.caseId}/${style}`;
    phase = key;
    textCalls = 0;
    const skipped: string[] = [];
    const deps: AssembleDeps = {
      inputs: work.inputs, store: memory.store, model, listMoments: memory.listMoments,
      getReference: work.getReference, loadReference: work.loadReference,
      onReferenceSkipped: (kind, id, why) => skipped.push(`${kind}:${id}:${why}`),
    };
    const started = Date.now();
    const assembled = await assembleRendering(deps, { workId, unitId: c.unitId, styleId: style, variationNumber: null, aspectRatio: options.aspectRatio });
    // Spend is labelled per case in the provider log; the shared in-memory ledger cannot attribute it under concurrency.
    const common = { ...base, key, style: options.tier === "image" ? style : null, textCalls, skippedReferences: skipped,
      context: assembled.ok ? assembled.context : null };
    // A refusal on the first style comes from the moment's shared look or plan, so it stands for every style; a later
    // one (a style's prompt over budget) stands for that style only.
    const standsFor = options.tier === "image" ? (index === 0 ? [...styles] : [style]) : null;
    // A seeded image run must draw the text run's plans; a call here means its inputs moved since that run.
    if (seeded && textCalls > 0) {
      options.record({ ...common, standsFor, outcome: "refused", stage: "seed", message: "The text run's look or plan was stale for this checkout, so the case was refused without re-planning; its images were not made.", elapsedMs: Date.now() - started });
      return;
    }
    if (!assembled.ok) {
      options.record({ ...common, standsFor, outcome: "refused", stage: "assemble", reason: assembled.reason, message: assembled.message, elapsedMs: Date.now() - started });
      if (index === 0) return;
      continue;
    }
    if (options.tier === "image" && index > 0 && textCalls > 0) throw new Error(`${key}: a prepared case called the text model again`);
    const prepared = { look: assembled.prepared.look.payload, situation: assembled.prepared.situation, plan: assembled.prepared.plan.payload, present: assembled.prepared.present };
    const references = assembled.references.map((r) => ({ kind: r.kind, storageId: r.storageId, version: r.version, caption: r.caption }));
    if (options.tier === "text") {
      const [look, plan] = await Promise.all([memory.store.getActiveRecord("look", assembled.sectionId), memory.store.getActiveRecord("plan", assembled.momentId)]);
      options.record({ ...common, outcome: "planned", momentId: assembled.momentId, sectionId: assembled.sectionId, prepared, records: { look, plan },
        promptChars: assembled.prompt.length, references, elapsedMs: Date.now() - started });
      log(JSON.stringify({ key, outcome: "planned", textCalls }));
      return;
    }
    const image = options.image!;
    const [provider, checker] = [providers.image!, providers.checker!];
    const generate = (n: number) => provider.generate({ label: `${key}#${n}`, prompt: assembled.prompt, model: image.model, aspectRatio: options.aspectRatio, resolution: image.resolution,
      references: assembled.sentReferences.map((r) => ({ bytes: r.bytes, mimeType: "image/jpeg" })) });
    const imageRow = { ...common, momentId: assembled.momentId, sectionId: assembled.sectionId, prepared, prompt: assembled.prompt, references };
    let first: GeneratedImage;
    try { first = await generate(1); }
    catch (error) { options.record({ ...imageRow, outcome: "failed", stage: "image", message: String(error).slice(0, 400), elapsedMs: Date.now() - started }); continue; }
    const checkContext = { people: assembled.canon.filter((x) => x.hasForm && x.kind === "character" && x.depiction !== "symbol").map((x) => x.name),
      description: `${assembled.prepared.plan.payload.primarySubject}; ${assembled.prepared.plan.payload.secondaryElements}`,
      softEdges: SOFT_EDGE_STYLES.includes(style), depiction: work.inputs.depiction };
    const checked = await checkAndRetry(first, {
      check: (img, n): Promise<SceneCheckResult> => withTimeout(checkScene(checker, { bytes: img.bytes, mimeType: img.mimeType }, checkContext, `${key}:${n}`), image.checkTimeoutMs ?? 30_000, "Scene check"),
      retry: () => generate(2),
    });
    const attempts = checked.attempts.map((a, i) => ({ n: i + 1, ...options.saveImage!(key, i + 1, a.image), bytes: a.image.bytes.length, mimeType: a.image.mimeType,
      costUsd: a.image.costUsd, elapsedMs: a.image.elapsedMs, providerRequestId: a.image.providerRequestId ?? null, check: a.check, checkError: a.checkError }));
    options.record({ ...imageRow, outcome: "image", checkContext: { people: checkContext.people, description: checkContext.description, softEdges: checkContext.softEdges },
      attempts, chosen: checked.chosen + 1, retryError: checked.retryError, elapsedMs: Date.now() - started });
    log(JSON.stringify({ key, attempts: attempts.length, faults: attempts.map((a) => a.check?.faults ?? a.checkError), chosen: checked.chosen + 1 }));
  }
}
