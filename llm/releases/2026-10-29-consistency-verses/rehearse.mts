/** Free rehearsal of run.mts in disposable clones. All HTTP is intercepted; synthetic grants, replies and images are never evidence. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { shownImagesFromResults, stagesFromSnapshot } from "../../../src/lib/image-evals/consistency";
import { blobs, dir, root, json } from "./common.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-consistency-verses-rehearsal-"));
const relative = path.relative(root, dir), artifacts = ["run-started.json", "run-finished.json", "frozen-commit.json", "ledger.json", "results.ndjson", "provider.ndjson", "funding.json", "offline-rehearsal.json"];
const git = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 10_000_000 });
const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const plan = json("plan.json"), seeds = json("seeds.json"), snapshot = json("snapshot.json");
const cases = plan.cases.length, styles = plan.styles.length;
const storeOf = Object.fromEntries((plan.stores as Array<{ id: string; styles: string[] }>).flatMap((s) => s.styles.map((style) => [style, s.id])));
const sectionOf = Object.fromEntries((snapshot.cases as Array<{ id: string; sectionId: string }>).map((c) => [c.id, c.sectionId]));
const summaries = [];
try {
  for (const scenario of ["complete", "first-refuses", "image-error"]) {
    const checkout = path.join(temporary, scenario);
    git(temporary, ["clone", "--quiet", "--shared", "--branch", branch, root, checkout]);
    const operation = path.join(checkout, relative);
    fs.mkdirSync(operation, { recursive: true });
    for (const name of fs.readdirSync(dir)) if (!artifacts.includes(name) && fs.statSync(path.join(dir, name)).isFile()) fs.copyFileSync(path.join(dir, name), path.join(operation, name));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(checkout, "node_modules"));
    fs.copyFileSync(path.join(root, "works/bible-web/work.json"), path.join(checkout, "works/bible-web/work.json"));
    fs.cpSync(path.join(blobs, "references"), path.join(checkout, path.relative(root, blobs), "references"), { recursive: true });
    const cap = plan.evaluation;
    fs.writeFileSync(path.join(operation, "funding.json"), JSON.stringify({ authorization: "SYNTHETIC OFFLINE REHEARSAL ONLY", increaseUsd: cap.proposedIncreaseUsd, authorizedUsd: cap.proposedAuthorizedUsd, operationCapUsd: cap.proposedOperationCapUsd }));
    git(checkout, ["add", "."]); git(checkout, ["-c", "user.name=Offline Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Synthetic fixture"]);
    const envFile = path.join(temporary, `${scenario}.env`), hook = path.join(temporary, `${scenario}.mjs`);
    fs.writeFileSync(envFile, "GENERIC_ENGINE_MODE=disabled\nNEXT_PUBLIC_CONVEX_URL=https://api.visibible.com\nOPENROUTER_API_KEY=offline-fixture-only\n", { mode: 0o600 });
    fs.writeFileSync(hook, `const scenario = ${JSON.stringify(scenario)};
let text = 0, images = 0, checks = 0;
globalThis.fetch = async (url, init) => {
  let payload, status = 200;
  if (url === "https://openrouter.ai/api/v1/models") payload = { data: [{ id: "google/gemini-3.1-flash-lite-image", pricing: { prompt: "0.00000025", image_output: "0.00003" } }] };
  else if (url === "https://openrouter.ai/api/v1/credits") payload = { data: { total_credits: 10, total_usage: 0 } };
  else if (url === "https://openrouter.ai/api/v1/chat/completions") {
    const r = JSON.parse(init.body);
    const kind = r.response_format?.json_schema?.name;
    if (kind === "reference_check") {
      checks++;
      // Every sixth checked image (both questions) reports lettering; Watercolor edges are accepted, so every fifth reports an edge too.
      const image = Math.ceil(checks / 2);
      const answers = { figure_in_light: false, unpainted_edge: image % 5 === 0, painted_frame: false, lettering: image % 6 === 0, reasons: [] };
      const content = JSON.stringify(JSON.stringify(r).includes("First describe") ? { edges: "scenery", bright_areas: "none", marks: "none", ...answers } : answers);
      payload = { id: "k" + checks, model: r.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0004 } };
    } else if (kind) {
      text++;
      const source = r.messages[1].content.match(/MOMENT \\([^\\n]*?\\): ([^\\n]+)/)?.[1] ?? "A source sentence.";
      const situation = { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" };
      // Cases run three at a time, so the refusal targets one case's reviews rather than a reply count.
      const refuse = scenario === "first-refuses" && kind === "plan_review" && r.messages[1].content.includes("MOMENT (Exodus 14:23)");
      const cast = (r.messages[1].content.match(/^- ([a-z0-9_]+): .*hasForm: false/m) || [])[1];
      const review = refuse && cast ? { problems: [{ kind: "embodied_formless", entryId: cast, planQuote: "remains still", reason: "Synthetic refusal" }] } : { problems: [] };
      const content = kind === "section_look" ? situation : kind === "plan_review" ? review
        : { focusQuote: source.split(/\\s+/).slice(0, 12).join(" "), instant: "A subject remains still.", selectedCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space", secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view" };
      payload = { id: "t" + text, model: r.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0002 } };
    } else {
      images++;
      if (scenario === "image-error" && images === 3) status = 503;
      payload = { id: "i" + images, choices: [{ message: { content: "", images: [{ type: "image_url", image_url: { url: "data:image/png;base64,${tinyPng}" } }] } }], usage: { cost: 0.0343 } };
    }
  } else throw Error("Offline rehearsal blocked unexpected network: " + url);
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
};`);
    execFileSync(process.execPath, ["--import", "tsx", "--import", hook, path.join(operation, "run.mts"), "--execute"], { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 50_000_000 });
    const finish = JSON.parse(fs.readFileSync(path.join(operation, "run-finished.json"), "utf8"));
    const results = fs.readFileSync(path.join(operation, "results.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const rendered = results.filter((r) => r.outcome === "image");
    if (scenario === "complete") {
      assert.equal(finish.blocked, null); assert.equal(rendered.length, cases * styles);
      assert.ok(!results.some((r) => r.outcome === "error"), JSON.stringify(results.filter((r) => r.outcome === "error")));
      const retried = rendered.filter((r) => r.attempts.length === 2);
      assert.ok(retried.length > 0 && retried.every((r) => [1, 2].includes(r.chosen)) && rendered.filter((r) => r.attempts.length === 1).every((r) => r.chosen === 1));
      assert.equal(finish.images, rendered.length + retried.length); assert.equal(finish.checkCalls, 2 * finish.images);
      // Each store prepares each case once: its first style calls the text model, the rest reuse the plan.
      assert.equal(results.filter((r) => r.textCalls > 0).length, cases * plan.stores.length);
      assert.deepEqual([...new Set(rendered.map((r) => r.style))].sort(), [...plan.styles].sort());
      for (const r of rendered) {
        assert.equal(r.store, storeOf[r.style]);
        assert.equal(r.checkContext.softEdges, r.style === "watercolor");
        // As in the third matrix: Classical sends its style reference, Watercolor's is stale and skipped, Fresco has none.
        const sent = r.references.some((ref: { kind: string }) => ref.kind === "styleReference");
        const skipped = r.skippedReferences.filter((s: string) => s.startsWith(`styleReference:${r.style}:`));
        assert.deepEqual({ sent, skipped }, { classical: { sent: true, skipped: [] }, watercolor: { sent: false, skipped: ["styleReference:watercolor:stale"] }, fresco: { sent: false, skipped: ["styleReference:fresco:missing"] } }[r.style as string], `${r.key} style reference`);
        const seed = seeds.stores[r.store].seeded[sectionOf[r.case]];
        // A seeded section is planned against the earlier look and never asks for a new one.
        assert.equal(r.look.seeded, Boolean(seed), `${r.key} look seeding`);
        if (seed) { assert.deepEqual(r.prepared.look, seed.payload); assert.ok(!r.spend.some((s: string) => s.startsWith("look:")), `${r.key} regenerated its look`); }
      }
      assert.ok(rendered.some((r) => r.attempts[0].check?.faults.includes("edge") && r.attempts.length === 2));
      // The consistency pairing reads these rows: each style's image carries its own store's plan.
      const shown = shownImagesFromResults(results, stagesFromSnapshot(snapshot));
      assert.equal(shown.length, cases * styles);
    }
    if (scenario === "first-refuses") assert.ok(results.some((r) => r.outcome === "refused") && rendered.length < cases * styles && rendered.length > 0);
    if (scenario === "image-error") { assert.equal(finish.blocked, "Provider error or exhausted cap"); assert.ok(finish.images <= 5); }
    assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", "--import", hook, path.join(operation, "run.mts"), "--execute"], { cwd: checkout, env: { ...process.env, VISIBIBLE_EVAL_ENV_FILE: envFile }, stdio: "pipe" }));
    summaries.push({ scenario, rendered: rendered.length, images: finish.images, checkCalls: finish.checkCalls, textCalls: finish.textCalls, blocked: finish.blocked, syntheticUsd: finish.measuredUsd,
      refused: results.filter((r) => r.outcome === "refused").length, seededRows: rendered.filter((r) => r.look?.seeded).length, rerunRefused: true, paidCalls: 0, productionMutations: 0 });
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
fs.writeFileSync(path.join(dir, "offline-rehearsal.json"), JSON.stringify({ at: new Date().toISOString(), method: "Disposable clones with every HTTP request intercepted; synthetic grants, text, checks and 1-pixel images only. Mechanics, not evidence.", summaries }, null, 2) + "\n");
console.log(JSON.stringify({ offline: true, summaries }));
