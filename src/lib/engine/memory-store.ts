/**
 * An in-memory analysis for one work (#181): the same PreparationStore the engine uses, over
 * records built the way the Convex module stores them (content-hash versions), with derived
 * looks and plans, claims and a preparation spend ledger kept in memory. Evaluation runs and
 * tests use it where no deployment is wanted; nothing in it is paid.
 */
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import type { AnalysisRecord, InputRef, PreparationStore } from "./preparation";
import type { MomentRange } from "./work-inputs";

export type MemoryRecordInput = { kind: string; recordId: string; payload: Record<string, unknown> & { kind: string } };
export type SpendEntry = { kind: string; recordId: string; model: string; outcome: string; costUsd: number | null; promptTokens: number | null; completionTokens: number | null; elapsedMs: number; at: number };

export function createMemoryPreparationStore(records: readonly MemoryRecordInput[], options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const current = new Map<string, AnalysisRecord>();
  const key = (kind: string, recordId: string) => `${kind}/${recordId}`;
  for (const r of records) current.set(key(r.kind, r.recordId), { kind: r.kind, recordId: r.recordId, version: contentVersion(r.payload), inputs: [], payload: r.payload });
  const claims = new Map<string, { holder: string; expiresAt: number }>();
  const ledger: SpendEntry[] = [];
  const store: PreparationStore = {
    async getActiveRecord(kind, recordId) { return current.get(key(kind, recordId)) ?? null; },
    async putDerivedRecord(args) {
      const version = contentVersion(args.payload);
      current.set(key(args.kind, args.recordId), { kind: args.kind, recordId: args.recordId, version, inputs: args.inputs as InputRef[], payload: args.payload });
      return { version };
    },
    async claim(kind, recordId, holder, ttlMs) {
      const k = key(kind, recordId);
      const existing = claims.get(k);
      if (existing && existing.holder !== holder && existing.expiresAt > now()) return { held: false };
      claims.set(k, { holder, expiresAt: now() + ttlMs });
      return { held: true };
    },
    async release(kind, recordId, holder) { if (claims.get(key(kind, recordId))?.holder === holder) claims.delete(key(kind, recordId)); },
    async recordSpend(entry) { ledger.push({ ...entry, at: now() }); },
  };
  return {
    store, ledger,
    async listMoments(): Promise<MomentRange[]> {
      return [...current.values()].filter((r) => r.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) }));
    },
    /** Forget a derived record so the next assembly remakes it (a cold run). */
    clear(kind: "look" | "plan", recordId: string) { current.delete(key(kind, recordId)); },
    has(kind: string, recordId: string) { return current.has(key(kind, recordId)); },
  };
}
