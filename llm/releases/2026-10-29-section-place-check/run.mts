/**
 * Section-place A/B (ADR 0009): one Classical image per neighbouring-verse group verse, cold, from the frozen production
 * snapshot of the Fresco matrix, with no scene check. The same file runs from each arm's checkout, so its relative imports
 * load that arm's engine; results go to --out. Every paid call (text or image) is reserved before it starts and settled
 * from reported usage, and the arm stops at its cap. No production read or write.
 *
 *   VISIBIBLE_EVAL_ENV_FILE=<.env.local> npx tsx <checkout>/llm/releases/2026-10-29-section-place-check/run.mts \
 *     --arm arm-a --out <folder> --references <reference jpgs> --images <image folder> --execute
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { assembleRendering, type AssembleDeps, type ReferenceRecord } from "../../../src/lib/engine/assemble";
import { MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../../../src/lib/engine/plan-review";
import { GENERIC_PROMPT_VERSION } from "../../../src/lib/engine/prompt";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { createOpenRouterEvalImageProvider } from "../../../src/lib/image-evals/adapters";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";

const { values } = parseArgs({ options: { arm: { type: "string" }, out: { type: "string" }, references: { type: "string" }, images: { type: "string" }, execute: { type: "boolean", default: false } } });
assert.ok(values.execute, "Pass --execute to make paid calls");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = path.resolve(values.out!), referencesDir = path.resolve(values.references!), imagesDir = path.resolve(values.images!, values.arm!);
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const plan = JSON.parse(fs.readFileSync(path.join(out, "plan.json"), "utf8"));
const arm = Object.values(plan.arms as Record<string, { label: string; commit: string; capUsd?: number; pipeline: Record<string, string> }>).find((a) => a.label === values.arm);
assert.ok(arm, `Unknown arm ${values.arm}`);
// The checkout must be the arm's own commit and run that commit's pipeline.
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.ok(head.startsWith(arm.commit), `Checkout ${head} is not ${arm.commit}`);
assert.equal(MOMENT_CAST_PROMPT_VERSION, arm.pipeline.momentCast); assert.equal(PLAN_REVIEW_PROMPT_VERSION, arm.pipeline.review); assert.equal(GENERIC_PROMPT_VERSION, arm.pipeline.rendering);
const snapshotText = fs.readFileSync(path.join(root, "llm/releases/2026-10-28-fresco-matrix/snapshot.json"), "utf8");
assert.equal(hash(snapshotText), plan.snapshotSha256);
const snapshot = JSON.parse(snapshotText);
for (const [storageId, file] of Object.entries(snapshot.files as Record<string, { sha256: string }>)) assert.equal(hash(fs.readFileSync(path.join(referencesDir, `${storageId}.jpg`))), file.sha256);
const resultsFile = path.join(out, `results-${arm.label}.ndjson`), ledgerFile = path.join(out, `ledger-${arm.label}.json`), providerFile = path.join(out, `provider-${arm.label}.ndjson`);
for (const file of [resultsFile, ledgerFile, providerFile]) assert.ok(!fs.existsSync(file), `One-shot artifact exists: ${file}`);

const inputs = await readWorkInputs("bible-web", root);
const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
const apiKey = env.OPENROUTER_API_KEY!.trim(); assert.ok(apiKey);
const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data as Array<{ id: string; pricing: Record<string, string> }>;
const imagePricing = models.find((m) => m.id === plan.image.model)!.pricing;
assert.equal(Number(imagePricing.image_output), 0.00003); assert.equal(Number(imagePricing.prompt), 0.00000025);
const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
const balanceUsd = credits.total_credits - credits.total_usage; assert.ok(balanceUsd > 5, `OpenRouter balance $${balanceUsd} leaves too little for production`);

// One ledger for every paid call: reserve before, settle from reported usage, block on any doubt.
type Kind = "text" | "image";
// An arm may carry a lower cap than the plan's default (arm-c, to stay within the allowance's remainder).
const cap = { ...plan.cap, perArmUsd: arm.capUsd ?? plan.cap.perArmUsd };
const ledger = { arm: arm.label, commit: head, startedAt: new Date().toISOString(), balanceBeforeUsd: balanceUsd, calls: [] as Array<{ phase: string; kind: Kind; status: string; measuredUsd: number | null }>,
  measuredUsd: 0, uncertainUsd: 0, images: 0, textCalls: 0, blocked: null as string | null, finishedAt: null as string | null };
const flush = () => fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
flush();
const scrub = (value: unknown, inOpaque = false): unknown => typeof value === "string"
  ? (value.startsWith("data:") ? `[data url sha256 ${hash(value)} chars ${value.length}]` : inOpaque && value.length > 1000 ? `[opaque sha256 ${hash(value)} chars ${value.length}]` : value.replaceAll(apiKey, "[redacted]"))
  : Array.isArray(value) ? value.map((v) => scrub(v, inOpaque)) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== "user_id").map(([k, v]) => [k, scrub(v, inOpaque || k === "reasoning_details")])) : value;
const ledgered = (kind: Kind, phaseOf: () => string) => async (url: string, init: RequestInit) => {
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  const reserve = kind === "image" ? cap.imageReserveUsd : cap.textReserveUsd;
  if (ledger.blocked) throw Error(`Evaluation stopped: ${ledger.blocked}`);
  if (ledger.measuredUsd + ledger.uncertainUsd + reserve > cap.perArmUsd || (kind === "image" ? ledger.images >= cap.maximumImages : ledger.textCalls >= cap.maximumTextCalls)) {
    ledger.blocked = "Evaluation cap exhausted"; flush(); throw Error(`Evaluation stopped: ${ledger.blocked}`);
  }
  const call = { phase: phaseOf(), kind, status: "in-flight", measuredUsd: null as number | null };
  ledger.calls.push(call); ledger.uncertainUsd += reserve;
  if (kind === "image") ledger.images++; else ledger.textCalls++;
  flush();
  try {
    const response = await fetch(url, init), body = await response.clone().text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(body); } catch { /* non-JSON is a provider error below */ }
    const cost = extractOpenRouterUsageUsd(payload);
    fs.appendFileSync(providerFile, JSON.stringify({ ...call, at: new Date().toISOString(), request: scrub(JSON.parse(String(init.body))), status: response.status, response: scrub(payload), nonJson: Object.keys(payload).length ? undefined : body.slice(0, 300), measuredUsageUsd: cost }) + "\n");
    call.status = String(response.status); call.measuredUsd = cost;
    if (cost === null) ledger.blocked = "Missing provider usage";
    else { ledger.uncertainUsd -= reserve; ledger.measuredUsd += cost; }
    if (!response.ok || ledger.measuredUsd > cap.perArmUsd) ledger.blocked = "Provider error or exhausted cap";
    flush(); return response;
  } catch (error) { ledger.blocked ??= error instanceof Error ? error.message : String(error); call.status = "uncertain"; flush(); throw error; }
};

// One store for the arm, as production has one database: verses of a section share its look.
const records: AnalysisRecord[] = structuredClone(Object.values(snapshot.records as Record<string, AnalysisRecord>));
const sections = records.filter((r) => r.kind === "section");
for (const id of plan.cases as string[]) {
  if (records.some((r) => r.kind === "moment" && r.recordId === id)) continue;
  // Bible moments are their units: build a missing one from the section holding it, as the analysis stores it.
  const position = inputs.work.getUnit(id).position;
  const section = sections.find((s) => inputs.work.getUnit(String(s.payload.firstUnit)).position <= position && position <= inputs.work.getUnit(String(s.payload.lastUnit)).position);
  assert.ok(section, `No snapshot section holds ${id}`);
  const payload = { kind: "moment", sectionId: section.recordId, firstUnit: id, lastUnit: id };
  records.push({ kind: "moment", recordId: id, version: contentVersion(payload), inputs: [], source: "generated", payload } as AnalysisRecord);
}
// The pairing command reads each case's section cast (entry:stage) from a snapshot.json beside the results.
const casts = { cases: (plan.cases as string[]).map((id) => {
  const moment = records.find((r) => r.kind === "moment" && r.recordId === id)!;
  const section = sections.find((s) => s.recordId === moment.payload.sectionId)!;
  return { id, sectionId: section.recordId, cast: (section.payload.cast as Array<{ entryId: string; stageId: string }>).map((m) => `${m.entryId}:${m.stageId}`) };
}), source: { file: "llm/releases/2026-10-28-fresco-matrix/snapshot.json", sha256: plan.snapshotSha256 } };
const castsFile = path.join(out, "snapshot.json");
if (fs.existsSync(castsFile)) assert.deepEqual(JSON.parse(fs.readFileSync(castsFile, "utf8")), casts);
else fs.writeFileSync(castsFile, JSON.stringify(casts, null, 2) + "\n");

let phase = "";
const textModel = createOpenRouterTextModel({ apiKey, timeoutMs: 120_000, fetch: ledgered("text", () => phase) });
let textCalls = 0;
const model: typeof textModel = { id: textModel.id, complete: (request) => { textCalls++; return textModel.complete(request); } };
const imageProvider = createOpenRouterEvalImageProvider({ apiKey, fetch: ledgered("image", () => phase), timeoutMs: 180_000 });
const store: PreparationStore = {
  getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
  claim: async () => ({ held: true }), release: async () => {}, recordSpend: async () => {},
  putDerivedRecord: async (args) => {
    const r = { ...structuredClone(args), version: contentVersion(args.payload), source: "generated" } as AnalysisRecord;
    const index = records.findIndex((x) => x.kind === args.kind && x.recordId === args.recordId);
    if (index < 0) records.push(r); else records[index] = r;
    return { version: r.version };
  },
};
fs.mkdirSync(imagesDir, { recursive: true });
const record = (row: unknown) => fs.appendFileSync(resultsFile, JSON.stringify(row) + "\n");

for (const id of plan.cases as string[]) {
  if (ledger.blocked) { record({ key: `${id}/${arm.label}`, case: id, style: arm.label, outcome: "not run", reason: ledger.blocked }); continue; }
  phase = id; textCalls = 0;
  const skipped: string[] = [];
  const deps: AssembleDeps = {
    inputs, store, model, listMoments: async () => [],
    getReference: async (kind, recordId) => (snapshot.references[`${kind}:${recordId}`] ?? null) as ReferenceRecord | null,
    loadReference: async (storageId) => {
      const bytes = new Uint8Array(fs.readFileSync(path.join(referencesDir, `${storageId}.jpg`)));
      assert.equal(hash(bytes), snapshot.files[storageId].sha256); return bytes;
    },
    onReferenceSkipped: (kind, recordId, why) => skipped.push(`${kind}:${recordId}:${why}`),
  };
  const started = Date.now();
  let assembled;
  try { assembled = await assembleRendering(deps, { workId: "bible-web", unitId: id, styleId: plan.style, variationNumber: null, aspectRatio: plan.image.aspectRatio }); }
  catch (error) { record({ key: `${id}/${arm.label}`, case: id, style: arm.label, outcome: "error", stage: "assemble", message: String(error).slice(0, 400), textCalls }); continue; }
  if (!assembled.ok) { record({ key: `${id}/${arm.label}`, case: id, style: arm.label, outcome: "refused", stage: "assemble", reason: assembled.reason, message: assembled.message, textCalls }); continue; }
  const p = assembled.prepared as typeof assembled.prepared & { sharedPlace?: string | null };
  const planPayload = await store.getActiveRecord("plan", assembled.momentId);
  const prepared = { look: p.look.payload, situation: p.situation, sharedPlace: p.sharedPlace ?? null, plan: p.plan.payload, present: p.present, review: planPayload?.payload.review ?? null, sectionPlace: planPayload?.payload.sectionPlace ?? null };
  let image;
  try {
    image = await imageProvider.generate({ label: `${id}/${arm.label}`, prompt: assembled.prompt, model: plan.image.model, aspectRatio: plan.image.aspectRatio, resolution: plan.image.resolution,
      references: assembled.sentReferences.map((r) => ({ bytes: r.bytes, mimeType: "image/jpeg" })) });
  } catch (error) {
    record({ key: `${id}/${arm.label}`, case: id, style: arm.label, outcome: "failed", stage: "image", message: String(error).slice(0, 400), prompt: assembled.prompt, prepared, textCalls });
    continue;
  }
  const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1] ?? "png";
  const file = path.join(imagesDir, `${id}.${extension}`);
  fs.writeFileSync(file, image.bytes);
  record({ key: `${id}/${arm.label}`, case: id, style: arm.label, outcome: "image", prompt: assembled.prompt, promptSha256: hash(assembled.prompt), packet: assembled.packet,
    references: assembled.references.map((r) => (r.kind === "sheet" ? `sheet:${r.entryId}:${r.stageId}` : `styleReference:${r.styleId}`)), skippedReferences: skipped, prepared, textCalls,
    // Relative to the checkout holding --out, which the pairing command resolves images against.
    attempts: [{ n: 1, file: path.relative(path.resolve(out, "../../.."), file), sha256: hash(image.bytes), bytes: image.bytes.length, mimeType: image.mimeType, costUsd: image.costUsd, elapsedMs: image.elapsedMs }],
    chosen: 1, elapsedMs: Date.now() - started });
  console.log(JSON.stringify({ case: id, arm: arm.label, sharedPlace: Boolean(prepared.sharedPlace), references: assembled.references.length, measuredUsd: ledger.measuredUsd.toFixed(4) }));
}
ledger.finishedAt = new Date().toISOString(); flush();
console.log(JSON.stringify({ done: true, arm: arm.label, measuredUsd: ledger.measuredUsd, uncertainUsd: ledger.uncertainUsd, images: ledger.images, textCalls: ledger.textCalls, blocked: ledger.blocked }));
