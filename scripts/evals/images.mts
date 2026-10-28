/**
 * Image evaluation command (#98, S10): fixed cases through the generic engine, one arm per art style,
 * repeated samples, a hard provider-spend budget and a resumable run. The legacy direct and planner
 * arms went with the legacy engine (#184).
 *
 *   npm run evals:images -- --dry-run                                  (costed manifest, no calls)
 *   npm run evals:images -- --run baseline --repeats 3 --budget 2.00
 *   npm run evals:images -- --run candidate --cases genesis-1-3-light,exodus-14-21-sea-parts --styles classical
 *   npm run evals:images -- --run styles --styles classical,watercolor,icon --analysis convex
 *   npm run evals:images -- --run trial --arms generic:gouache --style-file styles/trials/gouache.json
 *   npm run evals:images -- --compare baseline,candidate                 (side-by-side sheet from two runs)
 *
 * Arms (#181) render through the engine's own assembly: --analysis convex reads the deployment's
 * active analysis and references (NEXT_PUBLIC_CONVEX_URL, CONVEX_SERVER_SECRET); --analysis <run> builds an
 * in-memory analysis from works/<id>/.preparation/<run>/{state.json,canon.json} with no references. Looks and
 * plans are owner preparation spend, recorded apart from images and charged to the budget.
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
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { loadEvalCases, describeCoverage, type EvalArm } from "@/lib/image-evals/cases";
import { bindStyleReferenceControl, emptyEvalState, runImageEval, type EvalRunState } from "@/lib/image-evals/runner";
import { buildReport, buildScoreTemplate, renderComparisonSheet, renderContactSheet, type EvalReport, type ScoreFile } from "@/lib/image-evals/report";
import { createOpenRouterEvalImageProvider } from "@/lib/image-evals/adapters";
import { genericArm, isGenericArm, type GenericEvalContext, type GenericEvalProvider } from "@/lib/image-evals/generic";
import { fetchImageModels } from "@/lib/image-models";
import type { ImageBilling } from "@/lib/image-catalog";
import { createOpenRouterTextModel } from "@/lib/reading-pass/model";
import { createStyleLibrary, SHARED_STYLES, type ArtStyle } from "@/lib/work-preparation";
import { loadWorkInputs } from "@/lib/engine/work-inputs";
import { createConvexPreparationStore } from "@/lib/engine/preparation";
import { createMemoryPreparationStore } from "@/lib/engine/memory-store";
import { listAnalysisRecords } from "@/lib/engine/analysis-records";
import { analysisRecords, type ReadingPassState } from "@/lib/reading-pass/run";
import { canonRecords, type CanonState } from "@/lib/reading-pass/canon-run";
import type { ReferenceRecord } from "@/lib/engine/assemble";

const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean", default: false }, run: { type: "string", default: "latest" }, cases: { type: "string" }, arms: { type: "string", default: "generic" },
  repeats: { type: "string", default: "3" }, budget: { type: "string", default: "1.00" }, "estimate-image-usd": { type: "string", default: "0.035" },
  file: { type: "string" },
  styles: { type: "string" }, analysis: { type: "string" }, "style-file": { type: "string" }, compare: { type: "string" }, "estimate-preparation-usd": { type: "string", default: "0.0005" },
  "omit-style-reference": { type: "boolean", default: false },
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

if (values.compare) {
  // Two finished runs side by side, with each side's verdicts when scored.
  const [baselineRun, candidateRun] = values.compare.split(",").map((s) => s.trim());
  if (!baselineRun || !candidateRun) throw new Error("--compare takes baseline,candidate run names");
  const read = async <T,>(run: string, file: string): Promise<T | null> => { const f = path.join(root, "evals", "images", "runs", run, file); return existsSync(f) ? JSON.parse(await readFile(f, "utf8")) as T : null; };
  const baseline = await read<EvalReport>(baselineRun, "report.json");
  const candidate = await read<EvalReport>(candidateRun, "report.json");
  if (!baseline || !candidate) throw new Error("Both runs need a report.json; run them first");
  const html = renderComparisonSheet(baseline, candidate, { baseline: await read<ScoreFile>(baselineRun, "scores.json"), candidate: await read<ScoreFile>(candidateRun, "scores.json") },
    { baseline: (ref) => `../runs/${baselineRun}/${ref}`, candidate: (ref) => `../runs/${candidateRun}/${ref}` });
  const outDir = path.join(root, "evals", "images", "compare");
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${baselineRun}-vs-${candidateRun}.html`);
  await writeFile(out, html);
  console.log(`Wrote ${path.relative(root, out)}.`);
  process.exit(0);
}

const casesPath = values.file ? path.resolve(values.file) : path.join(root, "evals", "images", "cases.json");
let cases = loadEvalCases(JSON.parse(await readFile(casesPath, "utf8")));
const coverage = describeCoverage(cases);
if (values.cases) {
  const wanted = new Set(values.cases.split(",").map((s) => s.trim()).filter(Boolean));
  const unknown = [...wanted].filter((id) => !cases.some((c) => c.id === id));
  if (unknown.length) throw new Error(`Unknown case id(s): ${unknown.join(", ")}`);
  cases = cases.filter((c) => wanted.has(c.id));
}
// An owner-authored style trial: a style file outside the library, used for its id's generic arm.
const styleTrials: Record<string, { style: ArtStyle; version: string }> = {};
if (values["style-file"]) {
  const text = await readFile(path.resolve(values["style-file"]), "utf8");
  const style = createStyleLibrary([JSON.parse(text)]).styles[0];
  styleTrials[style.id] = { style, version: createHash("sha256").update(text).digest("hex") };
}
const requestedStyles = values.styles ? values.styles.split(",").map((s) => s.trim()).filter(Boolean) : [...SHARED_STYLES.styles.map((s) => s.id), ...Object.keys(styleTrials)];
const arms = values.arms.split(",").map((s) => s.trim()).filter(Boolean).flatMap((arm) => (arm === "generic" ? requestedStyles.map(genericArm) : [arm])) as EvalArm[];
for (const arm of arms) {
  if (!isGenericArm(arm)) throw new Error(`Unknown arm ${arm}; use generic or generic:<style> (the legacy direct and planner arms were removed with the legacy engine)`);
  const id = arm.slice("generic:".length);
  if (!SHARED_STYLES.styles.some((s) => s.id === id) && !styleTrials[id]) throw new Error(`Unknown art style ${id}; add it to the library or pass --style-file`);
}
const omitStyleReference = values["omit-style-reference"];
const repeats = Number.parseInt(values.repeats, 10);
const budgetUsd = Number(values.budget);
const estimateUsd = { image: Number(values["estimate-image-usd"]), preparation: Number(values["estimate-preparation-usd"]) };
if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--repeats must be a positive integer");
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive USD amount");
if (![estimateUsd.image, estimateUsd.preparation].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("estimates must be non-negative USD amounts");

const runDir = path.join(root, "evals", "images", "runs", values.run);
const outputsDir = path.join(runDir, "outputs");
await mkdir(outputsDir, { recursive: true });
const statePath = path.join(runDir, "state.json");
const imageModel = cases[0]?.resolvedSettings.model ?? "google/gemini-3.1-flash-lite-image";
const state: EvalRunState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyEvalState(values.run, imageModel);
if (state.imageModel !== imageModel || state.plannerModel) throw new Error(`Run "${values.run}" was started with ${state.imageModel}${state.plannerModel ? ` and the legacy planner ${state.plannerModel}` : ""}; use a new --run for ${imageModel}`);
bindStyleReferenceControl(state, omitStyleReference);
const saveState = async (next: EvalRunState) => { await writeFile(statePath, JSON.stringify(next, null, 1)); };

console.log(`${cases.length} case(s) (${coverage.total} in the file; genres ${Object.entries(coverage.byGenre).map(([g, n]) => `${g} ${n}`).join(", ")}${coverage.missing.length ? `; missing ${coverage.missing.join(", ")}` : ""}), arms ${arms.join("+")}, ${repeats} repeat(s), image ${imageModel}`);

if (values["dry-run"]) {
  const { manifest } = await runImageEval({ cases, arms, repeats, budgetUsd, estimateUsd, omitStyleReference, dryRun: true, providers: { image: { id: "none", generate: async () => { throw new Error("dry run"); } }, generic: null, sink: { save: async () => "" } }, state, saveState });
  await saveState(state);
  await writeFile(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`Dry run: ${manifest.plannedCalls} sample(s) to make (${manifest.doneCalls} already done), about $${manifest.estimatedUsd.toFixed(2)} at $${estimateUsd.image} per image + up to 3 × $${estimateUsd.preparation} preparation per sample (${arms.join(", ")}); budget $${budgetUsd.toFixed(2)} → ${manifest.withinBudget ? "fits" : "DOES NOT FIT; the run would stop at the budget"}. Manifest written to ${path.relative(root, path.join(runDir, "manifest.json"))}.`);
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
// The generic engine's inputs and analysis, per work, from the deployment or from preparation state files.
async function createGenericProvider(): Promise<GenericEvalProvider> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.CONVEX_SERVER_SECRET;
  const analysis = values.analysis ?? (url && secret ? "convex" : "latest");
  const catalog = await fetchImageModels(apiKey!);
  const billing = new Map<string, ImageBilling | undefined>(catalog.models.map((m) => [m.id, m.billing]));
  const contexts = new Map<string, Promise<GenericEvalContext>>();
  const context = (workId: string) => {
    let ctx = contexts.get(workId);
    if (!ctx) {
      ctx = (async () => {
        const inputs = await loadWorkInputs(workId);
        if (analysis === "convex") {
          if (!url || !secret) throw new Error("--analysis convex needs NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET");
          const client = new ConvexHttpClient(url);
          const status = await client.query(api.analysis.getWorkStatus, { workId });
          if (!status.ready) throw new Error(`${workId} is not ready on the deployment: ${status.reasons.join("; ")}`);
          if (status.workVersion !== inputs.workVersion || status.briefVersion !== inputs.briefVersion) throw new Error(`${workId}: the deployed analysis was registered against other work/brief versions than this checkout`);
          return {
            inputs,
            store: createConvexPreparationStore({ query: (ref, args) => client.query(ref as never, args as never), mutation: (ref, args) => client.mutation(ref as never, args as never) }, api.analysis as unknown as Record<string, unknown>, workId, secret),
            listMoments: async () => (await listAnalysisRecords(client, workId, status.activeGeneration!, "moment")).map((r) => ({ id: r.recordId, firstUnit: String((r.payload as { firstUnit: string }).firstUnit), lastUnit: String((r.payload as { lastUnit: string }).lastUnit) })),
            getReference: (kind, recordId) => client.query(api.analysis.getReference, { workId, kind, recordId }) as Promise<ReferenceRecord | null>,
            loadReference: async (storageId) => {
              const located = await client.query(api.analysis.getReferenceBlobUrl, { serverSecret: secret, storageId: storageId as never });
              if (!located?.url) throw new Error(`Reference blob ${storageId} is missing`);
              const response = await fetch(located.url, { signal: AbortSignal.timeout(10_000) });
              if (!response.ok) throw new Error(`Reference blob ${storageId} returned ${response.status}`);
              const bytes = new Uint8Array(await response.arrayBuffer());
              if ((located.contentType ?? "") === "image/jpeg") return bytes;
              const sharp = (await import("sharp")).default;
              return new Uint8Array(await sharp(Buffer.from(bytes)).jpeg({ quality: 88 }).toBuffer());
            },
          } satisfies GenericEvalContext;
        }
        const prepDir = path.join(root, "works", workId, ".preparation", analysis);
        const readingPath = path.join(prepDir, "state.json");
        const canonPath = path.join(prepDir, "canon.json");
        if (!existsSync(readingPath)) throw new Error(`No reading state at ${path.relative(root, readingPath)}; run works:read, or use --analysis convex`);
        const reading = JSON.parse(await readFile(readingPath, "utf8")) as ReadingPassState;
        const canon = existsSync(canonPath) ? JSON.parse(await readFile(canonPath, "utf8")) as CanonState : null;
        const records = canon ? canonRecords(reading, canon) : analysisRecords(reading);
        const memory = createMemoryPreparationStore(records);
        console.log(`${workId}: in-memory analysis from ${path.relative(root, prepDir)} (${records.length} record(s)${canon ? ", with canon" : ", no canon: entries have no stages"}); no reference images.`);
        return { inputs, store: memory.store, listMoments: memory.listMoments, getReference: async () => null, loadReference: async () => { throw new Error("no references in an in-memory analysis"); } } satisfies GenericEvalContext;
      })();
      contexts.set(workId, ctx);
    }
    return ctx;
  };
  return { context, model: createOpenRouterTextModel({ apiKey: apiKey! }), billing: (modelId) => billing.get(modelId), styleTrials };
}

const providers = {
  image: createOpenRouterEvalImageProvider({ apiKey }),
  generic: await createGenericProvider(),
  sink: { save: async (key: string, bytes: Uint8Array, mimeType: string) => {
    const file = path.join(outputsDir, `${key}.${mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "png"}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return path.relative(runDir, file);
  } },
};
await saveState(state);
const result = await runImageEval({ cases, arms, repeats, budgetUsd, estimateUsd, omitStyleReference, providers, state, saveState, log: (line) => console.log(line) });
const report = buildReport(result.state, cases, { arms, repeats });
await writeFile(path.join(runDir, "report.json"), JSON.stringify(report, null, 1));
await writeFile(path.join(runDir, "contact-sheet.html"), renderContactSheet(report));
const scoresPath = path.join(runDir, "scores.json");
if (!existsSync(scoresPath)) await writeFile(scoresPath, JSON.stringify(buildScoreTemplate(report), null, 1));
console.log(`Spent $${result.state.spentUsd.toFixed(4)}${result.state.stopped ? ` (stopped: ${result.state.stopped.reason})` : ""}. Comparisons: ${report.comparisons.ready} ready, ${report.comparisons.inconclusive} inconclusive, ${report.comparisons.incomplete} incomplete. Open ${path.relative(root, path.join(runDir, "contact-sheet.html"))} and score ${path.relative(root, scoresPath)}.`);
