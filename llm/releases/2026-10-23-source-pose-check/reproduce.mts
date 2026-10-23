/** Replays the exact false-clean reviews; no network, writes, or semantic inference. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { reviewPlan } from "../../../src/lib/engine/plan-review";
import { fixture, god } from "../2026-10-23-formless-selection-check/scenarios.mjs";

const rows = fs.readFileSync(new URL("../2026-10-23-formless-selection-check/provider.ndjson", import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line));
globalThis.fetch = async () => { throw Error("Offline reproduction forbids network"); };
const cases = [["pipeline-s001-1", "s001", "outside_instant", god], ["pipeline-s067-3", "s067", "outside_instant", god], ["pipeline-s074-2", "s074", "not_one_instant", ""]];
let caught = 0;
for (const [id, sample, kind, entryId] of cases) {
  const row = rows.filter((r) => r.phase === id && r.request.response_format.json_schema.name === "plan_review").at(-1)!;
  const input = fixture(sample).review;
  // The exact retained user packet is the reproduction input; the old reply declared it clean.
  const result = await reviewPlan({ id: "retained", complete: async (request) => {
    assert.equal(request.user, row.request.messages[1].content);
    const p = row.response;
    return { content: p.choices[0].message.content, model: p.model, providerRequestId: p.id, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
  } }, async () => {}, id, {
    ...input,
    present: JSON.parse(fs.readFileSync(new URL("../2026-10-23-formless-selection-check/results.ndjson", import.meta.url), "utf8").trim().split("\n").find((line) => JSON.parse(line).id === id)!).result.stored.payload.entries.map((e: { entryId: string }) => e.entryId),
    fields: JSON.parse(fs.readFileSync(new URL("../2026-10-23-formless-selection-check/results.ndjson", import.meta.url), "utf8").trim().split("\n").find((line) => JSON.parse(line).id === id)!).result.stored.payload.plan,
  });
  const hit = "problems" in result && result.problems.some((p) => p.kind === kind && p.entryId === entryId);
  caught += Number(hit);
  console.log(JSON.stringify({ id, expected: { kind, entryId }, caught: hit, result }));
}
assert.equal(caught, cases.length, "Retained reviews falsely accept unsupported presences / conflicting object states; semantic fixes need live evaluation, not scripted approval");
