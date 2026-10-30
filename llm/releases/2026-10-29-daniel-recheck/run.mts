/**
 * Funding-gated Daniel re-check: his four group verses in each public style, after his reference sheet was made. Two
 * memory stores, run one after the other, each seeded with the section looks of the earlier run its images pair with.
 * Preflight precedes credentials; every paid call (text, image, check) is reserved and ledgered.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assembleRendering, type AssembleDeps, type ReferenceRecord } from "../../../src/lib/engine/assemble";
import { FORMLESS_LOOK_PROMPT_VERSION, FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord, type InputRef, type PreparationStore } from "../../../src/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "../../../src/lib/engine/plan-review";
import { GENERIC_PROMPT_VERSION } from "../../../src/lib/engine/prompt";
import { checkAndRetry, checkScene, SCENE_CHECK_VERSION, SOFT_EDGE_STYLES } from "../../../src/lib/engine/scene-check";
import { createOpenRouterVisionChecker } from "../../../src/lib/engine/reference-adapters";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { createOpenRouterEvalImageProvider } from "../../../src/lib/image-evals/adapters";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";
import { blobs, dir, frozen, hash, json, readEnvironment, root, save, sharedSources } from "./common.mjs";

assert.equal(process.argv[2], "--execute");
const plan = json("plan.json"), snapshot = json("snapshot.json"), seeds = json("seeds.json"), cap = plan.evaluation;
assert.equal(MOMENT_CAST_PROMPT_VERSION, plan.pipeline.momentCast); assert.equal(FORMLESS_PLAN_PROMPT_VERSION, plan.pipeline.formlessPlan);
assert.equal(PLAN_REVIEW_PROMPT_VERSION, plan.pipeline.review); assert.equal(GENERIC_PROMPT_VERSION, plan.pipeline.rendering); assert.equal(SCENE_CHECK_VERSION, plan.pipeline.sceneCheck);
// The engine is production's: every shared source equals the commit main deployed.
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
assert.deepEqual(plan.stores.flatMap((s: { styles: string[] }) => s.styles).sort(), [...plan.styles].sort());

const env = readEnvironment(), apiKey = env.OPENROUTER_API_KEY!; assert.ok(apiKey);
const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data as Array<{ id: string; pricing: Record<string, string> }>;
const imagePricing = models.find((m) => m.id === plan.image.model)!.pricing;
assert.equal(Number(imagePricing.image_output), 0.00003); assert.equal(Number(imagePricing.prompt), 0.00000025);
const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
const balanceUsd = credits.total_credits - credits.total_usage; assert.ok(balanceUsd > grant.operationCapUsd);
save("frozen-commit.json", { at: new Date().toISOString(), commit, grant });
save("run-started.json", { at: new Date().toISOString(), balanceUsd, imagePricing, sources });

// One ledger for every paid call: reserve before, settle from reported usage, block on any doubt.
type Kind = "text" | "image" | "check";
const ledger = { calls: [] as Array<{ phase: string; kind: Kind; status: string; measuredUsd: number | null }>, measuredUsd: 0, uncertainUsd: 0, images: 0, textCalls: 0, checkCalls: 0, blocked: null as string | null };
const flush = () => fs.writeFileSync(path.join(dir, "ledger.json"), JSON.stringify(ledger, null, 2) + "\n");
flush();
const scrub = (value: unknown, inOpaque = false): unknown => typeof value === "string"
  ? (value.startsWith("data:") ? `[data url sha256 ${hash(value)} chars ${value.length}]` : inOpaque && value.length > 1000 ? `[opaque sha256 ${hash(value)} chars ${value.length}]` : value.replaceAll(apiKey, "[redacted]"))
  : Array.isArray(value) ? value.map((v) => scrub(v, inOpaque)) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== "user_id").map(([k, v]) => [k, scrub(v, inOpaque || k === "reasoning_details")])) : value;
const reserveFor: Record<Kind, number> = { text: cap.textReserveUsd, image: cap.imageReserveUsd, check: cap.checkReserveUsd };
const limitFor: Record<Kind, number> = { text: cap.maximumTextCalls, image: cap.maximumImages, check: cap.maximumCheckCalls };
const countOf = (kind: Kind) => kind === "image" ? ledger.images : kind === "text" ? ledger.textCalls : ledger.checkCalls;
const ledgered = (kind: Kind, phaseOf: () => string) => async (url: string, init: RequestInit) => {
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  const reserve = reserveFor[kind];
  if (ledger.blocked) throw Error(`Evaluation stopped: ${ledger.blocked}`);
  if (ledger.measuredUsd + ledger.uncertainUsd + reserve > grant.operationCapUsd || countOf(kind) >= limitFor[kind]) {
    ledger.blocked = "Evaluation cap/headroom exhausted"; flush(); throw Error(`Evaluation stopped: ${ledger.blocked}`);
  }
  const call = { phase: phaseOf(), kind, status: "in-flight", measuredUsd: null as number | null };
  ledger.calls.push(call); ledger.uncertainUsd += reserve;
  if (kind === "image") ledger.images++; else if (kind === "text") ledger.textCalls++; else ledger.checkCalls++;
  flush();
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
const record = (row: unknown) => fs.appendFileSync(path.join(dir, "results.ndjson"), JSON.stringify(row) + "\n");
fs.mkdirSync(path.join(blobs, "images"), { recursive: true });
const withTimeout = <T,>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Scene check timeout")), ms))]);

/** A seeded look as preparation would have stored it now: the earlier payload, with inputs from this snapshot and brief. */
function seededLook(records: AnalysisRecord[], sectionId: string, fields: Record<string, string>): AnalysisRecord {
  const find = (kind: string, id: string) => records.find((r) => r.kind === kind && r.recordId === id)!;
  const section = find("section", sectionId);
  const cast = (section.payload.cast as Array<{ entryId: string }>).map((m) => find("entry", m.entryId));
  const payload = { kind: "look", sectionId, ...fields };
  const lookInputs: InputRef[] = [{ kind: "section", recordId: sectionId, version: section.version }, { kind: "brief", recordId: "bible-web", version: inputs.briefVersion },
    ...cast.map((e) => ({ kind: "entry", recordId: e.recordId, version: e.version })),
    ...(cast.some((e) => e.payload.hasForm === false) ? [{ kind: "prompt", recordId: "section_look_formless_presence", version: FORMLESS_LOOK_PROMPT_VERSION }] : [])];
  return { kind: "look", recordId: sectionId, version: contentVersion(payload), inputs: lookInputs, payload, source: "generated" };
}

type StorePlan = { id: string; styles: string[] };
async function runCase(c: { id: string }, group: StorePlan, records: AnalysisRecord[], seededVersions: Map<string, string>) {
  let phase = `${c.id}/${group.id}`;
  const textModel = createOpenRouterTextModel({ apiKey, timeoutMs: 120_000, fetch: ledgered("text", () => phase) });
  let textCallsThisSample = 0;
  const countingModel: typeof textModel = { id: textModel.id, complete: (request) => { textCallsThisSample++; return textModel.complete(request); } };
  const imageProvider = createOpenRouterEvalImageProvider({ apiKey, fetch: ledgered("image", () => phase), timeoutMs: 180_000 });
  const checker = createOpenRouterVisionChecker({ apiKey, fetch: ledgered("check", () => phase), reasoningEffort: plan.checker.reasoningEffort, maxTokens: plan.checker.maxTokens, timeoutMs: 30_000 });
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
  const sectionId = (snapshot.cases as Array<{ id: string; sectionId: string }>).find((x) => x.id === c.id)!.sectionId;
  let first = true;
  for (const style of group.styles) {
    if (ledger.blocked) return;
    const key = `${c.id}/${style}/1`;
    phase = key; textCallsThisSample = 0;
    const skipped: string[] = [];
    const deps: AssembleDeps = {
      inputs, store, model: countingModel, listMoments: async () => [],
      getReference: async (kind, recordId) => (snapshot.references[`${kind}:${recordId}`] ?? null) as ReferenceRecord | null,
      loadReference: async (storageId) => {
        const bytes = new Uint8Array(fs.readFileSync(path.join(blobs, "references", `${storageId}.jpg`)));
        assert.equal(hash(bytes), snapshot.files[storageId].sha256); return bytes;
      },
      onReferenceSkipped: (kind, id, why) => skipped.push(`${kind}:${id}:${why}`),
    };
    const started = Date.now();
    const assembled = await assembleRendering(deps, { workId: "bible-web", unitId: c.id, styleId: style, variationNumber: null, aspectRatio: plan.image.aspectRatio });
    const textCalls = textCallsThisSample;
    if (!first) assert.equal(textCalls, 0, `${key}: a prepared case must not call the text model again`);
    if (!assembled.ok) {
      record({ key, case: c.id, style, store: group.id, outcome: "refused", stage: "assemble", reason: assembled.reason, message: assembled.message, textCalls, spend: [...spend], elapsedMs: Date.now() - started });
      if (first) return; // A refused preparation stops this store's styles before any image.
      continue;
    }
    // Every row carries its own preparation, since the two stores plan the same verse separately.
    const prepared = { look: assembled.prepared.look.payload, situation: assembled.prepared.situation, plan: assembled.prepared.plan.payload, present: assembled.prepared.present };
    const look = { version: assembled.prepared.look.version, seeded: seededVersions.get(sectionId) === assembled.prepared.look.version, seedAvailable: seededVersions.has(sectionId) };
    first = false;
    const generate = (n: number) => imageProvider.generate({ label: `${key}#${n}`, prompt: assembled.prompt, model: plan.image.model, aspectRatio: plan.image.aspectRatio, resolution: plan.image.resolution,
      references: assembled.sentReferences.map((r) => ({ bytes: r.bytes, mimeType: "image/jpeg" })) });
    let firstImage;
    try { firstImage = await generate(1); }
    catch (error) {
      record({ key, case: c.id, style, store: group.id, outcome: "failed", stage: "image", message: String(error).slice(0, 400), prompt: assembled.prompt, references: assembled.references, prepared, look, textCalls, spend: [...spend] });
      continue;
    }
    const checkContext = { people: assembled.canon.filter((x) => x.hasForm && x.kind === "character").map((x) => x.name),
      description: `${assembled.prepared.plan.payload.primarySubject}; ${assembled.prepared.plan.payload.secondaryElements}`, softEdges: SOFT_EDGE_STYLES.includes(style), depiction: inputs.depiction };
    const checked = await checkAndRetry(firstImage, {
      check: (image, n) => withTimeout(checkScene(checker, { bytes: image.bytes, mimeType: image.mimeType }, checkContext, `${c.id}:${n}`), 30_000),
      retry: () => generate(2),
    });
    const attempts = checked.attempts.map((a, i) => {
      const extension = a.image.mimeType === "image/jpeg" ? "jpg" : a.image.mimeType.split("/")[1] ?? "png";
      const file = path.join(blobs, "images", `${key.replaceAll("/", "__")}__a${i + 1}.${extension}`);
      fs.writeFileSync(file, a.image.bytes);
      return { n: i + 1, file: path.relative(root, file), sha256: hash(a.image.bytes), bytes: a.image.bytes.length, mimeType: a.image.mimeType, costUsd: a.image.costUsd, elapsedMs: a.image.elapsedMs,
        providerRequestId: a.image.providerRequestId, check: a.check, checkError: a.checkError };
    });
    record({ key, case: c.id, style, store: group.id, outcome: "image", prompt: assembled.prompt, promptSha256: hash(assembled.prompt), references: assembled.references, skippedReferences: skipped,
      prepared, look, checkContext, textCalls, spend: [...spend], attempts, chosen: checked.chosen + 1, retryError: checked.retryError, elapsedMs: Date.now() - started });
    console.log(JSON.stringify({ key, attempts: attempts.length, faults: attempts.map((a) => a.check?.faults ?? a.checkError), chosen: checked.chosen + 1, lookSeeded: look.seeded, measuredUsd: ledger.measuredUsd, images: ledger.images }));
  }
}

// The stores run one after the other: the engine shares an in-flight preparation across a process by record and inputs,
// so two stores preparing the same section at once would hand one store's look to the other.
for (const group of plan.stores as StorePlan[]) {
  const records: AnalysisRecord[] = structuredClone(Object.values(snapshot.records as Record<string, AnalysisRecord>));
  const seededVersions = new Map<string, string>();
  for (const [sectionId, seed] of Object.entries(seeds.stores[group.id].seeded as Record<string, { payload: Record<string, string> }>)) {
    const look = seededLook(records, sectionId, seed.payload);
    records.push(look); seededVersions.set(sectionId, look.version);
  }
  // Three cases at a time; each case's styles run in order so the first prepares it.
  const queue = [...plan.cases as Array<{ id: string }>];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      if (ledger.blocked) return;
      try { await runCase(c, group, records, seededVersions); }
      catch (error) { record({ key: `${c.id}/${group.id}/*`, case: c.id, store: group.id, outcome: "error", message: String(error).slice(0, 400) }); }
    }
  }));
}
save("run-finished.json", { at: new Date().toISOString(), measuredUsd: ledger.measuredUsd, uncertainUsd: ledger.uncertainUsd, images: ledger.images, textCalls: ledger.textCalls, checkCalls: ledger.checkCalls, blocked: ledger.blocked, productionMutations: 0 });
console.log(JSON.stringify({ done: true, measuredUsd: ledger.measuredUsd, images: ledger.images, textCalls: ledger.textCalls, checkCalls: ledger.checkCalls, blocked: ledger.blocked }));
