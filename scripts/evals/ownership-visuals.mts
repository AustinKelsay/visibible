/** One-shot ownership-only image comparison. Frozen original inputs; no production writes. */
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
import { READING_PASS_MODEL } from "../../src/lib/reading-pass/model";
import { createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { createOpenRouterEvalImageProvider } from "../../src/lib/image-evals/adapters";
import { createOfflineOpenRouter } from "../../src/lib/image-evals/suite-offline";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, runSuite, type ModelPricing, type SuiteWork } from "../../src/lib/image-evals/suite-run";

const root = path.resolve(import.meta.dirname, "../.."), run = "2026-10-31-ownership-visuals";
const dir = path.join(root, "llm/releases", run), prior = "llm/releases/2026-10-30-source-context";
const identity = "llm/releases/2026-10-30-identity-visuals", replay = "llm/releases/2026-10-31-scene-input-ownership/report.json";
const read = <T,>(file: string): T => JSON.parse(readFileSync(path.resolve(root, file), "utf8"));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const save = (folder: string, name: string, value: unknown) => writeFileSync(path.join(folder, name), JSON.stringify(value, null, 2) + "\n");
type Plan = { operationCapUsd: number; cumulativeCapUsd: number; priorUpperBoundUsd: number; readerReserveUsd: number; imageModel: string; repeats: number; aspectRatio: "16:9"; resolution: string; scenes: Array<{ id: string; work: string; unitId: string; expected: string; sourceCaseId: string }> };
type Row = { caseId: string; records: { look: AnalysisRecord; plan: AnalysisRecord } };
type Packet = { caseId: string; baseline: string; candidate: string | null; originalReferences: unknown; sentReferences: Array<{ storageId: string; sha256: string }> };
const { values } = parseArgs({ options: { prepare: { type: "boolean" }, offline: { type: "boolean" }, execute: { type: "boolean" } } });
assert.equal([values.prepare, values.offline, values.execute].filter(Boolean).length, 1, "Choose one of --prepare, --offline, --execute");
const plan = read<Plan>(path.join(dir, "plan.json"));
const priorFundingFile = "llm/releases/2026-10-31-scene-input-visuals/funding-close.json";
const priorFunding = read<{ cumulativeUpperBoundUsd: number; originalCapUsd: number }>(priorFundingFile);
const funding = read<{ status: string; operationCapUsd: number; cumulativeCapUsd: number; authorizedCumulativeCapUsd: number }>(path.join(dir, "funding.json"));
assert.equal(plan.priorUpperBoundUsd, priorFunding.cumulativeUpperBoundUsd);
assert.equal(funding.operationCapUsd, plan.operationCapUsd);
assert.equal(funding.cumulativeCapUsd, plan.cumulativeCapUsd);
assert.ok(funding.authorizedCumulativeCapUsd >= priorFunding.originalCapUsd);
if (values.execute) {
  assert.equal(funding.status, "approved", "Budget increase is not approved; offline preparation only");
  assert.equal(funding.authorizedCumulativeCapUsd, plan.cumulativeCapUsd);
}
assert.ok(plan.operationCapUsd > 0 && plan.priorUpperBoundUsd + plan.operationCapUsd <= plan.cumulativeCapUsd);
// Regenerate rather than trust overwriteable local packets; the retained report fixes every prompt hash.
execFileSync(process.execPath, ["--import", "tsx", "scripts/evals/scene-input-ownership.mts"], { cwd: root, stdio: "pipe" });
const local = "evals/images/runs/2026-10-31-scene-input-ownership";
assert.deepEqual(read(`${local}/report.json`), read(replay));
const allPackets = read<Packet[]>(`${local}/packets.json`), rows = read<Row[]>(`${prior}/text-results.json`);
const packets = plan.scenes.map(scene => { const packet = allPackets.find(p => p.caseId === scene.sourceCaseId); assert.ok(packet?.candidate); return packet; });
assert.equal(packets.length, 3); assert.equal(new Set(packets.map(p => p.caseId)).size, 3);
const refs = read<{ refs: Record<string, ReferenceRecord>; files: Record<string, { file: string; sha256: string }> }>(`${identity}/references.json`);
const snapshotFile = "llm/releases/2026-10-30-review-only-text/snapshot.json";
const snapshot = read<{ works: Record<string, { records: Record<string, AnalysisRecord> }> }>(snapshotFile);
const alice = read<AnalysisRecord[]>(`${identity}/candidate-records.json`);
const replayHashes = { ...read<{ inputHashes: Record<string, string> }>("llm/releases/2026-10-31-render-source-context-offline/report.json").inputHashes, ...read<{ inputHashes: Record<string, string> }>(replay).inputHashes };
if (values.prepare) {
  assert.ok(!existsSync(path.join(dir, "inputs.json")), "Do not replace frozen inputs");
  const files = [...new Set(["scripts/evals/ownership-visuals.mts", "scripts/evals/scene-input-ownership.mts", replay, priorFundingFile, ...Object.keys(replayHashes), ...["plan", "funding"].map(f => `llm/releases/${run}/${f}.json`)])];
  save(dir, "packets.json", packets);
  files.push(`llm/releases/${run}/packets.json`);
  save(dir, "inputs.json", Object.fromEntries(files.map(f => [f, hash(readFileSync(path.join(root, f)))])));
  console.log("Frozen visual comparison inputs; no provider calls.");
} else {
  const frozen = read<Record<string, string>>(path.join(dir, "inputs.json"));
  const verify = () => { for (const [f, expected] of Object.entries(frozen)) assert.equal(hash(readFileSync(path.join(root, f))), expected, f); };
  verify();
  assert.deepEqual(packets, read(path.join(dir, "packets.json")), "Frozen ownership packets must reproduce");
  const offline = !!values.offline, out = offline ? mkdtempSync(path.join(os.tmpdir(), "visibible-ownership-visuals-")) : dir;
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
      appendFileSync(path.join(out, "requests.ndjson"), JSON.stringify({ caseId, sourceId, promptHash: hash(prompt), references: packet.sentReferences }) + "\n");
      await runSuite({ tier: "image", cases: [{ caseId, work: scene.work, unitId: scene.unitId, reference: scene.expected, split: "dev", tiers: ["image"], styles: ["classical"] }], works: new Map([[scene.work, work]]), aspectRatio: plan.aspectRatio, concurrency: 1,
        image: { model: plan.imageModel, resolution: plan.resolution }, providers: phase => {
          const provider = createOpenRouterEvalImageProvider({ apiKey, fetch: ledger.fetchFor("image", phase), timeoutMs: 180000 });
          return { text: { id: "no-replanning", complete: async () => { throw new Error("Frozen plans must not re-plan"); } },
            image: { id: provider.id, generate: request => { assert.equal(request.prompt, packet.baseline); assert.deepEqual((request.references ?? []).map(r => hash(r.bytes)), packet.sentReferences.map(r => r.sha256)); return provider.generate({ ...request, prompt }); } },
            checker: createOpenRouterVisionChecker({ apiKey, fetch: ledger.fetchFor("check", phase), timeoutMs: 25000, reasoningEffort: "low", maxTokens: 1500 }) };
        }, blocked: () => ledger.state.blocked,
        saveImage: (key, n, image) => { const file = path.join(blobs, `${key.replaceAll("/", "__")}__a${n}.${image.mimeType.split("/")[1]}`); writeFileSync(file, image.bytes, { flag: "wx" }); return { file: path.relative(root, file), sha256: hash(image.bytes) }; },
        record: result => { const { prepared: baselinePrepared, ...rest } = result;
          const actual = { ...rest, baselinePrepared, sourceId, scene: scene.id, arm, repeat, prompt, baselinePromptHash: hash(packet.baseline), diagnosticReplay: replay }; results.push(actual); appendFileSync(path.join(out, "results.ndjson"), JSON.stringify(actual) + "\n"); }, log: console.log });
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
