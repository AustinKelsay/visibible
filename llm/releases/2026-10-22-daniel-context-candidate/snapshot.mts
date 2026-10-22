/** Read-only capture; never calls a model or writes to production. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { canonUserPrompt, canonSourceUnits, CANON_SYSTEM } from "../../../src/lib/reading-pass/canon";
import { estimateRequestCostUsd } from "../../../src/lib/reading-pass/model";
import { packetProvider, assemblePacket } from "../2026-10-21-daniel-schema-pilot/packets.mjs";
import { environment, root, json, save, sources, hash, noModel } from "./experiment.mjs";

const phase = process.argv[2];
assert.ok(phase === "before" || phase === "after");
const { env } = environment();
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion);
assert.equal(status.briefVersion, inputs.briefVersion);
const previous = JSON.parse(fs.readFileSync(path.join(root, "llm/releases/2026-10-21-reference-comparison/after.json"), "utf8"));
const records = [];
for (const record of previous.records) {
  const current = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: record.kind, recordId: record.recordId });
  assert.deepEqual(current, record, `Changed live ${record.kind}/${record.recordId}`);
  records.push(current);
}
const provider = await packetProvider(env, noModel);
const packets = [];
for (const style of ["classical", "watercolor", "icon"]) packets.push(await assemblePacket(provider, style, 1));
assert.ok(packets.every((p) => p.preparationCalls === 0));
const balanceResponse = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
assert.ok(balanceResponse.ok);
const { data } = await balanceResponse.json();
const catalogResponse = await fetch("https://visibible.com/api/image-models");
assert.ok(catalogResponse.ok);
const publicCatalog = await catalogResponse.json();
const modelsResponse = await fetch("https://openrouter.ai/api/v1/models");
assert.ok(modelsResponse.ok);
const modelCatalog = await modelsResponse.json();
const textModel = modelCatalog.data.find((m: { id: string }) => m.id === json("plan.json").textModel);
assert.ok(textModel && Number(textModel.pricing.prompt) > 0 && Number(textModel.pricing.completion) > 0);
assert.ok(publicCatalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
const result = { at: new Date().toISOString(), phase, sourceFiles: sources(), status, records, packets, balanceUsd: data.total_credits - data.total_usage, publicCatalog, textModel, paidCalls: 0, productionMutations: 0, publicActivation: false };
if (phase === "before") {
  const readingFile = path.join(root, "works/bible-web/.preparation/release-2026-10-20/state.json");
  const readingBytes = fs.readFileSync(readingFile);
  const reading = JSON.parse(readingBytes.toString());
  assert.equal(reading.workVersion, inputs.workVersion);
  const entry = reading.merge.entries.find((e: { id: string }) => e.id === "the_ancient_of_days");
  const liveEntry = records.find((r) => r?.recordId === entry.id)!.payload;
  assert.ok(liveEntry.kind === "entry");
  assert.deepEqual({ name: entry.name, aliases: entry.aliases, note: entry.note, members: entry.members, entryKind: entry.kind }, { name: liveEntry.name, aliases: liveEntry.aliases, note: liveEntry.note, members: liveEntry.members, entryKind: liveEntry.entryKind });
  const sections = reading.merge.sections.filter((s: { onStage: Array<{ id: string }> }) => s.onStage.some((o) => o.id === entry.id));
  assert.equal(sections.length, 1);
  const liveSection = records.find((r) => r?.kind === "section")!.payload;
  assert.ok(liveSection.kind === "section");
  assert.ok(typeof liveSection.era === "string");
  assert.equal(sections[0].firstUnitId, liveSection.firstUnit);
  assert.equal(sections[0].lastUnitId, liveSection.lastUnit);
  assert.equal(sections[0].title, liveSection.title);
  const hints = reading.brief.canonHints.filter((h: { entryId: string }) => h.entryId === entry.id);
  assert.equal(hints.length, 0);
  const sectionEras = { [sections[0].firstUnitId]: liveSection.era };
  const request = canonUserPrompt({ work: inputs.work, entry, brief: inputs.brief, sections, sectionEras, hints });
  const sourceUnits = canonSourceUnits(inputs.work, entry, sections);
  assert.ok(sourceUnits.some((u) => u.id === "daniel-7-9"));
  save("draft-input.json", { selectedUnitIds: sourceUnits.map((u) => u.id), sourceChars: sourceUnits.map((u) => `[${u.id}] ${u.text.replace(/\s+/g, " ").trim()}`).join("\n").length, entry, sections, sectionEras, hints, request, recoveredReadingStateSha256: hash(readingBytes), estimatedUsd: estimateRequestCostUsd({ system: CANON_SYSTEM, user: request.user, expectedCompletionTokens: 1200 }) });
} else {
  const before = json("before.json");
  assert.deepEqual(result.records, before.records);
  assert.deepEqual(result.packets, before.packets);
  assert.deepEqual(result.sourceFiles, before.sourceFiles);
}
save(`${phase}.json`, result);
console.log(JSON.stringify({ phase, sourceVersions: { work: inputs.workVersion, brief: inputs.briefVersion }, scopedRecords: records.length, baselinePackets: packets.length, balanceUsd: result.balanceUsd, paidCalls: 0, productionMutations: 0 }));
