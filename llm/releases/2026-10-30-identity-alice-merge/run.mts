/** One-shot diagnostic. Default: replay retained answers offline. --execute: the frozen paid run. */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { mergeCasts } from "../../../src/lib/reading-pass/merge";
import { responseSchema } from "../../../src/lib/reading-pass/prompts";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel, type TextModelRequest, type TextModelResult } from "../../../src/lib/reading-pass/model";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog } from "../../../src/lib/image-evals/suite-run";

const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, "../../..");
const read = (name: string) => JSON.parse(readFileSync(resolve(dir, name), "utf8"));
const save = (name: string, value: unknown) => writeFileSync(resolve(dir, name), JSON.stringify(value, null, 2) + "\n");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const input = read("input.json"), plan = read("plan.json");
const key = (request: TextModelRequest, baseline = false) => contentVersion({ model: plan.model, system: request.system, user: request.user, schemaName: request.schemaName, schema: responseSchema(request.schema), maxTokens: request.maxTokens, ...(baseline ? {} : { reasoningEffort: request.reasoningEffort }) });
const run = (complete: (request: TextModelRequest) => Promise<TextModelResult>) => mergeCasts({ ...input, model: { id: plan.model, complete } });
const rabbits = (result: Awaited<ReturnType<typeof run>>) => result.entries.filter(e => e.members.some(m => input.expectedRabbitMembers.includes(m)));
const replay = async (file: string, baseline = false) => {
  const answers = read(file);
  return run(async request => {
    const answer = answers[key(request, baseline)];
    assert.ok(answer, `Missing captured answer for ${request.label}; replay never calls a provider`);
    return answer;
  });
};
function verify(result: Awaited<ReturnType<typeof run>>) {
  const expected = input.readings.flatMap((r: { divisionId: string; characters: { id: string }[]; locations: { id: string }[] }) => [
    ...r.characters.map(e => `${r.divisionId}:character:${e.id}`), ...r.locations.map(e => `${r.divisionId}:location:${e.id}`),
  ]);
  assert.deepEqual(result.entries.flatMap(e => e.members).sort(), expected.sort());
  const ids = new Set(result.entries.map(e => e.id));
  for (const section of result.sections) for (const id of [...section.onStage.map(e => e.id), ...section.mentionedOnly, ...section.setting]) assert.ok(ids.has(id));
  assert.equal(result.unplaced.length, 0);
  const found = rabbits(result);
  assert.equal(found.length, 1, "The White Rabbit must have one identity");
  assert.deepEqual([...found[0].members].sort(), [...input.expectedRabbitMembers].sort());
}

const baseline = await replay("baseline-responses.json", true);
assert.equal(baseline.calls, 65);
assert.equal(rabbits(baseline).length, 4);
console.log("Baseline replay reproduced four Rabbit identities.");
if (!process.argv.includes("--execute")) {
  if (existsSync(resolve(dir, "responses.json"))) {
    verify(await replay("responses.json"));
    console.log("Candidate replay passed: one Rabbit, complete membership and valid section references.");
  } else console.log("Frozen inputs validated; candidate has not run. No network calls.");
} else {
  assert.ok(!existsSync(resolve(dir, "run-started.json")), "One-shot run already started");
  assert.equal(read("funding.json").operationCapUsd, plan.capUsd);
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "");
  const env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  const apiKey = env.OPENROUTER_API_KEY; assert.ok(apiKey);
  const catalog = await (await fetch("https://openrouter.ai/api/v1/models")).json();
  const pricing = modelPricing(catalog.data.find((m: { id: string }) => m.id === plan.model)); assert.ok(pricing);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers })).json()).data;
  const balance = credits.total_credits - credits.total_usage;
  assert.ok(balance >= plan.capUsd + plan.readerReserveUsd);
  const allowance = (await (await fetch("https://openrouter.ai/api/v1/key", { headers })).json()).data;
  assert.ok(allowance.limit_remaining === null || allowance.limit_remaining >= plan.capUsd + 1);
  const files = ["src/lib/reading-pass/merge.ts", "src/lib/reading-pass/prompts.ts", "src/lib/reading-pass/model.ts", "src/lib/image-evals/suite-run.ts", ...["input.json", "plan.json", "funding.json", "run.mts"].map(f => `llm/releases/2026-10-30-identity-alice-merge/${f}`)];
  const sources = Object.fromEntries(files.map(f => [f, hash(readFileSync(resolve(root, f)))]));
  save("run-started.json", { at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sources, pricing, balanceUsd: balance });
  const ledger = createLedger({ capUsd: plan.capUsd, reserves: { text: 0, image: 0, check: 0 }, limits: { text: plan.maximumCalls, image: 0, check: 0 }, fetch: (u, i) => fetch(u, i), ceiling: (kind, request) => requestCeilingUsd(kind, request, pricing), save: s => save("ledger.json", s), log: e => appendFileSync(resolve(dir, "provider.ndjson"), JSON.stringify(e) + "\n"), scrub: v => scrubForLog(v, apiKey, hash) });
  const answers: Record<string, TextModelResult> = {};
  const result = await run(async request => {
    assert.equal(request.reasoningEffort, "high");
    const model = createOpenRouterTextModel({ apiKey, model: plan.model, fetch: ledger.fetchFor("text", () => request.label) });
    const response = await model.complete(request);
    answers[key(request)] = response;
    save("responses.json", answers);
    console.log(`${request.label}: captured`);
    return response;
  });
  save("merge.json", result);
  for (const [file, expected] of Object.entries(sources)) assert.equal(hash(readFileSync(resolve(root, file))), expected);
  let failure: string | null = null;
  try { verify(result); } catch (error) { failure = String(error); }
  save("report.json", { pass: failure === null, failure, calls: result.calls, rabbitIdentities: rabbits(result), measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd, productionMutations: 0 });
  save("run-finished.json", { at: new Date().toISOString(), blocked: ledger.state.blocked });
  assert.equal(failure, null);
  console.log("Full Alice merge passed.");
}
