/** Free controller/audit rehearsal in disposable local clones. Synthetic grants and usage are never evidence. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dir, root, frozen, hash, json } from "./common.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-fresh-rehearsal-"));
const relative = path.relative(root, dir);
const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 10_000_000 });
const artifacts = ["run-started.json", "run-finished.json", "frozen-commit.json", "ledger.json", "results.ndjson", "provider.ndjson", "inputs.ndjson", "funding.json", "offline-rehearsal.json", "blind-packet.json", "blind-key.json", "operator-scores.json", "scorer-a.json", "scorer-b.json", "tally.json"];
for (const name of artifacts.filter((n) => n !== "offline-rehearsal.json")) assert.ok(!fs.existsSync(path.join(dir, name)), `Rehearse before any real artifact: ${name}`);
try {
  execFileSync(process.execPath, ["--import", "tsx", path.join(dir, "run.mts"), "--execute"], { cwd: root, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: path.join(temporary, "does-not-exist.env") }, stdio: "pipe" });
  assert.fail("An unfunded runner must refuse");
} catch (error) { assert.match(String((error as { stderr?: Buffer }).stderr), /Owner funding is required/); }
const summaries = [];
try {
  for (const scenario of ["complete", "look-refusal", "cap-stop", "provider-error", "missing-usage"]) {
    const checkout = path.join(temporary, scenario);
    git(temporary, ["clone", "--quiet", "--shared", root, checkout]);
    const operation = path.join(checkout, relative);
    fs.mkdirSync(operation, { recursive: true });
    for (const name of fs.readdirSync(dir)) if (!artifacts.includes(name)) fs.copyFileSync(path.join(dir, name), path.join(operation, name));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(checkout, "node_modules"));
    fs.copyFileSync(path.join(root, "works/bible-web/work.json"), path.join(checkout, "works/bible-web/work.json"));
    const cap = json("plan.json").evaluation;
    fs.writeFileSync(path.join(operation, "funding.json"), JSON.stringify({ authorization: "SYNTHETIC OFFLINE REHEARSAL ONLY — no owner grant", increaseUsd: cap.proposedIncreaseUsd, authorizedUsd: cap.proposedAuthorizedUsd, operationCapUsd: cap.proposedOperationCapUsd }));
    const commit = () => { git(checkout, ["add", "."]); git(checkout, ["-c", "user.name=Offline Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Record synthetic offline fixture"]); };
    commit();
    const envFile = path.join(temporary, `${scenario}.env`), hook = path.join(temporary, `${scenario}.mjs`);
    fs.writeFileSync(envFile, "GENERIC_ENGINE_MODE=disabled\nNEXT_PUBLIC_CONVEX_URL=https://api.visibible.com\nOPENROUTER_API_KEY=offline-fixture-only\n", { mode: 0o600 });
    fs.writeFileSync(hook, `import fs from "node:fs";
const pricing = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(operation, "pricing.json"))}, "utf8")).pricing;
const scenario = ${JSON.stringify(scenario)};
let calls = 0;
globalThis.fetch = async (url, init) => {
  let payload;
  if (url === "https://openrouter.ai/api/v1/models") payload = { data: [pricing] };
  else if (url === "https://openrouter.ai/api/v1/credits") payload = { data: { total_credits: 2, total_usage: 0 } };
  else if (url === "https://openrouter.ai/api/v1/chat/completions") {
    calls++; const r = JSON.parse(init.body), kind = r.response_format.json_schema.name;
    const source = r.messages[1].content.match(/MOMENT \\([^\\n]*?\\): ([^\\n]+)/)?.[1] ?? "A source sentence.";
    const situation = { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" };
    const review = scenario === "look-refusal" ? { problems: [{ kind: "look_conflict", entryId: "", planQuote: "an open space", reason: "Synthetic handling probe only" }] } : { problems: [] };
    const content = kind === "section_look" ? situation : kind === "plan_review" ? review
      : { grounding: { focusQuote: source.split(/\\s+/).slice(0, 12).join(" "), instant: "A subject remains still.", singleInstant: true }, selectedCast: [], consideredCast: [], missingCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space", secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view", situation };
    payload = { id: "offline-" + calls, model: r.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: ${scenario === "missing-usage" ? "undefined" : scenario === "cap-stop" ? 0.006 : 0.0001} } };
  } else throw Error("Offline rehearsal blocked unexpected network: " + url);
  return new Response(JSON.stringify(payload), { status: scenario === "provider-error" && calls === 4 ? 503 : 200, headers: { "Content-Type": "application/json" } });
};`);
    const run = (file: string, args: string[] = [], mock = false) => execFileSync(process.execPath, ["--import", "tsx", ...(mock ? ["--import", hook] : []), path.join(operation, file), ...args],
      { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 10_000_000 });
    run("run.mts", ["--execute"], true);
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(operation, name), "utf8"));
    const finish = read("run-finished.json");
    if (["complete", "look-refusal"].includes(scenario)) { assert.equal(finish.operationsCompleted, 30); assert.equal(finish.stopped, null); assert.equal(finish.blocked, null); }
    else { assert.ok(finish.operationsCompleted < 30); assert.ok(finish.blocked || finish.stopped); }
    if (scenario === "provider-error") assert.equal(finish.blocked, "Provider error or exhausted cap");
    if (scenario === "missing-usage") { assert.equal(finish.blocked, "Missing provider usage"); assert.equal(finish.uncertainUsd, 0.005); }
    const audit = JSON.parse(run("audit.mts")); assert.equal(audit.offlineReplay, true); assert.equal(audit.pass, false);
    if (scenario === "look-refusal") assert.equal(audit.outcomes.fresh.refused + audit.outcomes.retained.refused, 30);
    let scored = null;
    if (scenario !== "look-refusal") {
      run("score.mts", ["packet"]);
      const packet = read("blind-packet.json").packet;
      const scores = { scorer: "Synthetic fixture, no semantic assessment", scoredBeforeUnblinding: true,
        scores: packet.map((p: { id: string }) => ({ id: p.id, verdict: "acceptable", reason: "Synthetic controller fixture only", lookContradiction: false, defects: [] })) };
      for (const name of ["operator-scores.json", "scorer-a.json", "scorer-b.json"]) fs.writeFileSync(path.join(operation, name), JSON.stringify(scores));
      commit();
      scored = JSON.parse(run("audit.mts", ["finalize"]));
      assert.equal(scored.pass, scenario === "complete");
    }
    assert.throws(() => run("run.mts", ["--execute"], true), "One-shot rerun must refuse");
    summaries.push({ scenario, syntheticOperations: finish.operationsCompleted, syntheticCalls: audit.calls, syntheticUsageUsd: audit.measuredUsd, syntheticUncertainUsd: finish.uncertainUsd,
      stopped: finish.stopped, blocked: finish.blocked, replay: true, syntheticGate: scored?.pass ?? false, rerunRefused: true, paidCalls: 0, productionMutations: 0 });
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
fs.writeFileSync(path.join(dir, "offline-rehearsal.json"), JSON.stringify({ at: new Date().toISOString(), sources: frozen(), scriptSha256: hash(fs.readFileSync(path.join(dir, "rehearse.mts"))), unfundedRefusedBeforeCredentials: true,
  method: "Disposable shared local clones; all HTTP intercepted by synthetic responses. Synthetic grants and usage exist only in removed clones. Mechanics only, no semantic or cost evidence.", summaries }, null, 2) + "\n");
console.log(JSON.stringify({ offline: true, summaries }));
