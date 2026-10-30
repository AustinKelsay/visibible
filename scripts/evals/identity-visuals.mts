/** Bounded local diagnostic over existing canon, reference and suite code. No Convex writes.
 * --offline rehearses in a temporary directory. --execute --phase canon|references|text|images
 * runs one frozen phase once, preserving results and reserving the complete provider ceiling.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs, parseEnv } from "node:util";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import sharp from "sharp";
import { contentVersion } from "../../convex/_helpers/contentVersion";
import { readWorkInputs } from "../../src/lib/engine/work-inputs";
import type { AnalysisRecord } from "../../src/lib/engine/preparation";
import type { ReferenceRecord } from "../../src/lib/engine/assemble";
import { runCanon, emptyCanonState, canonRecords, type CanonState } from "../../src/lib/reading-pass/canon-run";
import type { ReadingPassState } from "../../src/lib/reading-pass/run";
import { createOpenRouterTextModel, type TextModel, READING_PASS_MODEL } from "../../src/lib/reading-pass/model";
import { runReferences, emptyReferenceState, inputFingerprint, type ReferenceStore } from "../../src/lib/engine/references-run";
import { createOpenRouterImageMaker, createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { createOpenRouterEvalImageProvider } from "../../src/lib/image-evals/adapters";
import { createOfflineOpenRouter } from "../../src/lib/image-evals/suite-offline";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, runSuite, type SuiteWork, type ModelPricing } from "../../src/lib/image-evals/suite-run";
import type { SuiteCase } from "../../src/lib/image-evals/suite";

type Plan = { operationCapUsd: number; readerReserveUsd: number; repeats: number; shownImages: number; phaseCaps: Record<string, number>;
  conditions: Array<{ id: string; work: string; style: string; model: string }>;
  scenes: Array<{ id: string; work: string; unitId: string; expected: string }> };
type Snapshot = { records: Record<string, AnalysisRecord>; references: Record<string, ReferenceRecord | null>; files: Record<string, { sha256: string }>; status: { workVersion: string; briefVersion: string } };
type Row = Record<string, unknown> & { outcome: string; records?: { look: AnalysisRecord; plan: AnalysisRecord } };
const { values } = parseArgs({ options: { execute: { type: "boolean" }, offline: { type: "boolean" }, phase: { type: "string" } } });
const root = path.resolve(import.meta.dirname, "../..");
const run = "2026-10-30-identity-visuals", frozen = path.join(root, "llm/releases", run);
const read = <T,>(file: string): T => JSON.parse(readFileSync(file, "utf8"));
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const plan = read<Plan>(path.join(frozen, "plan.json"));
const provenance = read<{ files: Record<string, string>; bibleReferenceDirectory: string }>(path.join(frozen, "inputs.json"));
for (const [file, expected] of Object.entries(provenance.files)) assert.equal(hash(readFileSync(path.join(root, file))), expected, file);
assert.equal(Object.values(plan.phaseCaps).reduce((a, b) => a + b, 0), plan.operationCapUsd);
const phases = ["canon", "references", "text", "images"];
const wanted = values.offline ? phases : [values.phase];
assert.ok(values.offline || (values.execute && wanted.every(p => p && phases.includes(p))), "Use --offline or --execute --phase canon|references|text|images");
const out = values.offline ? mkdtempSync(path.join(os.tmpdir(), "visibible-identity-visuals-")) : frozen;
const blobs = values.offline ? path.join(out, "blobs") : path.join(root, "evals/images/runs", run);
mkdirSync(blobs, { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + "\n");
const reading = read<ReadingPassState>(path.join(frozen, "reading.json"));
const alice = await readWorkInputs("alice-in-wonderland", root), bible = await readWorkInputs("bible-web", root);
const oldAlice = read<{ records: AnalysisRecord[]; workVersion: string; briefVersion: string }>(path.join(root, "evals/images/analyses/alice-in-wonderland.json"));
const bibleSnapshot = read<Snapshot>(path.join(frozen, "bible-snapshot.json"));
assert.equal(reading.workVersion, alice.workVersion);
assert.equal(oldAlice.workVersion, alice.workVersion);
assert.equal(oldAlice.briefVersion, alice.briefVersion);
assert.equal(bibleSnapshot.status.workVersion, bible.workVersion);
assert.equal(bibleSnapshot.status.briefVersion, bible.briefVersion);
for (const s of plan.scenes) (s.work === "bible-web" ? bible : alice).work.getUnit(s.unitId);
assert.equal(plan.conditions.reduce((n,c) => n + plan.scenes.filter(s => s.work === c.work).length * plan.repeats, 0), plan.shownImages);
const fake = createOfflineOpenRouter();
const env = values.offline ? { OPENROUTER_API_KEY: "offline" } : parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
if (!values.offline) { assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256); }
const apiKey = env.OPENROUTER_API_KEY; assert.ok(apiKey);
const fetchImpl: typeof fetch = values.offline ? async (url, init) => {
  const body = JSON.parse(String(init?.body));
  const schema = body.response_format?.json_schema?.schema;
  if (body.response_format?.json_schema?.name === "reference_check" && schema?.properties?.verdict) {
    const fields = Object.fromEntries(Object.entries(schema.properties as Record<string, { type: string }>).map(([k,v]) => [k, k === "verdict" ? "pass" : v.type === "array" ? [] : ["views_ok", "same_subject", "full_bleed"].includes(k)]));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fields) } }], usage: { cost: 0.0003 } }), { status: 200 });
  }
  return fake.fetch(String(url), init!);
} : fetch;
const prices = new Map<string, ModelPricing | undefined>();
if (!values.offline) {
  const catalog = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data;
  for (const id of new Set([READING_PASS_MODEL, ...plan.conditions.map(c => c.model)])) {
    prices.set(id, modelPricing(catalog.find((m: { id: string }) => m.id === id))); assert.ok(prices.get(id), `No price for ${id}`);
  }
}
for (const phase of wanted) {
  assert.ok(phase);
  const startedFile = `${phase}-started.json`;
  assert.ok(!existsSync(path.join(out, startedFile)), `${phase} already started; do not reroll`);
  if (!values.offline) {
    assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit frozen inputs before spending");
    execFileSync("git", ["ls-files", "--error-unmatch", "scripts/evals/identity-visuals.mts", ...["plan.json", "inputs.json", "reading.json", "bible-snapshot.json", "funding.json"].map(f => path.relative(root, path.join(frozen, f)))], { cwd: root, stdio: "pipe" });
    const funding = read<{ operationCapUsd: number }>(path.join(frozen, "funding.json")); assert.equal(funding.operationCapUsd, plan.operationCapUsd);
    const headers = { Authorization: `Bearer ${apiKey}` };
    const [credits, key] = await Promise.all(["credits", "key"].map(async p => (await (await fetch(`https://openrouter.ai/api/v1/${p}`, { headers })).json()).data));
    const remaining = phases.slice(phases.indexOf(phase)).reduce((n,p) => n + plan.phaseCaps[p], 0);
    assert.ok(credits.total_credits - credits.total_usage >= remaining + plan.readerReserveUsd, "Insufficient balance above reader reserve");
    assert.ok(key.limit_remaining === null || key.limit_remaining >= remaining + 1, "Insufficient key allowance");
  }
  const sourceFiles = execFileSync("git", ["ls-files", "src/lib", "convex/_helpers/contentVersion.ts", "scripts/evals/identity-visuals.mts", "styles", "works/*/brief.json", "works/*/depiction.json", "package-lock.json"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  save(startedFile, { at: new Date().toISOString(), offline: !!values.offline, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sources: Object.fromEntries(sourceFiles.map(f => [f, hash(readFileSync(path.join(root, f)))])), inputs: provenance.files, prices: Object.fromEntries(prices) });
  const ledger = createLedger({ capUsd: plan.phaseCaps[phase], reserves: { text: 0.005, image: 0.1, check: 0.002 }, limits: { text: 250, image: 110, check: 250 }, fetch: (u,i) => fetchImpl(u,i),
    ceiling: values.offline ? undefined : (kind, req) => requestCeilingUsd(kind, req, prices.get(String(req.model))),
    save: s => save(`${phase}-ledger.json`, s), log: e => appendFileSync(path.join(out, `${phase}-provider.ndjson`), JSON.stringify(e) + "\n"), scrub: v => scrubForLog(v, apiKey, hash) });
  const textModel = (label: () => string) => createOpenRouterTextModel({ apiKey, fetch: ledger.fetchFor("text", label) });
  const checker = (label: () => string) => createOpenRouterVisionChecker({ apiKey, fetch: ledger.fetchFor("check", label), reasoningEffort: "low", maxTokens: 1500 });
  if (phase === "canon") {
    const model: TextModel = values.offline ? { id: "offline-canon", async complete(req) {
      const id = req.label.split(":")[1], entry = reading.merge!.entries.find(e => e.id === id)!;
      return { content: JSON.stringify({ kind: entry.kind, has_form: true, appearance_from_text: "Synthetic rehearsal", stages: [{ id: "main", label: "Main", when: "Always", source: "invention", text: "Synthetic rehearsal subject.", quotes: [] }], section_stages: [] }), model: "offline-canon", providerRequestId: null, finishReason: "stop", usage: { costUsd: 0, promptTokens: 0, completionTokens: 0 }, elapsedMs: 0 };
    } } : textModel(() => "canon");
    const state = await runCanon({ workFile: read(path.join(root, "works/alice-in-wonderland/work.json")), workVersion: alice.workVersion, brief: alice.brief, briefVersion: alice.briefVersion, reading, hints: [], model, store: null,
      state: emptyCanonState(reading.workId, alice.workVersion, alice.briefVersion), saveState: async s => save("canon.json", s), budgetUsd: plan.phaseCaps.canon, formOnly: true, parallel: 3, log: console.log });
    save("candidate-records.json", canonRecords(reading, state));
  } else if (phase === "references") {
    const records = read<AnalysisRecord[]>(path.join(out, "candidate-records.json"));
    const refs: Record<string, ReferenceRecord> = {};
    const files: Record<string, { file: string; sha256: string }> = {};
    const store: ReferenceStore = { listActiveRecords: async kind => records.filter(r => r.kind === kind).map(r => ({ ...r, version: contentVersion(r.payload) })),
      getReference: async (kind,id,inputs) => { const r=refs[`${kind}:${id}`]; return r ? { storageId:r.storageId, stale:r.fingerprint!==inputFingerprint(inputs), pinned:false } : null; },
      putReference: async args => { refs[`${args.kind}:${args.recordId}`] = { storageId:args.storageId, inputs:args.inputs, fingerprint:inputFingerprint(args.inputs), pinned:false }; save("references.json", { refs,files }); },
      noteAttention: async item => appendFileSync(path.join(out,"reference-attention.ndjson"),JSON.stringify(item)+"\n") };
    const targetIds = new Set(reading.merge!.entries.filter(e => e.members.some(m => /:character:(?:alice|(?:the_)?white_rabbit)$/.test(m))).map(e=>e.id));
    const canon = read<CanonState>(path.join(out, "canon.json"));
    const only = ["classical", "watercolor", ...Object.values(canon.entries).filter(e=>targetIds.has(e.entryId)).flatMap(e=>e.stages.map(s=>`${e.entryId}:${s.id}`))];
    await runReferences({ workId:reading.workId, workTitle:alice.work.work.title, brief:alice.brief, store, state:emptyReferenceState(reading.workId), saveState:async s=>save("reference-state.json",s), budgetUsd:plan.phaseCaps.references, only,
      styleVersions:Object.fromEntries(Object.entries(alice.styles).map(([id,s])=>[id,s.version])),
      maker:createOpenRouterImageMaker({apiKey,fetch:ledger.fetchFor("image",()=>"reference")}), checker:checker(()=>"reference"),
      blobs:{store:async bytes=>{const jpg=await sharp(bytes).jpeg({quality:90}).toBuffer();const id=hash(jpg),file=path.join(blobs,`${id}.jpg`);writeFileSync(file,jpg);files[id]={file:path.relative(root,file),sha256:hash(jpg)};return{storageId:id};}},log:console.log });
    save("references.json", {refs,files});
  } else {
    const candidate = read<AnalysisRecord[]>(path.join(out,"candidate-records.json"));
    const localRefs = read<{refs:Record<string,ReferenceRecord>;files:Record<string,{file:string;sha256:string}>}>(path.join(out,"references.json"));
    const rows: Row[] = [];
    const selected = phase === "text" ? plan.conditions.filter(c=>["alice-baseline","alice-candidate","bible-control"].includes(c.id)) : plan.conditions;
    for (const condition of selected) {
      const variant = condition.id === "alice-baseline" ? "baseline" : condition.work === "bible-web" ? "bible" : "candidate";
      const records = variant === "baseline" ? oldAlice.records : variant === "bible" ? Object.values(bibleSnapshot.records) : candidate;
      const prior = phase === "images" ? read<Row[]>(path.join(out, `${variant}-plans.json`)) : [];
      const seeded = [...new Map(prior.filter(r=>r.outcome==="planned").flatMap(r=>[r.records!.look,r.records!.plan]).map(r=>[`${r.kind}:${r.recordId}`,r])).values()];
      if(phase === "images") assert.ok(seeded.length,"No frozen text plans");
      const work:SuiteWork={inputs:condition.work==="bible-web"?bible:alice,records,seeded:phase==="images"?seeded:undefined,
        getReference:async(kind,id)=>variant==="baseline"?null:variant==="bible"?bibleSnapshot.references[`${kind}:${id}`]??null:localRefs.refs[`${kind}:${id}`]??null,
        loadReference:async id=>{const file=variant==="bible"?path.join(root,provenance.bibleReferenceDirectory,`${id}.jpg`):path.resolve(root,localRefs.files[id].file);const bytes=readFileSync(file);assert.equal(hash(bytes),variant==="bible"?bibleSnapshot.files[id].sha256:localRefs.files[id].sha256);return bytes;} };
      const cases:SuiteCase[]=plan.scenes.filter(s=>s.work===condition.work).flatMap(s=>Array.from({length:phase==="text"?1:plan.repeats},(_,i)=>({caseId:`${condition.id}-${s.id}-${i+1}`,work:s.work,unitId:s.unitId,reference:s.expected,split:"dev",tiers:[phase==="text"?"text":"image"],styles:[condition.style]})));
      const part:Row[]=[];
      await runSuite({tier:phase==="text"?"text":"image",cases,works:new Map([[condition.work,work]]),aspectRatio:"16:9",concurrency:2,
        image:{model:condition.model,resolution:"1K"},providers:label=>({text:textModel(label),image:createOpenRouterEvalImageProvider({apiKey,timeoutMs:180000,fetch:ledger.fetchFor("image",label)}),checker:checker(label)}),
        blocked:()=>ledger.state.blocked,record:r=>{const row=r as Row;part.push(row);rows.push(row);appendFileSync(path.join(out,`${phase}-results.ndjson`),JSON.stringify(row)+"\n");},
        saveImage:(key,n,img)=>{const file=path.join(blobs,`${key.replaceAll("/","__")}__a${n}.${img.mimeType.split("/")[1]}`);writeFileSync(file,img.bytes);return{file:path.relative(root,file),sha256:hash(img.bytes)};},log:console.log});
      if(phase==="text") save(`${variant}-plans.json`,part);
      assert.equal(ledger.state.blocked,null,"Provider ledger blocked");
    }
    save(`${phase}-summary.json`,{rows:rows.length,outcomes:rows.reduce<Record<string,number>>((n,r)=>(n[r.outcome]=(n[r.outcome]??0)+1,n),{})});
    if(values.offline) assert.ok(rows.every(r=>r.outcome===(phase==="text"?"planned":"image")),"Offline assembly failed");
  }
  assert.equal(ledger.state.blocked,null);
  const started = read<{ sources: Record<string, string> }>(path.join(out, startedFile));
  for (const [file, expected] of Object.entries(started.sources)) assert.equal(hash(readFileSync(path.join(root, file))), expected, `Changed during run: ${file}`);
  for (const [file, expected] of Object.entries(provenance.files)) assert.equal(hash(readFileSync(path.join(root, file))), expected, `Changed input: ${file}`);
  save(`${phase}-finished.json`,{at:new Date().toISOString(),measuredUsd:ledger.state.measuredUsd,uncertainUsd:ledger.state.uncertainUsd,productionMutations:0,offline:!!values.offline});
}
console.log(`Diagnostic artifacts: ${out}`);
