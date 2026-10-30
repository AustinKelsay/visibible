/**
 * Owner corrections (#179, spec #165 §8): the operations behind the correction command, over the
 * Convex analysis module. Every edit writes an explicit owner version, names the version it
 * expected so a stale command is refused, and closes the checker attention for that record;
 * reader reports are never closed by an input change. Regeneration stays owner-funded and never
 * overwrites an owner version. Saved images are never touched.
 */
import type { FunctionReference } from "convex/server";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { WorkInputs } from "./work-inputs";
import { DEPICTION_MODES, depictionModeOf, effectsWordingFor, storedDepiction, type DepictionMode, type DepictionProfile } from "./depiction";

export type CastEntryAddition = {
  workVersion: string; expectedGeneration: number; sectionId: string; expectedSectionVersion: string;
  entryId: string; stageId: string; named?: boolean;
  entry: Extract<Doc<"analysisRecords">["payload"], { kind: "entry" }>;
};

export type CorrectionClient = {
  query: (ref: FunctionReference<"query">, args: Record<string, unknown>) => Promise<unknown>;
  mutation: (ref: FunctionReference<"mutation">, args: Record<string, unknown>) => Promise<unknown>;
};

type AnalysisApi = {
  getWorkStatus: FunctionReference<"query">; getActiveRecord: FunctionReference<"query">; listRecordHistory: FunctionReference<"query">;
  listStaleDependents: FunctionReference<"query">; getReference: FunctionReference<"query">; listAttention: FunctionReference<"query">;
  correctRecord: FunctionReference<"mutation">; clearRecord: FunctionReference<"mutation">; pinReference: FunctionReference<"mutation">;
  addCastEntry: FunctionReference<"mutation">;
  closeAttention: FunctionReference<"mutation">; closeAttentionFor: FunctionReference<"mutation">; wipeWork: FunctionReference<"mutation">;
  /** Reader image reports (#180): one item with its messages and history. */
  getAttentionItem: FunctionReference<"query">;
};
/** Functions outside the analysis module the commands need; the generated api object is a proxy, so it cannot be spread. */
export type CorrectionExtras = { getImageProvenance?: FunctionReference<"query"> };
export const READER_REPORT_DISPOSITIONS = Object.freeze(["source corrected", "isolated rendering error", "accepted limitation", "dismissed"]);
export type ReportResolution = { disposition: string; correction?: { kind: string; recordId: string; version: string }; check?: string };

/** `kind:recordId:version` as typed on the command line. */
export function parseCorrectionLink(value: string) {
  const match = value.match(/^([a-z]+):(.+):([0-9a-f]{32})$/);
  if (!match) throw new Error(`--correction must be kind:recordId:version, got ${value}`);
  return { kind: match[1], recordId: match[2], version: match[3] };
}

export const CHECKER_REASONS = Object.freeze(["sheet_failed", "style_reference_failed", "canon_note", "canon_check", "quote_check_failed", "unmatched_owner_edit"]);
export const READER_REPORT_REASON = "reader_report";

export function imageUrl(siteUrl: string, storageId: string) {
  return `${siteUrl.replace(/\/$/, "")}/image/${encodeURIComponent(storageId)}`;
}

export function createCorrections(client: CorrectionClient, api: AnalysisApi, workId: string, serverSecret: string, siteUrl: string, extras: CorrectionExtras = {}) {
  const query = <T>(ref: FunctionReference<"query">, args: Record<string, unknown>) => client.query(ref, { workId, ...args }) as Promise<T>;
  const mutate = <T>(ref: FunctionReference<"mutation">, args: Record<string, unknown>) => client.mutation(ref, { serverSecret, workId, ...args }) as Promise<T>;
  type Record_ = { kind: string; recordId: string; version: string; source: string; generation: number; payload: Record<string, unknown> };

  return {
    /** Source-check a missing entry before adding its canon and section assignment atomically. No model calls. */
    async addCastEntry(addition: CastEntryAddition, inputs: Pick<WorkInputs, "work" | "workVersion">) {
      if (inputs.work.work.id !== workId || inputs.workVersion !== addition.workVersion) throw new Error("Correction must use this work's exact imported reference text");
      const section = await query<Record_ | null>(api.getActiveRecord, { kind: "section", recordId: addition.sectionId });
      if (!section || section.payload.kind !== "section") throw new Error(`No current section ${addition.sectionId}`);
      const first = inputs.work.getUnit(String(section.payload.firstUnit)).position;
      const last = inputs.work.getUnit(String(section.payload.lastUnit)).position;
      let assignedStageHasSectionQuote = false;
      for (const stage of addition.entry.stages) {
        if (!stage.quotes?.length) throw new Error(`Stage ${stage.id} needs supporting reference-text quotes`);
        for (const q of stage.quotes) {
          const unit = inputs.work.getUnit(q.unit);
          if (!q.quote.trim() || !unit.text.includes(q.quote)) throw new Error(`Quote does not match reference unit ${q.unit}`);
          if (stage.id === addition.stageId && unit.position >= first && unit.position <= last) assignedStageHasSectionQuote = true;
        }
      }
      if (!assignedStageHasSectionQuote) throw new Error("The assigned stage needs a supporting quote inside this section");
      return mutate<{ changed: boolean; entryVersion: string; sectionVersion: string }>(api.addCastEntry, addition);
    },

    /** Open attention items with reason, state, latest activity and image links, checker items apart from reader reports. */
    async attention(status: "open" | "closed" = "open") {
      const items = await query<Array<{ id: string; reason: string; kind?: string; recordId?: string; count: number; status: string; detail?: string; lastActivityAt: number; disposition?: string }>>(api.listAttention, { status });
      const rows = [];
      for (const item of items) {
        let link: string | null = null;
        if (item.kind === "sheet" || item.kind === "styleReference") {
          const reference = await query<{ storageId: string; pinned: boolean } | null>(api.getReference, { kind: item.kind, recordId: item.recordId });
          link = reference ? imageUrl(siteUrl, reference.storageId) : null;
        }
        rows.push({ ...item, source: item.reason === READER_REPORT_REASON ? "reader" : "checker", link });
      }
      return rows;
    },

    /** An entry's current version, history, references per stage, stale dependents and open attention. */
    async inspect(entryId: string) {
      const entry = await query<Record_ | null>(api.getActiveRecord, { kind: "entry", recordId: entryId });
      if (!entry) throw new Error(`No active entry ${entryId}`);
      const history = await query<Array<{ generation: number; version: string; source: string; status: string }>>(api.listRecordHistory, { kind: "entry", recordId: entryId });
      const stages = (entry.payload.stages as Array<{ id: string; text: string }>) ?? [];
      const references = [];
      for (const stage of stages) {
        const reference = await query<{ storageId: string; pinned: boolean; fingerprint: string } | null>(api.getReference, { kind: "sheet", recordId: `${entryId}:${stage.id}` });
        references.push({ stageId: stage.id, pinned: reference?.pinned ?? false, url: reference ? imageUrl(siteUrl, reference.storageId) : null });
      }
      const stale = await query<Array<{ kind: string; recordId: string }>>(api.listStaleDependents, { kind: "entry", recordId: entryId });
      const attention = (await this.attention()).filter((a) => a.recordId === entryId || a.recordId?.startsWith(`${entryId}:`));
      return { entry, history, references, stale, attention };
    },

    /** Replace one stage's text with an owner version; other stages keep their text. */
    async editStage(entryId: string, stageId: string, text: string, expectedVersion?: string) {
      const entry = await query<Record_ | null>(api.getActiveRecord, { kind: "entry", recordId: entryId });
      if (!entry) throw new Error(`No active entry ${entryId}`);
      const stages = entry.payload.stages as Array<{ id: string; text: string; label?: string; quotes?: unknown }>;
      if (!stages.some((s) => s.id === stageId)) throw new Error(`Entry ${entryId} has no stage ${stageId}`);
      const payload = { ...entry.payload, stages: stages.map((s) => (s.id === stageId ? { ...s, text } : s)) };
      const result = await mutate<{ version: string; changed: boolean }>(api.correctRecord, { kind: "entry", recordId: entryId, payload, expectedVersion: expectedVersion ?? entry.version });
      const closed = await mutate<{ closed: number }>(api.closeAttentionFor, { kind: "entry", recordId: entryId, disposition: "source corrected" });
      const stale = await query<Array<{ kind: string; recordId: string }>>(api.listStaleDependents, { kind: "entry", recordId: entryId });
      return { ...result, closedAttention: closed.closed, staleDependents: stale };
    },

    /**
     * Set how an entry may be depicted (ADR 0010) as an owner version of the entry: `form` draws it from its canon,
     * `effects` never draws it and needs the work's wording for subjects without form. Its looks and plans are remade lazily.
     */
    async setDepiction(entryId: string, mode: string, depiction: DepictionProfile, expectedVersion?: string) {
      if (!(DEPICTION_MODES as readonly string[]).includes(mode)) throw new Error(`Depiction must be one of ${DEPICTION_MODES.join(", ")}, got ${mode}`);
      if (depiction.workId !== workId) throw new Error(`The depiction profile of ${depiction.workId} was given for ${workId}`);
      if (mode === "effects") effectsWordingFor(depiction, [entryId]);
      const entry = await query<Record_ | null>(api.getActiveRecord, { kind: "entry", recordId: entryId });
      if (!entry || entry.payload.kind !== "entry") throw new Error(`No active entry ${entryId}`);
      const previous = depictionModeOf(entry.payload);
      const payload = { ...entry.payload, ...storedDepiction(mode as DepictionMode) };
      const result = await mutate<{ version: string; changed: boolean }>(api.correctRecord, { kind: "entry", recordId: entryId, payload, expectedVersion: expectedVersion ?? entry.version });
      const closed = await mutate<{ closed: number }>(api.closeAttentionFor, { kind: "entry", recordId: entryId, disposition: "source corrected" });
      const stale = await query<Array<{ kind: string; recordId: string }>>(api.listStaleDependents, { kind: "entry", recordId: entryId });
      return { ...result, previous, depiction: mode, closedAttention: closed.closed, staleDependents: stale };
    },

    /**
     * Correct an entry's kind (character, location or object) as an owner version of the entry, such as a city the reading
     * pass filed as a character. Only selected characters are named as people in image prompts. An object keeps one stage.
     */
    async setKind(entryId: string, kind: string, expectedVersion?: string) {
      const kinds = ["character", "location", "object"];
      if (!kinds.includes(kind)) throw new Error(`Kind must be one of ${kinds.join(", ")}, got ${kind}`);
      const entry = await query<Record_ | null>(api.getActiveRecord, { kind: "entry", recordId: entryId });
      if (!entry || entry.payload.kind !== "entry") throw new Error(`No active entry ${entryId}`);
      const stages = (entry.payload.stages as unknown[]) ?? [];
      if (kind === "object" && stages.length > 1) throw new Error(`An object has one stage; ${entryId} has ${stages.length}`);
      const previous = String(entry.payload.entryKind);
      const payload = { ...entry.payload, entryKind: kind };
      const result = await mutate<{ version: string; changed: boolean }>(api.correctRecord, { kind: "entry", recordId: entryId, payload, expectedVersion: expectedVersion ?? entry.version });
      const closed = await mutate<{ closed: number }>(api.closeAttentionFor, { kind: "entry", recordId: entryId, disposition: "source corrected" });
      const stale = await query<Array<{ kind: string; recordId: string }>>(api.listStaleDependents, { kind: "entry", recordId: entryId });
      return { ...result, previous, entryKind: kind, closedAttention: closed.closed, staleDependents: stale };
    },

    /**
     * Remove a wrongly assigned cast member from one section as an owner version of the section. The entry and its
     * other sections are untouched; the section's looks and plans name the old section version and are remade lazily.
     */
    async removeCast(sectionId: string, entryId: string, expectedVersion?: string) {
      const section = await query<Record_ | null>(api.getActiveRecord, { kind: "section", recordId: sectionId });
      if (!section || section.payload.kind !== "section") throw new Error(`No current section ${sectionId}`);
      const cast = section.payload.cast as Array<{ entryId: string; stageId: string; named?: boolean }>;
      if (!cast.some((member) => member.entryId === entryId)) throw new Error(`Section ${sectionId} does not assign ${entryId}`);
      const payload = { ...section.payload, cast: cast.filter((member) => member.entryId !== entryId) };
      const result = await mutate<{ version: string; changed: boolean; previousVersion: string }>(api.correctRecord, { kind: "section", recordId: sectionId, payload, expectedVersion: expectedVersion ?? section.version });
      return { ...result, removed: entryId, cast: payload.cast.map((member) => member.entryId) };
    },

    /** Replace a section look with an owner version. */
    async editLook(sectionId: string, fields: Partial<{ place: string; timeOfDay: string; weather: string; light: string; clothing: string }>, expectedVersion?: string) {
      const look = await query<Record_ | null>(api.getActiveRecord, { kind: "look", recordId: sectionId });
      if (!look) throw new Error(`No current look for section ${sectionId}; it is made when the section is first drawn`);
      const payload = { ...look.payload, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
      const result = await mutate<{ version: string; changed: boolean }>(api.correctRecord, { kind: "look", recordId: sectionId, payload, expectedVersion: expectedVersion ?? look.version });
      const closed = await mutate<{ closed: number }>(api.closeAttentionFor, { kind: "look", recordId: sectionId, disposition: "source corrected" });
      const stale = await query<Array<{ kind: string; recordId: string }>>(api.listStaleDependents, { kind: "look", recordId: sectionId });
      return { ...result, closedAttention: closed.closed, staleDependents: stale };
    },

    async pin(kind: "sheet" | "styleReference", recordId: string, pinned: boolean) {
      return mutate<{ pinned: boolean }>(api.pinReference, { kind, recordId, pinned });
    },

    /** Plans are never edited: clearing one makes the next image replan. */
    async clearPlan(momentId: string) {
      return mutate<{ cleared: boolean }>(api.clearRecord, { kind: "plan", recordId: momentId });
    },

    /** Reader image reports with count, latest activity and the image's URL, style and source. */
    async reports(status: "open" | "closed" = "open") {
      const items = (await this.attention(status)).filter((a) => a.reason === READER_REPORT_REASON);
      const rows = [];
      for (const item of items) {
        const image = extras.getImageProvenance && item.recordId
          ? await client.query(extras.getImageProvenance, { serverSecret, imageId: item.recordId }) as { imageUrl: string | null; verseId: string; artStyle: string; engine?: string; translationId?: string } | null
          : null;
        rows.push({ ...item, link: image?.imageUrl ?? null, verseId: image?.verseId ?? null, artStyle: image?.artStyle ?? null, engine: image?.engine ?? null, translationId: image?.translationId ?? null, imageMissing: image === null });
      }
      return rows;
    },

    /** One report in full: every message with its time, the lifecycle, the last closure, and the image's resolved provenance (unknown for legacy images). */
    async report(id: string) {
      const item = await client.query(api.getAttentionItem, { serverSecret, id }) as { reason: string; recordId?: string; reports?: unknown[]; history?: unknown[]; closure?: unknown } | null;
      if (!item) throw new Error(`No attention item ${id}`);
      if (item.reason !== READER_REPORT_REASON) throw new Error(`${id} is a ${item.reason} item, not a reader report`);
      const image = extras.getImageProvenance && item.recordId ? await client.query(extras.getImageProvenance, { serverSecret, imageId: item.recordId }) : null;
      return { item, image: image ?? null };
    },

    /** Close a reader report with one disposition; "source corrected" needs the corrected version and a check. */
    async resolve(id: string, resolution: ReportResolution) {
      if (!READER_REPORT_DISPOSITIONS.includes(resolution.disposition)) throw new Error(`disposition must be one of: ${READER_REPORT_DISPOSITIONS.join(", ")}`);
      return client.mutation(api.closeAttention, { serverSecret, id, disposition: resolution.disposition, ...(resolution.correction ? { correction: resolution.correction } : {}), ...(resolution.check ? { check: resolution.check } : {}) }) as Promise<{ closed: boolean }>;
    },

    async dismiss(id: string, disposition = "dismissed") {
      // closeAttention is keyed by the item id alone, so it takes no work id.
      return client.mutation(api.closeAttention, { serverSecret, id, disposition }) as Promise<{ closed: boolean }>;
    },

    /** Mark a redone or corrected record's checker items closed; reader reports stay open. */
    async settleAttention(kind: "sheet" | "styleReference" | "entry" | "look", recordId: string) {
      return mutate<{ closed: number }>(api.closeAttentionFor, { kind, recordId, disposition: "source corrected" });
    },

    async wipe(options: { includingOwner: boolean }) {
      return mutate<{ records: number; ownerKept: number; generations: number; references: number; attention: number }>(api.wipeWork, { confirmation: workId, includingOwner: options.includingOwner });
    },

    status() {
      return query<{ ready: boolean; reasons: string[]; activeGeneration: number | null }>(api.getWorkStatus, {});
    },
  };
}
