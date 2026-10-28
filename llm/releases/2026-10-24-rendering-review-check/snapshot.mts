/** One read-only fresh draw. No model calls, API-key use, production mutation or score-based replacement. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import type { AnalysisRecord } from "../../../src/lib/engine/preparation";
import { dir, root, json, save, sources, randomFrom, hash } from "./common.mjs";

assert.ok(!fs.existsSync(path.join(dir, "sample-set.json")), "Keep the first draw");
assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
assert.equal(env.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com");
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const plan = json("plan.json"), previous = json(plan.sampling.exclude[0]);
const inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);
const prior = plan.sampling.exclude.map((file: string) => json(file));
const excluded = new Set<string>(prior.flatMap((set: { samples: Array<{ momentId: string }> }) => set.samples.map((s) => s.momentId)));
assert.equal(excluded.size, plan.sampling.excludedCount);
const records: Record<string, AnalysisRecord> = {};
const samples: Array<{ id: string; stratum: "retained" | "fresh"; verse: string; momentId: string; sectionId: string; draws: number; keys: string[] }> = [];
for (const index of plan.sampling.retained as number[]) {
  const s = previous.samples.find((s: { index: number }) => s.index === index); assert.ok(s);
  const keys: string[] = s.keys.filter((k: string) => !k.startsWith("look:") && !k.startsWith("plan:"));
  for (const key of keys) records[key] = previous.records[key];
  samples.push({ id: `r${String(index).padStart(3, "0")}`, stratum: "retained", verse: s.verse, momentId: s.momentId, sectionId: s.sectionId, draws: 0, keys });
}
let queries = 1;
const freshRecords: Record<string, AnalysisRecord> = {};
const get = async (kind: "moment" | "section" | "entry", recordId: string) => {
  const key = `${kind}:${recordId}`;
  if (!freshRecords[key]) { queries++; const record = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind, recordId }); assert.ok(record, `Missing ${key}`); freshRecords[key] = record as AnalysisRecord; }
  // Fresh canon/section may differ from the retained snapshot: preserve both under separate keys.
  records[`fresh:${key}`] = freshRecords[key];
  return freshRecords[key];
};
const random = randomFrom(plan.sampling.seed), seen = new Set(excluded);
let draws = 0;
while (samples.filter((s) => s.stratum === "fresh").length < plan.sampling.fresh) {
  draws++;
  const verse = inputs.work.units[Math.floor(random() * inputs.work.units.length)].id;
  if (seen.has(verse)) continue;
  seen.add(verse);
  const moment = await get("moment", verse);
  assert.equal(moment.payload.firstUnit, verse); assert.equal(moment.payload.lastUnit, verse);
  const sectionId = String(moment.payload.sectionId), section = await get("section", sectionId);
  const cast = section.payload.cast as Array<{ entryId: string }>;
  for (const { entryId } of cast) await get("entry", entryId);
  samples.push({ id: `f${String(samples.filter((s) => s.stratum === "fresh").length + 1).padStart(3, "0")}`, stratum: "fresh", verse, momentId: verse, sectionId, draws,
    keys: [`fresh:moment:${verse}`, `fresh:section:${sectionId}`, ...cast.map((c) => `fresh:entry:${c.entryId}`)] });
}
const response = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(response.ok);
const pricing = (await response.json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
save("sample-set.json", { at: new Date().toISOString(), seed: plan.sampling.seed, draws, sources: sources(), status,
  priorProvenance: plan.sampling.exclude.map((file: string) => ({ file, sha256: hash(fs.readFileSync(path.resolve(dir, file))), at: json(file).at })),
  verseCount: inputs.work.units.length, excludedMomentIds: [...excluded].sort(), samples, records, pricing, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 });
console.log(JSON.stringify({ samples: samples.length, fresh: plan.sampling.fresh, draws, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 }));
