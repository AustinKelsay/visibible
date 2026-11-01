/** Network-free reconstruction through the actual preparation and text adapter. See README for the unapplied candidate. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createMemoryPreparationStore, type MemoryRecordInput } from "../../../src/lib/engine/memory-store";
import { prepareMoment, MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord, type MomentContext } from "../../../src/lib/engine/preparation";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, "../../..");
const read = <T,>(file: string): T => JSON.parse(readFileSync(resolve(dir, file), "utf8"));
const { values } = parseArgs({ options: { write: { type: "boolean" } } });
const plan = read<{ sourceRun: string }>("plan.json");
const cases = read<Array<{ id: string; caseId: string; firstPlanLine: number; reviewLine: number; correctionLine: number | null;
  edit?: { field: string; before: string; after: string }; addedProblem?: Record<string, string> }>>("cases.json");
const rows = (file: string) => readFileSync(resolve(root, plan.sourceRun, file), "utf8").trim().split("\n").map((s) => JSON.parse(s));
const exchanges = rows("provider.ndjson"), results = rows("results.ndjson");
const snapshot = JSON.parse(readFileSync(resolve(root, plan.sourceRun, "snapshot.json"), "utf8"));
const arm = String(MOMENT_CAST_PROMPT_VERSION) === "2026-10-31-moment-cast-v16" ? "with-draft" : "baseline";
assert.ok(["2026-10-28-moment-cast-v15", "2026-10-31-moment-cast-v16"].includes(MOMENT_CAST_PROMPT_VERSION));
globalThis.fetch = async () => { throw new Error("Network forbidden in reconstruction"); };
const packets: Record<string, unknown> = {};
for (const c of cases) {
  const saved = results.find((r) => r.caseId === c.caseId); assert.ok(saved);
  const original = exchanges[c.firstPlanLine - 1], review = exchanges[c.reviewLine - 1];
  assert.equal(original.phase, `${c.caseId}/text`); assert.equal(review.phase, original.phase);
  const firstReply = structuredClone(original.response), reviewReply = structuredClone(review.response);
  if (c.edit) {
    const draft = JSON.parse(firstReply.choices[0].message.content), { field, before, after } = c.edit;
    assert.equal(draft[field].split(before).length, 2);
    draft[field] = draft[field].replace(before, after);
    firstReply.choices[0].message.content = JSON.stringify(draft);
    const problems = JSON.parse(reviewReply.choices[0].message.content);
    problems.problems.push(c.addedProblem);
    reviewReply.choices[0].message.content = JSON.stringify(problems);
  }
  const section = snapshot.works[saved.work].records[`section:${saved.sectionId}`];
  const cast = new Set(section.payload.cast.map((v: { entryId: string }) => v.entryId));
  const records = (Object.values(snapshot.works[saved.work].records) as MemoryRecordInput[]).filter((r) =>
    r.kind === "section" ? r.recordId === saved.sectionId : r.kind === "entry" ? cast.has(r.recordId) : r.kind === "moment" && r.payload.sectionId === saved.sectionId);
  const memory = createMemoryPreparationStore(records);
  const look = saved.records.look as AnalysisRecord; assert.equal(look.kind, "look"); assert.equal(look.payload.kind, "look");
  await memory.store.putDerivedRecord({ kind: "look", recordId: look.recordId, payload: { ...look.payload, kind: "look" }, inputs: look.inputs });
  const inputs = await readWorkInputs(saved.work);
  let count = 0;
  const model = createOpenRouterTextModel({ apiKey: "offline-unused", model: original.request.model, fetch: async (_url, init) => {
    const request = JSON.parse(String(init.body)), index = count++;
    assert.ok(index < 4);
    if (index === 0) assert.deepEqual(request, original.request);
    if (index === 1 && !c.edit) assert.deepEqual(request, review.request);
    if (index === 2) {
      assert.deepEqual({ ...request, messages: original.request.messages }, original.request);
      assert.deepEqual(request.messages[0], original.request.messages[0]);
      assert.ok(request.messages[1].content.startsWith(original.request.messages[1].content));
      if (arm === "baseline" && c.correctionLine) assert.deepEqual(request, exchanges[c.correctionLine - 1].request);
      packets[c.id] = request;
    }
    // Only the first draft and first review drive the captured correction. Later replies are mechanical placeholders.
    const response = index === 1 ? reviewReply : index === 3 ? { ...reviewReply, choices: [{ finish_reason: "stop", message: { content: '{"problems":[]}' } }] } : firstReply;
    return Response.json(response);
  } });
  await prepareMoment({ workId: saved.work, momentId: saved.momentId, store: memory.store, model, brief: inputs.brief,
    briefVersion: inputs.briefVersion, depiction: inputs.depiction, context: saved.context as MomentContext });
  assert.equal(count, 4);
}
const file = `${arm}-requests.json`;
if (values.write) writeFileSync(resolve(dir, file), JSON.stringify(packets, null, 2) + "\n");
else assert.deepEqual(packets, read(file));
console.log(`${arm}: four correction requests reconstructed exactly; zero network calls. Placeholder final replies establish no quality result.`);
