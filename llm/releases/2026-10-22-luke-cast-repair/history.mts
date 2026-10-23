/** Read-only retained version histories after the completed correction/text operation. */
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { environment, json, save, scoped } from "./inspect.mjs";
import { row } from "./correction.mjs";

const env = environment(), client = new ConvexHttpClient(env.url), final = json("final.json");
const histories = [];
for (const [kind, recordId] of scoped.filter(([kind]) => kind !== "moment")) {
  const history = await client.query(api.analysis.listRecordHistory, { workId: "bible-web", kind, recordId });
  const current = history.find((record) => record.status === "current");
  assert.equal(current?.version ?? null, row(final, kind, recordId)?.version ?? null);
  histories.push({ kind, recordId, history });
}
save("histories.json", { at: new Date().toISOString(), histories, paidCalls: 0, productionMutations: 0 });
console.log(JSON.stringify({ histories: histories.length, productionMutations: 0 }));
