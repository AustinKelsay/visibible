/** Offline rendering-context trial. Replays frozen plans; never calls a provider or changes production. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { assembleRendering, type ReferenceRecord } from "../../src/lib/engine/assemble";
import { createMemoryPreparationStore } from "../../src/lib/engine/memory-store";
import { depictionModeOf } from "../../src/lib/engine/depiction";
import { GENERIC_PROMPT_MAX_CHARS, PRECEDENCE_LINE } from "../../src/lib/engine/prompt";
import { readWorkInputs } from "../../src/lib/engine/work-inputs";
import type { AnalysisRecord } from "../../src/lib/engine/preparation";

const root = path.resolve(import.meta.dirname, "../..");
const baselineCommit = "d23437397d6af4b404b07b7b9946c62a4a480292";
const prior = "llm/releases/2026-10-30-source-context";
const identity = "llm/releases/2026-10-30-identity-visuals";
const out = path.join(root, "evals/images/runs/2026-10-31-render-source-context-offline");
const hashes: Record<string, string> = {};
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
execFileSync("git", ["diff", "--quiet", baselineCommit, "--", "src/lib", "styles", "convex/_helpers/contentVersion.ts", "package-lock.json"], { cwd: root });
hashes["scripts/evals/render-source-context.mts"] = hash(readFileSync(import.meta.filename));
function read<T>(file: string): T {
  const bytes = readFileSync(path.join(root, file));
  hashes[file] = hash(bytes);
  return JSON.parse(bytes.toString());
}
const sourcePriority = "Within the rules, work brief and binding owner constraints, the SOURCE SECTION determines this moment's events and changing state. Canon and reference sheets preserve recurring identity; they do not freeze temporary state. Use the scene plan to choose one instant and composition, resolving its omissions or contradictions from the source. Art style controls rendering, not story facts. Draw only that instant, not the whole section.";

/** A diagnostic transform of known frozen packets, not a production prompt option. */
function candidate(prompt: string, source: string, literalDepiction: boolean) {
  if (!literalDepiction) return { ok: false as const, reason: "Section contains non-literal depiction; raw source remains excluded from this trial." };
  assert.equal(prompt.split(PRECEDENCE_LINE).length, 2, "Expected one existing ownership rule");
  const blocks = prompt.replace(PRECEDENCE_LINE, sourcePriority).split("\n\n");
  const scene = blocks.findIndex(b => b.startsWith("SCENE:"));
  assert.ok(scene >= 0 && !blocks[scene].includes("described by the scene plan below"), "Do not restore suppressed source");
  // Replace the clipped excerpt and short cues with one whole source section. No new extracted state.
  blocks[scene] = source.trim();
  const plan = blocks.findIndex(b => b.startsWith("SCENE PLAN ("));
  assert.ok(plan >= 0);
  blocks[plan] = blocks[plan].replace(/^.*\n/, "SCENE PLAN (proposed instant and composition; source resolves changing state):\n");
  const result = blocks.filter(b => !b.startsWith("NARRATIVE CONTINUITY (")).join("\n\n");
  return result.length <= GENERIC_PROMPT_MAX_CHARS
    ? { ok: true as const, prompt: result }
    : { ok: false as const, reason: `Whole source exceeds the existing prompt cap: ${result.length}/${GENERIC_PROMPT_MAX_CHARS}.` };
}

type Row = { caseId: string; work: string; scene: string; arm: string; repeat: number; context: unknown; prepared: unknown; records: { look: AnalysisRecord; plan: AnalysisRecord } };
type Scene = { id: string; unitId: string; sectionId: string; source: string };
const rows = read<Row[]>(`${prior}/text-results.json`);
const scenes = read<Scene[]>(`${prior}/scenes.json`);
const images = read<Array<{ caseId: string; prompt: string; references: unknown }>>(`${prior}/images-results.json`);
const frozen = read<Record<string, string>>(`${prior}/inputs.json`);
for (const [file, expected] of Object.entries(frozen)) {
  assert.equal(hash(readFileSync(path.join(root, file))), expected, file);
  hashes[file] = expected;
}
const snapshot = read<{ works: Record<string, { records: Record<string, AnalysisRecord> }> }>("llm/releases/2026-10-30-review-only-text/snapshot.json");
const alice = read<AnalysisRecord[]>(`${identity}/candidate-records.json`);
const refs = read<{ refs: Record<string, ReferenceRecord>; files: Record<string, { file: string; sha256: string }> }>(`${identity}/references.json`);
const inputs = new Map(await Promise.all([...new Set(rows.map(r => r.work))].map(async id => [id, await readWorkInputs(id, root)] as const)));
// Neither credentials nor a live adapter are loaded; an accidental network path fails locally.
globalThis.fetch = async () => { throw new Error("Offline trial forbids network access"); };
let modelCalls = 0;
const packets = [];
for (const row of rows) {
  const scene = scenes.find(s => s.id === row.scene)!;
  const records = (row.work === "alice-in-wonderland" ? alice : Object.values(snapshot.works[row.work].records)).filter(r => !["look", "plan"].includes(r.kind));
  const memory = createMemoryPreparationStore(records);
  for (const record of [row.records.look, row.records.plan]) {
    assert.ok(record.kind === "look" || record.kind === "plan");
    assert.notEqual(record.source, "owner", "This frozen trial has no owner-derived seeds");
    await memory.store.putDerivedRecord({ kind: record.kind, recordId: record.recordId, payload: record.payload as never, inputs: record.inputs });
  }
  const section = records.find(r => r.kind === "section" && r.recordId === scene.sectionId)!;
  const cast = section.payload.cast as Array<{ entryId: string }>;
  const mentioned = section.payload.mentionedOnly as string[] | undefined;
  const literalDepiction = [...cast.map(c => c.entryId), ...(mentioned ?? [])].every(id => {
    const entry = records.find(r => r.kind === "entry" && r.recordId === id);
    assert.ok(entry, `Missing section entry: ${id}`);
    return depictionModeOf(entry.payload) === "form";
  });
  const assembled = await assembleRendering({
    inputs: inputs.get(row.work)!, store: memory.store, listMoments: memory.listMoments,
    model: { id: "offline-no-calls", complete: async () => { modelCalls++; throw new Error("Frozen plans must not re-plan"); } },
    getReference: async (kind, id) => row.work === "alice-in-wonderland" ? refs.refs[`${kind}:${id}`] ?? null : null,
    loadReference: async id => { const f = refs.files[id], bytes = readFileSync(path.join(root, f.file)); assert.equal(hash(bytes), f.sha256); hashes[f.file] = f.sha256; return bytes; },
  }, { workId: row.work, unitId: scene.unitId, styleId: "classical", variationNumber: null, aspectRatio: "16:9" });
  assert.ok(assembled.ok, row.caseId);
  assert.deepEqual(assembled.context, row.context);
  assert.deepEqual({ look: assembled.prepared.look.payload, situation: assembled.prepared.situation, plan: assembled.prepared.plan.payload, present: assembled.prepared.present }, row.prepared);
  const references = assembled.references.map(r => ({ kind: r.kind, storageId: r.storageId, version: r.version, caption: r.caption }));
  const previous = images.find(i => i.caseId === row.caseId);
  if (previous) { assert.equal(assembled.prompt, previous.prompt); assert.deepEqual(references, previous.references); }
  const trial = candidate(assembled.prompt, scene.source, literalDepiction);
  if (trial.ok) {
    assert.ok(trial.prompt.includes(scene.source.trim()));
    const retained = assembled.prompt.split("\n\n").filter(b => /^(WORK BRIEF|SELECTED CHARACTERS|CANON |OWNER LOOK|ART STYLE|REFERENCE IMAGES|SCENE PRESENTATION)/.test(b));
    for (const block of retained) assert.ok(trial.prompt.includes(block), "Identity, style and constraints must remain exact");
    assert.ok(!candidate(assembled.prompt, scene.source.repeat(30), true).ok, "Overflow must reject, not truncate");
  }
  packets.push({ caseId: row.caseId, work: row.work, scene: row.scene, priorPlanningArm: row.arm, repeat: row.repeat,
    baseline: assembled.prompt, candidate: trial.ok ? trial.prompt : null, blockedReason: trial.ok ? null : trial.reason,
    references, sentReferences: assembled.sentReferences.map(r => ({ storageId: r.storageId, sha256: hash(r.bytes) })) });
}
assert.equal(modelCalls, 0);
assert.equal(new Set(images.map(i => i.caseId)).size, images.length, "Prior image case IDs must be unique");
assert.ok(images.every(i => rows.some(r => r.caseId === i.caseId)), "Every prior image packet must be compared");
assert.equal(packets.length, 36);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "packets.json"), JSON.stringify(packets, null, 2) + "\n");
const report = { baselineCommit, inputHashes: hashes, modelCalls, providerCalls: 0, spendUsd: 0, productionChanges: false,
  reproducedPriorImagePackets: images.length, wholeSourceRetained: true, unchangedPlansAndOrderedReferences: true,
  overflowRejected: true, sourceRuleChanges: "Both fuller source and its precedence change; a future image comparison would measure the combined candidate.",
  cases: packets.map(p => ({ caseId: p.caseId, work: p.work, eligible: p.candidate !== null, blockedReason: p.blockedReason,
    baselineChars: p.baseline.length, candidateChars: p.candidate?.length ?? null, baselineHash: hash(p.baseline), candidateHash: p.candidate ? hash(p.candidate) : null })) };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ rows: packets.length, eligible: packets.filter(p => p.candidate).length, modelCalls, output: out }, null, 2));
