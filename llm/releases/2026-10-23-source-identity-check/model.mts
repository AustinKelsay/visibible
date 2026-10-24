/** One evaluation cap across all samples; reserves before every actual request and stops on uncertain usage. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createOpenRouterTextModel, estimateRequestCostUsd, READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { responseSchema } from "../../../src/lib/reading-pass/prompts";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { dir, environment, hash, json } from "./common.mjs";

export const plain = (request: TextModelRequest) => ({ system: request.system, user: request.user, schemaName: request.schemaName,
  schema: responseSchema(request.schema), maxTokens: request.maxTokens, expectedCompletionTokens: request.expectedCompletionTokens, reasoningEffort: request.reasoningEffort ?? "none" });

/** Shared across samples: the ledger persists after every call so an interrupted run cannot overspend. */
export function evaluationModel(snapshot: { at: string; balanceUsd: number; pricing: { pricing: { completion: string } } }) {
  const plan = json("plan.json"), env = environment(), cap = plan.evaluation;
  assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
  assert.ok(snapshot.balanceUsd > cap.capUsd);
  assert.ok(cap.measuredBeforeUsd + cap.uncertaintyBeforeUsd + cap.capUsd <= cap.authorizedUsd);
  const ledgerFile = path.join(dir, "ledger.json");
  assert.ok(!fs.existsSync(ledgerFile), "One-shot: the ledger already exists");
  const ledger = { calls: [] as Array<{ phase: string; startedAt: string; status: string; measuredUsd: number | null }>, measuredUsd: 0, uncertainUsd: 0, blocked: null as string | null };
  const flush = () => fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
  flush();
  const nativeFetch = globalThis.fetch;
  let current: ReturnType<typeof plain>, phase = "";
  const adapter = createOpenRouterTextModel({ apiKey: env.key, timeoutMs: 120_000, fetch: async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0);
    assert.ok(ledger.calls.length < cap.maximumCalls);
    assert.ok(ledger.measuredUsd + cap.reservePerCallUsd <= cap.capUsd);
    const request = JSON.parse(String(init.body));
    assert.equal(request.model, READING_PASS_MODEL);
    assert.deepEqual(request.reasoning, { effort: current.reasoningEffort });
    assert.deepEqual(request.provider, { require_parameters: true, order: ["anthropic"], allow_fallbacks: false });
    assert.equal(request.temperature, undefined, "Production sampling defaults must be kept");
    assert.deepEqual(request.messages, [{ role: "system", content: current.system }, { role: "user", content: current.user }]);
    assert.deepEqual(request.response_format, { type: "json_schema", json_schema: { name: current.schemaName, strict: true, schema: current.schema } });
    assert.equal(request.max_tokens, current.maxTokens);
    const call = { phase, startedAt: new Date().toISOString(), status: "in-flight", measuredUsd: null as number | null };
    ledger.calls.push(call); ledger.uncertainUsd += cap.reservePerCallUsd; flush();
    try {
      const response = await nativeFetch(url, init); const payload = await response.clone().json();
      delete payload.user_id;
      if (payload.choices) for (const choice of payload.choices) if (choice.message?.reasoning_details) choice.message.reasoning_details = choice.message.reasoning_details.filter((item: { type: string }) => item.type !== "reasoning.encrypted");
      const cost = extractOpenRouterUsageUsd(payload);
      fs.appendFileSync(path.join(dir, "provider.ndjson"), JSON.stringify({ ...call, completedAt: new Date().toISOString(), request, status: response.status, response: payload, measuredUsageUsd: cost }) + "\n");
      call.status = String(response.status); call.measuredUsd = cost;
      if (cost === null) ledger.blocked = "Missing provider usage";
      else { ledger.uncertainUsd -= cap.reservePerCallUsd; ledger.measuredUsd += cost; }
      if (!response.ok || ledger.measuredUsd > cap.capUsd) ledger.blocked = "Provider error or exhausted cap";
      flush(); return response;
    } catch (error) {
      ledger.blocked = error instanceof Error ? error.message : String(error); call.status = "uncertain"; flush(); throw error;
    }
  } });
  /** A per-sample model: the label prefix identifies the sample in the ledger and provider log. */
  const forSample = (sample: string, check: (request: TextModelRequest, first: boolean) => void) => {
    let first = true;
    return { id: adapter.id, complete: async (request: TextModelRequest) => {
      check(request, first); first = false;
      current = plain(request); phase = sample;
      const estimatedUsd = estimateRequestCostUsd(current);
      const maximumCompletionEstimatedUsd = estimatedUsd + (current.maxTokens - current.expectedCompletionTokens) * Number(snapshot.pricing.pricing.completion);
      assert.ok(maximumCompletionEstimatedUsd < cap.reservePerCallUsd);
      // Log local cap refusals too: preparation may exercise its ordinary retry after a stop.
      if (!ledger.blocked && (ledger.calls.length >= cap.maximumCalls || ledger.measuredUsd + cap.reservePerCallUsd > cap.capUsd)) {
        ledger.blocked = "Evaluation cap/headroom exhausted"; flush();
      }
      fs.appendFileSync(path.join(dir, "inputs.ndjson"), JSON.stringify({ at: new Date().toISOString(), sample, label: request.label, requestSha256: hash(JSON.stringify(current)), estimatedUsd, maximumCompletionEstimatedUsd, blocked: ledger.blocked }) + "\n");
      if (ledger.blocked) throw Error(`Evaluation stopped: ${ledger.blocked}`);
      return adapter.complete(request);
    } };
  };
  return { ledger, forSample };
}
