/** Funding-gated one-shot image check. Preflight precedes credentials; every paid call is reserved and ledgered. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assembleRendering, type AssembleDeps, type ReferenceRecord } from "../../../src/lib/engine/assemble";
import { FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../../../src/lib/engine/plan-review";
import { GENERIC_PROMPT_VERSION } from "../../../src/lib/engine/prompt";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { createOpenRouterEvalImageProvider } from "../../../src/lib/image-evals/adapters";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { blobs, dir, frozen, hash, json, readEnvironment, root, save, sharedSources } from "./common.mjs";

assert.equal(process.argv[2], "--execute");
const plan = json("plan.json"), snapshot = json("snapshot.json"), cap = plan.evaluation;
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.momentCast); assert.equal(FORMLESS_PLAN_PROMPT_VERSION, plan.pipeline.formlessPlan);
assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.review); assert.equal(GENERIC_PROMPT_VERSION, plan.pipeline.rendering);
for (const file of sharedSources) assert.equal(hash(execFileSync("git", ["show", `${plan.candidateCommit}:${file}`], { cwd: root })), hash(fs.readFileSync(path.join(root, file))), `Candidate changed: ${file}`);
assert.ok(fs.existsSync(path.join(dir, "funding.json")), "Owner funding is required; no paid request permitted");
const grant = json("funding.json");
assert.ok(typeof grant.authorization === "string" && grant.authorization.trim());
assert.equal(grant.increaseUsd, cap.proposedIncreaseUsd); assert.equal(grant.authorizedUsd, cap.proposedAuthorizedUsd); assert.equal(grant.operationCapUsd, cap.proposedOperationCapUsd);
assert.ok(cap.measuredBeforeUsd + cap.uncertaintyBeforeUsd + grant.operationCapUsd <= grant.authorizedUsd);
for (const name of ["run-started.json", "frozen-commit.json", "ledger.json", "provider.ndjson", "results.ndjson"]) assert.ok(!fs.existsSync(path.join(dir, name)), `One-shot artifact exists: ${name}`);
assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit frozen inputs before calls");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sources = frozen();
for (const [file, sha] of Object.entries(sources)) assert.equal(hash(execFileSync("git", ["show", `${commit}:${file}`], { cwd: root })), sha, `Absent from pre-call commit: ${file}`);
assert.deepEqual(JSON.parse(execFileSync("git", ["show", `${commit}:${path.relative(root, path.join(dir, "funding.json"))}`], { cwd: root, encoding: "utf8" })), grant);
for (const [storageId, file] of Object.entries(snapshot.files as Record<string, { sha256: string }>)) assert.equal(hash(fs.readFileSync(path.join(blobs, "references", `${storageId}.jpg`))), file.sha256);
const inputs = await readWorkInputs("bible-web", root);
assert.equal(inputs.workVersion, snapshot.status.workVersion); assert.equal(inputs.briefVersion, snapshot.status.briefVersion);

const env = readEnvironment(), apiKey = env.OPENROUTER_API_KEY!; assert.ok(apiKey);
const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data as Array<{ id: string; pricing: Record<string, string> }>;
const imagePricing = models.find((m) => m.id === plan.image.model)!.pricing;
assert.equal(Number(imagePricing.image_output), 0.00003); assert.equal(Number(imagePricing.prompt), 0.00000025);
const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
const balanceUsd = credits.total_credits - credits.total_usage; assert.ok(balanceUsd > grant.operationCapUsd);
save("frozen-commit.json", { at: new Date().toISOString(), commit, grant });
save("run-started.json", { at: new Date().toISOString(), balanceUsd, imagePricing, sources });

// One ledger for text and image calls: reserve before, settle from reported usage, block on any doubt.
const ledger = { calls: [] as Array<{ phase: string; kind: "text" | "image"; status: string; measuredUsd: number | null }>, measuredUsd: 0, uncertainUsd: 0, images: 0, textCalls: 0, blocked: null as string | null };
const flush = () => fs.writeFileSync(path.join(dir, "ledger.json"), JSON.stringify(ledger, null, 2) + "\n");
flush();
const scrub = (value: unknown): unknown => typeof value === "string" ? (value.startsWith("data:") ? `[data url sha256 ${hash(value)} chars ${value.length}]` : value.replaceAll(apiKey, "[redacted]"))
  : Array.isArray(value) ? value.map(scrub) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== "user_id").map(([k, v]) => [k, scrub(v)])) : value;
let phase = "";
const ledgered = (kind: "text" | "image") => async (url: string, init: RequestInit) => {
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  const reserve = kind === "image" ? cap.imageReserveUsd : cap.textReserveUsd;
  if (ledger.blocked) throw Error(`Evaluation stopped: ${ledger.blocked}`);
  if (ledger.measuredUsd + ledger.uncertainUsd + reserve > grant.operationCapUsd || (kind === "image" ? ledger.images >= cap.maximumImages : ledger.textCalls >= cap.maximumTextCalls)) {
    ledger.blocked = "Evaluation cap/headroom exhausted"; flush(); throw Error(`Evaluation stopped: ${ledger.blocked}`);
  }
  const call = { phase, kind, status: "in-flight", measuredUsd: null as number | null };
  ledger.calls.push(call); ledger.uncertainUsd += reserve; if (kind === "image") ledger.images++; else ledger.textCalls++; flush();
  try {
    const response = await fetch(url, init), body = await response.clone().text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(body); } catch { /* non-JSON is a provider error below */ }
    const cost = extractOpenRouterUsageUsd(payload);
    fs.appendFileSync(path.join(dir, "provider.ndjson"), JSON.stringify({ ...call, at: new Date().toISOString(), request: scrub(JSON.parse(String(init.body))), status: response.status, response: scrub(payload), nonJson: Object.keys(payload).length ? undefined : body.slice(0, 300), measuredUsageUsd: cost }) + "\n");
    call.status = String(response.status); call.measuredUsd = cost;
    if (cost === null) ledger.blocked = "Missing provider usage";
    else { ledger.uncertainUsd -= reserve; ledger.measuredUsd += cost; }
    if (!response.ok || ledger.measuredUsd > grant.operationCapUsd) ledger.blocked = "Provider error or exhausted cap";
    flush(); return response;
  } catch (error) { ledger.blocked ??= error instanceof Error ? error.message : String(error); call.status = "uncertain"; flush(); throw error; }
};
const textModel = createOpenRouterTextModel({ apiKey, timeoutMs: 120_000, fetch: ledgered("text") });
let textCallsThisSample = 0;
const countingModel: typeof textModel = { id: textModel.id, complete: (request) => { textCallsThisSample++; return textModel.complete(request); } };
const imageProvider = createOpenRouterEvalImageProvider({ apiKey, fetch: ledgered("image"), timeoutMs: 180_000 });
const record = (row: unknown) => fs.appendFileSync(path.join(dir, "results.ndjson"), JSON.stringify(row) + "\n");
fs.mkdirSync(path.join(blobs, "images"), { recursive: true });

// Classical first (it prepares the case), then the other styles, one image each.
const samplesFor = (_caseId: string) => ["classical", "watercolor", "icon"].map((style) => ({ style, n: 1, control: false }));
for (const c of plan.cases as Array<{ id: string }>) {
  if (ledger.blocked) break;
  const records: AnalysisRecord[] = structuredClone(Object.values(snapshot.records as Record<string, AnalysisRecord>));
  const spend: string[] = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    claim: async () => ({ held: true }), release: async () => {}, recordSpend: async (entry) => { spend.push(`${entry.kind}:${entry.outcome}`); },
    putDerivedRecord: async (args) => {
      const r = { ...structuredClone(args), version: contentVersion(args.payload), source: "generated" } as AnalysisRecord;
      const index = records.findIndex((x) => x.kind === args.kind && x.recordId === args.recordId);
      if (index < 0) records.push(r); else records[index] = r;
      return { version: r.version };
    },
  };
  const skipped: string[] = [];
  let first = true;
  for (const s of samplesFor(c.id)) {
    if (ledger.blocked) break;
    const key = `${c.id}/${s.style}${s.control ? "-control" : ""}/${s.n}`;
    phase = key; textCallsThisSample = 0;
    const deps: AssembleDeps = {
      inputs, store, model: countingModel, listMoments: async () => [], omitStyleReference: s.control,
      getReference: async (kind, recordId) => (snapshot.references[`${kind}:${recordId}`] ?? null) as ReferenceRecord | null,
      loadReference: async (storageId) => {
        const bytes = new Uint8Array(fs.readFileSync(path.join(blobs, "references", `${storageId}.jpg`)));
        assert.equal(hash(bytes), snapshot.files[storageId].sha256); return bytes;
      },
      onReferenceSkipped: (kind, id, why) => skipped.push(`${kind}:${id}:${why}`),
    };
    const started = Date.now();
    const assembled = await assembleRendering(deps, { workId: "bible-web", unitId: c.id, styleId: s.style, variationNumber: s.n > 1 ? s.n : null, aspectRatio: plan.image.aspectRatio });
    const textCalls = textCallsThisSample;
    if (!first) assert.equal(textCalls, 0, `${key}: a prepared case must not call the text model again`);
    if (!assembled.ok) {
      record({ key, case: c.id, ...s, outcome: "refused", stage: "assemble", reason: assembled.reason, message: assembled.message, textCalls, spend, elapsedMs: Date.now() - started });
      if (first) break; // A refused preparation stops the case before any image.
      continue;
    }
    const prepared = first ? { look: assembled.prepared.look.payload, situation: assembled.prepared.situation, plan: assembled.prepared.plan.payload, present: assembled.prepared.present } : undefined;
    first = false;
    let image;
    try {
      image = await imageProvider.generate({ label: key, prompt: assembled.prompt, model: plan.image.model, aspectRatio: plan.image.aspectRatio, resolution: plan.image.resolution,
        references: assembled.sentReferences.map((r) => ({ bytes: r.bytes, mimeType: "image/jpeg" })) });
    } catch (error) {
      record({ key, case: c.id, ...s, outcome: "failed", stage: "image", message: String(error).slice(0, 400), prompt: assembled.prompt, references: assembled.references, prepared, textCalls, spend });
      continue;
    }
    const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1] ?? "png";
    const file = path.join(blobs, "images", `${key.replaceAll("/", "__")}.${extension}`);
    fs.writeFileSync(file, image.bytes);
    record({ key, case: c.id, ...s, outcome: "image", prompt: assembled.prompt, promptSha256: hash(assembled.prompt), references: assembled.references, skippedReferences: [...skipped],
      prepared, textCalls, spend, image: { file: path.relative(root, file), sha256: hash(image.bytes), bytes: image.bytes.length, mimeType: image.mimeType, costUsd: image.costUsd, elapsedMs: image.elapsedMs, providerRequestId: image.providerRequestId } });
    skipped.length = 0;
    console.log(JSON.stringify({ key, measuredUsd: ledger.measuredUsd, images: ledger.images, references: assembled.references.length }));
  }
}
save("run-finished.json", { at: new Date().toISOString(), measuredUsd: ledger.measuredUsd, uncertainUsd: ledger.uncertainUsd, images: ledger.images, textCalls: ledger.textCalls, blocked: ledger.blocked, productionMutations: 0 });
console.log(JSON.stringify({ done: true, measuredUsd: ledger.measuredUsd, images: ledger.images, textCalls: ledger.textCalls, blocked: ledger.blocked }));
