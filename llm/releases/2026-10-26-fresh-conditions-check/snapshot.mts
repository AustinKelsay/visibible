/** One read-only fresh draw. No model calls, API-key use, production mutation or score-based replacement. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import type { AnalysisRecord } from "../../../src/lib/engine/preparation";
import { dir, root, json, save, sources, randomFrom, hash, readEnvironment } from "./common.mjs";

assert.ok(!fs.existsSync(path.join(dir, "sample-set.json")), "Keep the first draw");
const env = readEnvironment();
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL!);
const plan = json("plan.json");
const inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);
const excluded = new Set<string>(plan.sampling.exclude.flatMap((file: string) => json(file).samples.map((s: { momentId: string }) => s.momentId)));
const records: Record<string, AnalysisRecord> = {};
const samples: Array<{ id: string; stratum: "fresh"; verse: string; momentId: string; sectionId: string; draws: number; keys: string[] }> = [];
let queries = 1, draws = 0;
const get = async (kind: "moment" | "section" | "entry", recordId: string) => {
  const key = `fresh:${kind}:${recordId}`;
  if (!records[key]) { queries++; const record = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind, recordId }); assert.ok(record, `Missing ${key}`); records[key] = record as AnalysisRecord; }
  return records[key];
};
const random = randomFrom(plan.sampling.seed), seen = new Set(excluded);
while (samples.length < plan.sampling.fresh) {
  draws++;
  const verse = inputs.work.units[Math.floor(random() * inputs.work.units.length)].id;
  if (seen.has(verse)) continue;
  seen.add(verse);
  const moment = await get("moment", verse);
  assert.equal(moment.payload.firstUnit, verse); assert.equal(moment.payload.lastUnit, verse);
  const sectionId = String(moment.payload.sectionId), section = await get("section", sectionId);
  const cast = section.payload.cast as Array<{ entryId: string }>;
  for (const { entryId } of cast) await get("entry", entryId);
  samples.push({ id: `n${String(samples.length + 1).padStart(3, "0")}`, stratum: "fresh", verse, momentId: verse, sectionId, draws,
    keys: [`fresh:moment:${verse}`, `fresh:section:${sectionId}`, ...cast.map((c) => `fresh:entry:${c.entryId}`)] });
}
save("sample-set.json", { at: new Date().toISOString(), seed: plan.sampling.seed, draws, sources: sources(), status,
  priorProvenance: plan.sampling.exclude.map((file: string) => ({ file, sha256: hash(fs.readFileSync(path.resolve(dir, file))) })),
  verseCount: inputs.work.units.length, excludedMomentIds: [...excluded].sort(), samples, records, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 });
console.log(JSON.stringify({ samples: samples.length, draws, excluded: excluded.size, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 }));
