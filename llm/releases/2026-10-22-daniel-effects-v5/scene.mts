/** Capture the ordinary planner request, then optionally execute it through the shared guard. */
import assert from "node:assert/strict";
import { prepareMoment, PreparationUnavailableError } from "../../../src/lib/engine/preparation";
import { estimateRequestCostUsd, READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { responseSchema } from "../../../src/lib/reading-pass/prompts";
import { overlay, planSources } from "./overlay.mjs";
import { environment, requireSnapshot, json, save, textModel } from "./experiment.mjs";

const execute = process.argv.includes("--execute");
const local = await overlay();
const options = { workId: "bible-web", momentId: "daniel-7-9", store: local.store,
  brief: local.inputs.brief, briefVersion: local.inputs.briefVersion, context: local.context, holder: "isolated-daniel-effects-v5" };
const plain = (r: TextModelRequest) => ({ system: r.system, user: r.user, schemaName: r.schemaName,
  schema: responseSchema(r.schema), maxTokens: r.maxTokens, expectedCompletionTokens: r.expectedCompletionTokens });
if (!execute) {
  globalThis.fetch = async () => { throw new Error("Dry run forbids network"); };
  let request: ReturnType<typeof plain> | undefined;
  let captured = 0;
  try {
    await prepareMoment({ ...options, model: { id: READING_PASS_MODEL, complete: async (r) => {
      captured++;
      if (request) assert.deepEqual(plain(r), request); else request = plain(r);
      throw new Error("dry-run request captured");
    } } });
    assert.fail("Capture must not produce a plan");
  } catch (error) {
    assert.ok(error instanceof PreparationUnavailableError && error.stage === "plan" && error.message.endsWith("dry-run request captured"));
  }
  assert.equal(captured, 2); assert.ok(request); assert.equal(local.writes.length, 0);
  const estimatedUsd = estimateRequestCostUsd(request);
  const maximumCompletionEstimatedUsd = estimatedUsd + (request.maxTokens - request.expectedCompletionTokens) * Number(json("before.json").textModel.pricing.completion);
  assert.ok(maximumCompletionEstimatedUsd < json("plan.json").preparation.reservePerCallUsd);
  save("plan-input.json", { at: new Date().toISOString(), request, context: local.context, overlay: local.audit,
    records: local.records, estimatedUsd, maximumCompletionEstimatedUsd, captureAttempts: captured,
    paidCalls: 0, productionMutations: 0, syntheticPlanProduced: false });
  console.log(JSON.stringify({ estimatedUsd, maximumCompletionEstimatedUsd, captured, paidCalls: 0, productionMutations: 0 }));
} else {
  const { env, nativeFetch } = environment();
  requireSnapshot();
  const input = json("plan-input.json");
  assert.deepEqual(local.audit, input.overlay); assert.deepEqual(planSources(), input.overlay.sourceFiles);
  assert.deepEqual(local.context, input.context); assert.deepEqual(local.records, input.records);
  assert.ok(Date.parse(input.at) > Date.parse(json("canon-review.json").at));
  assert.equal(input.paidCalls, 0); assert.equal(input.productionMutations, 0);
  const bounded = textModel("plan", env.OPENROUTER_API_KEY, nativeFetch, (request) => {
    assert.deepEqual(request.messages, [{ role: "system", content: input.request.system }, { role: "user", content: input.request.user }]);
    assert.deepEqual(request.response_format, { type: "json_schema", json_schema: { name: "scene_plan", strict: true, schema: input.request.schema } });
    assert.equal(request.max_tokens, input.request.maxTokens);
  });
  let status = "failed";
  try {
    const result = await prepareMoment({ ...options, model: bounded.model });
    assert.equal(local.writes.length, 1); assert.equal(result.look.version, local.audit.frozenLookVersion);
    save("scene.json", { at: new Date().toISOString(), result, localWrites: local.writes, localSpends: local.spends,
      records: local.records, productionMutations: 0 });
    status = "completed";
    console.log(JSON.stringify(result, null, 2));
  } finally { bounded.finish(status); }
}
