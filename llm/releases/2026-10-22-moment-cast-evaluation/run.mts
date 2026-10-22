/** Retained bounded text operation. Artifacts are evidence, not authorization to replay. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { createConvexPreparationStore, prepareMoment, PreparationUnavailableError, type AnalysisRecord } from "../../../src/lib/engine/preparation";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { createOpenRouterTextModel, estimateRequestCostUsd, READING_PASS_MODEL, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import { responseSchema } from "../../../src/lib/reading-pass/prompts";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const hash = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
export const json = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
const save = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
const sourceFiles = ["convex/analysis.ts", "convex/schema.ts", "convex/_helpers/contentVersion.ts", "src/lib/engine/preparation.ts", "src/lib/engine/assemble.ts", "src/lib/engine/prompt.ts", "src/lib/engine/work-inputs.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "src/lib/image-response.ts", "src/lib/canon-showing.ts", "works/bible-web/work.json", "works/bible-web/brief.json", "styles/classical.json", "styles/watercolor.json", "styles/icon.json"];
export const sources = () => Object.fromEntries(sourceFiles.map((f) => [f, hash(fs.readFileSync(path.join(root, f)))]));
const scoped = [["section", "daniel-7-9"], ["entry", "the_ancient_of_days"], ["entry", "ministering_assembly_in_daniels_vision"], ["entry", "daniel_prophet_of_babylon"], ["entry", "one_like_a_son_of_man"], ["entry", "babylon"], ["look", "daniel-7-9"], ["moment", "daniel-7-9"], ["moment", "daniel-7-10"], ["plan", "daniel-7-9"], ["plan", "daniel-7-10"]] as const;
export const row = (snapshot: { records: Array<{ kind: string; recordId: string; record: (AnalysisRecord & { source: string }) | null }> }, kind: string, id: string) => snapshot.records.find((r) => r.kind === kind && r.recordId === id)?.record;
export const plain = (r: TextModelRequest) => ({ system: r.system, user: r.user, schemaName: r.schemaName, schema: responseSchema(r.schema), maxTokens: r.maxTokens, expectedCompletionTokens: r.expectedCompletionTokens });

function environment() {
  assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE && process.env.VISIBIBLE_CURRENT_ENV_FILE);
  const e = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
  const current = parseEnv(fs.readFileSync(process.env.VISIBIBLE_CURRENT_ENV_FILE, "utf8"));
  for (const config of [e, current]) {
    assert.equal(config.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!config.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
    assert.equal(config.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com");
  }
  for (const key of ["CONVEX_SERVER_SECRET", "OPENROUTER_API_KEY"]) assert.ok(e[key] && e[key] !== "[SENSITIVE]");
  return { url: e.NEXT_PUBLIC_CONVEX_URL!, secret: e.CONVEX_SERVER_SECRET!, key: e.OPENROUTER_API_KEY! };
}

async function main() {
  const command = process.argv[2], plan = json("plan.json"), e = environment();
  const client = new ConvexHttpClient(e.url);
  const inputs = await readWorkInputs("bible-web", root);
  const query = (kind: typeof scoped[number][0], recordId: string) => client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind, recordId });
  if (command === "snapshot") {
    const phase = process.argv[3]; assert.ok(["before", "after-9", "after-10"].includes(phase));
    const records = [];
    for (const [kind, recordId] of scoped) records.push({ kind, recordId, record: await query(kind, recordId) });
    const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
    assert.ok(status.ready && status.activeGeneration === 1);
    assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);
    const histories = [];
    for (const [kind, recordId] of scoped.filter(([k]) => ["section", "entry", "look", "plan"].includes(k))) histories.push({ kind, recordId, history: await client.query(api.analysis.listRecordHistory, { workId: "bible-web", kind, recordId }) });
    const spend = await client.query(api.analysis.getPreparationSpend, { workId: "bible-web" });
    const catalogResponse = await fetch("https://visibible.com/api/image-models"); assert.ok(catalogResponse.ok);
    const catalog = await catalogResponse.json(); assert.ok(catalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
    const pricingResponse = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(pricingResponse.ok);
    const pricing = (await pricingResponse.json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
    assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
    const creditsResponse = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${e.key}` } }); assert.ok(creditsResponse.ok);
    const { data } = await creditsResponse.json();
    if (phase === "before") {
      const previous = JSON.parse(fs.readFileSync(path.join(root, "llm/releases/2026-10-22-formless-look-evaluation/after-10.json"), "utf8"));
      assert.deepEqual(records, previous.records); assert.deepEqual(spend, previous.spend);
    }
    save(`${phase}.json`, { at: new Date().toISOString(), phase, sources: sources(), status, records, histories, spend, catalog, pricing,
      balanceUsd: data.total_credits - data.total_usage, environment: { mode: "disabled", ownerSessionConfigured: false, convexUrl: e.url }, publicActivation: false });
    console.log(JSON.stringify({ phase, records: records.length, spend, publicActivation: false })); return;
  }
  assert.ok(command === "dry-run" || (command === "prepare" && process.argv.includes("--execute")));
  const before = json("before.json"); assert.deepEqual(sources(), before.sources);
  const unit = process.argv[3]; assert.ok(unit === "daniel-7-9" || unit === "daniel-7-10");
  const snapshot = unit.endsWith("-9") ? before : json("after-9.json");
  assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
  assert.deepEqual(sources(), snapshot.sources);
  if (unit.endsWith("-10")) {
    const review = json("review-9.json"); assert.equal(review.verdict, "accept-for-next-text-check");
    assert.equal(review.artifactSha256, hash(fs.readFileSync(path.join(dir, "scene-9.json"))));
  }
  const moment = row(snapshot, "moment", unit)!, section = row(snapshot, "section", "daniel-7-9")!;
  const context = momentContext(inputs.work, { id: unit, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) }, { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  for (const r of snapshot.records) assert.deepEqual(await query(r.kind, r.recordId), r.record);
  const store = createConvexPreparationStore({ query: (ref, args) => client.query(ref as never, args as never), mutation: (ref, args) => client.mutation(ref as never, args as never) }, api.analysis, "bible-web", e.secret);
  const number = unit.endsWith("-9") ? "9" : "10";
  const options = { workId: "bible-web", momentId: unit, store, brief: inputs.brief, briefVersion: inputs.briefVersion, context, holder: `moment-cast-${number}` };
  if (command === "dry-run") {
    let request: ReturnType<typeof plain> | undefined; let attempts = 0;
    try {
      await prepareMoment({ ...options, store: { ...store, claim: async () => ({ held: true }), release: async () => {}, recordSpend: async () => {}, putDerivedRecord: async () => { throw Error("Dry run forbids writes"); } }, model: { id: READING_PASS_MODEL, complete: async (r) => { attempts++; if (request) assert.deepEqual(plain(r), request); else request = plain(r); throw Error("dry-run capture"); } } });
      assert.fail("Dry run must not prepare");
    } catch (error) { assert.ok(error instanceof PreparationUnavailableError && error.message.endsWith("dry-run capture")); }
    assert.equal(attempts, 2); assert.ok(request);
    save(`dry-run-${number}.json`, { at: new Date().toISOString(), request, estimatedUsd: estimateRequestCostUsd(request), context, attempts, paidCalls: 0, productionMutations: 0 });
    console.log(JSON.stringify({ unit, dryRun: true, schema: request.schemaName, estimatedUsd: estimateRequestCostUsd(request) })); return;
  }
  assert.ok(before.balanceUsd > plan.preparation.capUsd);
  assert.ok(plan.preparation.measuredBeforeUsd + plan.preparation.uncertaintyBeforeUsd + plan.preparation.capUsd <= plan.preparation.authorizedUsd);
  const dry = json(`dry-run-${number}.json`);
  save(`started-${number}.json`, { at: new Date().toISOString(), unit, status: "started", retryPolicy: "Inspect read-back after an ambiguous outcome; never blindly rerun." });
  const ledgerFile = path.join(dir, "preparation-ledger.json");
  const ledger = fs.existsSync(ledgerFile) ? json("preparation-ledger.json") : { calls: [], measuredUsd: 0, uncertainUsd: 0, blocked: null };
  const flush = () => fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
  const nativeFetch = globalThis.fetch;
  let current: ReturnType<typeof plain>;
  const model = createOpenRouterTextModel({ apiKey: e.key, timeoutMs: 120_000, fetch: async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(ledger.blocked, null); assert.equal(ledger.uncertainUsd, 0);
    assert.ok(ledger.calls.length < plan.preparation.maximumCalls);
    assert.ok(ledger.measuredUsd + plan.preparation.reservePerCallUsd <= plan.preparation.capUsd);
    const request = JSON.parse(String(init.body));
    assert.equal(request.model, READING_PASS_MODEL); assert.deepEqual(request.reasoning, { effort: "none" });
    assert.deepEqual(request.provider, { require_parameters: true, order: ["anthropic"], allow_fallbacks: false });
    assert.deepEqual(request.messages, [{ role: "system", content: current.system }, { role: "user", content: current.user }]);
    assert.deepEqual(request.response_format, { type: "json_schema", json_schema: { name: current.schemaName, strict: true, schema: current.schema } });
    assert.equal(request.max_tokens, 900);
    const call = { unit, label: current.schemaName, startedAt: new Date().toISOString(), status: "in-flight", measuredUsd: null as number | null };
    ledger.calls.push(call); ledger.uncertainUsd += plan.preparation.reservePerCallUsd; flush();
    try {
      const response = await nativeFetch(url, init); const payload = await response.clone().json();
      delete payload.user_id;
      if (payload.choices) for (const choice of payload.choices) if (choice.message?.reasoning_details) choice.message.reasoning_details = choice.message.reasoning_details.filter((r: { type: string }) => r.type !== "reasoning.encrypted");
      const cost = extractOpenRouterUsageUsd(payload);
      fs.appendFileSync(path.join(dir, "provider.ndjson"), JSON.stringify({ ...call, completedAt: new Date().toISOString(), request, status: response.status, response: payload, measuredUsageUsd: cost }) + "\n");
      call.status = String(response.status); call.measuredUsd = cost;
      if (cost === null) ledger.blocked = "Missing provider usage";
      else { ledger.uncertainUsd -= plan.preparation.reservePerCallUsd; ledger.measuredUsd += cost; }
      if (!response.ok || ledger.measuredUsd > plan.preparation.capUsd) ledger.blocked = "Provider error or exhausted cap";
      flush(); return response;
    } catch (error) { ledger.blocked = error instanceof Error ? error.message : String(error); call.status = "uncertain"; flush(); throw error; }
  } });
  let first = true;
  const bounded = { id: model.id, complete: async (r: TextModelRequest) => {
    assert.equal(r.schemaName, "scene_plan", "This operation must reuse the current shared look");
    current = plain(r);
    if (first) { assert.deepEqual(current, dry.request); first = false; }
    const estimatedUsd = estimateRequestCostUsd(current);
    const maximumCompletionEstimatedUsd = estimatedUsd + (current.maxTokens - current.expectedCompletionTokens) * Number(snapshot.pricing.pricing.completion);
    assert.ok(maximumCompletionEstimatedUsd < plan.preparation.reservePerCallUsd);
    assert.ok(r.user.includes("effect names for placement: radiance, fire, cloud, light"));
    save(`input-${number}-${ledger.calls.length + 1}.json`, { at: new Date().toISOString(), label: r.label, request: current, estimatedUsd, maximumCompletionEstimatedUsd });
    return model.complete(r);
  } };
  const started = performance.now();
  const result = await prepareMoment({ ...options, model: bounded });
  save(`scene-${number}.json`, { at: new Date().toISOString(), context, result, preparationElapsedMs: performance.now() - started });
  console.log(JSON.stringify({ unit, calls: result.calls, lookVersion: result.look.version, planVersion: result.plan.version, measuredUsd: ledger.measuredUsd }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
