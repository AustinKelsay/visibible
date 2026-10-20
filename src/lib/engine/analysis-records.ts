import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

/** A work can have more moments than Convex allows in one query or returned array. */
export async function listAnalysisRecords(
  client: Pick<ConvexHttpClient, "query">,
  workId: string,
  generation: number,
  kind: "entry" | "section" | "moment" | "look" | "plan",
) {
  const records: FunctionReturnType<typeof api.analysis.listActiveRecordsPage>["records"] = [];
  let cursor: string | null = null;
  do {
    const page: FunctionReturnType<typeof api.analysis.listActiveRecordsPage> = await client.query(api.analysis.listActiveRecordsPage, { workId, generation, kind, cursor });
    records.push(...page.records);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return records;
}
