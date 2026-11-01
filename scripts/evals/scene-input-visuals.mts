/** One-shot corrected-input diagnostic. Frozen baseline admission; explicit late prompt substitution, never production activation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import path from "node:path";
import os from "node:os";
import { readWorkInputs } from "../../src/lib/engine/work-inputs";
import type { AnalysisRecord } from "../../src/lib/engine/preparation";
import type { ReferenceRecord } from "../../src/lib/engine/assemble";
import { contentVersion } from "../../convex/_helpers/contentVersion";
import { GENERIC_PROMPT_MAX_CHARS } from "../../src/lib/engine/prompt";
import { READING_PASS_MODEL } from "../../src/lib/reading-pass/model";
import { createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { createOpenRouterEvalImageProvider } from "../../src/lib/image-evals/adapters";
import { createOfflineOpenRouter } from "../../src/lib/image-evals/suite-offline";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, runSuite, type ModelPricing, type SuiteWork } from "../../src/lib/image-evals/suite-run";

const root = path.resolve(import.meta.dirname, "../.."), run = "2026-10-31-scene-input-visuals";
const dir = path.join(root, "llm/releases", run), prior = "llm/releases/2026-10-30-source-context";
const identity = "llm/releases/2026-10-30-identity-visuals", replay = "llm/releases/2026-10-31-render-source-context-offline/report.json";
const read = <T,>(file: string): T => JSON.parse(readFileSync(path.resolve(root, file), "utf8"));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const save = (folder: string, name: string, value: unknown) => writeFileSync(path.join(folder, name), JSON.stringify(value, null, 2) + "\n");
type Plan = { operationCapUsd: number; cumulativeCapUsd: number; priorUpperBoundUsd: number; readerReserveUsd: number; imageModel: string; repeats: number; aspectRatio: "16:9"; resolution: string; scenes: Array<{ id: string; work: string; unitId: string; expected: string; sourceCaseId: string }> };
type Row = { caseId: string; records: { look: AnalysisRecord; plan: AnalysisRecord } };
type Packet = { caseId: string; baseline: string; candidate: string | null; references: unknown; sentReferences: Array<{ storageId: string; sha256: string }> };
const { values } = parseArgs({ options: { prepare: { type: "boolean" }, offline: { type: "boolean" }, execute: { type: "boolean" } } });
assert.equal([values.prepare, values.offline, values.execute].filter(Boolean).length, 1, "Choose one of --prepare, --offline, --execute");
const plan = read<Plan>(path.join(dir, "plan.json"));
const priorFunding = read<{ cumulativeUpperBoundUsd: number; originalCapUsd: number }>("llm/releases/2026-10-31-render-source-visuals/funding-close.json");
assert.equal(plan.priorUpperBoundUsd, priorFunding.cumulativeUpperBoundUsd);
assert.equal(plan.cumulativeCapUsd, priorFunding.originalCapUsd);
assert.ok(plan.operationCapUsd > 0 && plan.priorUpperBoundUsd + plan.operationCapUsd <= plan.cumulativeCapUsd);
// Regenerate rather than trust overwriteable local packets; the retained report fixes every prompt hash.
execFileSync(process.execPath, ["--import", "tsx", "scripts/evals/render-source-context.mts"], { cwd: root, stdio: "pipe" });
const local = "evals/images/runs/2026-10-31-render-source-context-offline";
assert.deepEqual(read(`${local}/report.json`), read(replay));
const baselinePackets = read<Packet[]>(`${local}/packets.json`), rows = read<Row[]>(`${prior}/text-results.json`);
const refs = read<{ refs: Record<string, ReferenceRecord>; files: Record<string, { file: string; sha256: string }> }>(`${identity}/references.json`);
const snapshotFile = "llm/releases/2026-10-30-review-only-text/snapshot.json";
const snapshot = read<{ works: Record<string, { records: Record<string, AnalysisRecord> }> }>(snapshotFile);
const alice = read<AnalysisRecord[]>(`${identity}/candidate-records.json`);
const correctionFile = "llm/releases/2026-10-31-scene-input-corrections/corrections.json";
type Correction = { workId: string; recordId: string; stageId?: string; sourceCaseId?: string; expectedVersion: string; correctedVersion: string; payload: AnalysisRecord["payload"] };
const corrections = read<{ sourceFiles: Record<string, string>; entries: Correction[]; plans: Correction[] }>(correctionFile);
for (const [file, expected] of Object.entries(corrections.sourceFiles)) assert.equal(hash(readFileSync(path.join(root, file))), expected, file);
const packets = plan.scenes.map(scene => {
  const packet = baselinePackets.find(p => p.caseId === scene.sourceCaseId), row = rows.find(r => r.caseId === scene.sourceCaseId);
  assert.ok(packet && row, scene.sourceCaseId);
  const entry = corrections.entries.find(c => c.workId === scene.work); assert.ok(entry);
  const original = (scene.work === "alice-in-wonderland" ? alice : Object.values(snapshot.works[scene.work].records)).find(r => r.kind === "entry" && r.recordId === entry.recordId); assert.ok(original);
  assert.equal(contentVersion(original.payload), entry.expectedVersion);
  assert.equal(contentVersion(entry.payload), entry.correctedVersion);
  const stage = (payload: AnalysisRecord["payload"]) => (payload.stages as Array<{ id: string; text: string }>).find(s => s.id === entry.stageId)!.text;
  const planCopy = corrections.plans.find(c => c.sourceCaseId === scene.sourceCaseId);
  if (planCopy) {
    assert.equal(contentVersion(row.records.plan.payload), planCopy.expectedVersion);
    assert.equal(contentVersion(planCopy.payload), planCopy.correctedVersion);
    assert.deepEqual(planCopy.payload.entries, row.records.plan.payload.entries);
  }
  const oldPlan = row.records.plan.payload.plan as Record<string, string>, newPlan = (planCopy?.payload.plan ?? oldPlan) as Record<string, string>;
  const labels = { primarySubject: "Primary subject", action: "Action", setting: "Setting", secondaryElements: "Secondary elements", mood: "Mood", timeOfDay: "Time of day", composition: "Composition" };
  const blocks = packet.baseline.split("\n\n");
  // Change only full, unique lines in the named canon/plan blocks. The current prompt's ownership and source remain exact.
  const replace = (prefix: string, before: string, after: string) => {
    const indices = blocks.flatMap((b, i) => b.startsWith(prefix) ? [i] : []); assert.equal(indices.length, 1);
    const i = indices[0], lines = blocks[i].split("\n"); assert.equal(lines.filter(l => l === before).length, 1, before);
    blocks[i] = lines.map(l => l === before ? after : l).join("\n");
  };
  replace("CANON (", `- ${stage(original.payload)}`, `- ${stage(entry.payload)}`);
  for (const [field, label] of Object.entries(labels)) if (newPlan[field] !== oldPlan[field]) replace("SCENE PLAN (", `${label}: ${oldPlan[field]}`, `${label}: ${newPlan[field]}`);
  const candidate = blocks.join("\n\n"); assert.ok(candidate.length <= GENERIC_PROMPT_MAX_CHARS);
  const unchanged = (prompt: string) => prompt.split("\n\n").filter(b => !b.startsWith("CANON (") && !b.startsWith("SCENE PLAN ("));
  assert.deepEqual(unchanged(candidate), unchanged(packet.baseline));
  return { ...packet, candidate, diagnosticBindings: { correctionFile, entry: { recordId: entry.recordId, originalVersion: entry.expectedVersion, correctedVersion: entry.correctedVersion },
    plan: { recordId: row.records.plan.recordId, originalVersion: row.records.plan.version, correctedVersion: planCopy?.correctedVersion ?? null, manuallyCorrected: !!planCopy },
    baselineGuideVersion: row.records.look.version, guideRevalidated: false, referenceSelection: "frozen baseline attachments; no sheet for either corrected location" },
    descriptions: { baseline: `${oldPlan.primarySubject}; ${oldPlan.secondaryElements}`, candidate: `${newPlan.primarySubject}; ${newPlan.secondaryElements}` } };
});
assert.equal(packets.length, 3); assert.equal(new Set(packets.map(p => p.caseId)).size, 3);
const replayHashes = read<{ inputHashes: Record<string, string> }>(replay).inputHashes;
if (values.prepare) {
  assert.ok(!existsSync(path.join(dir, "inputs.json")), "Do not replace frozen inputs");
  const files = [...new Set(["scripts/evals/scene-input-visuals.mts", correctionFile, replay, "llm/releases/2026-10-31-render-source-visuals/funding-close.json", ...Object.keys(replayHashes), ...["plan", "funding"].map(f => `llm/releases/${run}/${f}.json`)])];
  save(dir, "packets.json", packets);
  files.push(`llm/releases/${run}/packets.json`);
  save(dir, "inputs.json", Object.fromEntries(files.map(f => [f, hash(readFileSync(path.join(root, f)))])));
  console.log("Frozen visual comparison inputs; no provider calls.");
} else {
  const frozen = read<Record<string, string>>(path.join(dir, "inputs.json"));
  const verify = () => { for (const [f, expected] of Object.entries(frozen)) assert.equal(hash(readFileSync(path.join(root, f))), expected, f); };
  verify();
  assert.deepEqual(packets, read(path.join(dir, "packets.json")), "Reconstructed packets must match frozen diagnostic bindings");
  const offline = !!values.offline, out = offline ? mkdtempSync(path.join(os.tmpdir(), "visibible-input-visuals-")) : dir;
  const blobs = offline ? path.join(out, "images") : path.join(root, "evals/images/runs", run);
  mkdirSync(blobs, { recursive: true });
  assert.ok(!existsSync(path.join(out, "started.json")), "One shot only; never reroll or overwrite this run");
  const env = offline ? { OPENROUTER_API_KEY: "offline" } : parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  if (!offline) { assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256); }
  const apiKey = env.OPENROUTER_API_KEY; assert.ok(apiKey);
  const prices = new Map<string, ModelPricing>();
  let balance: unknown = null;
  if (!offline) {
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit all inputs before spending");
    const manifest = path.relative(root, path.join(dir, "inputs.json"));
    assert.equal(hash(readFileSync(path.join(root, manifest))), hash(execFileSync("git", ["show", `HEAD:${manifest}`], { cwd: root })));
    const funding = read<{ operationCapUsd: number }>(path.join(dir, "funding.json")); assert.equal(funding.operationCapUsd, plan.operationCapUsd);
    const headers = { Authorization: `Bearer ${apiKey}` };
    const [credits, key] = await Promise.all(["credits", "key"].map(async p => { const r = await fetch(`https://openrouter.ai/api/v1/${p}`, { headers }); assert.ok(r.ok); return (await r.json()).data; }));
    const available = credits.total_credits - credits.total_usage;
    assert.ok(available >= plan.readerReserveUsd + plan.operationCapUsd, "Reader reserve must remain protected");
    assert.ok(key.limit_remaining === null || key.limit_remaining >= plan.operationCapUsd + 1, "Key allowance too small");
    balance = { at: new Date().toISOString(), balanceUsd: available, keyLimitRemainingUsd: key.limit_remaining, readerReserveUsd: plan.readerReserveUsd };
    const response = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(response.ok);
    const catalog = (await response.json()).data;
    for (const id of [READING_PASS_MODEL, plan.imageModel]) { const p = modelPricing(catalog.find((m: { id: string }) => m.id === id)); assert.ok(p, id); prices.set(id, p); }
  }
  writeFileSync(path.join(out, "started.json"), JSON.stringify({ at: new Date().toISOString(), offline, capUsd: plan.operationCapUsd, frozen, balance, prices: Object.fromEntries(prices), commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() }, null, 2) + "\n", { flag: "wx" });
  const fake = createOfflineOpenRouter({ letteringEvery: 3 });
  const ledger = createLedger({ capUsd: plan.operationCapUsd, reserves: { text: 0.005, image: 0.1, check: 0.002 }, limits: { text: 0, image: 36, check: 72 }, fetch: offline ? fake.fetch : fetch,
    ceiling: offline ? undefined : (kind, req) => requestCeilingUsd(kind, req, prices.get(String(req.model))), save: state => save(out, "ledger.json", state),
    log: entry => appendFileSync(path.join(out, "provider.ndjson"), JSON.stringify(entry) + "\n"), scrub: value => scrubForLog(value, apiKey, hash) });
  const results: Array<Record<string, unknown>> = [];
  for (const scene of plan.scenes) for (let repeat = 1; repeat <= plan.repeats; repeat++) {
    const sourceId = scene.sourceCaseId, packet = packets.find(p => p.caseId === sourceId), row = rows.find(r => r.caseId === sourceId);
    assert.ok(packet?.candidate && row, sourceId);
    const records = (scene.work === "alice-in-wonderland" ? alice : Object.values(snapshot.works[scene.work].records)).filter(r => !["look", "plan"].includes(r.kind));
    const work: SuiteWork = { inputs: await readWorkInputs(scene.work, root), records, seeded: [row.records.look, row.records.plan],
      getReference: async (kind, id) => scene.work === "alice-in-wonderland" ? refs.refs[`${kind}:${id}`] ?? null : null,
      loadReference: async id => { const f = refs.files[id], bytes = readFileSync(path.join(root, f.file)); assert.equal(hash(bytes), f.sha256); return bytes; } };
    for (const arm of repeat % 2 ? ["baseline", "candidate"] as const : ["candidate", "baseline"] as const) {
      const caseId = `${scene.id}-${arm}-${repeat}`, prompt = packet[arm]!;
      appendFileSync(path.join(out, "requests.ndjson"), JSON.stringify({ caseId, sourceId, promptHash: hash(prompt), references: packet.sentReferences, diagnosticBindings: packet.diagnosticBindings, checkerDescription: packet.descriptions[arm] }) + "\n");
      await runSuite({ tier: "image", cases: [{ caseId, work: scene.work, unitId: scene.unitId, reference: scene.expected, split: "dev", tiers: ["image"], styles: ["classical"] }], works: new Map([[scene.work, work]]), aspectRatio: plan.aspectRatio, concurrency: 1,
        image: { model: plan.imageModel, resolution: plan.resolution }, providers: phase => {
          const provider = createOpenRouterEvalImageProvider({ apiKey, fetch: ledger.fetchFor("image", phase), timeoutMs: 180000 });
          const checker = createOpenRouterVisionChecker({ apiKey, fetch: ledger.fetchFor("check", phase), timeoutMs: 25000, reasoningEffort: "low", maxTokens: 1500 });
          return { text: { id: "no-replanning", complete: async () => { throw new Error("Frozen plans must not re-plan"); } },
            image: { id: provider.id, generate: request => { assert.equal(request.prompt, packet.baseline); assert.deepEqual((request.references ?? []).map(r => hash(r.bytes)), packet.sentReferences.map(r => r.sha256)); return provider.generate({ ...request, prompt }); } },
            checker: { id: checker.id, check: request => {
              const before = `Its description: ${packet.descriptions.baseline}`, after = `Its description: ${packet.descriptions[arm]}`;
              assert.equal(request.question.split(before).length, 2);
              return checker.check({ ...request, question: request.question.replace(before, after) });
            } } };
        }, blocked: () => ledger.state.blocked,
        saveImage: (key, n, image) => { const file = path.join(blobs, `${key.replaceAll("/", "__")}__a${n}.${image.mimeType.split("/")[1]}`); writeFileSync(file, image.bytes, { flag: "wx" }); return { file: path.relative(root, file), sha256: hash(image.bytes) }; },
        record: result => { const { prepared: baselinePrepared, checkContext, ...rest } = result;
          const actual = { ...rest, baselinePrepared, checkContext: checkContext ? { ...(checkContext as Record<string, unknown>), description: packet.descriptions[arm] } : undefined,
            sourceId, scene: scene.id, arm, repeat, prompt, baselinePromptHash: hash(packet.baseline), diagnosticBindings: packet.diagnosticBindings }; results.push(actual); appendFileSync(path.join(out, "results.ndjson"), JSON.stringify(actual) + "\n"); }, log: console.log });
      assert.equal(ledger.state.blocked, null);
      assert.ok(!results.some(r => r.retryError || (r.attempts as Array<{ checkError: string | null }> | undefined)?.some(a => a.checkError)), "Stop on failed checks or retries");
      assert.ok(!results.some(r => r.outcome === "error" || r.outcome === "refused" || r.outcome === "failed"), "Stop on a failed image or invalid frozen input");
    }
  }
  assert.equal(results.length, plan.scenes.length * plan.repeats * 2);
  assert.ok(ledger.state.calls.every(call => call.status !== "in-flight"), "Unsettled calls prevent completion");
  verify();
  if (offline) { assert.equal(fake.counts.text, 0); assert.ok(results.every(r => r.outcome === "image")); }
  save(out, "finished.json", { at: new Date().toISOString(), offline, rows: results.length, measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd, cumulativeUpperBoundUsd: plan.priorUpperBoundUsd + ledger.state.measuredUsd + ledger.state.uncertainUsd, productionMutations: 0 });
  console.log(`Artifacts: ${out}`);
}
