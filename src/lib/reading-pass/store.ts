/**
 * Where the reading pass writes its results: the analysis store (#168) behind a small interface,
 * so tests can use an in-memory store and the owner command uses Convex with the server secret.
 */
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { FunctionArgs } from "convex/server";

export type AnalysisRecordInput = FunctionArgs<typeof api.analysis.putRecords>["records"][number];

export type AttentionInput = { workId: string; reason: string; kind?: string; recordId?: string; generation?: number; detail?: string };

export interface AnalysisStore {
  registerWork(args: { workId: string; workVersion: string; briefVersion?: string }): Promise<void>;
  stageGeneration(args: { workId: string; workVersion: string; briefVersion: string; note?: string }): Promise<{ generation: number }>;
  putRecords(args: { workId: string; generation: number; records: AnalysisRecordInput[] }): Promise<void>;
  activateGeneration(args: { workId: string; generation: number }): Promise<{ carriedOwnerVersions: string[]; unmatchedOwnerVersions: string[] }>;
  noteAttention(item: AttentionInput): Promise<void>;
}

/** Records are written in batches so one mutation never carries a whole work. */
export const PUT_RECORDS_BATCH = 500;

export function createConvexAnalysisStore(client: ConvexHttpClient, serverSecret: string): AnalysisStore {
  return {
    async registerWork(args) {
      await client.mutation(api.analysis.registerWork, { serverSecret, ...args });
    },
    async stageGeneration(args) {
      return client.mutation(api.analysis.stageGeneration, { serverSecret, ...args });
    },
    async putRecords({ workId, generation, records }) {
      for (let i = 0; i < records.length; i += PUT_RECORDS_BATCH) {
        await client.mutation(api.analysis.putRecords, { serverSecret, workId, generation, records: records.slice(i, i + PUT_RECORDS_BATCH) });
      }
    },
    async activateGeneration(args) {
      const result = await client.mutation(api.analysis.activateGeneration, { serverSecret, ...args });
      return { carriedOwnerVersions: result.carriedOwnerVersions, unmatchedOwnerVersions: result.unmatchedOwnerVersions };
    },
    async noteAttention(item) {
      await client.mutation(api.analysis.noteAttention, { serverSecret, ...item });
    },
  };
}

export function createMemoryAnalysisStore() {
  const generations: Array<{ workId: string; generation: number; workVersion: string; briefVersion: string; records: AnalysisRecordInput[] }> = [];
  const works = new Map<string, { workVersion: string; briefVersion?: string }>();
  const attention: AttentionInput[] = [];
  const activated: number[] = [];
  const store: AnalysisStore = {
    async registerWork({ workId, workVersion, briefVersion }) {
      works.set(workId, { workVersion, briefVersion });
    },
    async stageGeneration({ workId, workVersion, briefVersion }) {
      const generation = generations.filter((g) => g.workId === workId).length + 1;
      generations.push({ workId, generation, workVersion, briefVersion, records: [] });
      return { generation };
    },
    async putRecords({ workId, generation, records }) {
      const target = generations.find((g) => g.workId === workId && g.generation === generation);
      if (!target) throw new Error(`No staged generation ${generation}`);
      for (const record of records) {
        const index = target.records.findIndex((r) => r.kind === record.kind && r.recordId === record.recordId);
        if (index >= 0) target.records[index] = record;
        else target.records.push(record);
      }
    },
    async activateGeneration({ generation }) {
      activated.push(generation);
      return { carriedOwnerVersions: [], unmatchedOwnerVersions: [] };
    },
    async noteAttention(item) {
      attention.push(item);
    },
  };
  return { store, generations, works, attention, activated };
}
