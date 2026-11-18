import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { isOwnerOnlyWork } from "../../../convex/lib/proseWorks";
import { getConvexServerSecret } from "../convex-client";

/**
 * Extra args for a Convex analysis read. The Bible's analysis is public and takes none; any other work is the owner's
 * preview and its reads need the server secret (env by default; scripts pass the one they loaded).
 */
export function analysisAccess(workId: string, serverSecret?: string): { serverSecret?: string } {
  return isOwnerOnlyWork(workId) ? { serverSecret: serverSecret ?? getConvexServerSecret() } : {};
}

/** One stored analysis record as Convex returns it. */
export type AnalysisRecord = { source?: "generated" | "owner"; kind: string; recordId: string; version: string; inputs: Array<{ kind: string; recordId: string; version: string }>; payload: Record<string, unknown> & { kind: string } };

/** Every active entry or section, read through the paged query so a large work never meets the one-call cap. */
export async function listActiveKind(client: Pick<ConvexHttpClient, "query">, workId: string, kind: "entry" | "section", serverSecret?: string) {
  const status = await client.query(api.analysis.getWorkStatus, { workId, ...analysisAccess(workId, serverSecret) });
  return status.activeGeneration === null ? [] : listAnalysisRecords(client, workId, status.activeGeneration, kind, serverSecret);
}

/** A work can have more moments than Convex allows in one query or returned array. */
export async function listAnalysisRecords(
  client: Pick<ConvexHttpClient, "query">,
  workId: string,
  generation: number,
  kind: "entry" | "section" | "moment",
  serverSecret?: string,
) {
  const records: FunctionReturnType<typeof api.analysis.listActiveRecordsPage>["records"] = [];
  let cursor: string | null = null;
  do {
    const page: FunctionReturnType<typeof api.analysis.listActiveRecordsPage> = await client.query(api.analysis.listActiveRecordsPage, { workId, generation, kind, cursor, ...analysisAccess(workId, serverSecret) });
    records.push(...page.records);
    cursor = page.nextCursor;
  } while (cursor !== null);
  // An owner correction between pages can return a record twice; the later row is its replacement.
  return [...new Map(records.map((record) => [record.recordId, record])).values()];
}
