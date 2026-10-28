/** Ordinary preparation on current source records; one retained outcome per declared moment. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { createConvexPreparationStore, prepareMoment, PreparationUnavailableError } from "../../../src/lib/engine/preparation";
import { estimateRequestCostUsd, READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { dir, root, json, hash, save, environment, sources } from "./inspect.mjs";
import { row } from "./correction.mjs";
import { boundedModel, plain } from "./model.mjs";

const [command, unit, phase] = process.argv.slice(2);
assert.ok(command === "dry-run" || (command === "prepare" && process.argv.includes("--execute")));
assert.ok(["luke-10-33", "luke-10-34", "daniel-7-9", "daniel-7-10"].includes(unit));
assert.match(phase, /^[a-z0-9-]+$/);
const state = json(`${phase}.json`), inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(sources(), state.sources); assert.ok(Date.now() - Date.parse(state.at) < 30 * 60_000);
const prior = unit === "luke-10-34" ? "luke-10-33" : unit === "daniel-7-10" ? "daniel-7-9" : null;
if (prior) {
  const review = json(`review-${prior}.json`);
  assert.equal(review.verdict, "accept-for-next-text-check");
  assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, `scene-${prior}.json`))));
}
if (unit === "daniel-7-9") {
  const luke = json("review-luke-10-33.json");
  assert.equal(luke.artifactSha256, hash(fs.readFileSync(path.join(dir, "scene-luke-10-33.json"))));
  if (luke.verdict === "accept-for-next-text-check") assert.ok(json("review-luke-10-34.json"));
}
const env = environment(), client = new ConvexHttpClient(env.url);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" }); assert.deepEqual(status, state.status);
for (const r of state.records) assert.deepEqual(await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: r.kind, recordId: r.recordId }), r.record);
const moment = row(state, "moment", unit)!, section = row(state, "section", String(moment.payload.sectionId))!;
const context = momentContext(inputs.work, { id: unit, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
const store = createConvexPreparationStore({ query: (ref, args) => client.query(ref as never, args as never), mutation: (ref, args) => client.mutation(ref as never, args as never) }, api.analysis, "bible-web", env.secret);
const options = { workId: "bible-web", momentId: unit, store, brief: inputs.brief, briefVersion: inputs.briefVersion, context, holder: `luke-cast-repair-${unit}` };
if (command === "dry-run") {
  let request: ReturnType<typeof plain> | undefined, attempts = 0;
  try {
    await prepareMoment({ ...options, store: { ...store, claim: async () => ({ held: true }), release: async () => {}, recordSpend: async () => {}, putDerivedRecord: async () => { throw Error("Dry run forbids writes"); } }, model: { id: READING_PASS_MODEL, complete: async (r) => { attempts++; if (request) assert.deepEqual(plain(r), request); else request = plain(r); throw Error("dry-run capture"); } } });
    assert.fail("Dry run expected a missing derived record");
  } catch (error) { assert.ok(error instanceof PreparationUnavailableError && error.message.endsWith("dry-run capture")); }
  assert.equal(attempts, 2); assert.ok(request);
  save(`dry-run-${unit}.json`, { at: new Date().toISOString(), snapshot: phase, request, estimatedUsd: estimateRequestCostUsd(request), context, paidCalls: 0, productionMutations: 0 });
  console.log(JSON.stringify({ unit, dryRun: true, schema: request.schemaName }));
} else {
  const dry = json(`dry-run-${unit}.json`); assert.equal(dry.snapshot, phase); assert.deepEqual(dry.context, context);
  save(`started-${unit}.json`, { at: new Date().toISOString(), unit, snapshot: phase, retryPolicy: "Retain first ordinary outcome; do not rerun after an ambiguous result." });
  const model = boundedModel(`prepare:${unit}`, (request, first) => {
    assert.ok(request.schemaName === "section_look" || request.schemaName === "scene_plan"); assert.equal(request.maxTokens, 900);
    assert.ok(request.label.startsWith(`look:${section.recordId}:`) || request.label.startsWith(`plan:${unit}:`));
    if (first) assert.deepEqual(plain(request), dry.request);
  }, "preparation-preflight.json");
  try {
    const result = await prepareMoment({ ...options, model });
    save(`scene-${unit}.json`, { at: new Date().toISOString(), snapshot: phase, context, result });
    console.log(JSON.stringify({ unit, result }));
  } catch (error) {
    save(`scene-${unit}.json`, { at: new Date().toISOString(), snapshot: phase, context, error: { name: error instanceof Error ? error.name : "Error", message: String(error) } });
    throw error;
  }
}
