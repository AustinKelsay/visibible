/** Free rehearsal of run.mts in a disposable clone. All HTTP is intercepted; synthetic grants and images are never evidence. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { blobs, dir, root, json } from "./common.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-forgiving-image-rehearsal-"));
const relative = path.relative(root, dir), artifacts = ["run-started.json", "run-finished.json", "frozen-commit.json", "ledger.json", "results.ndjson", "provider.ndjson", "funding.json", "offline-rehearsal.json"];
const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 10_000_000 });
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const summaries = [];
try {
  for (const scenario of ["complete", "first-refuses", "image-error"]) {
    const checkout = path.join(temporary, scenario);
    git(temporary, ["clone", "--quiet", "--shared", root, checkout]);
    const operation = path.join(checkout, relative);
    fs.mkdirSync(operation, { recursive: true });
    for (const name of fs.readdirSync(dir)) if (!artifacts.includes(name)) fs.copyFileSync(path.join(dir, name), path.join(operation, name));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(checkout, "node_modules"));
    fs.copyFileSync(path.join(root, "works/bible-web/work.json"), path.join(checkout, "works/bible-web/work.json"));
    fs.cpSync(path.join(blobs, "references"), path.join(checkout, path.relative(root, blobs), "references"), { recursive: true });
    const cap = json("plan.json").evaluation;
    fs.writeFileSync(path.join(operation, "funding.json"), JSON.stringify({ authorization: "SYNTHETIC OFFLINE REHEARSAL ONLY", increaseUsd: cap.proposedIncreaseUsd, authorizedUsd: cap.proposedAuthorizedUsd, operationCapUsd: cap.proposedOperationCapUsd }));
    git(checkout, ["add", "."]); git(checkout, ["-c", "user.name=Offline Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Synthetic fixture"]);
    const envFile = path.join(temporary, `${scenario}.env`), hook = path.join(temporary, `${scenario}.mjs`);
    fs.writeFileSync(envFile, "GENERIC_ENGINE_MODE=disabled\nNEXT_PUBLIC_CONVEX_URL=https://api.visibible.com\nOPENROUTER_API_KEY=offline-fixture-only\n", { mode: 0o600 });
    fs.writeFileSync(hook, `const scenario = ${JSON.stringify(scenario)};
let text = 0, images = 0;
globalThis.fetch = async (url, init) => {
  let payload, status = 200;
  if (url === "https://openrouter.ai/api/v1/models") payload = { data: [{ id: "google/gemini-3.1-flash-lite-image", pricing: { prompt: "0.00000025", image_output: "0.00003" } }] };
  else if (url === "https://openrouter.ai/api/v1/credits") payload = { data: { total_credits: 5, total_usage: 0 } };
  else if (url === "https://openrouter.ai/api/v1/chat/completions") {
    const r = JSON.parse(init.body);
    if (r.response_format) {
      text++; const kind = r.response_format.json_schema.name;
      const source = r.messages[1].content.match(/MOMENT \\([^\\n]*?\\): ([^\\n]+)/)?.[1] ?? "A source sentence.";
      const situation = { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" };
      // Forgiving preparation refuses only a no-form subject still drawn as a body after the re-plan.
      const review = scenario === "first-refuses" && text <= 5 ? { problems: [{ kind: "embodied_formless", entryId: "god_yahweh_the_father_and_god_of_israel", planQuote: "remains still", reason: "Synthetic refusal" }] } : { problems: [] };
      const content = kind === "section_look" ? situation : kind === "plan_review" ? review
        : { focusQuote: source.split(/\\s+/).slice(0, 12).join(" "), instant: "A subject remains still.", selectedCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space", secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view", situation };
      payload = { id: "t" + text, model: r.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0002 } };
    } else {
      images++;
      if (scenario === "image-error" && images === 3) status = 503;
      payload = { id: "i" + images, choices: [{ message: { content: "", images: [{ type: "image_url", image_url: { url: "data:image/png;base64,${tinyPng}" } }] } }], usage: { cost: 0.035 } };
    }
  } else throw Error("Offline rehearsal blocked unexpected network: " + url);
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
};`);
    execFileSync(process.execPath, ["--import", "tsx", "--import", hook, path.join(operation, "run.mts"), "--execute"], { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 10_000_000 });
    const finish = JSON.parse(fs.readFileSync(path.join(operation, "run-finished.json"), "utf8"));
    const results = fs.readFileSync(path.join(operation, "results.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    if (scenario === "complete") {
      assert.equal(finish.images, 45); assert.equal(finish.blocked, null); assert.equal(results.filter((r) => r.outcome === "image").length, 45);
      assert.equal(results.filter((r) => r.textCalls > 0).length, 8);
      // Controls drop only the style reference; Classical normally sends its new style reference.
      assert.ok(results.filter((r) => r.control).every((r) => !r.references.some((ref: { kind: string }) => ref.kind === "styleReference")));
      assert.ok(results.filter((r) => r.style === "classical" && !r.control).every((r) => r.references.some((ref: { kind: string }) => ref.kind === "styleReference")));
    }
    if (scenario === "first-refuses") { assert.equal(results[0].outcome, "refused"); assert.equal(results[0].case, "numbers-3-39"); assert.equal(finish.images, 40); assert.ok(results.some((r) => r.case === "isaiah-6-1" && r.outcome === "image")); }
    if (scenario === "image-error") { assert.equal(finish.images, 3); assert.equal(finish.blocked, "Provider error or exhausted cap"); }
    assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", "--import", hook, path.join(operation, "run.mts"), "--execute"], { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, stdio: "pipe" }));
    const references = results.filter((r) => r.outcome === "image").map((r) => r.references.length);
    summaries.push({ scenario, images: finish.images, textCalls: finish.textCalls, blocked: finish.blocked, syntheticUsd: finish.measuredUsd, referencesPerImage: [Math.min(...references), Math.max(...references)], rerunRefused: true, paidCalls: 0, productionMutations: 0 });
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
fs.writeFileSync(path.join(dir, "offline-rehearsal.json"), JSON.stringify({ at: new Date().toISOString(), method: "Disposable clones with every HTTP request intercepted; synthetic grants, text and 1-pixel images only. Mechanics, not evidence.", summaries }, null, 2) + "\n");
console.log(JSON.stringify({ offline: true, summaries }));
