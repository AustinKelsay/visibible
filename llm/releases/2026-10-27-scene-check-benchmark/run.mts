/** One funded pass of the scene check over a labelled set. Every call is reserved and ledgered; images never leave this machine except to the checker. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createOpenRouterVisionChecker } from "../../../src/lib/engine/reference-adapters";
import { SCENE_CHECK_VERSION, sceneCheckQuestion, sceneCheckSchema } from "../../../src/lib/engine/scene-check";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { dir, hash, items, json, readEnvironment, root } from "./common.mjs";

const [flag, runName] = process.argv.slice(2);
assert.equal(flag, "--execute");
const plan = json("plan.json"), cap = plan.evaluation.operationCapsUsd[runName];
assert.ok(cap, `Unknown run ${runName}`);
const set = runName === "holdout" ? "holdout" : "dev";
assert.equal(SCENE_CHECK_VERSION, plan.checker.runVersions[runName], "The checker version must be declared for this run before it executes");
assert.ok(fs.existsSync(path.join(dir, "funding.json")), "Owner funding is required");
const grant = json("funding.json");
assert.ok(grant.operationCapsUsd[runName] === cap);
for (const name of [`results-${runName}.ndjson`, `ledger-${runName}.json`]) assert.ok(!fs.existsSync(path.join(dir, name)), `One-shot artifact exists: ${name}`);
assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit frozen inputs before calls");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const list = items(set);
for (const item of list) assert.equal(hash(fs.readFileSync(path.join(root, item.file))), item.sha256, `Image changed: ${item.key}`);
const env = readEnvironment();

const ledger = { run: runName, commit, version: SCENE_CHECK_VERSION, calls: 0, measuredUsd: 0, uncertainUsd: 0, blocked: null as string | null };
const flush = () => fs.writeFileSync(path.join(dir, `ledger-${runName}.json`), JSON.stringify(ledger, null, 2) + "\n");
flush();
const reserve = plan.evaluation.reservePerCallUsd;
const ledgered = async (url: string, init: RequestInit) => {
  if (ledger.blocked) throw Error(`Stopped: ${ledger.blocked}`);
  if (ledger.measuredUsd + ledger.uncertainUsd + reserve > cap) { ledger.blocked = "cap"; flush(); throw Error("Stopped: cap"); }
  ledger.calls++; ledger.uncertainUsd += reserve; flush();
  const response = await fetch(url, init);
  const payload = await response.clone().json().catch(() => ({}));
  const cost = extractOpenRouterUsageUsd(payload);
  if (cost === null) ledger.blocked = "missing usage"; else { ledger.uncertainUsd -= reserve; ledger.measuredUsd += cost; }
  if (!response.ok) ledger.blocked = `provider ${response.status}`;
  flush();
  return response;
};
const checker = createOpenRouterVisionChecker({ apiKey: env.OPENROUTER_API_KEY!, fetch: ledgered, reasoningEffort: plan.checker.reasoningEffort, maxTokens: plan.checker.maxTokens, timeoutMs: 90_000 });
for (const item of list) {
  if (ledger.blocked) break;
  const bytes = new Uint8Array(fs.readFileSync(path.join(root, item.file)));
  const mimeType = item.file.endsWith(".png") ? "image/png" : "image/jpeg";
  let row: Record<string, unknown>;
  try {
    const result = await checker.check({ label: item.key, question: sceneCheckQuestion({ people: item.people, description: item.description }), schema: sceneCheckSchema, image: { bytes, mimeType } });
    row = { key: item.key, check: result.value, costUsd: result.costUsd, elapsedMs: result.elapsedMs };
  } catch (error) {
    row = { key: item.key, error: String(error).slice(0, 300) };
  }
  fs.appendFileSync(path.join(dir, `results-${runName}.ndjson`), JSON.stringify(row) + "\n");
}
console.log(JSON.stringify({ run: runName, images: list.length, calls: ledger.calls, measuredUsd: ledger.measuredUsd, blocked: ledger.blocked }));
