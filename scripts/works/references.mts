/**
 * Owner-run reference step (#172): make the Classical reference sheets and the style references
 * (Classical included) a work's active analysis needs, check them, and store them. `--only` makes just
 * the named records ("entry:stage" or a style id), remaking them even if fresh.
 *
 *   npm run works:references -- <work-id> [--dry-run] [--budget 5.00] [--run latest] [--brief path] [--only classical,adam:adam]
 *
 * Needs the work's active analysis (npm run works:canon -- <id> --activate), the approved brief,
 * OPENROUTER_API_KEY, NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET. State lives beside the
 * reading state as references.json. Pinned references are never remade; failed ones surface as
 * attention items and the engine runs without them.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { validateWorkBrief, SHARED_STYLES } from "@/lib/work-preparation";
import { createOpenRouterImageMaker, createOpenRouterVisionChecker } from "@/lib/engine/reference-adapters";
import { emptyReferenceState, planReferences, runReferences, type ReferenceRunState, type ReferenceStore } from "@/lib/engine/references-run";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  "dry-run": { type: "boolean", default: false }, budget: { type: "string", default: "5.00" }, run: { type: "string", default: "latest" }, brief: { type: "string" }, only: { type: "string" },
} });
const workId = positionals[0];
if (!workId) throw new Error("Usage: npm run works:references -- <work-id> [--dry-run] [--budget usd] [--run name] [--brief path]");
const root = fileURLToPath(new URL("../../", import.meta.url));
const workDir = path.join(root, "works", workId);
const runDir = path.join(workDir, ".preparation", values.run);
await mkdir(runDir, { recursive: true });

async function loadEnv() {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
await loadEnv();
const work = JSON.parse(await readFile(path.join(workDir, "work.json"), "utf8")) as { title: string };
const briefPath = values.brief ? path.resolve(values.brief) : path.join(workDir, "brief.json");
const brief = validateWorkBrief(JSON.parse(await readFile(briefPath, "utf8")));
const styleVersions = Object.fromEntries(await Promise.all(SHARED_STYLES.styles.map(async (s) => [s.id, createHash("sha256").update(await readFile(path.join(root, "styles", `${s.id}.json`), "utf8")).digest("hex")])));
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.CONVEX_SERVER_SECRET;
if (!url || !secret) throw new Error("NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET are needed");
const client = new ConvexHttpClient(url);
const store: ReferenceStore = {
  listActiveRecords: (kind) => client.query(api.analysis.listActiveRecords, { workId, kind }) as Promise<Array<{ recordId: string; version: string; payload: Record<string, unknown> }>>,
  getReference: async (kind, recordId, expectedInputs) => {
    const r = await client.query(api.analysis.getReference, { workId, kind, recordId, expectedInputs });
    return r ? { storageId: r.storageId, stale: r.stale, pinned: r.pinned } : null;
  },
  putReference: async (args) => { await client.mutation(api.analysis.putReference, { serverSecret: secret, workId, ...args, storageId: args.storageId as never }); },
  noteAttention: async (item) => { await client.mutation(api.analysis.noteAttention, { serverSecret: secret, workId, ...item }); },
};
const statePath = path.join(runDir, "references.json");
let state: ReferenceRunState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyReferenceState(workId);
const budgetUsd = Number(values.budget);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive USD amount");

const only = values.only?.split(",").map((id) => id.trim()).filter(Boolean);
const plan = await planReferences({ workId, brief, store, state, styleVersions });
const wanted = (id: string) => !only || only.includes(id);
const todo = only ? [...plan.sheets.map((s) => s.recordId), ...plan.styles.map((s) => s.styleId)].filter(wanted).length
  : [...plan.sheets, ...plan.styles].filter((x) => x.status === "missing" || x.status === "stale").length;
console.log(`${plan.sheets.length} sheet subject(s), ${plan.styles.length} style reference(s); ${todo} to make (about $${(todo * 0.045).toFixed(2)} at one attempt each); failed ones are retried only after their inputs change or with a new --run; spent so far $${state.spentUsd.toFixed(4)}; budget $${budgetUsd.toFixed(2)}`);
for (const s of plan.sheets.filter((x) => wanted(x.recordId))) console.log(`  ${s.status.padEnd(7)} sheet ${s.recordId} (${s.kind}: ${s.name})`);
for (const s of plan.styles.filter((x) => wanted(x.styleId))) console.log(`  ${s.status.padEnd(7)} style reference ${s.styleId}`);
if (only) console.log(`--only: making just ${only.join(", ")}, even if fresh`);
if (values["dry-run"]) { console.log("Dry run: no calls made, nothing written."); process.exit(0); }

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
const blobs = { store: async (bytes: Uint8Array, mimeType: string) => {
  const { storageId } = await client.action(api.analysis.storeReferenceBlob, { serverSecret: secret, base64: Buffer.from(bytes).toString("base64"), mimeType });
  return { storageId: storageId as string };
} };
try {
  state = await runReferences({ workId, workTitle: work.title, brief, store, maker: createOpenRouterImageMaker({ apiKey }), checker: createOpenRouterVisionChecker({ apiKey }), blobs,
    state, saveState: async (next) => { await writeFile(statePath, JSON.stringify(next, null, 1)); }, budgetUsd, styleVersions, only, log: (line) => console.log(line) });
} finally {
  await writeFile(statePath, JSON.stringify(state, null, 1));
  console.log(`spent $${state.spentUsd.toFixed(4)} of $${budgetUsd.toFixed(2)}; ${Object.values(state.done).filter((d) => d.ok).length} made, ${Object.values(state.done).filter((d) => !d.ok).length} failed; state in ${path.relative(root, statePath)}`);
}
