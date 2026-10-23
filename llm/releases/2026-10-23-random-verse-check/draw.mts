/** Draws the random verse sample and snapshots each sample's production records read-only. */
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { root, json, save, environment, sources, mulberry32, bookOf } from "./common.mjs";

const plan = json("plan.json"), env = environment(), client = new ConvexHttpClient(env.url);
const inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);

// Every active moment, paged, then a verse-position index so each verse maps to its moment.
const moments: Array<{ recordId: string; payload: { firstUnit: string; lastUnit: string; sectionId: string } }> = [];
for (let cursor: string | null = null; ;) {
  const page: { records: typeof moments; nextCursor: string | null } = await client.query(api.analysis.listActiveRecordsPage, { workId: "bible-web", generation: 1, kind: "moment", cursor }) as never;
  moments.push(...page.records); cursor = page.nextCursor; if (!cursor) break;
}
const owner = new Array<string | undefined>(inputs.work.units.length);
for (const m of moments) {
  const first = inputs.work.getUnit(m.payload.firstUnit).position, last = inputs.work.getUnit(m.payload.lastUnit).position;
  for (let p = first; p <= last; p++) { assert.equal(owner[p], undefined, `verse ${p} in two moments`); owner[p] = m.recordId; }
}
const uncovered = owner.filter((o) => !o).length;
assert.equal(uncovered, 0, "every verse belongs to a moment");

const random = mulberry32(plan.sampling.seed), drawn: Array<{ index: number; verse: string; momentId: string; book: string; draws: number }> = [], seen = new Set<string>();
let draws = 0;
while (drawn.length < plan.sampling.target) {
  draws++;
  const position = Math.floor(random() * inputs.work.units.length), momentId = owner[position]!;
  if (seen.has(momentId)) continue;
  seen.add(momentId);
  const verse = inputs.work.units[position].id;
  drawn.push({ index: drawn.length + 1, verse, momentId, book: bookOf(verse), draws });
}

// Read each sample's records once; identical records are stored once and referenced by key.
const records: Record<string, unknown> = {};
const get = async (kind: string, recordId: string) => {
  const key = `${kind}:${recordId}`;
  if (!(key in records)) records[key] = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: kind as never, recordId });
  return records[key] as { payload: Record<string, unknown> } | null;
};
const samples = [];
for (const s of drawn) {
  const moment = (await get("moment", s.momentId))!; const sectionId = String(moment.payload.sectionId);
  const section = (await get("section", sectionId))!;
  const cast = (section.payload.cast as Array<{ entryId: string }>).map((c) => c.entryId);
  for (const id of cast) assert.ok(await get("entry", id), `missing entry ${id}`);
  const look = await get("look", sectionId);
  samples.push({ ...s, sectionId, keys: [`moment:${s.momentId}`, `section:${sectionId}`, ...cast.map((id) => `entry:${id}`), ...(look ? [`look:${sectionId}`] : [])], storedLook: !!look });
}
const pricing = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
const credits = await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.key}` } })).json();
save("sample-set.json", { at: new Date().toISOString(), seed: plan.sampling.seed, sources: sources(), status, momentCount: moments.length, verseCount: inputs.work.units.length, draws, samples, records, pricing,
  balanceUsd: credits.data.total_credits - credits.data.total_usage, productionMutations: 0 });
console.log(JSON.stringify({ moments: moments.length, draws, samples: samples.length, storedLooks: samples.filter((s) => s.storedLook).length, uniqueRecords: Object.keys(records).length,
  books: Object.entries(samples.reduce<Record<string, number>>((a, s) => ({ ...a, [s.book]: (a[s.book] ?? 0) + 1 }), {})).length }));
