/** Re-reads the baseline verses' production records read-only, reporting any record that changed since the baseline. */
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { root, json, base, save, environment, sources } from "./common.mjs";

const plan = json("plan.json"), env = environment(), client = new ConvexHttpClient(env.url), baseline = base("sample-set.json");
const inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);
assert.equal(baseline.samples.length, plan.sampling.target);
const records: Record<string, unknown> = {}, changed: string[] = [];
for (const key of Object.keys(baseline.records)) {
  const [kind, ...rest] = key.split(":"); const recordId = rest.join(":");
  records[key] = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: kind as never, recordId });
  if (!isDeepStrictEqual(records[key], baseline.records[key])) changed.push(key);
}
// A look stored since the baseline would change what a sample prepares, so its key set is rechecked too.
const samples = [];
for (const s of baseline.samples) {
  const look = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: "look", recordId: s.sectionId });
  const keys = s.keys.filter((k: string) => !k.startsWith("look:"));
  if (look) { records[`look:${s.sectionId}`] = look; keys.push(`look:${s.sectionId}`); }
  if (!!look !== s.storedLook) changed.push(`look:${s.sectionId}`);
  samples.push({ ...s, keys, storedLook: !!look });
}
const pricing = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
const credits = await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.key}` } })).json();
save("sample-set.json", { at: new Date().toISOString(), baseline: "../2026-10-23-random-verse-check/sample-set.json", seed: baseline.seed, sources: sources(), status, samples, records, recordsChangedSinceBaseline: [...new Set(changed)], pricing,
  balanceUsd: credits.data.total_credits - credits.data.total_usage, productionMutations: 0 });
console.log(JSON.stringify({ samples: samples.length, records: Object.keys(records).length, changedSinceBaseline: [...new Set(changed)] }));
