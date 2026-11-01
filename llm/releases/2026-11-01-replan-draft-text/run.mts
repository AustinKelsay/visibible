/** One-use correction-only diagnostic. Default is network-free; --execute uses the existing evaluation ledger. */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { z } from "zod";
import { planOutputSchema } from "../../../src/lib/engine/preparation";
import { PLAN_SCENE_FIELDS } from "../../../src/lib/engine/plan-review";
import { parseModelJson } from "../../../src/lib/reading-pass/model";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, type ModelPricing } from "../../../src/lib/image-evals/suite-run";
const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, "../../..");
const read = <T,>(file: string): T => JSON.parse(readFileSync(resolve(dir, file), "utf8"));
const save = (file: string, value: unknown) => writeFileSync(resolve(dir, file), JSON.stringify(value, null, 2) + "\n");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const { values } = parseArgs({ options: { execute: { type: "boolean" } } });
const plan = read<{ model: string; repeats: number; maximumCalls: number; operationCapUsd: number; cumulativeCapUsd: number;
  priorConservativeUsd: number; readerReserveUsd: number; priorFunding: string; retainedPricing: string; candidatePatch: string }>("plan.json");
const funding = read<{ status: string; operationCapUsd: number; cumulativeCapUsd: number; priorConservativeUsd: number; readerReserveUsd: number }>("funding.json");
const manifest = read<Record<string, string>>("manifest.json");
const verifySources = () => { for (const [file, expected] of Object.entries(manifest)) assert.equal(hash(readFileSync(resolve(root, file))), expected, file); };
verifySources();
execFileSync("git", ["apply", "--check", resolve(root, plan.candidatePatch)], { cwd: root, stdio: "pipe" });
const prior = JSON.parse(readFileSync(resolve(root, plan.priorFunding), "utf8"));
assert.equal(prior.cumulativeConservativeUsd, plan.priorConservativeUsd); assert.equal(prior.cumulativeCapUsd, plan.cumulativeCapUsd);
assert.ok(plan.priorConservativeUsd + plan.operationCapUsd <= plan.cumulativeCapUsd);
assert.equal(funding.status, "within-existing-grant");
for (const key of ["operationCapUsd", "cumulativeCapUsd", "priorConservativeUsd", "readerReserveUsd"] as const) assert.equal(funding[key], plan[key]);
type Packet = { model: string; messages: Array<{ role: string; content: string }>; max_tokens: number; reasoning: { effort: string };
  response_format: { json_schema: { schema: { properties: { selectedCast: { items: { properties: { entryId: { enum: string[] } } } } } } } } };
const cases = read<Array<{ id: string }>>("cases.json");
const arms = { baseline: read<Record<string, Packet>>("baseline-requests.json"), "with-draft": read<Record<string, Packet>>("with-draft-requests.json") };
for (const arm of Object.values(arms)) assert.deepEqual(Object.keys(arm).sort(), cases.map((c) => c.id).sort());
for (const c of cases) {
  const baseline = arms.baseline[c.id], candidate = arms["with-draft"][c.id];
  assert.deepEqual({ ...candidate, messages: baseline.messages }, baseline); assert.deepEqual(candidate.messages[0], baseline.messages[0]);
  assert.equal(candidate.messages.length, 2); assert.equal(baseline.messages.length, 2);
  const marker = "\n\nA PREVIOUS PLAN FOR THIS MOMENT WAS REJECTED.";
  assert.equal(baseline.messages[1].content.split(marker).length, 2); assert.equal(candidate.messages[1].content.split(marker).length, 2);
  assert.equal(baseline.messages[1].content.split(marker)[0], candidate.messages[1].content.split(marker)[0]);
  assert.equal(candidate.model, plan.model); assert.equal(candidate.max_tokens, 2400); assert.equal(candidate.reasoning.effort, "none");
}
type Job = { id: string; caseId: string; arm: keyof typeof arms; repeat: number; request: Packet };
const jobs: Job[] = [];
for (let repeat = 1; repeat <= plan.repeats; repeat++) for (const c of cases) {
  const order: Array<keyof typeof arms> = repeat % 2 ? ["baseline", "with-draft"] : ["with-draft", "baseline"];
  for (const arm of order) jobs.push({ id: `${c.id}/${arm}/${repeat}`, caseId: c.id, arm, repeat, request: arms[arm][c.id] });
}
assert.equal(jobs.length, plan.maximumCalls); assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);
const ceilingsFor = (pricing: ModelPricing) => jobs.map((j) => { const n = requestCeilingUsd("text", j.request, pricing); assert.ok(n !== null); return n; });
const retained = JSON.parse(readFileSync(resolve(root, plan.retainedPricing), "utf8"));
const retainedPricing = modelPricing(retained.models.find((m: { id: string }) => m.id === plan.model)); assert.ok(retainedPricing);
const retainedCeilings = ceilingsFor(retainedPricing);
assert.ok(retainedCeilings.reduce((a, b) => a + b, 0) <= plan.operationCapUsd);
const summary = { scope: "Mechanical rehearsal, not semantic evidence", networkCalls: 0, requests: jobs.length, sourceHashes: manifest,
  retainedPricingCeilingUsd: retainedCeilings.reduce((a, b) => a + b, 0), jobs: jobs.map(({ request, ...job }) => ({ ...job, requestSha256: hash(JSON.stringify(request)) })) };
async function run(send: (job: Job) => Promise<Response>, capture: (answer: unknown) => void) {
  for (const job of jobs) {
    verifySources();
    const response = await send(job); assert.ok(response.ok, `HTTP ${response.status}; stop, do not reroll`);
    const payload = await response.json(), content = payload.choices?.[0]?.message?.content ?? "";
    const ids = job.request.response_format.json_schema.schema.properties.selectedCast.items.properties.entryId.enum;
    const schema = planOutputSchema.omit({ present: true }).extend({ focusQuote: z.string(), instant: z.string(),
      selectedCast: z.array(z.object({ entryId: z.enum(ids), evidence: z.string() }).strict()) }).strict();
    const parsed = parseModelJson(schema, content); assert.ok("value" in parsed, "Malformed correction; retain raw exchange and stop");
    assert.equal(payload.model, plan.model); assert.equal(payload.choices[0].finish_reason, "stop");
    const { request, ...identity } = job;
    capture({ ...identity, requestSha256: hash(JSON.stringify(request)), providerId: payload.id, model: payload.model, content, answer: parsed.value,
      normalizedCorrection: { present: [...new Set(parsed.value.selectedCast.map((c) => c.entryId))], ...Object.fromEntries(PLAN_SCENE_FIELDS.map((f) => {
        const text = parsed.value[f]; return [f, text.length <= 400 ? text : `${text.slice(0, 399).trimEnd()}…`];
      })) } });
  }
}
if (!values.execute) {
  execFileSync(process.execPath, ["--import", "tsx", resolve(dir, "replay.mts")], { cwd: root, stdio: "pipe" });
  const stops: Record<string, { sent: number; captured: number; blocked: string | null; uncertainUsd: number }> = {};
  for (const fault of ["none", "http", "schema", "missing-usage", "over-ceiling", "exception"]) {
    let sent = 0, captured = 0;
    const ledger = createLedger({ capUsd: plan.operationCapUsd, reserves: { text: 0, image: 0, check: 0 }, limits: { text: jobs.length, image: 0, check: 0 },
      ceiling: (kind, request) => requestCeilingUsd(kind, request, retainedPricing), save: () => {}, log: () => {}, scrub: (v) => v,
      fetch: async () => {
        sent++; if (fault === "exception") throw new Error("fake timeout");
        const content = fault === "schema" ? "invalid" : JSON.stringify({ focusQuote: "offline", instant: "offline", selectedCast: [], ...Object.fromEntries(PLAN_SCENE_FIELDS.map((f) => [f, "offline"])) });
        return Response.json({ id: "offline", model: plan.model, choices: [{ finish_reason: "stop", message: { content } }],
          ...(fault === "missing-usage" ? {} : { usage: { cost: fault === "over-ceiling" ? 1 : 0.000001 } }) }, { status: fault === "http" ? 500 : 200 });
      } });
    const trial = () => run(async (job) => { const r = await ledger.fetchFor("text", () => job.id)("https://openrouter.ai/api/v1/chat/completions", { body: JSON.stringify(job.request) }); assert.equal(ledger.state.blocked, null); return r; }, () => { captured++; });
    if (fault === "none") { await trial(); assert.equal(sent, jobs.length); assert.equal(captured, jobs.length); }
    else { await assert.rejects(trial()); assert.equal(sent, 1); assert.equal(captured, 0); }
    stops[fault] = { sent, captured, blocked: ledger.state.blocked, uncertainUsd: ledger.state.uncertainUsd };
  }
  save("verification.json", { ...summary, stops });
  console.log(`Rehearsed ${jobs.length} requests, five stop paths; retained-price ceiling $${summary.retainedPricingCeilingUsd}. No network.`);
} else {
  assert.ok(!existsSync(resolve(dir, "run-started.json")), "Single-use diagnostic; do not restart");
  const verified = read<typeof summary>("verification.json");
  assert.deepEqual(verified.jobs, summary.jobs); assert.deepEqual(verified.sourceHashes, manifest);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit reviewed preparation before spending");
  const env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  const apiKey = env.OPENROUTER_API_KEY?.trim(); assert.ok(apiKey);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const get = async (endpoint: string) => { const r = await fetch(`https://openrouter.ai/api/v1/${endpoint}`, { headers, signal: AbortSignal.timeout(15_000) }); assert.ok(r.ok); return (await r.json()).data; };
  const funds = async (required: number) => {
    const [credits, key] = await Promise.all([get("credits"), get("key")]);
    const balanceUsd = credits.total_credits - credits.total_usage;
    assert.ok(Number.isFinite(balanceUsd) && balanceUsd >= required + plan.readerReserveUsd, "Preserve $5 reader reserve");
    assert.ok(key.limit_remaining === null || key.limit_remaining >= required + 1, "Insufficient key allowance");
    return { balanceUsd, keyLimitRemaining: key.limit_remaining };
  };
  const before = await funds(plan.operationCapUsd), catalog = await get("models");
  const model = catalog.find((m: { id: string }) => m.id === plan.model), pricing = modelPricing(model); assert.ok(pricing);
  const ceilings = ceilingsFor(pricing); assert.ok(ceilings.reduce((a, b) => a + b, 0) <= plan.operationCapUsd, "All calls must fit before spending");
  writeFileSync(resolve(dir, "run-started.json"), JSON.stringify({ at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sources: manifest, model, pricing, ceilings, ...before }, null, 2) + "\n", { flag: "wx" });
  const ledger = createLedger({ capUsd: plan.operationCapUsd, reserves: { text: 0, image: 0, check: 0 }, limits: { text: jobs.length, image: 0, check: 0 },
    ceiling: (kind, request) => requestCeilingUsd(kind, request, pricing), fetch: (url, init) => fetch(url, init), save: (state) => save("ledger.json", state),
    log: (entry) => appendFileSync(resolve(dir, "provider.ndjson"), JSON.stringify(entry) + "\n"), scrub: (v) => scrubForLog(v, apiKey, hash) });
  await run(async (job) => {
    assert.equal(ledger.state.blocked, null); await funds(plan.operationCapUsd - ledger.state.measuredUsd);
    const r = await ledger.fetchFor("text", () => job.id)("https://openrouter.ai/api/v1/chat/completions", { method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "X-Title": "visibible-replan-draft-diagnostic" }, body: JSON.stringify(job.request), signal: AbortSignal.timeout(25_000) });
    assert.equal(ledger.state.blocked, null); return r;
  }, (answer) => appendFileSync(resolve(dir, "answers.ndjson"), JSON.stringify(answer) + "\n"));
  assert.equal(ledger.state.blocked, null); assert.equal(ledger.state.uncertainUsd, 0); assert.ok(ledger.state.calls.every((c) => c.status !== "in-flight"));
  verifySources();
  const finished = { at: new Date().toISOString(), calls: ledger.state.counts, measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd,
    cumulativeConservativeUsd: plan.priorConservativeUsd + ledger.state.measuredUsd, cumulativeCapUsd: plan.cumulativeCapUsd };
  save("run-finished.json", finished);
  save("run-finished.json", { ...finished, ...await funds(0) });
  console.log(`Captured ${jobs.length} corrections; $${ledger.state.measuredUsd}. Inspect every field before interpreting.`);
}
