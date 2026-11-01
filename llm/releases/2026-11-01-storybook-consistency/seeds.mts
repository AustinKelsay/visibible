/**
 * Offline: the section looks each store starts with. Production keeps one look per section, so a new verse is planned
 * against the look its earlier neighbours were drawn with. A look is seeded only when the earlier run prepared it and the
 * section and its cast entries are unchanged since that run's snapshot. No network.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { lookOutputSchema } from "../../../src/lib/engine/preparation";
import { dir, json, ndjson, root, save } from "./common.mjs";

assert.ok(!fs.existsSync(path.join(dir, "seeds.json")), "Keep the first seeds");
const plan = json("plan.json"), snapshot = json("snapshot.json");
const sectionOf = Object.fromEntries((snapshot.cases as Array<{ id: string; sectionId: string }>).map((c) => [c.id, c.sectionId]));
const sameVersion = (key: string, earlier: Record<string, { version: string }>) => earlier[key]?.version === snapshot.records[key]?.version;
const stores: Record<string, unknown> = {};
for (const store of plan.stores as Array<{ id: string; seededFrom: string }>) {
  const earlierDir = path.join(root, "llm/releases", store.seededFrom);
  const earlier = JSON.parse(fs.readFileSync(path.join(earlierDir, "snapshot.json"), "utf8"));
  const earlierSection = Object.fromEntries((earlier.cases as Array<{ id: string; sectionId: string }>).map((c) => [c.id, c.sectionId]));
  const looks: Record<string, { payload: Record<string, string>; fromCases: string[] }> = {};
  for (const row of ndjson(path.join(earlierDir, "results.ndjson"))) {
    if (!row.prepared?.look) continue;
    const sectionId = earlierSection[row.case], payload = lookOutputSchema.parse(row.prepared.look);
    const seen = looks[sectionId];
    if (seen) { assert.deepEqual(seen.payload, payload, `${store.seededFrom} has two looks for ${sectionId}`); seen.fromCases.push(row.case); }
    else looks[sectionId] = { payload, fromCases: [row.case] };
  }
  const seeded: Record<string, unknown> = {}, fresh: Array<{ sectionId: string; cases: string[]; reason: string }> = [];
  for (const sectionId of [...new Set(Object.values(sectionOf))]) {
    const cases = Object.keys(sectionOf).filter((id) => sectionOf[id] === sectionId);
    const look = looks[sectionId];
    if (!look) { fresh.push({ sectionId, cases, reason: "no earlier verse in this section" }); continue; }
    const section = snapshot.records[`section:${sectionId}`];
    const keys = [`section:${sectionId}`, ...(section.payload.cast as Array<{ entryId: string }>).map((m) => `entry:${m.entryId}`)];
    const changed = keys.filter((key) => !sameVersion(key, earlier.records));
    if (changed.length) { fresh.push({ sectionId, cases, reason: `changed since ${store.seededFrom}: ${changed.join(", ")}` }); continue; }
    seeded[sectionId] = { cases, ...look };
  }
  stores[store.id] = { seededFrom: store.seededFrom, seeded, fresh };
}
save("seeds.json", { note: "Section looks copied from the earlier run's results. The run rebuilds each record's inputs from this snapshot and the current brief; the brief is unchanged since the Storybook matrix.", stores });
console.log(JSON.stringify(stores, (key, value) => (key === "payload" ? undefined : value), 1));
