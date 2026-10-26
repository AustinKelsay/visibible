/** Persistent one-shot cap; funding must be recorded before any paid adapter is created. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createOpenRouterTextModel, READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { dir, environment, hash, json, plain } from "./common.mjs";

export function funding() {
  assert.ok(fs.existsSync(path.join(dir, "funding.json")), "Owner funding is required; no paid request permitted");
  const grant = json("funding.json"), cap = json("plan.json").evaluation;
  assert.ok(typeof grant.authorization === "string" && grant.authorization.trim().length > 0);
  assert.equal(grant.increaseUsd, cap.proposedIncreaseUsd);
  assert.equal(grant.authorizedUsd, cap.proposedAuthorizedUsd);
  assert.equal(grant.operationCapUsd, cap.proposedOperationCapUsd);
  assert.ok(cap.measuredBeforeUsd + cap.uncertaintyBeforeUsd + grant.operationCapUsd <= grant.authorizedUsd);
  return grant;
}
export function evaluationModel(snapshot: { at: string; balanceUsd: number; pricing: { pricing: { prompt: string; completion: string } } }) {
  const grant = funding(), cap = json("plan.json").evaluation, env = environment();
  assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
  assert.ok(snapshot.balanceUsd > grant.operationCapUsd);
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
    assert.ok(ledger.measuredUsd + cap.reservePerCallUsd <= grant.operationCapUsd);
    const request = JSON.parse(String(init.body));
    assert.equal(request.model, READING_PASS_MODEL);
    assert.deepEqual(request.reasoning, { effort: current.reasoningEffort });
    assert.deepEqual(request.provider, { require_parameters: true, order: ["anthropic"], allow_fallbacks: false });
    assert.equal(request.temperature, undefined);
    assert.deepEqual(request.messages, [{ role: "system", content: current.system }, { role: "user", content: current.user }]);
    assert.deepEqual(request.response_format, { type: "json_schema", json_schema: { name: current.schemaName, strict: true, schema: current.schema } });
    assert.equal(request.max_tokens, current.maxTokens);
    const call = { phase, startedAt: new Date().toISOString(), status: "in-flight", measuredUsd: null as number | null };
    ledger.calls.push(call); ledger.uncertainUsd += cap.reservePerCallUsd; flush();
    try {
      const response = await nativeFetch(url, init), body = await response.clone().text();
      let payload;
      let nonJsonBody: { excerpt: string; sha256: string; bytes: number } | undefined;
      try { payload = JSON.parse(body); }
      catch {
        payload = {};
        nonJsonBody = { excerpt: body.replaceAll(env.key, "[redacted]").slice(0, 500), sha256: hash(body), bytes: Buffer.byteLength(body) };
      }
      if (payload && typeof payload === "object") {
        delete payload.user_id;
        if (Array.isArray(payload.choices)) for (const choice of payload.choices) if (Array.isArray(choice?.message?.reasoning_details)) choice.message.reasoning_details = choice.message.reasoning_details.filter((item: { type?: string } | null) => item?.type !== "reasoning.encrypted");
      }
      const cost = extractOpenRouterUsageUsd(payload);
      fs.appendFileSync(path.join(dir, "provider.ndjson"), JSON.stringify({ ...call, completedAt: new Date().toISOString(), request, status: response.status, response: payload, nonJsonBody, measuredUsageUsd: cost }) + "\n");
      call.status = String(response.status); call.measuredUsd = cost;
      if (cost === null) ledger.blocked = "Missing provider usage";
      else { ledger.uncertainUsd -= cap.reservePerCallUsd; ledger.measuredUsd += cost; }
      if (!response.ok || ledger.measuredUsd > grant.operationCapUsd) ledger.blocked = "Provider error or exhausted cap";
      flush(); return response;
    } catch (error) { ledger.blocked = error instanceof Error ? error.message : String(error); call.status = "uncertain"; flush(); throw error; }
  } });
  const forSample = (sample: string, check: (request: TextModelRequest, first: boolean) => void) => {
    let first = true;
    return { id: adapter.id, complete: async (request: TextModelRequest) => {
      check(request, first); first = false;
      current = plain(request); phase = sample;
      const promptUsd = (current.system.length + current.user.length + JSON.stringify(current.schema).length) / 2.7 * Number(snapshot.pricing.pricing.prompt);
      const maximumCompletionEstimatedUsd = promptUsd + current.maxTokens * Number(snapshot.pricing.pricing.completion);
      if (!ledger.blocked && (maximumCompletionEstimatedUsd >= cap.reservePerCallUsd || ledger.calls.length >= cap.maximumCalls || ledger.measuredUsd + cap.reservePerCallUsd > grant.operationCapUsd)) {
        ledger.blocked = "Evaluation cap/headroom exhausted"; flush();
      }
      fs.appendFileSync(path.join(dir, "inputs.ndjson"), JSON.stringify({ at: new Date().toISOString(), sample, label: request.label, requestSha256: hash(JSON.stringify(current)), maximumCompletionEstimatedUsd, blocked: ledger.blocked }) + "\n");
      if (ledger.blocked) throw Error(`Evaluation stopped: ${ledger.blocked}`);
      return adapter.complete(request);
    } };
  };
  return { ledger, forSample };
}
