/** Free rehearsal of run.mts and score.mts in a disposable clone; every HTTP request is intercepted. Mechanics only. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, root } from "./common.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-scene-check-rehearsal-"));
try {
  const checkout = path.join(temporary, "clone"), relative = path.relative(root, dir);
  execFileSync("git", ["clone", "--quiet", "--shared", root, checkout]);
  const operation = path.join(checkout, relative);
  fs.mkdirSync(operation, { recursive: true });
  for (const name of fs.readdirSync(dir)) if (/\.(mts|json)$/.test(name) && !/^(results|ledger|metrics)-/.test(name) && name !== "offline-rehearsal.json") fs.copyFileSync(path.join(dir, name), path.join(operation, name));
  fs.writeFileSync(path.join(operation, "funding.json"), JSON.stringify({ authorization: "SYNTHETIC OFFLINE REHEARSAL ONLY", operationCapsUsd: JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8")).evaluation.operationCapsUsd }));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(checkout, "node_modules"));
  for (const run of ["forgiving", "v10", "v11", "v12"].map((r) => `evals/images/runs/2026-10-27-${r}-image-check/blind`)) fs.cpSync(path.join(root, run), path.join(checkout, run), { recursive: true });
  execFileSync("git", ["add", "."], { cwd: checkout });
  execFileSync("git", ["-c", "user.name=Offline Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Synthetic fixture"], { cwd: checkout });
  const envFile = path.join(temporary, "rehearsal.env"), hook = path.join(temporary, "hook.mjs");
  fs.writeFileSync(envFile, "GENERIC_ENGINE_MODE=disabled\nOPENROUTER_API_KEY=offline-fixture-only\n", { mode: 0o600 });
  fs.writeFileSync(hook, `let n = 0;
globalThis.fetch = async (url, init) => {
  if (url !== "https://openrouter.ai/api/v1/chat/completions") throw Error("Offline rehearsal blocked " + url);
  n++;
  const answers = { figure_in_light: n % 5 === 0, unpainted_edge: n % 7 === 0, painted_frame: false, lettering: n % 11 === 0, reasons: [] };
  const describeFirst = String(init.body).includes("First describe");
  const content = JSON.stringify(describeFirst ? { edges: "scenery", bright_areas: "none", marks: "none", ...answers } : answers);
  return new Response(JSON.stringify({ id: "c" + n, choices: [{ message: { content } }], usage: { cost: 0.0004 } }), { status: 200, headers: { "Content-Type": "application/json" } });
};`);
  const run = (args: string[]) => execFileSync(process.execPath, ["--import", "tsx", "--import", hook, ...args], { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10_000_000 });
  assert.throws(() => run([path.join(operation, "run.mts"), "--execute", "dev"]), "The single-question dev runs are complete");
  const out = JSON.parse(run([path.join(operation, "run.mts"), "--execute", "holdout"]).trim().split("\n").pop()!);
  assert.equal(out.images, 48); assert.equal(out.calls, 96); assert.equal(out.blocked, null);
  const score = JSON.parse(run([path.join(operation, "score.mts"), "holdout"]).trim().split("\n").pop()!);
  assert.equal(score.errors, 0);
  assert.throws(() => run([path.join(operation, "run.mts"), "--execute", "holdout"]), "A second holdout run must be refused");
  fs.writeFileSync(path.join(dir, "offline-rehearsal.json"), JSON.stringify({ at: new Date().toISOString(), method: "Disposable clone, intercepted HTTP, synthetic checker replies. Mechanics, not evidence.", holdout: out, score, devRefused: true, rerunRefused: true, paidCalls: 0 }, null, 2) + "\n");
  console.log(JSON.stringify({ offline: true, holdout: out, score }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
