/** A shared operation cap; reserves before every actual request and stops on uncertain usage. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createOpenRouterTextModel, estimateRequestCostUsd, READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { responseSchema } from "../../../src/lib/reading-pass/prompts";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { dir, environment, json, save, sources } from "./inspect.mjs";

export const plain = (request: TextModelRequest) => ({ system: request.system, user: request.user, schemaName: request.schemaName,
  schema: responseSchema(request.schema), maxTokens: request.maxTokens, expectedCompletionTokens: request.expectedCompletionTokens });
export function boundedModel(phase: string, check: (request: TextModelRequest, first: boolean) => void, preflightName = "preflight.json") {
  assert.ok(preflightName === "preflight.json" || preflightName === "preparation-preflight.json");
  const plan = json("plan.json"), preflight = json(preflightName), env = environment();
  assert.deepEqual(sources(), preflight.sources);
  assert.ok(Date.now() - Date.parse(preflight.at) < 60 * 60_000);
  assert.ok(preflight.balanceUsd > plan.preparation.capUsd);
  assert.ok(plan.preparation.measuredBeforeUsd + plan.preparation.uncertaintyBeforeUsd + plan.preparation.capUsd <= plan.preparation.authorizedUsd);
  const ledgerFile = path.join(dir, "ledger.json");
  const ledger = fs.existsSync(ledgerFile) ? json("ledger.json") : { calls: [], measuredUsd: 0, uncertainUsd: 0, blocked: null };
  const flush = () => fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
  const nativeFetch = globalThis.fetch;
  let current: ReturnType<typeof plain>, first = true;
  const model = createOpenRouterTextModel({ apiKey: env.key, timeoutMs: 120_000, fetch: async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0);
    assert.ok(ledger.calls.length < plan.preparation.maximumCalls);
    assert.ok(ledger.measuredUsd + plan.preparation.reservePerCallUsd <= plan.preparation.capUsd);
    const request = JSON.parse(String(init.body));
    assert.equal(request.model, READING_PASS_MODEL);
    assert.deepEqual(request.reasoning, { effort: "none" });
    assert.deepEqual(request.provider, { require_parameters: true, order: ["anthropic"], allow_fallbacks: false });
    assert.deepEqual(request.messages, [{ role: "system", content: current.system }, { role: "user", content: current.user }]);
    assert.deepEqual(request.response_format, { type: "json_schema", json_schema: { name: current.schemaName, strict: true, schema: current.schema } });
    assert.equal(request.max_tokens, current.maxTokens);
    const call = { phase, label: current.schemaName, startedAt: new Date().toISOString(), status: "in-flight", measuredUsd: null as number | null };
    ledger.calls.push(call); ledger.uncertainUsd += plan.preparation.reservePerCallUsd; flush();
    try {
      const response = await nativeFetch(url, init); const payload = await response.clone().json();
      delete payload.user_id;
      if (payload.choices) for (const choice of payload.choices) if (choice.message?.reasoning_details) choice.message.reasoning_details = choice.message.reasoning_details.filter((item: { type: string }) => item.type !== "reasoning.encrypted");
      const cost = extractOpenRouterUsageUsd(payload);
      fs.appendFileSync(path.join(dir, "provider.ndjson"), JSON.stringify({ ...call, completedAt: new Date().toISOString(), request, status: response.status, response: payload, measuredUsageUsd: cost }) + "\n");
      call.status = String(response.status); call.measuredUsd = cost;
      if (cost === null) ledger.blocked = "Missing provider usage";
      else { ledger.uncertainUsd -= plan.preparation.reservePerCallUsd; ledger.measuredUsd += cost; }
      if (!response.ok || ledger.measuredUsd > plan.preparation.capUsd) ledger.blocked = "Provider error or exhausted cap";
      flush(); return response;
    } catch (error) {
      ledger.blocked = error instanceof Error ? error.message : String(error); call.status = "uncertain"; flush(); throw error;
    }
  } });
  return { id: model.id, complete: async (request: TextModelRequest) => {
    check(request, first); first = false;
    current = plain(request);
    const estimatedUsd = estimateRequestCostUsd(current);
    const maximumCompletionEstimatedUsd = estimatedUsd + (current.maxTokens - current.expectedCompletionTokens) * Number(preflight.pricing.pricing.completion);
    assert.ok(maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
    save(`input-${ledger.calls.length + 1}.json`, { at: new Date().toISOString(), phase, label: request.label, request: current, estimatedUsd, maximumCompletionEstimatedUsd });
    return model.complete(request);
  } };
}
