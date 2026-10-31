/** Paired, local source-context diagnostic through the existing suite runner. No production writes.
 * --prepare freezes source boundaries; --offline rehearses both phases; --execute --phase text|images
 * runs a phase once under the remaining original allowance. No failed sample is rerolled.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs, parseEnv } from "node:util";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { readWorkInputs, momentForUnit, momentContext } from "../../src/lib/engine/work-inputs";
import type { AnalysisRecord } from "../../src/lib/engine/preparation";
import type { ReferenceRecord } from "../../src/lib/engine/assemble";
import { createOpenRouterTextModel, READING_PASS_MODEL } from "../../src/lib/reading-pass/model";
import { createOpenRouterEvalImageProvider } from "../../src/lib/image-evals/adapters";
import { createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { createOfflineOpenRouter } from "../../src/lib/image-evals/suite-offline";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, runSuite, type ModelPricing, type SuiteWork } from "../../src/lib/image-evals/suite-run";

const root = path.resolve(import.meta.dirname, "../.."), dir = path.join(root, "llm/releases/2026-10-30-source-context");
const old = "llm/releases/2026-10-30-identity-visuals", snapshotFile = "llm/releases/2026-10-30-review-only-text/snapshot.json";
const read = <T,>(file: string): T => JSON.parse(readFileSync(path.resolve(root, file), "utf8"));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const save = (folder: string, name: string, value: unknown) => writeFileSync(path.join(folder, name), JSON.stringify(value, null, 2) + "\n");
type Scene = { id: string; work: string; unitId: string; expected: string; images: boolean };
type Plan = { operationCapUsd: number; priorUpperBoundUsd: number; cumulativeCapUsd: number; readerReserveUsd: number; phaseCaps: Record<string, number>; repeats: number; imageModel: string; scenes: Scene[] };
type Row = { caseId: string; outcome: string; scene: string; arm: string; repeat: number; records?: { look: AnalysisRecord; plan: AnalysisRecord }; [key: string]: unknown };
const { values } = parseArgs({ options: { prepare: { type: "boolean" }, offline: { type: "boolean" }, execute: { type: "boolean" }, phase: { type: "string" } } });
const plan = read<Plan>(path.join(dir, "plan.json"));
const prior = read<{ upperBoundUsd: number; operationCapUsd: number }>(`${old}/funding-close.json`);
assert.equal(prior.upperBoundUsd, plan.priorUpperBoundUsd);
assert.equal(prior.operationCapUsd, plan.cumulativeCapUsd);
assert.ok(plan.priorUpperBoundUsd + plan.operationCapUsd <= plan.cumulativeCapUsd);
assert.equal(Object.values(plan.phaseCaps).reduce((a, b) => a + b, 0), plan.operationCapUsd);
const snapshot = read<{ works: Record<string, { records: Record<string, AnalysisRecord> }> }>(snapshotFile);
const aliceRecords = read<AnalysisRecord[]>(`${old}/candidate-records.json`);
const recordsFor = (id: string) => (id === "alice-in-wonderland" ? aliceRecords : Object.values(snapshot.works[id].records)).filter(r => !["look", "plan"].includes(r.kind));
const works = new Map(await Promise.all([...new Set(plan.scenes.map(s => s.work))].map(async id => [id, await readWorkInputs(id, root)] as const)));
const scenes = plan.scenes.map(scene => {
  const work = works.get(scene.work)!.work, records = recordsFor(scene.work);
  const moment = momentForUnit(work, scene.unitId, records.filter(r => r.kind === "moment").map(r => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) })))!;
  assert.ok(moment, scene.unitId);
  const sectionId = records.find(r => r.kind === "moment" && r.recordId === moment.id)!.payload.sectionId;
  const section = records.find(r => r.kind === "section" && r.recordId === sectionId)!;
  const range = { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) };
  const context = momentContext(work, moment, range);
  const first = work.getUnit(moment.firstUnit).position, last = work.getUnit(moment.lastUnit).position;
  const before = work.units.slice(work.getUnit(range.firstUnit).position, first).map(u => u.text).join("\n\n");
  const after = work.units.slice(last + 1, work.getUnit(range.lastUnit).position + 1).map(u => u.text).join("\n\n");
  const source = `\n\nCOMPLETE SOURCE SECTION (context for the focal MOMENT; establish its state at that instant, not a later event):\nBEFORE THE MOMENT:\n${before || "(none)"}\nFOCAL MOMENT:\n${context.moment.text}\nAFTER THE MOMENT:\n${after || "(none)"}`;
  assert.ok(source.length <= 12000, "Choose a smaller declared diagnostic section; never clip source");
  return { ...scene, moment, sectionId, range, context, source };
});
if (values.prepare) {
  assert.ok(!existsSync(path.join(dir, "inputs.json")), "Do not replace frozen inputs");
  save(dir, "scenes.json", scenes);
  const files = [path.relative(root, path.join(dir, "plan.json")), path.relative(root, path.join(dir, "scenes.json")), snapshotFile, `${old}/candidate-records.json`, `${old}/references.json`, `${old}/funding-close.json`,
    ...[...works.keys()].flatMap(id => ["work", "brief", "depiction"].map(f => `works/${id}/${f}.json`))];
  save(dir, "inputs.json", Object.fromEntries(files.map(file => [file, hash(readFileSync(path.join(root, file)))])));
  console.log(`Frozen ${scenes.length} sections; longest source block ${Math.max(...scenes.map(s => s.source.length))} characters.`);
} else {
  assert.ok(values.offline || (values.execute && ["text", "images"].includes(values.phase ?? "")), "Use --prepare, --offline, or --execute --phase text|images");
  const inputs = read<Record<string, string>>(path.join(dir, "inputs.json"));
  const verify = () => { for (const [file, expected] of Object.entries(inputs)) assert.equal(hash(readFileSync(path.join(root, file))), expected, file); };
  verify();
  assert.deepEqual(scenes, read(path.join(dir, "scenes.json")));
  const out = values.offline ? mkdtempSync(path.join(os.tmpdir(), "visibible-source-context-")) : dir;
  const blobs = values.offline ? path.join(out, "images") : path.join(root, "evals/images/runs/2026-10-30-source-context");
  mkdirSync(blobs, { recursive: true });
  const env = values.offline ? { OPENROUTER_API_KEY: "offline" } : parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  if (!values.offline) { assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256); }
  const apiKey = env.OPENROUTER_API_KEY; assert.ok(apiKey);
  const fake = createOfflineOpenRouter(), prices = new Map<string, ModelPricing>();
  if (!values.offline) {
    const catalog = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data;
    for (const id of [READING_PASS_MODEL, plan.imageModel]) { const price = modelPricing(catalog.find((m: { id: string }) => m.id === id)); assert.ok(price, id); prices.set(id, price); }
  }
  const refs = read<{ refs: Record<string, ReferenceRecord>; files: Record<string, { file: string; sha256: string }> }>(`${old}/references.json`);
  for (const phase of values.offline ? ["text", "images"] : [values.phase!]) {
    assert.ok(!existsSync(path.join(out, `${phase}-started.json`)), "One-shot phase; never reroll a sample");
    if (phase === "images") assert.ok(existsSync(path.join(out, "text-finished.json")), "Finish text before images");
    const phaseFiles = phase === "images" ? ["text-results.json", "text-finished.json", "text-ledger.json"].map(f => path.join(out, f)) : [];
    const phaseInputs = Object.fromEntries(phaseFiles.map(f => [f, hash(readFileSync(f))]));
    if (!values.offline) {
      assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit inputs before spending");
      execFileSync("git", ["ls-files", "--error-unmatch", "scripts/evals/source-context.mts", ...["plan", "inputs", "scenes", "funding"].map(f => path.relative(root, path.join(dir, `${f}.json`))), ...phaseFiles.map(f => path.relative(root, f))], { cwd: root });
      const funding = read<{ operationCapUsd: number }>(path.join(dir, "funding.json")); assert.equal(funding.operationCapUsd, plan.operationCapUsd);
      const remaining = phase === "text" ? plan.operationCapUsd : plan.phaseCaps.images + plan.phaseCaps.score;
      const headers = { Authorization: `Bearer ${apiKey}` };
      const [credits, key] = await Promise.all(["credits", "key"].map(async endpoint => (await (await fetch(`https://openrouter.ai/api/v1/${endpoint}`, { headers })).json()).data));
      assert.ok(credits.total_credits - credits.total_usage >= plan.readerReserveUsd + remaining, "Reader reserve must remain protected");
      assert.ok(key.limit_remaining === null || key.limit_remaining >= remaining + 1, "Key allowance too small");
    }
    const sourceFiles = execFileSync("git", ["ls-files", "src/lib", "convex/_helpers/contentVersion.ts", "scripts/evals/source-context.mts", "styles", "package-lock.json"], { cwd: root, encoding: "utf8" }).trim().split("\n");
    const sources = Object.fromEntries(sourceFiles.map(f => [f, hash(readFileSync(path.join(root, f)))]));
    save(out, `${phase}-started.json`, { at: new Date().toISOString(), offline: !!values.offline, capUsd: plan.phaseCaps[phase], sources, inputs, phaseInputs, prices: Object.fromEntries(prices) });
    const ledger = createLedger({ capUsd: plan.phaseCaps[phase], reserves: { text: 0.005, image: 0.1, check: 0.002 }, limits: { text: phase === "text" ? 250 : 0, image: phase === "images" ? 24 : 0, check: phase === "images" ? 48 : 0 },
      fetch: values.offline ? fake.fetch : fetch, ceiling: values.offline ? undefined : (kind, req) => requestCeilingUsd(kind, req, prices.get(String(req.model))),
      save: state => save(out, `${phase}-ledger.json`, state), log: event => appendFileSync(path.join(out, `${phase}-provider.ndjson`), JSON.stringify(event) + "\n"), scrub: v => scrubForLog(v, apiKey, hash) });
    const rows: Row[] = [], savedPlans = phase === "images" ? read<Row[]>(path.join(out, "text-results.json")) : [];
    for (const scene of scenes.filter(s => phase === "text" || s.images)) {
      let look: AnalysisRecord | undefined;
      for (let repeat = 1; repeat <= plan.repeats; repeat++) for (const arm of repeat % 2 ? ["baseline", "section"] : ["section", "baseline"]) {
        const caseId = `${scene.id}-${arm}-${repeat}`, saved = savedPlans.find(r => r.caseId === caseId);
        if (phase === "images" && saved?.outcome !== "planned") {
          const row = { caseId, scene: scene.id, arm, repeat, outcome: "refused", reason: "No frozen successful plan" };
          rows.push(row); appendFileSync(path.join(out, `${phase}-results.ndjson`), JSON.stringify(row) + "\n"); continue;
        }
        const seeded = phase === "images" ? [saved!.records!.look, saved!.records!.plan] : look ? [look] : [];
        const work: SuiteWork = { inputs: works.get(scene.work)!, records: recordsFor(scene.work), seeded,
          getReference: async (kind, id) => phase === "images" ? refs.refs[`${kind}:${id}`] ?? null : null,
          loadReference: async id => { const f = refs.files[id], bytes = readFileSync(path.join(root, f.file)); assert.equal(hash(bytes), f.sha256); return bytes; } };
        await runSuite({ tier: phase === "text" ? "text" : "image", cases: [{ caseId, work: scene.work, unitId: scene.unitId, reference: scene.expected, split: "dev", tiers: [phase === "text" ? "text" : "image"], styles: ["classical"] }], works: new Map([[scene.work, work]]), aspectRatio: "16:9", concurrency: 1,
          image: { model: plan.imageModel, resolution: "1K" }, providers: label => {
            const text = createOpenRouterTextModel({ apiKey, fetch: ledger.fetchFor("text", label) });
            return { text: { id: text.id, complete: req => text.complete(arm === "section" && /^(plan|review):/.test(req.label) ? { ...req, user: req.user + scene.source } : req) },
              image: createOpenRouterEvalImageProvider({ apiKey, fetch: ledger.fetchFor("image", label), timeoutMs: 180000 }), checker: createOpenRouterVisionChecker({ apiKey, fetch: ledger.fetchFor("check", label), reasoningEffort: "low", maxTokens: 1500 }) };
          }, blocked: () => ledger.state.blocked,
          record: result => { const row = { ...result, scene: scene.id, arm, repeat } as Row; rows.push(row); appendFileSync(path.join(out, `${phase}-results.ndjson`), JSON.stringify(row) + "\n"); },
          saveImage: (key, n, image) => { const file = path.join(blobs, `${key.replaceAll("/", "__")}__a${n}.${image.mimeType.split("/")[1]}`); writeFileSync(file, image.bytes); return { file: path.relative(root, file), sha256: hash(image.bytes) }; }, log: console.log });
        assert.equal(ledger.state.blocked, null);
        assert.ok(!rows.some(r => r.outcome === "error"), "Suite error; stop without a finished marker");
        if (phase === "text" && !look) { look = rows.at(-1)?.records?.look; assert.ok(look, "Cannot pair without a frozen guide"); }
      }
    }
    assert.equal(rows.length, scenes.filter(s => phase === "text" || s.images).length * 2 * plan.repeats);
    if (values.offline) assert.ok(rows.every(r => r.outcome === (phase === "text" ? "planned" : "image")));
    verify();
    for (const [file, expected] of Object.entries(phaseInputs)) assert.equal(hash(readFileSync(file)), expected, file);
    for (const [file, expected] of Object.entries(sources)) assert.equal(hash(readFileSync(path.join(root, file))), expected, file);
    save(out, `${phase}-results.json`, rows);
    save(out, `${phase}-finished.json`, { at: new Date().toISOString(), rows: rows.length, measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd, productionMutations: 0, offline: !!values.offline });
  }
  console.log(`Diagnostic artifacts: ${out}`);
}
