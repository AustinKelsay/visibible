/**
 * Owner corrections (#179, spec #165 §8): the operations behind the correction command, over the
 * Convex analysis module. Every edit writes an explicit owner version, names the version it
 * expected so a stale command is refused, and closes the checker attention for that record;
 * reader reports are never closed by an input change. Regeneration stays owner-funded and never
 * overwrites an owner version. Saved images are never touched.
 */
import type { FunctionReference } from "convex/server";

export type CorrectionClient = {
  query: (ref: FunctionReference<"query">, args: Record<string, unknown>) => Promise<unknown>;
  mutation: (ref: FunctionReference<"mutation">, args: Record<string, unknown>) => Promise<unknown>;
};

type AnalysisApi = {
  getWorkStatus: FunctionReference<"query">; getActiveRecord: FunctionReference<"query">; listRecordHistory: FunctionReference<"query">;
  listStaleDependents: FunctionReference<"query">; getReference: FunctionReference<"query">; listAttention: FunctionReference<"query">;
  correctRecord: FunctionReference<"mutation">; clearRecord: FunctionReference<"mutation">; pinReference: FunctionReference<"mutation">;
  closeAttention: FunctionReference<"mutation">; closeAttentionFor: FunctionReference<"mutation">; wipeWork: FunctionReference<"mutation">;
};

export const CHECKER_REASONS = Object.freeze(["sheet_failed", "style_reference_failed", "canon_note", "canon_check", "quote_check_failed", "unmatched_owner_edit"]);
export const READER_REPORT_REASON = "reader_report";

export function imageUrl(siteUrl: string, storageId: string) {
  return `${siteUrl.replace(/\/$/, "")}/image/${encodeURIComponent(storageId)}`;
}

export function createCorrections(client: CorrectionClient, api: AnalysisApi, workId: string, serverSecret: string, siteUrl: string) {
  const query = <T>(ref: FunctionReference<"query">, args: Record<string, unknown>) => client.query(ref, { workId, ...args }) as Promise<T>;
  const mutate = <T>(ref: FunctionReference<"mutation">, args: Record<string, unknown>) => client.mutation(ref, { serverSecret, workId, ...args }) as Promise<T>;
  type Record_ = { kind: string; recordId: string; version: string; source: string; generation: number; payload: Record<string, unknown> };

  return {
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
