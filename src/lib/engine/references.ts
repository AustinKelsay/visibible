/**
 * Reference images (#172, spec #165 §4, §5): Classical reference sheets for entries that recur
 * in two or more story sections, one per stage a cast uses, and one style reference per work and
 * style, Classical included. Both are made on Nano Banana 2 Lite from fixed templates, checked by a
 * cheap vision model for hard faults only (text, border, extra figures, missing view, different
 * subjects), retried at most three times with the reasons fed back, and stored as JPEG blobs
 * with the exact input versions they were made from. Subjective canon notes become attention
 * items, never retries. Entries with no form never get a sheet. A missing or failed reference
 * never blocks an image: the moment prompt simply goes without it.
 */
import { z } from "zod";
import type { ArtStyle, Era, WorkBrief } from "../work-preparation";
import { contentVersion } from "../../../convex/_helpers/contentVersion";

export const REFERENCE_IMAGE_MODEL = "google/gemini-3.1-flash-lite-image";
/** The cheap vision model that look-checks reference images (#159). */
export const CHECK_MODEL_ID = "anthropic/claude-haiku-5.5";
export const MAX_REFERENCE_ATTEMPTS = 3;
/** Reserved before every attempt and counted when the provider reports no cost, so the budget stays conservative. */
export const ESTIMATED_IMAGE_USD = 0.04;
export const ESTIMATED_CHECK_USD = 0.005;

/** What every check returns: a verdict and reasons, plus the schema's own fields. */
export type Verdict = { verdict: "pass" | "fail"; reasons: string[] } & Record<string, unknown>;

export interface ImageMaker {
  readonly id: string;
  generate(request: { label: string; prompt: string; aspectRatio: "16:9" }): Promise<{ bytes: Uint8Array; mimeType: string; costUsd: number | null; elapsedMs: number }>;
}
export interface VisionChecker {
  readonly id: string;
  check<T>(request: { label: string; question: string; schema: z.ZodType<T>; image: { bytes: Uint8Array; mimeType: string } }): Promise<{ value: T; costUsd: number | null; elapsedMs: number }>;
}
export interface ReferenceBlobStore {
  store(bytes: Uint8Array, mimeType: string): Promise<{ storageId: string }>;
}

const NO_TEXT = "Absolutely no text of any kind anywhere: no names, labels, captions, titles, letters, numbers, arrows, colour swatches, rulers, frames, borders or panel dividers.";
const NO_LIKENESS = "No likeness of any real actor, performer or public figure.";

export type SheetSubject = { entryId: string; stageId: string; kind: "character" | "location" | "object"; name: string; text: string; version: string; eras: Era[] };

export function styleBriefText(style: ArtStyle) {
  return [style.rendering, style.palette, style.lighting, style.materials, style.composition].join(" ");
}

const LAYOUT = {
  character: "Layout: the same figure shown three times side by side, evenly spaced, on one plain, even mid-grey background: (1) full-length standing view facing the viewer; (2) full-length standing view in a three-quarter turn; (3) a large head-and-shoulders close-up portrait in three-quarter view that shows the face clearly. Calm, neutral standing pose and expression, arms relaxed. Face, hair, build, garments and colours identical in all three views. No other people or figures.",
  location: "Layout: two views of this same place side by side, each filling half of the image, separated by a narrow plain mid-grey gap: left, a wide establishing view; right, a closer ground-level view of its most characteristic part. Clear, neutral daylight. No people, no animals.",
  object: "Layout: the same object shown twice side by side on one plain, even mid-grey background: left, the whole object from a three-quarter angle; right, a close detail. Neutral, even light. No people, no hands, no animals.",
};

export function sheetPrompt(work: { title: string }, subject: SheetSubject, classical: ArtStyle): string {
  const world = subject.kind === "character"
    ? subject.eras.map((e) => `${e.people} ${e.dress}`).join(" ")
    : subject.eras.map((e) => e.buildingsAndObjects).join(" ");
  const head = { character: "Character reference sheet", location: "Location reference sheet", object: "Object reference sheet" }[subject.kind];
  return `${head} for an illustrated edition of ${work.title}.
Art style: ${classical.label}. ${styleBriefText(classical)}
World: ${world}
${subject.kind.charAt(0).toUpperCase()}${subject.kind.slice(1)}: ${subject.text}
${LAYOUT[subject.kind]}
${NO_TEXT}
${NO_LIKENESS}
Style negatives: ${classical.negatives}
Not a photograph.`;
}

export const sheetCheckSchema = z.object({
  views_ok: z.boolean(), same_subject: z.boolean(), extra_figures: z.boolean(), text_present: z.boolean(), frame_present: z.boolean(),
  canon_notes: z.array(z.string()), verdict: z.enum(["pass", "fail"]), reasons: z.array(z.string()),
}).strict();
export type SheetCheck = z.infer<typeof sheetCheckSchema>;

export function sheetCheckQuestion(subject: SheetSubject): string {
  const views = { character: "three views of one figure: full-length front, full-length three-quarter, and a head-and-shoulders close-up",
    location: "two views of one place: a wide view and a closer view", object: "two views of one object: the whole object and a close detail" }[subject.kind];
  const extra = subject.kind === "character" ? "no figures other than the subject" : "no people at all";
  return `You check a ${subject.kind} reference sheet before it is used as a reference image. Judge strictly from the image. Return only JSON.
It must show ${views}; ${extra}; no text of any kind; no frame or border around the image. All views must show the same subject. The plain grey background and the narrow plain gap or divider between the views are part of the sheet layout and are NOT a frame or panel edge.
Fail ONLY for these hard faults: a required view missing, views showing different subjects, extra figures, text, or a frame. Anything about likeness to the canon entry (build, age, colours, props) goes in canon_notes and never causes a fail.
CANON ENTRY (for notes only): ${subject.text}`;
}

export function styleReferencePrompt(style: ArtStyle, mainEra: Era): string {
  return `Style reference image for an illustrated edition; it exists only to show the art style.
Subject: one wide, quiet outdoor view of the kind of place this era's stories happen in (${mainEra.label}): buildings and streets or countryside of this era, drawn from this list but shown as a single natural scene, not a collection of objects: ${mainEra.buildingsAndObjects} Leave out every small object, paper, book, letter, sign, poster or anything bearing writing. No people, no animals, no vehicles with drivers or passengers.
Art style: ${style.label}. ${styleBriefText(style)}
Style negatives: ${style.negatives}
One single full-bleed scene, composed as a cropped detail of a larger work: the painted scene runs off all four edges, with colour in every corner. ${NO_TEXT}`;
}

export const styleCheckSchema = z.object({
  people_present: z.boolean(), frame_present: z.boolean(), text_present: z.boolean(), full_bleed: z.boolean(), verdict: z.enum(["pass", "fail"]), reasons: z.array(z.string()),
}).strict();
export const STYLE_CHECK_QUESTION = `You look-check a style reference image before an illustration engine uses it. Judge strictly from the image. Return only JSON.
Inspect the entire perimeter, including all four corners, before deciding full_bleed. The depicted scene must continue to every edge. A mostly painted image still fails if scenery or pigment fades into bare white or cream paper at any edge or corner; irregular washed-out edges and partial paper margins count as a vignette/frame, even without a straight border. Set full_bleed=false and frame_present=true for those faults. Pale sky, clouds or a light-coloured object within a continuous scene are not by themselves paper margins.
Fail if there are any people, any text, any frame/border/margin/vignette, or full_bleed is false. A window within the depicted scene is not itself a frame around the image. Pass only when all four conditions are satisfied. Give only observed faults in reasons on a fail; do not ask the generator to fix absent people or absent text.`;

/** The inputs a reference is made from; their fingerprint decides staleness. */
export function sheetInputs(subject: SheetSubject, classical: ArtStyle, classicalVersion: string) {
  return [{ kind: "entry", recordId: subject.entryId, version: subject.version }, { kind: "stage", recordId: `${subject.entryId}:${subject.stageId}`, version: contentVersion(subject.text) },
    { kind: "style", recordId: classical.id, version: classicalVersion }, { kind: "era", recordId: subject.eras.map((e) => e.id).join("+"), version: contentVersion(subject.eras) }];
}
export function styleReferenceInputs(style: ArtStyle, styleVersion: string, mainEra: Era) {
  return [{ kind: "style", recordId: style.id, version: styleVersion }, { kind: "era", recordId: mainEra.id, version: contentVersion(mainEra) }];
}

export type Attempt = { n: number; verdict: Verdict | null; error: string | null; costUsd: number; elapsedMs: number };
export type ReferenceOutcome =
  | { ok: true; storageId: string; verdict: Verdict; attempts: Attempt[]; notes: string[] }
  /** `aborted` carries a budget stop that happened after paid attempts, so the caller can record them first. */
  | { ok: false; attempts: Attempt[]; notes: string[]; aborted?: unknown };

async function makeWithCheck<T extends Verdict>(
  label: string, prompt: string, question: string, schema: z.ZodType<T>,
  deps: { maker: ImageMaker; checker: VisionChecker; blobs: ReferenceBlobStore; /** Checked before every attempt with the estimate and what this subject's earlier attempts already cost. */ beforeCall?: (estimateUsd: number, pendingUsd: number) => Promise<void> },
  notesOf: (verdict: T) => string[],
): Promise<ReferenceOutcome> {
  const attempts: Attempt[] = [];
  let feedback = "";
  const notes: string[] = [];
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
  for (let n = 1; n <= MAX_REFERENCE_ATTEMPTS; n++) {
    try {
      await deps.beforeCall?.(ESTIMATED_IMAGE_USD + ESTIMATED_CHECK_USD, attempts.reduce((n, a) => n + a.costUsd, 0));
    } catch (error) {
      if (attempts.length === 0) throw error;
      return { ok: false, attempts, notes, aborted: error }; // paid attempts are reported before the stop propagates
    }
    let image: Awaited<ReturnType<ImageMaker["generate"]>>;
    try {
      image = await deps.maker.generate({ label: `${label}:${n}`, prompt: prompt + feedback, aspectRatio: "16:9" });
    } catch (error) {
      attempts.push({ n, verdict: null, error: message(error), costUsd: 0, elapsedMs: 0 });
      continue;
    }
    const imageCost = image.costUsd ?? ESTIMATED_IMAGE_USD;
    // The image is paid for by now: a checker or storage failure still counts it and still ends the attempt.
    let check: Awaited<ReturnType<VisionChecker["check"]>> extends infer R ? R & { value: T } : never;
    try {
      check = (await deps.checker.check({ label: `check:${label}:${n}`, question, schema, image })) as typeof check;
    } catch (error) {
      attempts.push({ n, verdict: null, error: `check: ${message(error)}`, costUsd: imageCost, elapsedMs: image.elapsedMs });
      continue;
    }
    const costUsd = imageCost + (check.costUsd ?? ESTIMATED_CHECK_USD);
    attempts.push({ n, verdict: check.value, error: null, costUsd, elapsedMs: image.elapsedMs + check.elapsedMs });
    if (check.value.verdict === "pass") {
      try {
        const { storageId } = await deps.blobs.store(image.bytes, image.mimeType);
        // Notes describe the image that was kept, never a discarded attempt.
        notes.push(...notesOf(check.value));
        return { ok: true, storageId, verdict: check.value, attempts, notes };
      } catch (error) {
        attempts[attempts.length - 1].error = `store: ${message(error)}`;
        continue;
      }
    }
    feedback = `\n\nA previous attempt was rejected because: ${check.value.reasons.join("; ")}. Fix these.`;
  }
  return { ok: false, attempts, notes };
}

export function makeSheet(work: { title: string }, subject: SheetSubject, classical: ArtStyle, deps: Parameters<typeof makeWithCheck>[4]) {
  return makeWithCheck(`sheet:${subject.entryId}:${subject.stageId}`, sheetPrompt(work, subject, classical), sheetCheckQuestion(subject), sheetCheckSchema, deps, (v) => v.canon_notes);
}
export function makeStyleReference(style: ArtStyle, mainEra: Era, deps: Parameters<typeof makeWithCheck>[4]) {
  return makeWithCheck(`styleref:${style.id}`, styleReferencePrompt(style, mainEra), STYLE_CHECK_QUESTION, styleCheckSchema, deps, () => []);
}

// ---------------------------------------------------------------- who gets a sheet

export type ActiveSection = { recordId: string; era?: string; cast: Array<{ entryId: string; stageId: string }> };
export type ActiveEntry = { recordId: string; version: string; name: string; entryKind: "character" | "location" | "object"; hasForm?: boolean; stages: Array<{ id: string; text: string }> };

/** One subject per (entry, stage) that a cast uses, for entries present in two or more sections and not without form. Eras come from those sections. */
export function sheetSubjects(entries: ActiveEntry[], sections: ActiveSection[], brief: WorkBrief): SheetSubject[] {
  const byEntry = new Map(entries.map((e) => [e.recordId, e]));
  const uses = new Map<string, { sections: Set<string>; eras: Set<string> }>();
  for (const section of sections) {
    for (const member of section.cast) {
      const key = `${member.entryId}:${member.stageId}`;
      const use = uses.get(key) ?? { sections: new Set(), eras: new Set() };
      use.sections.add(section.recordId);
      if (section.era) use.eras.add(section.era);
      uses.set(key, use);
    }
  }
  const sectionsPerEntry = new Map<string, Set<string>>();
  for (const [key, use] of uses) {
    const entryId = key.slice(0, key.lastIndexOf(":"));
    const set = sectionsPerEntry.get(entryId) ?? new Set();
    for (const s of use.sections) set.add(s);
    sectionsPerEntry.set(entryId, set);
  }
  const subjects: SheetSubject[] = [];
  for (const [key, use] of uses) {
    const entryId = key.slice(0, key.lastIndexOf(":"));
    const stageId = key.slice(entryId.length + 1);
    const entry = byEntry.get(entryId);
    if (!entry || entry.hasForm === false || (sectionsPerEntry.get(entryId)?.size ?? 0) < 2) continue;
    const stage = entry.stages.find((s) => s.id === stageId);
    if (!stage) continue;
    const eras = brief.eras.filter((e) => use.eras.has(e.id));
    subjects.push({ entryId, stageId, kind: entry.entryKind, name: entry.name, text: stage.text, version: entry.version, eras: eras.length ? eras : [brief.eras[0]] });
  }
  return subjects;
}

/** The era with the most story sections (#156); ties keep brief order. */
export function mainEra(sections: ActiveSection[], brief: WorkBrief): Era {
  const counts = new Map(brief.eras.map((e) => [e.id, 0]));
  for (const s of sections) if (s.era && counts.has(s.era)) counts.set(s.era, counts.get(s.era)! + 1);
  return brief.eras.reduce((best, era) => (counts.get(era.id)! > counts.get(best.id)! ? era : best));
}

// ---------------------------------------------------------------- blob cache for inline use

/** A bounded per-instance cache of reference bytes, so a request rarely re-reads the same blob. */
export function createReferenceBlobCache(load: (storageId: string) => Promise<Uint8Array>, options: { maxEntries?: number; maxBytes?: number } = {}) {
  const maxEntries = options.maxEntries ?? 64;
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  const entries = new Map<string, Uint8Array>();
  const loading = new Map<string, Promise<Uint8Array>>();
  let bytes = 0;
  return {
    async get(storageId: string): Promise<Uint8Array> {
      const hit = entries.get(storageId);
      if (hit) { entries.delete(storageId); entries.set(storageId, hit); return hit; }
      // Concurrent misses share one load, so the entry and its byte count are added once.
      const pending = loading.get(storageId);
      if (pending) return pending;
      const task = load(storageId).finally(() => loading.delete(storageId));
      loading.set(storageId, task);
      const data = await task;
      if (entries.has(storageId)) return entries.get(storageId)!;
      entries.set(storageId, data);
      bytes += data.length;
      while ((entries.size > maxEntries || bytes > maxBytes) && entries.size > 1) {
        const oldest = entries.keys().next().value!;
        bytes -= entries.get(oldest)!.length;
        entries.delete(oldest);
      }
      return data;
    },
    get size() { return entries.size; },
    get bytes() { return bytes; },
  };
}
