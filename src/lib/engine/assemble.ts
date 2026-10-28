/**
 * One moment's rendering, assembled the same way for every caller (#175, #181): the moment and
 * its in-section neighbours from the imported text, the lazy look and plan, the canon stages of
 * the present entries, the current references that load, and the validated packet. The request
 * engine maps the failures to responses; the evaluation harness records them. Nothing here is
 * paid except the owner-funded look and plan.
 */
import { lookPolicy } from "./situation";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import type { TextModel } from "../reading-pass/model";
import type { ArtStyle } from "../work-preparation";
import { prepareMoment, PreparationUnavailableError, type PreparedMoment, type PreparationStore } from "./preparation";
import { buildRenderingPacket, type AvailableReference, type RenderingPacket, type SelectedCanon, type SelectedReference } from "./prompt";
import { momentContext, momentForUnit, type MomentRange, type WorkInputs } from "./work-inputs";
import type { MomentContext } from "./preparation";

export type ActiveRecord = { kind: string; recordId: string; version: string; inputs: Array<{ kind: string; recordId: string; version: string }>; payload: Record<string, unknown> & { kind: string } };
export type ReferenceRecord = { storageId: string; inputs: Array<{ kind: string; recordId: string; version: string }>; fingerprint: string; pinned: boolean };

/** A reference is usable when pinned or when every input the engine knows about matches the current versions. */
export function referenceIsCurrent(reference: ReferenceRecord, required: Array<{ kind: string; recordId: string; version: string }>) {
  return reference.pinned || required.every((r) => reference.inputs.some((i) => i.kind === r.kind && i.recordId === r.recordId && i.version === r.version));
}

export type AssembleDeps = {
  inputs: WorkInputs;
  store: PreparationStore;
  /** Every active moment, for works whose moments span several units; unit-mode works never need it. */
  listMoments: () => Promise<MomentRange[]>;
  getReference: (kind: "sheet" | "styleReference", recordId: string) => Promise<ReferenceRecord | null>;
  /** JPEG bytes of a stored reference blob. */
  loadReference: (storageId: string) => Promise<Uint8Array>;
  model: TextModel;
  now?: () => number;
  onReferenceSkipped?: (kind: string, id: string, reason: "missing" | "stale") => void;
  onReferenceUnavailable?: (kind: string, id: string, error: unknown) => void;
  /** An owner-authored style trial: used instead of the brief's style entry of that id (#181). */
  styleOverride?: { style: ArtStyle; version: string };
  /** Evaluation-only omission after normal reference selection and prompt trimming. */
  omitStyleReference?: boolean;
};

export type AssembleInput = { workId: string; unitId: string; styleId: string; variationNumber: number | null; aspectRatio: "16:9" | "21:9" | "3:2" };

export type AssembleFailure =
  | { ok: false; reason: "style"; message: string }
  | { ok: false; reason: "unit"; message: string }
  | { ok: false; reason: "moment"; message: string }
  | { ok: false; reason: "context"; message: string; error: unknown }
  | { ok: false; reason: "preparation"; message: string; retryable: boolean; stage: "look" | "plan" | null; error: unknown }
  | { ok: false; reason: "packet"; message: string; finalChars: number; momentId: string };
export type AssembleSuccess = {
  ok: true;
  momentId: string;
  sectionId: string;
  context: MomentContext;
  prepared: PreparedMoment;
  canon: SelectedCanon[];
  styleEntry: { style: ArtStyle; version: string };
  prompt: string;
  packet: RenderingPacket;
  references: SelectedReference[];
  /** The bytes actually attached, in packet order. */
  sentReferences: Array<{ storageId: string; bytes: Uint8Array }>;
};

export async function assembleRendering(deps: AssembleDeps, input: AssembleInput): Promise<AssembleSuccess | AssembleFailure> {
  const { inputs, store } = deps;
  const styleEntry = deps.styleOverride && deps.styleOverride.style.id === input.styleId ? deps.styleOverride : inputs.styles[input.styleId];
  if (!styleEntry) return { ok: false, reason: "style", message: `The ${input.styleId} art style is not approved for this work.` };
  const classical = inputs.styles.classical;
  let unit;
  try {
    unit = inputs.work.getUnit(input.unitId);
  } catch {
    return { ok: false, reason: "unit", message: "This passage is not part of the work's reference text." };
  }

  // The moment and section; multi-unit works find the moment holding the unit.
  let moment = await store.getActiveRecord("moment", unit.id);
  if (!moment && inputs.work.momentMode !== "unit") {
    const range = momentForUnit(inputs.work, unit.id, await deps.listMoments());
    moment = range ? await store.getActiveRecord("moment", range.id) : null;
  }
  const section = moment ? await store.getActiveRecord("section", String(moment.payload.sectionId)) : null;
  if (!moment || moment.payload.kind !== "moment" || !section || section.payload.kind !== "section") {
    return { ok: false, reason: "moment", message: "This passage has no moment in the work's analysis." };
  }
  const momentId = moment.recordId;
  const sectionId = section.recordId;
  let context: MomentContext;
  try {
    context = momentContext(inputs.work, { id: momentId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
      { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  } catch (error) {
    return { ok: false, reason: "context", message: "This passage's moment is malformed in the work's analysis.", error };
  }

  // The required look and plan; owner-funded, retryable without any image charge when they fail.
  let prepared: PreparedMoment;
  try {
    prepared = await prepareMoment({ workId: input.workId, momentId, store, model: deps.model, brief: inputs.brief, briefVersion: inputs.briefVersion, context, now: deps.now });
  } catch (error) {
    if (error instanceof PreparationUnavailableError) return { ok: false, reason: "preparation", message: error.message, retryable: true, stage: error.stage, error };
    return { ok: false, reason: "preparation", message: "Scene preparation failed.", retryable: true, stage: null, error };
  }

  // A concurrent section correction can reassign a stage without changing its entry's version.
  const activeSection = await store.getActiveRecord("section", sectionId);
  const assignments = activeSection?.payload.cast as Array<{ entryId: string; stageId: string }> | undefined;
  if (!activeSection || activeSection.payload.kind !== "section" || activeSection.version !== section.version || prepared.sectionId !== sectionId ||
    !assignments || prepared.present.some((present) => !assignments.some((member) => member.entryId === present.entryId && member.stageId === present.stageId))) {
    return { ok: false, reason: "preparation", message: "Preparing scene: section cast changed.", retryable: true, stage: "plan", error: null };
  }

  // The canon stages of the entries the plan marked present.
  const canon: SelectedCanon[] = [];
  for (const present of prepared.present) {
    const entry = await store.getActiveRecord("entry", present.entryId);
    if (!entry || entry.payload.kind !== "entry" || entry.version !== present.version) {
      return { ok: false, reason: "preparation", message: `Preparing scene: canon changed for ${present.entryId}.`, retryable: true, stage: "plan", error: null };
    }
    const payload = entry.payload as unknown as { name: string; entryKind: SelectedCanon["kind"]; hasForm?: boolean; stages: Array<{ id: string; text: string }> };
    const stage = payload.stages.find((s) => s.id === present.stageId);
    if (!stage || !stage.text.trim()) {
      return { ok: false, reason: "preparation", message: `Preparing scene: missing canon stage ${present.entryId}:${present.stageId}.`, retryable: true, stage: "plan", error: null };
    }
    canon.push({ entryId: present.entryId, stageId: stage.id, kind: payload.entryKind, name: payload.name, text: stage.text, hasForm: payload.hasForm !== false, version: entry.version });
  }

  const lookCurrent = async () => {
    const active = await store.getActiveRecord("look", sectionId);
    return active?.version === prepared.look.version && lookPolicy(active) === prepared.look.policy;
  };
  if (!await lookCurrent()) return { ok: false, reason: "preparation", message: "Preparing scene: section look changed.", retryable: true, stage: "look", error: null };

  // Optional references: only the ones the packet could select, only when current, only when their bytes load.
  const available: AvailableReference[] = [];
  const inline = new Map<string, Uint8Array>();
  type Required = Array<{ kind: string; recordId: string; version: string }>;
  const candidates: Array<{ kind: "sheet" | "styleReference"; id: string; reference: (storageId: string, version: string) => AvailableReference; required: Required }> = [];
  candidates.push({ kind: "styleReference", id: input.styleId, reference: (storageId, version) => ({ kind: "styleReference", styleId: input.styleId, storageId, version }),
    required: [{ kind: "style", recordId: input.styleId, version: styleEntry.version }] });
  const eligible = canon.filter((c) => c.hasForm);
  const characters = eligible.filter((c) => c.kind === "character");
  const locations = eligible.filter((c) => c.kind === "location");
  for (const entry of [characters[0], locations[0], characters[1]].filter((c): c is SelectedCanon => Boolean(c))) {
    candidates.push({ kind: "sheet", id: `${entry.entryId}:${entry.stageId}`, reference: (storageId, version) => ({ kind: "sheet", entryId: entry.entryId, stageId: entry.stageId, storageId, version }),
      required: [
        { kind: "entry", recordId: entry.entryId, version: entry.version },
        { kind: "stage", recordId: `${entry.entryId}:${entry.stageId}`, version: contentVersion(entry.text) },
        ...(classical ? [{ kind: "style", recordId: "classical", version: classical.version }] : []),
      ] });
  }
  for (const candidate of candidates) {
    const record = await deps.getReference(candidate.kind, candidate.id).catch(() => null);
    if (!record || !referenceIsCurrent(record, candidate.required)) {
      deps.onReferenceSkipped?.(candidate.kind, candidate.id, record ? "stale" : "missing");
      continue;
    }
    try {
      inline.set(record.storageId, await deps.loadReference(record.storageId));
      available.push(candidate.reference(record.storageId, record.fingerprint));
    } catch (error) {
      deps.onReferenceUnavailable?.(candidate.kind, candidate.id, error);
    }
  }

  if (!await lookCurrent()) return { ok: false, reason: "preparation", message: "Preparing scene: section look changed.", retryable: true, stage: "look", error: null };

  // The rendering packet, validated before any paid call.
  const rendering = buildRenderingPacket({
    work: { id: input.workId, title: inputs.work.work.title },
    moment: { id: momentId, sectionId, reference: context.moment.reference, text: context.moment.text },
    neighbors: { previous: context.previous?.text ?? null, next: context.next?.text ?? null },
    brief: inputs.brief, briefVersion: inputs.briefVersion, eraId: prepared.era ?? inputs.brief.eras[0].id,
    style: styleEntry.style, styleVersion: styleEntry.version,
    look: { version: prepared.look.version, ...prepared.look.payload },
    situation: prepared.situation,
    plan: { version: prepared.plan.version, primarySubject: prepared.plan.payload.primarySubject, action: prepared.plan.payload.action, setting: prepared.plan.payload.setting, secondaryElements: prepared.plan.payload.secondaryElements, mood: prepared.plan.payload.mood, timeOfDay: prepared.plan.payload.timeOfDay, composition: prepared.plan.payload.composition },
    canon, references: available, omitStyleReference: deps.omitStyleReference, variationNumber: input.variationNumber, aspectRatio: input.aspectRatio,
  });
  if (!rendering.ok) return { ok: false, reason: "packet", message: rendering.error, finalChars: rendering.finalChars, momentId };
  return {
    ok: true, momentId, sectionId, context, prepared, canon, styleEntry, prompt: rendering.prompt, packet: rendering.packet, references: rendering.references,
    sentReferences: rendering.references.map((r) => ({ storageId: r.storageId, bytes: inline.get(r.storageId)! })),
  };
}
