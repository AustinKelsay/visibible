/** Offline provenance/restart verification after the single run. Never supplies usable credentials to the restart probe. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, root, hash, json, save, environment, frozen } from "./common.mjs";

const scoreCommit = "64e0b2730cf057ce647392c447e6960b38dcce79";
const freeze = json("frozen-commit.json"), started = json("run-started.json"), finished = json("run-finished.json");
const git = (args: string[]) => execFileSync("git", args, { cwd: root });
const replay = (file: string, args: string[]) => JSON.parse(execFileSync(process.execPath, ["--import", "tsx", path.join(dir, file), ...args], { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 }));
assert.equal(freeze.commit, "6bafeffd2b9b5d38a3bc08b2193996ba38647843");
git(["merge-base", "--is-ancestor", freeze.commit, scoreCommit]);
const scoreFiles = ["blind-packet.json", "operator-scores.json", "scoring-sensitivity.json"];
for (const file of scoreFiles) assert.deepEqual(fs.readFileSync(path.join(dir, file)), git(["show", `${scoreCommit}:${path.relative(root, path.join(dir, file))}`]));
assert.ok(Date.parse(git(["show", "-s", "--format=%cI", freeze.commit]).toString().trim()) <= Date.parse(started.at));
assert.ok(Date.parse(git(["show", "-s", "--format=%cI", scoreCommit]).toString().trim()) >= Date.parse(finished.at));
const paidFiles = ["funding.json", "frozen-commit.json", "run-started.json", "ledger.json", "inputs.ndjson", "provider.ndjson", "results.ndjson", "run-finished.json"];
const fingerprint = () => Object.fromEntries(paidFiles.map((file) => [file, hash(fs.readFileSync(path.join(dir, file)))]));
const before = fingerprint(), missingEnv = path.join(dir, "restart-probe-must-not-exist.env");
assert.ok(!fs.existsSync(missingEnv));
let refused = false;
try {
  execFileSync(process.execPath, ["--import", "tsx", path.join(dir, "run.mts"), "--execute"], { cwd: root,
    env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: missingEnv }, stdio: "pipe" });
} catch (error) {
  assert.match(String((error as { stderr?: Buffer }).stderr), /One-shot artifact exists: run-started.json/);
  refused = true;
}
assert.ok(refused); assert.deepEqual(fingerprint(), before);
const dry = replay("dry-run.mts", ["verify"]), audit = replay("audit.mts", ["finalize"]), summary = replay("summarize.mts", ["verify"]);
assert.equal(dry.paidCalls, 0); assert.equal(audit.offlineReplay, true); assert.equal(audit.operations, 92); assert.equal(audit.calls, 233);
assert.equal(audit.uncertainUsd, 0); assert.equal(audit.pass, false); assert.equal(summary.budget.measuredThisRunUsd, 0.1448852);
const { key } = environment();
const files = fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile());
for (const file of files) assert.equal(fs.readFileSync(path.join(dir, file)).includes(Buffer.from(key)), false, `Credential in ${file}`);
const data = { frozenSources: frozen(), paidArtifactSha256: before, preCallCommit: freeze.commit, maskedScoresCommit: scoreCommit,
  scoresCommittedAfterRunBeforeUnblinding: true, firstScoreBytesUnchanged: true, dryVerify: true, exactOfflineReplay: true, scoredFinalize: true, summaryVerify: true,
  oneShotRefusedBeforeCredentials: true, invalidEnvironmentUsedForProbe: true, paidArtifactsUnchangedAfterProbe: true, exactCredentialAbsence: true,
  completedOperations: audit.operations, chargedCalls: audit.calls, measuredUsd: summary.budget.measuredThisRunUsd, uncertainUsd: audit.uncertainUsd,
  verificationPaidCalls: 0, productionMutations: 0, images: 0, releaseHold: true };
assert.ok(process.argv[2] === "capture" || process.argv[2] === "verify");
if (process.argv[2] === "capture") save("execution-validation.json", data);
else assert.deepEqual(json("execution-validation.json"), data);
console.log(JSON.stringify({ offline: true, chargedCalls: audit.calls, verificationPaidCalls: 0, exactReplay: true, restartRefusedBeforeCredentials: true, firstScoresUnchanged: true, exactCredentialAbsence: true }));
