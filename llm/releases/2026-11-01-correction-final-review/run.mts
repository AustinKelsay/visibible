/** One-use final-review continuation. Default: offline rehearsal. --execute: existing ledger and $0.13 cap. */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, type ModelPricing } from "../../../src/lib/image-evals/suite-run";
import { corrections, dir, root, read, hash, replay, type Packet } from "./replay.mjs";
const { values } = parseArgs({ options: { execute: { type: "boolean" } } });
const save = (file: string, value: unknown) => writeFileSync(resolve(dir, file), JSON.stringify(value, null, 2) + "\n");
const plan = JSON.parse(readFileSync(resolve(dir, "plan.json"), "utf8")) as {
  model: string; operationCapUsd: number; cumulativeCapUsd: number; priorConservativeUsd: number; readerReserveUsd: number;
  priorFunding: string; retainedPricing: string; maximumCalls: number;
};
const manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8")) as Record<string, string>;
const verifySources = () => { for (const [path, expected] of Object.entries(manifest)) assert.equal(hash(readFileSync(resolve(root, path))), expected, path); };
verifySources();
const funding = JSON.parse(readFileSync(resolve(dir, "funding.json"), "utf8"));
assert.equal(funding.status, "within-existing-grant");
for (const key of ["operationCapUsd", "cumulativeCapUsd", "priorConservativeUsd", "readerReserveUsd"] as const) assert.equal(funding[key], plan[key]);
const prior = read<{ cumulativeConservativeUsd: number; cumulativeCapUsd: number }>(plan.priorFunding);
assert.equal(prior.cumulativeConservativeUsd, plan.priorConservativeUsd); assert.equal(prior.cumulativeCapUsd, plan.cumulativeCapUsd);
assert.ok(plan.priorConservativeUsd + plan.operationCapUsd <= plan.cumulativeCapUsd);
assert.equal(plan.maximumCalls, corrections.length * 2);
const retained = read<{ models: Array<{ id: string; pricing: Record<string, unknown> }> }>(plan.retainedPricing);
const retainedPricing = modelPricing(retained.models.find(m => m.id === plan.model)); assert.ok(retainedPricing);
const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Uncontrolled network forbidden"); };
type Job = { id: string; inputContentSha256: string; requestSha256: string; ceilingUsd: number };
const packets: Record<string, Packet> = {}, jobs: Job[] = [];
const response = (packet: Packet, content = '{"problems":[]}') => Response.json({ id: "offline", model: packet.model,
  choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 0, completion_tokens: 0, cost: 0 } });
for (const correction of corrections) {
  const row = await replay(correction, async packet => {
    assert.equal(packet.model, plan.model); assert.ok(!packets[correction.id]); packets[correction.id] = packet;
    const ceiling = requestCeilingUsd("text", packet, retainedPricing); assert.ok(ceiling !== null);
    jobs.push({ id: correction.id, inputContentSha256: hash(correction.content), requestSha256: hash(JSON.stringify(packet)), ceilingUsd: ceiling });
    return response(packet);
  });
  assert.equal(row.rendering.ok, true); assert.equal(row.finalReviewAttempts, 1);
}
const ceilingsFor = (pricing: ModelPricing) => jobs.map(job => { const n = requestCeilingUsd("text", packets[job.id], pricing); assert.ok(n !== null); return n; });
const ceilingWithEveryRetryUsd = jobs.reduce((sum, job) => sum + job.ceilingUsd * 2, 0);
assert.ok(ceilingWithEveryRetryUsd <= plan.operationCapUsd);
async function run(send: (packet: Packet, phase: string) => Promise<Response>, capture: (row: Awaited<ReturnType<typeof replay>>) => void, expected = jobs) {
  for (const [index, correction] of corrections.entries()) {
    let fatal: unknown;
    const row = await replay(correction, async (packet, attempt) => {
      if (fatal) throw fatal;
      try {
        verifySources(); assert.equal(hash(JSON.stringify(packet)), expected[index].requestSha256);
        const reply = await send(packet, `${correction.id}/review/${attempt + 1}`), payload = await reply.clone().json();
        assert.ok(reply.ok, `HTTP ${reply.status}; stop`); assert.equal(payload.model, plan.model);
        assert.equal(payload.choices?.[0]?.finish_reason, "stop");
        return reply;
      } catch (error) { fatal = error; throw error; }
    });
    capture(row);
    assert.ok(!fatal, `Final-review execution stopped: ${String(fatal)}`);
    assert.ok(row.rendering.ok, "Assembly refused; retain result and stop");
    const review = row.stored?.review as { notes?: string[] } | undefined;
    assert.ok(!review?.notes?.some(note => note.startsWith("plan review unavailable:")), "Review unavailable after bounded retry; retain result and stop");
  }
}
if (!values.execute) {
  const rehearsals: Record<string, unknown> = {};
  for (const fault of ["none", "retry-once", "http", "schema", "missing-usage", "over-ceiling", "exception", "model", "finish", "packet-hash"]) {
    let sent = 0; const rows: Awaited<ReturnType<typeof replay>>[] = [];
    const ledger = createLedger({ capUsd: plan.operationCapUsd, reserves: { text: 0, image: 0, check: 0 }, limits: { text: plan.maximumCalls, image: 0, check: 0 },
      ceiling: (kind, packet) => requestCeilingUsd(kind, packet, retainedPricing), save: () => {}, log: () => {}, scrub: v => v,
      fetch: async (_url, init) => {
        sent++; if (fault === "exception") throw new Error("fake timeout");
        const packet: Packet = JSON.parse(String(init.body));
        const payload = await response(packet, fault === "schema" || (fault === "retry-once" && sent % 2 === 1) ? "unreadable" : '{"problems":[]}').json();
        payload.usage.cost = 0.000001;
        if (fault === "missing-usage") delete payload.usage;
        if (fault === "over-ceiling") payload.usage.cost = 1;
        if (fault === "model") payload.model = "unexpected";
        if (fault === "finish") payload.choices[0].finish_reason = "length";
        return Response.json(payload, { status: fault === "http" ? 500 : 200 });
      } });
    const expected = fault === "packet-hash" ? jobs.map(job => ({ ...job, requestSha256: "wrong" })) : jobs;
    const trial = () => run(async (packet, phase) => {
      const reply = await ledger.fetchFor("text", () => phase)("https://openrouter.ai/api/v1/chat/completions", { body: JSON.stringify(packet) });
      assert.equal(ledger.state.blocked, null); return reply;
    }, row => rows.push(row), expected);
    if (fault === "none" || fault === "retry-once") { await trial(); assert.equal(rows.length, 24); assert.equal(sent, fault === "none" ? 24 : 48); }
    else { await assert.rejects(trial()); assert.equal(rows.length, 1); assert.equal(sent, fault === "schema" ? 2 : fault === "packet-hash" ? 0 : 1); }
    rehearsals[fault] = { sent, results: rows.length, outputSha256: hash(JSON.stringify(rows)), blocked: ledger.state.blocked, uncertainUsd: ledger.state.uncertainUsd };
  }
  save("verification.json", { networkCalls: 0, jobs, ceilingWithEveryRetryUsd, rehearsals });
  console.log(`Rehearsed all 24 final reviews, 48-call retry path and eight stops; maximum $${ceilingWithEveryRetryUsd}. No network.`);
} else {
  assert.ok(!existsSync(resolve(dir, "run-started.json")), "Single-use: do not restart");
  const verified = JSON.parse(readFileSync(resolve(dir, "verification.json"), "utf8")); assert.deepEqual(verified.jobs, jobs);
  assert.equal(verified.ceilingWithEveryRetryUsd, ceilingWithEveryRetryUsd);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit reviewed preparation before spending");
  const env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  const apiKey = env.OPENROUTER_API_KEY?.trim(); assert.ok(apiKey);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const get = async (endpoint: string) => { const r = await network(`https://openrouter.ai/api/v1/${endpoint}`, { headers, signal: AbortSignal.timeout(15_000) }); assert.ok(r.ok); return (await r.json()).data; };
  const funds = async (required: number) => {
    const [credits, key] = await Promise.all([get("credits"), get("key")]);
    const balanceUsd = credits.total_credits - credits.total_usage;
    assert.ok(Number.isFinite(balanceUsd) && balanceUsd >= required + plan.readerReserveUsd, "Preserve reader reserve");
    assert.ok(key.limit_remaining === null || (Number.isFinite(key.limit_remaining) && key.limit_remaining >= required + 1), "Insufficient key allowance");
    return { balanceUsd, keyLimitRemaining: key.limit_remaining };
  };
  const before = await funds(plan.operationCapUsd), catalog = await get("models");
  const model = catalog.find((m: { id: string }) => m.id === plan.model), pricing = modelPricing(model); assert.ok(pricing);
  const ceilings = ceilingsFor(pricing); assert.ok(ceilings.reduce((sum, n) => sum + n * 2, 0) <= plan.operationCapUsd, "All allowed attempts must fit before spend");
  writeFileSync(resolve(dir, "run-started.json"), JSON.stringify({ at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sources: manifest, model, pricing, ceilings, ...before }, null, 2) + "\n", { flag: "wx" });
  const ledger = createLedger({ capUsd: plan.operationCapUsd, reserves: { text: 0, image: 0, check: 0 }, limits: { text: plan.maximumCalls, image: 0, check: 0 },
    ceiling: (kind, packet) => requestCeilingUsd(kind, packet, pricing), fetch: (url, init) => network(url, init), save: state => save("ledger.json", state),
    log: entry => appendFileSync(resolve(dir, "provider.ndjson"), JSON.stringify(entry) + "\n"), scrub: v => scrubForLog(v, apiKey, hash) });
  await run(async (packet, phase) => {
    assert.equal(ledger.state.blocked, null); await funds(plan.operationCapUsd - ledger.state.measuredUsd);
    const r = await ledger.fetchFor("text", () => phase)("https://openrouter.ai/api/v1/chat/completions", { method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "X-Title": "visibible-correction-final-review" }, body: JSON.stringify(packet), signal: AbortSignal.timeout(25_000) });
    assert.equal(ledger.state.blocked, null); return r;
  }, row => appendFileSync(resolve(dir, "results.ndjson"), JSON.stringify(row) + "\n"));
  assert.equal(ledger.state.blocked, null); assert.equal(ledger.state.uncertainUsd, 0); assert.ok(ledger.state.calls.every(c => c.status !== "in-flight")); verifySources();
  const finished = { at: new Date().toISOString(), calls: ledger.state.counts, measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd,
    cumulativeConservativeUsd: plan.priorConservativeUsd + ledger.state.measuredUsd, cumulativeCapUsd: plan.cumulativeCapUsd };
  save("run-finished.json", finished); save("run-finished.json", { ...finished, ...await funds(0) });
  console.log(`Captured 24 final-review continuations; $${ledger.state.measuredUsd}. Inspect reports and saved results before interpreting.`);
}
