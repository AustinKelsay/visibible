/** Free controller/audit rehearsal in disposable local clones. Synthetic grants/usage are never real evidence. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, root, frozen, hash, json } from "./common.mjs";
import { planReviewUser } from "../../../src/lib/engine/plan-review";
import { cases } from "./controls.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-offline-rehearsal-"));
const relative = path.relative(root, dir), patch = execFileSync("git", ["diff", "--binary", "HEAD"], { cwd: root, maxBuffer: 10_000_000 });
const git = (cwd: string, args: string[], input?: Uint8Array) => execFileSync("git", args, { cwd, input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 10_000_000 });
const summaries = [];
assert.ok(!fs.existsSync(path.join(dir, "funding.json")));
try {
  execFileSync(process.execPath, ["--import", "tsx", path.join(dir, "run.mts"), "--execute"], {
    cwd: root, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: path.join(temporary, "does-not-exist.env") }, stdio: "pipe",
  });
  assert.fail("An unfunded runner must refuse");
} catch (error) {
  assert.match(String((error as { stderr?: Buffer }).stderr), /Owner funding is required/);
}
try {
  for (const scenario of ["complete", "look-refusal", "cap-stop", "review-unavailable", "missing-usage"]) {
    const checkout = path.join(temporary, scenario);
    git(temporary, ["clone", "--quiet", "--shared", root, checkout]);
    if (patch.length) git(checkout, ["apply", "--binary", "-"], patch);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(checkout, "node_modules"));
    fs.copyFileSync(path.join(root, "works/bible-web/work.json"), path.join(checkout, "works/bible-web/work.json"));
    const operation = path.join(checkout, relative);
    for (const name of ["run-started.json", "run-finished.json", "ledger.json", "results.ndjson", "provider.ndjson", "inputs.ndjson", "funding.json"]) assert.ok(!fs.existsSync(path.join(operation, name)));
    fs.writeFileSync(path.join(operation, "funding.json"), JSON.stringify({ authorization: "SYNTHETIC OFFLINE REHEARSAL ONLY — no owner grant", increaseUsd: json("plan.json").evaluation.proposedIncreaseUsd, authorizedUsd: json("plan.json").evaluation.proposedAuthorizedUsd, operationCapUsd: json("plan.json").evaluation.proposedOperationCapUsd }));
    const commit = () => { git(checkout, ["add", "."]); git(checkout, ["-c", "user.name=Offline Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Record synthetic offline fixture"]); };
    commit();
    const envFile = path.join(temporary, `${scenario}.env`), hook = path.join(temporary, `${scenario}.mjs`);
    fs.writeFileSync(envFile, "GENERIC_ENGINE_MODE=disabled\nNEXT_PUBLIC_CONVEX_URL=https://api.visibible.com\nOPENROUTER_API_KEY=offline-fixture-only\n", { mode: 0o600 });
    fs.writeFileSync(hook, `import fs from "node:fs";
const pricing = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(operation, "sample-set.json"))}, "utf8")).pricing;
const controls = ${JSON.stringify(cases.map((c) => ({ user: planReviewUser(c.input), problems: c.required.map((e) => ({ kind: e.kind, entryId: e.entryId ?? "", planQuote: e.quoteFrom, reason: "Synthetic required-control handler only, no semantic verdict" })) })))};
let calls = 0;
globalThis.fetch = async (url, init) => {
  let payload;
  if (url === "https://openrouter.ai/api/v1/models") payload = { data: [pricing] };
  else if (url === "https://openrouter.ai/api/v1/credits") payload = { data: { total_credits: 2, total_usage: 0 } };
  else if (url === "https://openrouter.ai/api/v1/chat/completions") {
    calls++; const r = JSON.parse(init.body), kind = r.response_format.json_schema.name;
    const source = r.messages[1].content.match(/MOMENT \\([^\\n]*?\\): ([^\\n]+)/)?.[1] ?? "A source sentence.";
    const content = kind === "section_look" ? { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" }
      : kind === "plan_review" ? ${scenario === "review-unavailable" ? '(calls >= 2 ? { invalid: true } : { problems: [] })' : scenario === "look-refusal" ? '(r.messages[1].content.includes("SECTION LOOK (verbatim") && r.messages[1].content.includes("primarySubject: A subject") ? { problems: [{ kind: "look_conflict", entryId: "", planQuote: "an open space", reason: "Synthetic handling probe only" }] } : { problems: controls.find((c) => c.user === r.messages[1].content)?.problems ?? [] })' : '{ problems: controls.find((c) => c.user === r.messages[1].content)?.problems ?? [] }'} : { grounding: { focusQuote: source.split(/\\s+/).slice(0, 12).join(" "), instant: "A subject remains still.", singleInstant: true }, selectedCast: [], consideredCast: [], missingCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space", secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view" };
    payload = { id: "offline-" + calls, model: r.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: ${scenario === "missing-usage" ? "undefined" : scenario === "cap-stop" ? 0.004 : 0.0001} } };
  } else throw Error("Offline rehearsal blocked unexpected network: " + url);
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
};`);
    const run = (file: string, args: string[] = [], mock = false) => execFileSync(process.execPath, ["--import", "tsx", ...(mock ? ["--import", hook] : []), path.join(operation, file), ...args],
      { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 10_000_000 });
    run("run.mts", ["--execute"], true);
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(operation, name), "utf8"));
    const finish = read("run-finished.json");
    if (["complete", "look-refusal"].includes(scenario)) { assert.equal(finish.operationsCompleted, 92); assert.equal(finish.stopped, null); }
    else { assert.ok(finish.operationsCompleted < 92); assert.ok(finish.blocked || finish.stopped); }
    if (scenario === "review-unavailable") assert.equal(finish.stopped, "Review unavailable");
    if (scenario === "missing-usage") { assert.equal(finish.blocked, "Missing provider usage"); assert.equal(finish.uncertainUsd, 0.005); }
    const audit = JSON.parse(run("audit.mts")); assert.equal(audit.offlineReplay, true); assert.equal(audit.pass, false);
    if (["complete", "look-refusal"].includes(scenario)) assert.equal(audit.reviewGate, true);
    if (scenario === "look-refusal") {
      const results = fs.readFileSync(path.join(operation, "results.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(results.filter((r) => r.kind === "pipeline" && r.arm === "candidate" && r.result.outcome === "refused" && r.calls === 3).length, 30);
      assert.equal(results.filter((r) => r.kind === "pipeline" && r.arm === "baseline" && r.result.outcome === "stored").length, 30);
    }
    run("score.mts", ["packet"]);
    const packet = read("blind-packet.json").packet;
    fs.writeFileSync(path.join(operation, "operator-scores.json"), JSON.stringify({ scorer: "Synthetic fixture, no semantic assessment", scoredBeforeUnblinding: true,
      scores: packet.map((p: { id: string }) => ({ id: p.id, verdict: "acceptable", reason: "Synthetic controller fixture only", lookContradiction: false, defects: [] })) }));
    commit();
    const scored = JSON.parse(run("audit.mts", ["finalize"])); assert.equal(scored.pass, false); assert.equal(scored.scoring.pass, false);
    assert.throws(() => run("run.mts", ["--execute"], true), "One-shot rerun must refuse");
    summaries.push({ scenario, syntheticOperations: finish.operationsCompleted, syntheticCalls: audit.calls, syntheticUsageUsd: audit.measuredUsd, stopped: finish.stopped, blocked: finish.blocked,
      replay: true, scoring: true, rerunRefused: true, paidCalls: 0, productionMutations: 0 });
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
assert.ok(!fs.existsSync(path.join(dir, "funding.json")));
fs.writeFileSync(path.join(dir, "offline-rehearsal.json"), JSON.stringify({ at: new Date().toISOString(), sources: frozen(), scriptSha256: hash(fs.readFileSync(path.join(dir, "rehearse.mts"))), unfundedRefusedBeforeCredentials: true, method: "Disposable shared local clones; all HTTP intercepted by synthetic responses. Synthetic grants and usage exist only in removed clones, never in this operation. Mechanics only, no semantic or cost evidence; free mechanical rehearsals may be repeated after code changes.", summaries }, null, 2) + "\n");
console.log(JSON.stringify({ offline: true, summaries }));
