/**
 * One moment's lean rendering, assembled the same way for the request path and the evaluation command: the moment
 * and its in-section neighbours from the imported text, the section's cast with the canon stage it assigns each
 * member (all of it, or no image), the current reference sheets that load, and the prompt with the packet saved beside
 * the request. No model is called: nothing here is paid.
 */
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import type { ArtStyle } from "../work-preparation";
import { buildLeanRendering, leanCastMember, LEAN_PROMPT_MAX_CHARS, LEAN_PROMPT_VERSION, type LeanCastMember, type LeanRanked, type LeanReference, type LeanSelectedReference } from "./lean";
import { momentContext, momentForUnit, type MomentContext, type MomentRange, type WorkInputs } from "./work-inputs";

type Record_ = { recordId: string; version: string; payload: Record<string, unknown> & { kind: string } };

/** A stored reference image: the blob, the inputs it was made from and whether the owner pinned it. */
export type ReferenceRecord = { storageId: string; inputs: Array<{ kind: string; recordId: string; version: string }>; fingerprint: string; pinned: boolean };

/** A reference is usable when pinned or when every input the engine knows about matches the current versions. */
export function referenceIsCurrent(reference: ReferenceRecord, required: Array<{ kind: string; recordId: string; version: string }>) {
  return reference.pinned || required.every((r) => reference.inputs.some((i) => i.kind === r.kind && i.recordId === r.recordId && i.version === r.version));
}

export type LeanAssembleDeps = {
  inputs: WorkInputs;
  getRecord: (kind: "moment" | "section" | "entry", recordId: string) => Promise<Record_ | null>;
  /** Every active moment, for works whose moments span several units; unit-mode works never need it. */
  listMoments: () => Promise<MomentRange[]>;
  getReference: (kind: "sheet" | "styleReference", recordId: string) => Promise<ReferenceRecord | null>;
  /** JPEG bytes of a stored reference blob. */
  loadReference: (storageId: string) => Promise<Uint8Array>;
  onReferenceSkipped?: (kind: string, id: string, reason: "missing" | "stale") => void;
  onReferenceUnavailable?: (kind: string, id: string, error: unknown) => void;
};

export type LeanAssembleInput = { workId: string; unitId: string; styleId: string; aspectRatio: "16:9" | "21:9" | "3:2" };

/**
 * The snapshot saved with a request and the provenance saved with its image. It keeps the stored packet's shape, so
 * looks and plans, which the lean engine does not make, read "none".
 */
export type LeanPacket = {
  promptVersion: string; workId: string; momentId: string; sectionId: string; eraId: string; styleId: string; styleVersion: string; briefVersion: string;
  lookVersion: "none"; planVersion: "none"; depictionVersion: string;
  canon: Array<{ entryId: string; stageId: string; version: string }>;
  references: Array<{ kind: LeanReference["kind"]; id: string; storageId: string; version: string; caption: string }>;
  flags: { variationIncluded: false; neighborsIncluded: boolean; styleDetailIncluded: true; lookDetailIncluded: false };
  budget: { maxChars: number; finalChars: number };
};

export type LeanAssembleFailure =
  | { ok: false; reason: "style" | "unit" | "moment" | "canon"; message: string }
  | { ok: false; reason: "context"; message: string; error: unknown }
  | { ok: false; reason: "packet"; message: string; momentId: string };
export type LeanAssembleSuccess = {
  ok: true; momentId: string; sectionId: string; context: MomentContext; styleEntry: { style: ArtStyle; version: string };
  present: LeanRanked[]; prompt: string; packet: LeanPacket; references: LeanSelectedReference[];
  /** The bytes actually attached, in packet order. */
  sentReferences: Array<{ storageId: string; bytes: Uint8Array }>;
};

export async function assembleLean(deps: LeanAssembleDeps, input: LeanAssembleInput): Promise<LeanAssembleSuccess | LeanAssembleFailure> {
  const { inputs } = deps;
  const styleEntry = inputs.styles[input.styleId];
  if (!styleEntry) return { ok: false, reason: "style", message: `The ${input.styleId} art style is not approved for this work.` };
  let unit;
  try {
    unit = inputs.work.getUnit(input.unitId);
  } catch {
    return { ok: false, reason: "unit", message: "This passage is not part of the work's reference text." };
  }

  // The moment and section; multi-unit works find the moment holding the unit.
  let moment = await deps.getRecord("moment", unit.id);
  if (!moment && inputs.work.momentMode !== "unit") {
    const range = momentForUnit(inputs.work, unit.id, await deps.listMoments());
    moment = range ? await deps.getRecord("moment", range.id) : null;
  }
  const section = moment ? await deps.getRecord("section", String(moment.payload.sectionId)) : null;
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

  // The section's cast with the canon stage it assigns each member. A member whose canon cannot be read stops the
  // image: it may be a subject without form, whose name would then reach the image model unreplaced.
  const assigned = (section.payload.cast ?? []) as Array<{ entryId: string; stageId: string }>;
  const cast: LeanCastMember[] = [];
  for (const [i, entry] of (await Promise.all(assigned.map((m) => deps.getRecord("entry", m.entryId)))).entries()) {
    const m = assigned[i];
    const member = entry?.payload.kind === "entry" ? leanCastMember(m.entryId, m.stageId, entry.version, entry.payload as never) : null;
    if (!member) return { ok: false, reason: "canon", message: `Preparing scene: missing canon stage ${m.entryId}:${m.stageId}.` };
    cast.push(member);
  }

  // References made from the current inputs: the style reference, and a sheet for any drawable cast member.
  const classical = inputs.styles.classical;
  const current = async (kind: "sheet" | "styleReference", id: string, required: Array<{ kind: string; recordId: string; version: string }>) => {
    const record = await deps.getReference(kind, id).catch(() => null);
    if (record && referenceIsCurrent(record, required)) return record;
    deps.onReferenceSkipped?.(kind, id, record ? "stale" : "missing");
    return null;
  };
  const [styleReference, ...sheets] = await Promise.all([
    current("styleReference", input.styleId, [{ kind: "style", recordId: input.styleId, version: styleEntry.version }]),
    ...cast.map((m) => m.depiction !== "form" ? null : current("sheet", `${m.entryId}:${m.stageId}`, [
      { kind: "entry", recordId: m.entryId, version: m.version },
      { kind: "stage", recordId: `${m.entryId}:${m.stageId}`, version: contentVersion(m.text) },
      ...(classical ? [{ kind: "style", recordId: "classical", version: classical.version }] : []),
    ])),
  ]);
  let available: LeanReference[] = [
    ...(styleReference ? [{ kind: "styleReference" as const, styleId: input.styleId, storageId: styleReference.storageId, version: styleReference.fingerprint }] : []),
    ...cast.flatMap((m, i) => sheets[i] ? [{ kind: "sheet" as const, entryId: m.entryId, stageId: m.stageId, storageId: sheets[i]!.storageId, version: sheets[i]!.fingerprint }] : []),
  ];

  const eraId = (inputs.brief.eras.find((e) => e.id === section.payload.era) ?? inputs.brief.eras[0]).id;
  // Build, load the chosen references, and rebuild without any that will not load, so its slot passes to the next.
  for (;;) {
    const rendering = buildLeanRendering({
      work: { id: input.workId, title: inputs.work.work.title }, moment: { id: momentId, sectionId, reference: context.moment.reference, text: context.moment.text },
      neighbors: { previous: context.previous?.text ?? null, next: context.next?.text ?? null }, brief: inputs.brief, eraId, style: styleEntry.style,
      cast, references: available, depiction: inputs.depiction, aspectRatio: input.aspectRatio,
    });
    if (!rendering.ok) return { ok: false, reason: "packet", message: rendering.error, momentId };
    const loaded = await Promise.all(rendering.references.map(async (r) => {
      try { return { storageId: r.storageId, bytes: await deps.loadReference(r.storageId) }; }
      catch (error) { deps.onReferenceUnavailable?.(r.kind, r.kind === "sheet" ? `${r.entryId}:${r.stageId}` : r.styleId, error); return null; }
    }));
    const failed = new Set(rendering.references.filter((_, i) => !loaded[i]).map((r) => r.storageId));
    if (failed.size) { available = available.filter((r) => !failed.has(r.storageId)); continue; }
    return {
      ok: true, momentId, sectionId, context, styleEntry, present: rendering.present, prompt: rendering.prompt, references: rendering.references,
      sentReferences: loaded as Array<{ storageId: string; bytes: Uint8Array }>,
      packet: {
        promptVersion: LEAN_PROMPT_VERSION, workId: input.workId, momentId, sectionId, eraId, styleId: styleEntry.style.id, styleVersion: styleEntry.version, briefVersion: inputs.briefVersion,
        lookVersion: "none", planVersion: "none", depictionVersion: inputs.depiction.version,
        canon: rendering.present.map((m) => ({ entryId: m.entryId, stageId: m.stageId, version: m.version })),
        references: rendering.references.map((r) => ({ kind: r.kind, id: r.kind === "sheet" ? `${r.entryId}:${r.stageId}` : r.styleId, storageId: r.storageId, version: r.version, caption: r.caption })),
        flags: { variationIncluded: false, neighborsIncluded: Boolean(context.previous || context.next), styleDetailIncluded: true, lookDetailIncluded: false },
        budget: { maxChars: LEAN_PROMPT_MAX_CHARS, finalChars: rendering.prompt.length },
      },
    };
  }
}
