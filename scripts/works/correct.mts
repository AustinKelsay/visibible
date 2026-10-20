/**
 * Owner correction command (#179): inspect and correct a work's analysis without touching saved images.
 *
 *   npm run works:correct -- <work-id> attention [--closed]
 *   npm run works:correct -- <work-id> inspect <entryId>
 *   npm run works:correct -- <work-id> edit-stage <entryId> <stageId> --text "..." [--expect <version>]
 *   npm run works:correct -- <work-id> edit-look <sectionId> [--place ..] [--time ..] [--weather ..] [--light ..] [--clothing ..] [--expect <version>]
 *   npm run works:correct -- <work-id> pin|unpin sheet|style <recordId>
 *   npm run works:correct -- <work-id> redo-sheet <entryId:stageId>            (owner-funded; refuses a pinned sheet)
 *   npm run works:correct -- <work-id> redo-style <styleId>
 *   npm run works:correct -- <work-id> redraft <entryId>                       (runs works:canon --redraft --activate)
 *   npm run works:correct -- <work-id> clear-plan <momentId>
 *   npm run works:correct -- <work-id> dismiss <attentionId> [--disposition ..]
 *   npm run works:correct -- <work-id> reports [--closed]                        (reader image reports)
 *   npm run works:correct -- <work-id> report <attentionId>                      (messages, history, image provenance)
 *   npm run works:correct -- <work-id> resolve <attentionId> --disposition "source corrected" --correction entry:<id>:<version> --check "..."
 *                                                            --disposition "isolated rendering error" | "accepted limitation" | "dismissed"
 *   npm run works:correct -- <work-id> wipe [--including-owner] [--confirm-production]
 *
 * Needs NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET (read from .env.local when unset). A wipe
 * against a production deployment (CONVEX_DEPLOYMENT starting with "prod:") requires --confirm-production.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { createCorrections, parseCorrectionLink } from "@/lib/engine/corrections";
import { validateWorkBrief, SHARED_STYLES } from "@/lib/work-preparation";
import { createOpenRouterImageMaker, createOpenRouterVisionChecker } from "@/lib/engine/reference-adapters";
import { emptyReferenceState, runReferences, type ReferenceRunState, type ReferenceStore } from "@/lib/engine/references-run";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  text: { type: "string" }, expect: { type: "string" }, place: { type: "string" }, time: { type: "string" }, weather: { type: "string" }, light: { type: "string" }, clothing: { type: "string" },
  disposition: { type: "string" }, correction: { type: "string" }, check: { type: "string" }, closed: { type: "boolean", default: false }, "including-owner": { type: "boolean", default: false }, "confirm-production": { type: "boolean", default: false },
  budget: { type: "string", default: "1.00" }, run: { type: "string", default: "latest" },
} });
const [workId, command, ...rest] = positionals;
if (!workId || !command) throw new Error("Usage: npm run works:correct -- <work-id> <command> …");
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
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.CONVEX_SERVER_SECRET;
if (!url || !secret) throw new Error("NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET are needed");
const siteUrl = process.env.NOSTR_IMAGE_BASE_URL || process.env.CONVEX_SITE_URL || url.replace(".convex.cloud", ".convex.site");
const client = new ConvexHttpClient(url);
const corrections = createCorrections(client, api.analysis as never, workId, secret, siteUrl, { getImageProvenance: api.verseImages.getImageProvenance });
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

switch (command) {
  case "attention": {
    const rows = await corrections.attention(values.closed ? "closed" : "open");
    if (!rows.length) { console.log("Nothing needs attention."); break; }
    for (const r of rows) console.log(`${r.id}  ${r.source.padEnd(7)} ${r.reason.padEnd(24)} ${(r.kind ?? "").padEnd(14)} ${(r.recordId ?? "").padEnd(32)} ×${r.count}  ${new Date(r.lastActivityAt).toISOString()}${r.link ? `  ${r.link}` : ""}${r.detail ? `\n    ${r.detail}` : ""}`);
    break;
  }
  case "inspect": print(await corrections.inspect(rest[0])); break;
  case "edit-stage": {
    if (!values.text) throw new Error("--text is required");
    print(await corrections.editStage(rest[0], rest[1], values.text, values.expect));
    break;
  }
  case "edit-look": print(await corrections.editLook(rest[0], { place: values.place, timeOfDay: values.time, weather: values.weather, light: values.light, clothing: values.clothing }, values.expect)); break;
  case "pin": case "unpin": {
    const kind = rest[0] === "style" ? "styleReference" : "sheet";
    print(await corrections.pin(kind, rest[1], command === "pin"));
    break;
  }
  case "redo-sheet": case "redo-style": {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
    const workDir = path.join(root, "works", workId);
    const work = JSON.parse(await readFile(path.join(workDir, "work.json"), "utf8")) as { title: string };
    const brief = validateWorkBrief(JSON.parse(await readFile(path.join(workDir, "brief.json"), "utf8")));
    const styleVersions = Object.fromEntries(await Promise.all(SHARED_STYLES.styles.map(async (s) => [s.id, createHash("sha256").update(await readFile(path.join(root, "styles", `${s.id}.json`), "utf8")).digest("hex")])));
    const store: ReferenceStore = {
      listActiveRecords: (kind) => client.query(api.analysis.listActiveRecords, { workId, kind }) as never,
      getReference: async (kind, recordId, expectedInputs) => { const r = await client.query(api.analysis.getReference, { workId, kind, recordId, expectedInputs }); return r ? { storageId: r.storageId, stale: r.stale, pinned: r.pinned } : null; },
      putReference: async (args) => { await client.mutation(api.analysis.putReference, { serverSecret: secret, workId, ...args, storageId: args.storageId as never }); },
      noteAttention: async (item) => { await client.mutation(api.analysis.noteAttention, { serverSecret: secret, workId, ...item }); },
    };
    const blobs = { store: async (bytes: Uint8Array, mimeType: string) => ({ storageId: (await client.action(api.analysis.storeReferenceBlob, { serverSecret: secret, base64: Buffer.from(bytes).toString("base64"), mimeType })).storageId as string }) };
    const runDir = path.join(workDir, ".preparation", values.run);
    await mkdir(runDir, { recursive: true });
    const statePath = path.join(runDir, "references.json");
    const state: ReferenceRunState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyReferenceState(workId);
    delete state.done[`${command === "redo-sheet" ? "sheet" : "styleReference"}:${rest[0]}`];
    const kind = command === "redo-sheet" ? "sheet" : "styleReference";
    const budgetUsd = Number(values.budget);
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be a positive USD amount");
    const result = await runReferences({ workId, workTitle: work.title, brief, store, maker: createOpenRouterImageMaker({ apiKey }), checker: createOpenRouterVisionChecker({ apiKey }), blobs, state,
      saveState: async (next) => { await writeFile(statePath, JSON.stringify(next, null, 1)); }, budgetUsd, styleVersions, only: [rest[0]], log: (line) => console.log(line) });
    const done = result.done[`${kind}:${rest[0]}`];
    if (!done) throw new Error(`${rest[0]} is not a ${kind} this work needs (no entry with that stage in two or more sections, or no such style in the brief)`);
    if (!done.ok) throw new Error(`${rest[0]} failed again after ${done.attempts} attempt(s); its attention item stays open`);
    // Only a successful remake closes the checker items for this reference.
    print(await corrections.settleAttention(kind, rest[0]));
    break;
  }
  case "redraft": {
    const result = spawnSync("npx", ["tsx", "scripts/works/canon.mts", workId, "--run", values.run, "--redraft", rest[0], "--activate"], { cwd: root, stdio: "inherit" });
    if (result.status !== 0) throw new Error("redraft failed");
    print(await corrections.settleAttention("entry", rest[0]));
    break;
  }
  case "clear-plan": print(await corrections.clearPlan(rest[0])); break;
  case "dismiss": print(await corrections.dismiss(rest[0], values.disposition ?? "dismissed")); break;
  case "reports": {
    const rows = await corrections.reports(values.closed ? "closed" : "open");
    if (!rows.length) { console.log("No reader reports."); break; }
    for (const r of rows) console.log(`${r.id}  ×${r.count}  ${new Date(r.lastActivityAt).toISOString()}  ${r.verseId ?? "?"}  ${r.artStyle ?? "?"}  ${r.engine ?? "legacy"}/${r.translationId ?? "?"}${r.disposition ? `  [${r.disposition}]` : ""}${r.imageMissing ? "  (image missing)" : ""}${r.link ? `\n    ${r.link}` : ""}${r.detail ? `\n    ${r.detail}` : ""}`);
    break;
  }
  case "report": print(await corrections.report(rest[0])); break;
  case "resolve": {
    if (!values.disposition) throw new Error("--disposition is required");
    print(await corrections.resolve(rest[0], { disposition: values.disposition, correction: values.correction ? parseCorrectionLink(values.correction) : undefined, check: values.check }));
    break;
  }
  case "wipe": {
    // The targeted deployment is the one the client connects to. It counts as development only
    // when its URL names the deployment in .env.convex.dev; anything else needs the production flag.
    const devFile = path.join(root, ".env.convex.dev");
    const devName = existsSync(devFile) ? (await readFile(devFile, "utf8")).match(/^\s*CONVEX_DEPLOYMENT\s*=\s*dev:([a-z0-9-]+)/m)?.[1] : undefined;
    const isDevelopment = Boolean(devName && new URL(url).hostname === `${devName}.convex.cloud`);
    if (!isDevelopment && !values["confirm-production"]) throw new Error(`${new URL(url).hostname} is not the development deployment named in .env.convex.dev; pass --confirm-production to wipe it`);
    print(await corrections.wipe({ includingOwner: values["including-owner"] }));
    print(await corrections.status());
    break;
  }
  default: throw new Error(`Unknown command ${command}`);
}
