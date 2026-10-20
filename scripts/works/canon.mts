/**
 * Owner-run canon step (#170): draft canon for every on-stage entry of a finished reading pass
 * against the approved brief, stage the complete analysis as a candidate generation, and
 * optionally activate it.
 *
 *   npm run works:canon -- <work-id> [--run latest] [--budget 2.00] [--activate] [--redraft id,id] [--no-store] [--brief path]
 *
 * Reads works/<work-id>/work.json, the reading-pass state under works/<work-id>/.preparation/<run>/,
 * and the approved brief at works/<work-id>/brief.json (or --brief). Canon state lives beside the
 * reading state as canon.json, so a repeated command resumes. Needs OPENROUTER_API_KEY, and
 * NEXT_PUBLIC_CONVEX_URL plus CONVEX_SERVER_SECRET unless --no-store.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { validateWorkBrief, type CanonHint } from "@/lib/work-preparation";
import { createOpenRouterTextModel } from "@/lib/reading-pass/model";
import { createConvexAnalysisStore } from "@/lib/reading-pass/store";
import type { ReadingPassState } from "@/lib/reading-pass/run";
import { emptyCanonState, runCanon, type CanonState } from "@/lib/reading-pass/canon-run";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    run: { type: "string", default: "latest" },
    budget: { type: "string", default: "2.00" },
    activate: { type: "boolean", default: false },
    redraft: { type: "string" },
    "no-store": { type: "boolean", default: false },
    brief: { type: "string" },
  },
});
const workId = positionals[0];
if (!workId) throw new Error("Usage: npm run works:canon -- <work-id> [--run name] [--budget usd] [--activate] [--redraft id,id] [--no-store] [--brief path]");
const root = fileURLToPath(new URL("../../", import.meta.url));
const workDir = path.join(root, "works", workId);
const runDir = path.join(workDir, ".preparation", values.run);

async function loadEnv() {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const workJson = await readFile(path.join(workDir, "work.json"), "utf8");
const workVersion = createHash("sha256").update(workJson).digest("hex");
const readingPath = path.join(runDir, "state.json");
if (!existsSync(readingPath)) throw new Error(`No reading-pass state at ${path.relative(root, readingPath)}; run npm run works:read first`);
const reading: ReadingPassState = JSON.parse(await readFile(readingPath, "utf8"));
const briefPath = values.brief ? path.resolve(values.brief) : path.join(workDir, "brief.json");
if (!existsSync(briefPath)) throw new Error(`No approved brief at ${path.relative(root, briefPath)}; merge the brief PR first, or pass --brief`);
const briefJson = await readFile(briefPath, "utf8");
const brief = validateWorkBrief(JSON.parse(briefJson));
const briefVersion = createHash("sha256").update(briefJson).digest("hex");
const reviewPath = path.join(workDir, "brief.draft.review.json");
const hints: CanonHint[] = existsSync(reviewPath) ? (JSON.parse(await readFile(reviewPath, "utf8")).canonHints ?? []) : reading.brief?.canonHints ?? [];
const statePath = path.join(runDir, "canon.json");
let state: CanonState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyCanonState(workId, workVersion, briefVersion);
if (state.briefVersion !== briefVersion) {
  console.log("The brief changed since the last canon run; starting canon fresh against the new brief.");
  state = emptyCanonState(workId, workVersion, briefVersion);
}
const budgetUsd = Number(values.budget);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive USD amount");

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
const saveState = async (next: CanonState) => { await writeFile(statePath, JSON.stringify(next, null, 1)); };
try {
  state = await runCanon({ workFile: JSON.parse(workJson), workVersion, brief, briefVersion, reading, hints, model: createOpenRouterTextModel({ apiKey }), store, state, saveState,
    budgetUsd, activate: values.activate, redraft: values.redraft?.split(",").map((s) => s.trim()).filter(Boolean), log: (line) => console.log(line) });
} finally {
  await saveState(state);
  const spent = state.ledger.reduce((n, e) => n + (e.costUsd ?? 0), 0);
  console.log(`spent $${spent.toFixed(4)} of $${budgetUsd.toFixed(2)} across ${state.ledger.length} call(s); ${Object.keys(state.entries).length} entries drafted; state in ${path.relative(root, statePath)}`);
}
if (state.staged) console.log(`generation ${state.staged.generation}: ${state.staged.records} records, ${state.staged.activated ? "active" : "staged; run again with --activate to serve it"}`);
