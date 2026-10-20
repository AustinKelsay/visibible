/**
 * Image evaluation command (#98, S10): fixed cases through the production prompt path, direct and
 * planner arms, repeated samples, a hard provider-spend budget and a resumable run.
 *
 *   npm run evals:images -- --dry-run                                  (costed manifest, no calls)
 *   npm run evals:images -- --run baseline --repeats 3 --budget 2.00
 *   npm run evals:images -- --run candidate --cases genesis-1-3-light,exodus-14-21-sea-parts --arms direct
 *
 * Reads evals/images/cases.json; writes evals/images/runs/<run>/{state.json,manifest.json,report.json,
 * scores.json,contact-sheet.html,outputs/}. Needs OPENROUTER_API_KEY (from .env.local when unset) unless
 * --dry-run. Paid runs are owner spend under the explicit --budget; nothing here is authorization.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadEvalCases, describeCoverage, EVAL_ARMS, type EvalArm } from "@/lib/image-evals/cases";
import { emptyEvalState, runImageEval, type EvalRunState } from "@/lib/image-evals/runner";
import { buildReport, buildScoreTemplate, renderContactSheet } from "@/lib/image-evals/report";
import { createOpenRouterEvalImageProvider, createOpenRouterEvalPlannerProvider } from "@/lib/image-evals/adapters";
import { resolveGenerationPassage } from "@/lib/generation-passage";
import { getScenePlannerModelId, isScenePlannerEnabled } from "@/lib/scene-planner";
import type { Translation } from "@/lib/bible-api";

const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean", default: false }, run: { type: "string", default: "latest" }, cases: { type: "string" }, arms: { type: "string", default: EVAL_ARMS.join(",") },
  repeats: { type: "string", default: "3" }, budget: { type: "string", default: "1.00" }, "estimate-image-usd": { type: "string", default: "0.035" }, "estimate-planner-usd": { type: "string", default: "0" },
  file: { type: "string" }, "planner-model": { type: "string" },
} });
const root = fileURLToPath(new URL("../../", import.meta.url));
async function loadEnv() {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
await loadEnv();

const casesPath = values.file ? path.resolve(values.file) : path.join(root, "evals", "images", "cases.json");
let cases = loadEvalCases(JSON.parse(await readFile(casesPath, "utf8")));
const coverage = describeCoverage(cases);
if (values.cases) {
  const wanted = new Set(values.cases.split(",").map((s) => s.trim()).filter(Boolean));
  const unknown = [...wanted].filter((id) => !cases.some((c) => c.id === id));
  if (unknown.length) throw new Error(`Unknown case id(s): ${unknown.join(", ")}`);
  cases = cases.filter((c) => wanted.has(c.id));
}
const arms = values.arms.split(",").map((s) => s.trim()).filter(Boolean) as EvalArm[];
for (const arm of arms) if (!EVAL_ARMS.includes(arm)) throw new Error(`Unknown arm ${arm}; use ${EVAL_ARMS.join(" or ")}`);
const repeats = Number.parseInt(values.repeats, 10);
const budgetUsd = Number(values.budget);
const estimateUsd = { image: Number(values["estimate-image-usd"]), planner: Number(values["estimate-planner-usd"]) };
if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--repeats must be a positive integer");
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive USD amount");
if (![estimateUsd.image, estimateUsd.planner].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("estimates must be non-negative USD amounts");

const runDir = path.join(root, "evals", "images", "runs", values.run);
const outputsDir = path.join(runDir, "outputs");
await mkdir(outputsDir, { recursive: true });
const statePath = path.join(runDir, "state.json");
const imageModel = cases[0]?.resolvedSettings.model ?? "google/gemini-3.1-flash-lite-image";
const plannerModel = arms.includes("planner") ? (values["planner-model"] ?? (isScenePlannerEnabled() ? getScenePlannerModelId() : null)) : null;
const state: EvalRunState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyEvalState(values.run, imageModel, plannerModel);
if (state.imageModel !== imageModel || state.plannerModel !== plannerModel) throw new Error(`Run "${values.run}" was started with ${state.imageModel} / ${state.plannerModel ?? "no planner"}; use a new --run for ${imageModel} / ${plannerModel ?? "no planner"}`);
const saveState = async (next: EvalRunState) => { await writeFile(statePath, JSON.stringify(next, null, 1)); };

console.log(`${cases.length} case(s) (${coverage.total} in the file; genres ${Object.entries(coverage.byGenre).map(([g, n]) => `${g} ${n}`).join(", ")}${coverage.missing.length ? `; missing ${coverage.missing.join(", ")}` : ""}), arms ${arms.join("+")}, ${repeats} repeat(s), image ${imageModel}, planner ${plannerModel ?? "none"}`);
if (arms.includes("planner") && !plannerModel) console.log("Planner arm requested but the scene planner is disabled (ENABLE_SCENE_PLANNER=false) and no --planner-model given: planner samples will run without a plan.");

if (values["dry-run"]) {
  const { manifest } = await runImageEval({ cases, arms, repeats, budgetUsd, estimateUsd, dryRun: true, providers: { resolvePassage: async () => null, image: { id: "none", generate: async () => { throw new Error("dry run"); } }, planner: null, sink: { save: async () => "" } }, state, saveState });
  await writeFile(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`Dry run: ${manifest.plannedCalls} call(s) to make (${manifest.doneCalls} already done), about $${manifest.estimatedUsd.toFixed(2)} at $${estimateUsd.image} per image${arms.includes("planner") ? ` + $${estimateUsd.planner} per plan` : ""}; budget $${budgetUsd.toFixed(2)} → ${manifest.withinBudget ? "fits" : "DOES NOT FIT; the run would stop at the budget"}. Manifest written to ${path.relative(root, path.join(runDir, "manifest.json"))}.`);
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
const providers = {
  resolvePassage: (reference: string, translation: string) => resolveGenerationPassage(reference, translation as Translation),
  image: createOpenRouterEvalImageProvider({ apiKey }),
  planner: plannerModel ? createOpenRouterEvalPlannerProvider({ apiKey, model: plannerModel }) : null,
  sink: { save: async (key: string, bytes: Uint8Array, mimeType: string) => {
    const file = path.join(outputsDir, `${key}.${mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "png"}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return path.relative(runDir, file);
  } },
};
const result = await runImageEval({ cases, arms, repeats, budgetUsd, estimateUsd, providers, state, saveState, log: (line) => console.log(line) });
const report = buildReport(result.state, cases, { arms, repeats });
await writeFile(path.join(runDir, "report.json"), JSON.stringify(report, null, 1));
await writeFile(path.join(runDir, "contact-sheet.html"), renderContactSheet(report));
const scoresPath = path.join(runDir, "scores.json");
if (!existsSync(scoresPath)) await writeFile(scoresPath, JSON.stringify(buildScoreTemplate(report), null, 1));
console.log(`Spent $${result.state.spentUsd.toFixed(4)}${result.state.stopped ? ` (stopped: ${result.state.stopped.reason})` : ""}. Comparisons: ${report.comparisons.ready} ready, ${report.comparisons.inconclusive} inconclusive, ${report.comparisons.incomplete} incomplete. Open ${path.relative(root, path.join(runDir, "contact-sheet.html"))} and score ${path.relative(root, scoresPath)}.`);
