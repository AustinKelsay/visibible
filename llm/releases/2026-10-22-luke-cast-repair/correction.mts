/** Explicit owner correction candidate and one-shot application. No model calls. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { createCorrections, type CastEntryAddition } from "../../../src/lib/engine/corrections";
import type { AnalysisRecord } from "../../../src/lib/engine/preparation";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { dir, root, json, hash, save, ids, sources, environment, snapshot } from "./inspect.mjs";

export const row = (state: { records: Array<{ kind: string; recordId: string; record: AnalysisRecord | null }> }, kind: string, id: string) => state.records.find((r) => r.kind === kind && r.recordId === id)?.record ?? null;
type Revision = { originalArtifactSha256: string; text?: string; textReplace?: [string, string]; keepQuoteUnits?: string[] };
export async function candidate() {
  const before = json("preflight.json"), curation = json("canon-curation-v2.json");
  assert.deepEqual(sources(), before.sources);
  const inputs = await readWorkInputs("bible-web", root);
  const subjects = json("subjects.json") as Array<{ id: string; kind: "character" | "location"; name: string; aliases: string[]; note: string; members: string[]; support: string[] }>;
  assert.deepEqual(subjects.map((s) => s.id), ids);
  const old = row(before, "section", "luke-10-25")!;
  let section = structuredClone(old.payload);
  let sectionVersion = old.version;
  const additions: CastEntryAddition[] = [], entries: Array<{ id: string; payload: CastEntryAddition["entry"] }> = [];
  for (const subject of subjects) {
    const artifact = json(`canon-${subject.id}.json`), result = artifact.result;
    assert.deepEqual(artifact.entry, subject); assert.deepEqual(result.problems, []);
    assert.equal(result.attempts, 1); assert.equal(result.hasForm, true); assert.equal(result.stages.length, 1);
    const stage = structuredClone(result.stages[0]);
    const revision: Revision | undefined = curation.revisions[subject.id];
    if (revision) {
      assert.equal(revision.originalArtifactSha256, hash(fs.readFileSync(path.join(dir, `canon-${subject.id}.json`))));
      if (revision.text) stage.text = revision.text;
      if (revision.textReplace) { assert.ok(stage.text.includes(revision.textReplace[0])); stage.text = stage.text.replace(...revision.textReplace); }
      if (revision.keepQuoteUnits) stage.quotes = stage.quotes.filter((q: { unit: string }) => revision.keepQuoteUnits!.includes(q.unit));
    }
    assert.ok(stage.text.trim() && stage.text.length <= 500 && stage.quotes.length);
    assert.equal(result.sectionStages[old.recordId], stage.id);
    for (const q of stage.quotes) { assert.ok(subject.support.includes(q.unit)); assert.ok(q.quote.trim() && inputs.work.getUnit(q.unit).text.includes(q.quote)); }
    const previous = row(before, "entry", subject.id);
    if (subject.id === "the_samaritan") assert.deepEqual(previous!.payload.stages, []); else assert.equal(previous, null);
    const payload: CastEntryAddition["entry"] = {
      ...(previous?.payload ?? { kind: "entry", entryKind: subject.kind, name: subject.name, aliases: subject.aliases, note: subject.note, members: subject.members }),
      kind: "entry", entryKind: subject.kind, name: subject.name, hasForm: true,
      stages: [{ id: stage.id, label: stage.label, text: stage.text, quotes: stage.quotes }],
    };
    entries.push({ id: subject.id, payload });
    if (previous) continue;
    additions.push({ workVersion: inputs.workVersion, expectedGeneration: 1, sectionId: old.recordId, expectedSectionVersion: sectionVersion, entryId: subject.id, stageId: stage.id, named: false, entry: payload });
    section = { ...section, cast: [...section.cast as unknown[], { entryId: subject.id, stageId: stage.id, named: false }], mentionedOnly: (section.mentionedOnly as string[]).filter((id) => id !== subject.id) };
    sectionVersion = contentVersion(section);
  }
  const samaritan = entries[0];
  const finalSection = { ...section, cast: [...section.cast as unknown[], { entryId: samaritan.id, stageId: samaritan.payload.stages[0].id, named: false }], mentionedOnly: (section.mentionedOnly as string[]).filter((id) => id !== samaritan.id) };
  return { inputHashes: Object.fromEntries(["plan.json", "subjects.json", "canon-curation-v2.json", ...ids.map((id) => `canon-${id}.json`)].map((name) => [name, hash(fs.readFileSync(path.join(dir, name)))])), entries, samaritanExpectedVersion: row(before, "entry", samaritan.id)!.version, additions, finalSectionExpectedVersion: sectionVersion, finalSection, finalSectionVersion: contentVersion(finalSection) };
}

async function main() {
  const command = process.argv[2], proposed = await candidate();
  if (command === "candidate") { save("candidate.json", proposed); console.log(JSON.stringify({ entries: proposed.entries.length, additions: proposed.additions.length, finalSectionVersion: proposed.finalSectionVersion })); return; }
  assert.equal(command, "apply"); assert.ok(process.argv.includes("--execute"));
  assert.deepEqual(proposed, json("candidate.json"));
  const reviewed = json("candidate-review.json");
  assert.equal(reviewed.issues, 0); assert.equal(reviewed.candidateSha256, hash(fs.readFileSync(path.join(dir, "candidate.json"))));
  for (const [file, digest] of Object.entries(reviewed.files)) assert.equal(hash(fs.readFileSync(path.join(root, file))), digest);
  // Fresh full scoped snapshot catches source, generation, derived-record and unrelated-entry drift.
  await snapshot("before-apply"); const before = json("preflight.json"), fresh = json("before-apply.json");
  assert.deepEqual(fresh.records, before.records); assert.deepEqual(fresh.status, before.status); assert.deepEqual(fresh.spend, before.spend);
  assert.ok(Date.now() - Date.parse(fresh.at) < 60_000);
  const env = environment(), client = new ConvexHttpClient(env.url), inputs = await readWorkInputs("bible-web", root);
  const query = (kind: "entry" | "section", recordId: string) => client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind, recordId });
  save("correction-started.json", { at: new Date().toISOString(), candidateSha256: reviewed.candidateSha256, retryPolicy: "Never blindly rerun; inspect durable per-operation read-back and record histories after any ambiguity." });
  const first = proposed.entries[0];
  const result = await client.mutation(api.analysis.correctRecord, { serverSecret: env.secret, workId: "bible-web", kind: "entry", recordId: first.id, expectedVersion: proposed.samaritanExpectedVersion, payload: first.payload });
  const readBack = await query("entry", first.id); assert.deepEqual(readBack?.payload, first.payload);
  save("applied-samaritan.json", { at: new Date().toISOString(), result, readBack });
  const corrections = createCorrections(client, api.analysis as never, "bible-web", env.secret, "https://visibible.com");
  for (const addition of proposed.additions) {
    const result = await corrections.addCastEntry(addition, inputs);
    const readBack = await query("entry", addition.entryId), section = await query("section", addition.sectionId);
    assert.deepEqual(readBack?.payload, addition.entry); assert.equal(section?.version, result.sectionVersion);
    save(`applied-${addition.entryId}.json`, { at: new Date().toISOString(), result, readBack, section });
  }
  const final = await client.mutation(api.analysis.correctRecord, { serverSecret: env.secret, workId: "bible-web", kind: "section", recordId: "luke-10-25", expectedVersion: proposed.finalSectionExpectedVersion, payload: proposed.finalSection as never });
  const section = await query("section", "luke-10-25"); assert.deepEqual(section?.payload, proposed.finalSection);
  save("applied-section.json", { at: new Date().toISOString(), result: final, readBack: section });
  await snapshot("corrected"); console.log(JSON.stringify({ corrected: proposed.entries.length, finalSectionVersion: section?.version }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
