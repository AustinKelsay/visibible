/** Isolated experimental control, never a production correction or a cache-behaviour claim. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import type { AnalysisRecord, PreparationStore } from "../../../src/lib/engine/preparation";
import type { CanonEntryResult } from "../../../src/lib/reading-pass/canon";
import { root, dir, json, hash } from "./experiment.mjs";

export function planSources() {
  return Object.fromEntries(["convex/_helpers/contentVersion.ts", "src/lib/engine/work-inputs.ts", "src/lib/reading-pass/canon-run.ts",
    "llm/releases/2026-10-22-daniel-structured-candidate/overlay.mts", "llm/releases/2026-10-22-daniel-structured-candidate/scene.mts"]
    .map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));
}

export async function overlay() {
  const review = json("canon-review.json");
  assert.equal(review.verdict, "accept-for-isolated-plan");
  assert.equal(review.canonArtifactSha256, hash(fs.readFileSync(path.join(dir, "canon.json"))));
  const inputs = await readWorkInputs("bible-web", root);
  const before = json("before.json");
  const candidate: CanonEntryResult = json("canon.json").result;
  assert.equal(candidate.hasForm, false);
  assert.deepEqual(candidate.problems, []);
  const rows: AnalysisRecord[] = structuredClone(before.records);
  const get = (kind: string, id: string) => {
    const row = rows.find((r) => r.kind === kind && r.recordId === id);
    assert.ok(row, `Missing scoped record ${kind}/${id}`);
    return row;
  };
  const entry = get("entry", candidate.entryId);
  // Match canonRecords' staged payload shape; showing stays in the local draft audit.
  entry.payload = { ...entry.payload, hasForm: candidate.hasForm,
    stages: candidate.stages.map(({ id, label, text, quotes }) => ({ id, label, text, quotes })) };
  entry.version = contentVersion(entry.payload);
  entry.inputs = [{ kind: "prompt", recordId: "canon", version: candidate.promptVersion! }];
  const section = get("section", "daniel-7-9");
  const cast = section.payload.cast as Array<{ entryId: string; stageId: string; named?: boolean }>;
  const member = cast.find((c) => c.entryId === candidate.entryId);
  assert.ok(member);
  member.stageId = candidate.sectionStages[section.recordId];
  assert.ok(candidate.stages.some((s) => s.id === member.stageId));
  section.version = contentVersion(section.payload);
  const look = get("look", section.recordId);
  const originalLook = before.records.find((r: AnalysisRecord) => r.kind === "look");
  assert.equal(look.version, "1469b2542a3afbf77ed9921c8f727f20");
  // Explicitly freeze the control by rebinding only its dependency refs in memory.
  // The normal live path would invalidate the old look when entry/section inputs change.
  look.inputs = [{ kind: "section", recordId: section.recordId, version: section.version },
    { kind: "brief", recordId: "bible-web", version: inputs.briefVersion },
    ...cast.map((c) => ({ kind: "entry", recordId: c.entryId, version: get("entry", c.entryId).version }))];
  assert.deepEqual(look.payload, originalLook.payload);
  assert.equal(look.version, originalLook.version);
  const records = rows.filter((r) => r.kind !== "plan");
  const moment = get("moment", "daniel-7-9");
  const context = momentContext(inputs.work,
    { id: moment.recordId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
    { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const writes: unknown[] = [], spends: unknown[] = [];
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
    putDerivedRecord: async (args) => {
      assert.equal(args.kind, "plan"); assert.equal(args.recordId, "daniel-7-9");
      const version = contentVersion(args.payload);
      records.push({ ...structuredClone(args), version });
      writes.push(structuredClone(args));
      return { version };
    },
    claim: async (kind, id) => { assert.equal(kind, "plan"); assert.equal(id, "daniel-7-9"); return { held: true }; },
    release: async (kind, id) => { assert.equal(kind, "plan"); assert.equal(id, "daniel-7-9"); },
    recordSpend: async (entry) => { assert.equal(entry.kind, "plan"); spends.push(structuredClone(entry)); },
  };
  return { inputs, context, store, records, writes, spends, audit: {
    canonArtifactSha256: review.canonArtifactSha256, sourceFiles: planSources(),
    originalEntryVersion: before.records.find((r: AnalysisRecord) => r.kind === "entry" && r.recordId === candidate.entryId).version,
    localEntryVersion: entry.version, localSectionVersion: section.version,
    frozenLookVersion: look.version, originalLookInputs: originalLook.inputs, reboundLookInputs: look.inputs,
    explanation: "Local dependency rebind holds the owner's payload/version fixed for this experiment. It is not the deployed invalidation path. No live records are written.",
  } };
}
