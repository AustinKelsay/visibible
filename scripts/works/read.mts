/**
 * Owner-run reading pass (#169): read an imported work into sections, moments, a merged cast and
 * a draft brief, and stage them as a candidate analysis generation.
 *
 *   npm run works:read -- <work-id> [--dry-run] [--budget 2.00] [--run <name>] [--no-store]
 *
 * Reads works/<work-id>/work.json (from `npm run works:import`) and works/<work-id>/hints.json if
 * present. State lives in works/<work-id>/.preparation/<run>/state.json (ignored by git), so a
 * repeated command resumes and never repeats a completed paid call. The draft brief is written to
 * works/<work-id>/brief.draft.json with a review sidecar for the owner's one-file brief PR.
 * Needs OPENROUTER_API_KEY, and NEXT_PUBLIC_CONVEX_URL plus CONVEX_SERVER_SECRET unless --no-store;
 * each is read from .env.local when not already set. Guest credits are never involved.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { createWorkReader } from "@/lib/work-input";
import { createOpenRouterTextModel } from "@/lib/reading-pass/model";
import { createConvexAnalysisStore } from "@/lib/reading-pass/store";
import { emptyState, planReadingPass, runReadingPass, spentUsd, type ReadingPassState, type WorkHints } from "@/lib/reading-pass/run";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    budget: { type: "string", default: "2.00" },
    run: { type: "string", default: "latest" },
    "no-store": { type: "boolean", default: false },
  },
});
const workId = positionals[0];
if (!workId) throw new Error("Usage: npm run works:read -- <work-id> [--dry-run] [--budget usd] [--run name] [--no-store]");
const root = fileURLToPath(new URL("../../", import.meta.url));
const workDir = path.join(root, "works", workId);

async function loadEnv() {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const workJson = await readFile(path.join(workDir, "work.json"), "utf8");
const workFile = JSON.parse(workJson);
const workVersion = createHash("sha256").update(workJson).digest("hex");
const work = createWorkReader(workFile);
const hintsPath = path.join(workDir, "hints.json");
const hints: WorkHints | undefined = existsSync(hintsPath) ? JSON.parse(await readFile(hintsPath, "utf8")) : undefined;
const stateDir = path.join(workDir, ".preparation", values.run);
const statePath = path.join(stateDir, "state.json");
await mkdir(stateDir, { recursive: true });
let state: ReadingPassState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyState(work.work.id, workVersion);
if (state.workVersion !== workVersion) {
  if (Object.keys(state.readings).length) throw new Error(`The run "${values.run}" was read against another version of work.json; use --run <new name>`);
  state = emptyState(work.work.id, workVersion);
}
const budgetUsd = Number(values.budget);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive USD amount");

const plan = planReadingPass(work, state, { hints });
console.log(`${work.work.title}: ${plan.divisions.length} divisions, ${plan.divisions.filter((d) => d.done).length} already read; ` +
  `about $${plan.estimatedUsd.toFixed(2)} for ${plan.remainingCalls} remaining call(s); spent so far $${plan.spentUsd.toFixed(4)}; budget $${budgetUsd.toFixed(2)}`);
for (const d of plan.divisions) console.log(`  ${d.done ? "done" : "todo"}  ${d.label} (${d.units} units, ${d.unitsPerSection} per section)`);
if (values["dry-run"]) {
  console.log("Dry run: no calls made, nothing written.");
  process.exit(0);
}

await loadEnv();
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
let store = null;
if (!values["no-store"]) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.CONVEX_SERVER_SECRET;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET are needed to stage the analysis (or pass --no-store)");
  store = createConvexAnalysisStore(new ConvexHttpClient(url), secret);
}
const saveState = async (next: ReadingPassState) => {
  await writeFile(statePath, JSON.stringify(next, null, 1));
};
try {
  state = await runReadingPass({ workFile, workVersion, model: createOpenRouterTextModel({ apiKey }), store, state, saveState, budgetUsd, hints, log: (line) => console.log(line) });
} finally {
  await saveState(state);
  console.log(`spent $${spentUsd(state).toFixed(4)} of $${budgetUsd.toFixed(2)} across ${state.ledger.length} call(s); state in ${path.relative(root, statePath)}`);
}
if (state.brief) {
  const draftPath = path.join(workDir, "brief.draft.json");
  await writeFile(draftPath, JSON.stringify(state.brief.brief, null, 2) + "\n");
  const review = { styleReasons: state.brief.styleReasons, canonHints: state.brief.canonHints, scopeIssues: state.brief.scopeIssues,
    validationErrors: state.brief.validationErrors, assignmentProblems: state.brief.assignmentProblems, sectionEras: state.brief.sectionEras };
  await writeFile(path.join(workDir, "brief.draft.review.json"), JSON.stringify(review, null, 2) + "\n");
  console.log(`draft brief written to ${path.relative(root, draftPath)} (review notes alongside); open a one-file PR with works/${workId}/brief.json to approve it`);
}
if (state.staged) console.log(`staged generation ${state.staged.generation} with ${state.staged.records} records; it cannot activate until canon is drafted`);
