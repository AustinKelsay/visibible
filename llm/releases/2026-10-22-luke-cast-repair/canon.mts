/** Draft only the nine declared subjects with the existing canon function; no production writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { canonUserPrompt, canonOutputSchema, CANON_SYSTEM, draftCanonEntry } from "../../../src/lib/reading-pass/canon";
import { estimateRequestCostUsd, type TextModelRequest } from "../../../src/lib/reading-pass/model";
import type { MergedEntry, MergedSection } from "../../../src/lib/reading-pass/merge";
import { dir, root, hash, json, save, sources } from "./inspect.mjs";
import { boundedModel, plain } from "./model.mjs";

type Subject = MergedEntry & { support: string[] };
export async function options() {
  const inputs = await readWorkInputs("bible-web", root), snapshot = json("preflight.json");
  assert.deepEqual(sources(), snapshot.sources);
  const subjects: Subject[] = json("subjects.json");
  const old = snapshot.records.find((row: { kind: string; recordId: string }) => row.kind === "section" && row.recordId === "luke-10-25").record;
  const originalCast = old.payload.cast as Array<{ entryId: string; stageId: string; named?: boolean }>;
  const section: MergedSection = { divisionId: "luke", firstUnitId: old.payload.firstUnit, lastUnitId: old.payload.lastUnit, title: old.payload.title,
    onStage: [...originalCast.filter((member) => member.entryId !== "judea_gospel_region_around_jerusalem").map((member) => ({ id: member.entryId, named: member.named ?? false })),
      ...subjects.filter((entry) => entry.kind === "character").map((entry) => ({ id: entry.id, named: false }))],
    setting: ["judea_gospel_region_around_jerusalem", ...subjects.filter((entry) => entry.kind === "location").map((entry) => entry.id)], mentionedOnly: [] };
  return { inputs, subjects, section, sectionEras: { [section.firstUnitId]: old.payload.era } };
}
export const inputHashes = () => Object.fromEntries(["plan.json", "subjects.json"].map((name) => [name, hash(fs.readFileSync(path.join(dir, name)))]));
async function main() {
  const { inputs, subjects, section, sectionEras } = await options();
  const command = process.argv[2];
  if (command === "dry-run") {
    const requests = subjects.map((entry) => {
      const prompt = canonUserPrompt({ work: inputs.work, entry, brief: inputs.brief, sections: [section], sectionEras, hints: [] });
      const request: TextModelRequest = { label: `canon:${entry.id}:1`, system: CANON_SYSTEM, user: prompt.user, schemaName: "canon_entry", schema: canonOutputSchema, maxTokens: 4000, expectedCompletionTokens: 1200 };
      return { entryId: entry.id, request: plain(request), estimatedUsd: estimateRequestCostUsd(request) };
    });
    save("dry-run-canon.json", { at: new Date().toISOString(), inputHashes: inputHashes(), requests, estimatedFirstAttemptsUsd: requests.reduce((sum, row) => sum + row.estimatedUsd, 0), paidCalls: 0, productionMutations: 0 });
    console.log(JSON.stringify({ requests: requests.length, estimatedFirstAttemptsUsd: requests.reduce((sum, row) => sum + row.estimatedUsd, 0) })); return;
  }
  assert.equal(command, "draft"); assert.ok(process.argv.includes("--execute"));
  const entry = subjects.find((subject) => subject.id === process.argv[3]); assert.ok(entry);
  const dry = json("dry-run-canon.json"); assert.deepEqual(inputHashes(), dry.inputHashes);
  save(`started-canon-${entry.id}.json`, { at: new Date().toISOString(), retryPolicy: "Read retained ledger and result after any uncertain outcome; never blindly rerun." });
  const model = boundedModel(`canon:${entry.id}`, (request, first) => {
    assert.equal(request.schemaName, "canon_entry"); assert.equal(request.maxTokens, 4000);
    assert.match(request.label, new RegExp(`^canon:${entry.id}:[12]$`));
    if (first) assert.deepEqual(plain(request), dry.requests.find((row: { entryId: string }) => row.entryId === entry.id).request);
  });
  const result = await draftCanonEntry({ work: inputs.work, entry, brief: inputs.brief, sections: [section], sectionEras, hints: [], model });
  save(`canon-${entry.id}.json`, { at: new Date().toISOString(), entry, result });
  assert.deepEqual(result.problems, []); assert.equal(result.stages.length, 1); assert.equal(result.hasForm, true);
  assert.equal(result.sectionStages[section.firstUnitId], result.stages[0].id);
  for (const stage of result.stages) {
    assert.ok(stage.text.trim() && stage.text.length <= 500 && stage.quotes.length > 0);
    for (const quote of stage.quotes) {
      assert.ok(entry.support.includes(quote.unit), `Quote must support this subject in the declared passage: ${quote.unit}`);
      assert.ok(quote.quote.trim() && inputs.work.getUnit(quote.unit).text.includes(quote.quote));
    }
  }
  console.log(JSON.stringify({ entryId: entry.id, attempts: result.attempts, stage: result.stages[0] }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
