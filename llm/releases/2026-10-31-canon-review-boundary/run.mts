/** Frozen reviewer-only diagnostic. Default rehearses offline; --execute spends once within the existing grant. */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs, parseEnv } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { loadDepictionProfile } from "../../../src/lib/engine/depiction";
import { planReviewSchema, planReviewSystem, planReviewUser, type PlanReviewInput } from "../../../src/lib/engine/plan-review";
import { parseModelJson } from "../../../src/lib/reading-pass/model";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog } from "../../../src/lib/image-evals/suite-run";

const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, "../../..");
const read = <T,>(file: string): T => JSON.parse(readFileSync(resolve(dir, file), "utf8"));
const save = (file: string, value: unknown) => writeFileSync(resolve(dir, file), JSON.stringify(value, null, 2) + "\n");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const { values } = parseArgs({ options: { execute: { type: "boolean" } } });
type Packet = { model: string; messages: Array<{ role: string; content: string }>; max_tokens: number; reasoning: { effort: string };
  response_format: { json_schema: { name: string; schema: { properties: { problems: { items: { properties: { kind: { enum: string[] } } } } } } } } };
type Case = { id: string; source: { file: string; row: number }; edits?: [string, string][]; input?: Omit<PlanReviewInput, "depiction">;
  cleanCanonRemove?: string; targetEntry: string | null; targetKind: string; expected: boolean; note: string };
type Job = { id: string; caseId: string; rule: boolean; clean: boolean; expected: boolean; targetEntry: string | null; targetKind: string; request: Packet };
const cases = read<Case[]>("cases.json");
const plan = read<{ model: string; repeats: number; maximumCalls: number; operationCapUsd: number; cumulativeCapUsd: number;
  priorConservativeUsd: number; readerReserveUsd: number; priorFunding: string; candidateRule: string; candidateVersion: string }>("plan.json");
const funding = read<{ status: string; operationCapUsd: number; cumulativeCapUsd: number; priorConservativeUsd: number; readerReserveUsd: number }>("funding.json");
const manifest = read<Record<string, string>>("manifest.json");
const verifySources = () => { for (const [file, expected] of Object.entries(manifest)) assert.equal(hash(readFileSync(resolve(root, file))), expected, file); };
verifySources();
execFileSync("git", ["apply", "--check", resolve(dir, "candidate.patch")], { cwd: root, stdio: "pipe" });
const prior = JSON.parse(readFileSync(resolve(root, plan.priorFunding), "utf8"));
assert.equal(prior.cumulativeConservativeUsd, plan.priorConservativeUsd);
assert.equal(prior.cumulativeCapUsd, plan.cumulativeCapUsd);
assert.ok(plan.priorConservativeUsd + plan.operationCapUsd <= plan.cumulativeCapUsd);
assert.equal(funding.status, "within-existing-grant");
for (const key of ["operationCapUsd", "cumulativeCapUsd", "priorConservativeUsd", "readerReserveUsd"] as const) assert.equal(funding[key], plan[key]);
const depiction = loadDepictionProfile({ schemaVersion: 1, workId: "synthetic", writingSurfaces: "objects", closedDocuments: "Documents stay closed.", inscribedObjects: "objects", seriousSubjects: [], modes: {} }, "synthetic");
function replaceOnce(text: string, before: string, after: string) {
  assert.equal(text.split(before).length, 2, `Expected one occurrence: ${before}`);
  return text.replace(before, after);
}
const originals = cases.map((c) => {
  const row = JSON.parse(readFileSync(resolve(root, c.source.file), "utf8").trim().split("\n")[c.source.row - 1]);
  assert.equal(row.phase, "alice-cat-head-talks/text");
  const packet = structuredClone(row.request) as Packet;
  assert.equal(packet.model, plan.model); assert.equal(packet.reasoning.effort, "low"); assert.equal(packet.max_tokens, 4000);
  assert.equal(packet.response_format.json_schema.name, "plan_review");
  if (c.id !== "queen-retained-paragraph") assert.equal(packet.messages[0].content, planReviewSystem(depiction));
  if (c.input) packet.messages[1].content = planReviewUser({ ...c.input, depiction });
  for (const [before, after] of c.edits ?? []) packet.messages[1].content = replaceOnce(packet.messages[1].content, before, after);
  return packet;
});
const jobs: Job[] = [];
for (let repeat = 1; repeat <= plan.repeats; repeat++) for (const [index, c] of cases.entries()) {
  const arms = c.cleanCanonRemove ? [[false, false], [true, false], [false, true], [true, true]] : [[false, false], [true, false]];
  if (repeat % 2 === 0) arms.reverse();
  for (const [rule, clean] of arms) {
    const request = structuredClone(originals[index]);
    if (rule) {
      const line = request.messages[0].content.split("\n").find((s) => s.startsWith("- canon_conflict:")); assert.ok(line);
      request.messages[0].content = replaceOnce(request.messages[0].content, line, plan.candidateRule);
      assert.equal(request.messages[0].content.split("\n").filter((s, i) => s !== originals[index].messages[0].content.split("\n")[i]).length, 1);
    }
    if (clean) request.messages[1].content = replaceOnce(request.messages[1].content, c.cleanCanonRemove!, "");
    jobs.push({ id: `${c.id}/${rule ? "rule" : "baseline"}/${clean ? "clean" : "original"}/${repeat}`, caseId: c.id, rule, clean,
      expected: c.expected, targetEntry: c.targetEntry, targetKind: c.targetKind, request });
  }
}
assert.equal(jobs.length, plan.maximumCalls); assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);
const summary = { scope: "Mechanical rehearsal only; no semantic or visual judgment", networkCalls: 0, requests: jobs.length,
  cases: cases.length, sourceHashes: manifest, jobs: jobs.map(({ request, ...job }) => ({ ...job, requestSha256: hash(JSON.stringify(request)) })) };
type Answer = { id: string; caseId: string; rule: boolean; clean: boolean; expected: boolean; observedTarget: boolean;
  requestSha256: string; content: string; problems: unknown; finishReason: string; providerId: string; model: string };
async function run(send: (job: Job) => Promise<Response>, capture: (answer: Answer) => void) {
  for (const job of jobs) {
    verifySources();
    const response = await send(job);
    assert.ok(response.ok, `Provider error ${response.status}; do not continue or reroll`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelJson(planReviewSchema, content);
    assert.ok("value" in parsed, `Malformed review; stop, retain evidence: ${"error" in parsed ? parsed.error : ""}`);
    const allowed = job.request.response_format.json_schema.schema.properties.problems.items.properties.kind.enum;
    assert.ok(parsed.value.problems.every((p) => allowed.includes(p.kind)));
    assert.equal(payload.model, plan.model); assert.equal(payload.choices[0].finish_reason, "stop");
    const { request, targetEntry, targetKind, ...identity } = job;
    capture({ ...identity, requestSha256: hash(JSON.stringify(request)), content, problems: parsed.value.problems,
      observedTarget: parsed.value.problems.some((p) => p.kind === targetKind && (targetEntry === null || p.entryId === targetEntry)),
      finishReason: payload.choices[0].finish_reason, providerId: payload.id, model: payload.model });
  }
}
if (!values.execute) {
  let sent = 0;
  await run(async () => { sent++; return Response.json({ id: "offline", model: plan.model, choices: [{ finish_reason: "stop", message: { content: '{"problems":[]}' } }] }); }, () => {});
  assert.equal(sent, jobs.length);
  for (const malformed of [false, true]) {
    let attempts = 0;
    await assert.rejects(run(async () => { attempts++; return malformed ? Response.json({ choices: [{ message: { content: "invalid" } }] }) : new Response("failure", { status: 500 }); }, () => {}));
    assert.equal(attempts, 1, "Failed or malformed replies must stop later calls");
  }
  save("verification.json", { ...summary, rehearsed: sent, failedResponseStops: true, malformedResponseStops: true });
  console.log(`Verified ${jobs.length} reviewer requests offline; failure stops passed. No provider calls.`);
} else {
  assert.ok(!existsSync(resolve(dir, "run-started.json")), "This diagnostic is single-use; do not restart");
  const verified = read<typeof summary & { rehearsed: number }>("verification.json");
  assert.deepEqual(verified.jobs, summary.jobs); assert.deepEqual(verified.sourceHashes, manifest); assert.equal(verified.rehearsed, jobs.length);
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit reviewed preparation first");
  const env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  const apiKey = env.OPENROUTER_API_KEY?.trim(); assert.ok(apiKey);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const get = async (endpoint: string) => { const r = await fetch(`https://openrouter.ai/api/v1/${endpoint}`, { headers, signal: AbortSignal.timeout(15_000) }); assert.ok(r.ok); return (await r.json()).data; };
  const funds = async (required: number) => {
    const [credits, key] = await Promise.all([get("credits"), get("key")]);
    const balanceUsd = credits.total_credits - credits.total_usage;
    assert.ok(Number.isFinite(balanceUsd) && balanceUsd >= required + plan.readerReserveUsd, "Preserve the reader reserve");
    assert.ok(key.limit_remaining === null || key.limit_remaining >= required + 1, "Insufficient key allowance");
    return { balanceUsd, keyLimitRemaining: key.limit_remaining };
  };
  const before = await funds(plan.operationCapUsd), catalog = await get("models");
  const model = catalog.find((m: { id: string }) => m.id === plan.model), pricing = modelPricing(model); assert.ok(pricing);
  const ceilings = jobs.map((j) => { const ceiling = requestCeilingUsd("text", j.request, pricing); assert.ok(ceiling !== null); return ceiling; });
  assert.ok(ceilings.reduce((a, b) => a + b, 0) <= plan.operationCapUsd, "All scheduled requests must fit before any paid call");
  writeFileSync(resolve(dir, "run-started.json"), JSON.stringify({ at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sources: manifest, pricing, model, ceilings, ...before }, null, 2) + "\n", { flag: "wx" });
  const ledger = createLedger({ capUsd: plan.operationCapUsd, reserves: { text: 0, image: 0, check: 0 }, limits: { text: jobs.length, image: 0, check: 0 },
    fetch: (url, init) => fetch(url, init), ceiling: (kind, request) => requestCeilingUsd(kind, request, pricing),
    save: (state) => save("ledger.json", state), log: (entry) => appendFileSync(resolve(dir, "provider.ndjson"), JSON.stringify(entry) + "\n"), scrub: (value) => scrubForLog(value, apiKey, hash) });
  await run(async (job) => {
    assert.equal(ledger.state.blocked, null);
    await funds(plan.operationCapUsd - ledger.state.measuredUsd);
    return ledger.fetchFor("text", () => job.id)("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json", "X-Title": "visibible-canon-review-diagnostic" }, body: JSON.stringify(job.request), signal: AbortSignal.timeout(25_000),
    });
  }, (answer) => appendFileSync(resolve(dir, "answers.ndjson"), JSON.stringify(answer) + "\n"));
  assert.equal(ledger.state.blocked, null); assert.equal(ledger.state.uncertainUsd, 0); assert.ok(ledger.state.calls.every((c) => c.status !== "in-flight"));
  verifySources();
  save("run-finished.json", { at: new Date().toISOString(), calls: ledger.state.counts, measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd,
    cumulativeConservativeUsd: plan.priorConservativeUsd + ledger.state.measuredUsd, cumulativeCapUsd: plan.cumulativeCapUsd, ...await funds(0) });
  console.log(`Captured ${jobs.length} reviews; $${ledger.state.measuredUsd}. Inspect all reasons before interpreting target flags.`);
}
