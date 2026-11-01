/** Inject retained corrections, then use the unchanged engine's final review and assembly. No image calls. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryPreparationStore, type MemoryRecordInput } from "../../../src/lib/engine/memory-store";
import { assembleRendering } from "../../../src/lib/engine/assemble";
import { PLAN_SCENE_FIELDS } from "../../../src/lib/engine/plan-review";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";

export const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, "../../..");
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const read = <T,>(path: string): T => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const ndjson = <T,>(path: string): T[] => readFileSync(resolve(root, path), "utf8").trim().split("\n").map(s => JSON.parse(s));
const source = "llm/releases/2026-10-31-suite-v2-baseline-text", trial = "llm/releases/2026-11-01-replan-draft-text";
type Reply = { id: string; caseId: string; arm: string; repeat: number; content: string; normalizedCorrection: Record<string, unknown> };
type Exchange = { request: Packet; response: { choices: Array<{ message: { content: string } }> } };
export type Packet = { model: string; messages: Array<{ role: string; content: string }>; max_tokens: number; reasoning: { effort: string }; response_format: { json_schema: { name: string } } };
type Saved = { caseId: string; work: string; momentId: string; sectionId: string; context: unknown; records: { look: { recordId: string; payload: MemoryRecordInput["payload"] & { kind: "look" }; inputs: Array<{ kind: string; recordId: string; version: string }> } } };
const exchanges = ndjson<Exchange>(`${source}/provider.ndjson`), results = ndjson<Saved>(`${source}/results.ndjson`);
const snapshot = read<{ works: Record<string, { records: Record<string, MemoryRecordInput> }> }>(`${source}/snapshot.json`);
const controls = read<Array<{ id: string; caseId: string; firstPlanLine: number; reviewLine: number;
  edit?: { field: string; before: string; after: string }; addedProblem?: Record<string, string> }>>(`${trial}/cases.json`);
export const corrections = ndjson<Reply>(`${trial}/answers.ndjson`);
assert.equal(corrections.length, 24); assert.equal(new Set(corrections.map(r => r.id)).size, 24);
const baselinePackets = read<Record<string, Packet>>(`${trial}/baseline-requests.json`);
const inputs = new Map<string, ReturnType<typeof readWorkInputs>>();

export async function replay(correction: Reply, sendReview: (packet: Packet, attempt: number) => Promise<Response>) {
  const control = controls.find(c => c.id === correction.caseId); assert.ok(control);
  const saved = results.find(r => r.caseId === control.caseId); assert.ok(saved);
  if (!inputs.has(saved.work)) inputs.set(saved.work, readWorkInputs(saved.work));
  const workInputs = await inputs.get(saved.work)!;
  const original = exchanges[control.firstPlanLine - 1], first = JSON.parse(original.response.choices[0].message.content);
  const review = JSON.parse(exchanges[control.reviewLine - 1].response.choices[0].message.content);
  if (control.edit) {
    const { field, before, after } = control.edit; assert.equal(first[field].split(before).length, 2);
    first[field] = first[field].replace(before, after); review.problems.push(control.addedProblem);
  }
  const records = snapshot.works[saved.work].records, section = records[`section:${saved.sectionId}`];
  const cast = new Set((section.payload.cast as Array<{ entryId: string }>).map(c => c.entryId));
  const memory = createMemoryPreparationStore(Object.values(records).filter(r =>
    r.kind === "section" ? r.recordId === saved.sectionId : r.kind === "entry" ? cast.has(r.recordId) : r.kind === "moment" && r.payload.sectionId === saved.sectionId), { now: () => 0 });
  const look = saved.records.look;
  await memory.store.putDerivedRecord({ kind: "look", recordId: look.recordId, payload: look.payload, inputs: look.inputs });
  const requests: Packet[] = [], referenceLookups: string[] = [];
  const model = createOpenRouterTextModel({ apiKey: "offline-unused", model: original.request.model, timeoutMs: 25_000, fetch: async (_url, init) => {
    const packet: Packet = JSON.parse(String(init.body)), index = requests.length; requests.push(packet);
    assert.ok(index < 5, "Only two final-review attempts allowed");
    if (index === 0) assert.deepEqual(packet, original.request);
    if (index === 1 && !control.edit) assert.deepEqual(packet, exchanges[control.reviewLine - 1].request);
    if (index === 2) assert.deepEqual(packet, baselinePackets[control.id]);
    if (index >= 3) {
      assert.equal(packet.response_format.json_schema.name, "plan_review");
      assert.equal(packet.reasoning.effort, "low"); assert.equal(packet.max_tokens, 4000);
      return sendReview(packet, index - 3);
    }
    const content = index === 0 ? JSON.stringify(first) : index === 1 ? JSON.stringify(review) : correction.content;
    return Response.json({ id: `retained-${index}`, model: packet.model, choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 0, completion_tokens: 0, cost: 0 } });
  } });
  const firstUnit = String(records[`moment:${saved.momentId}`].payload.firstUnit);
  const rendering = await assembleRendering({ inputs: workInputs, store: memory.store, listMoments: memory.listMoments, model,
    getReference: async (kind, id) => { referenceLookups.push(`${kind}:${id}`); return null; },
    loadReference: async () => { throw new Error("No reference bytes in text-only review"); } },
    { workId: saved.work, unitId: firstUnit, styleId: "watercolor", variationNumber: null, aspectRatio: "16:9" });
  const stored = await memory.store.getActiveRecord("plan", saved.momentId);
  if (rendering.ok) {
    assert.deepEqual(rendering.context, saved.context);
    for (const field of PLAN_SCENE_FIELDS) assert.equal(rendering.prepared.plan.payload[field], correction.normalizedCorrection[field]);
    assert.equal(rendering.references.length, 0);
    assert.deepEqual(rendering.prepared.present.map(c => c.entryId), rendering.canon.map(c => c.entryId));
  }
  assert.ok(requests.length >= 4);
  return { id: correction.id, caseId: correction.caseId, arm: correction.arm, repeat: correction.repeat,
    work: saved.work, momentId: saved.momentId, inputContentSha256: hash(correction.content),
    requestSha256: requests.map(r => hash(JSON.stringify(r))), finalReviewAttempts: requests.length - 3,
    stored: stored?.payload ?? null,
    rendering: rendering.ok ? { ok: true, canon: rendering.canon, prompt: rendering.prompt, referenceLookups, attachedReferences: 0 }
      : { ok: false, reason: rendering.reason, message: rendering.message },
    ledger: memory.ledger.map(({ at, elapsedMs, ...rest }) => { void at; void elapsedMs; return rest; }) };
}
