/** Fresh read-only records and pricing. No preparation or packet assembly on a stale plan. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { FORMLESS_PLAN_PROMPT_VERSION, type AnalysisRecord } from "../../../src/lib/engine/preparation";
import { environment, root, json, save, sources, hash } from "./experiment.mjs";

const phase = process.argv[2];
assert.ok(phase === "before" || phase === "after");
const { env } = environment();
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);
const priorFile = path.join(root, "llm/releases/2026-10-22-daniel-structured-candidate/after.json");
const prior = JSON.parse(fs.readFileSync(priorFile, "utf8"));
const records = [];
for (const record of prior.records) {
  const current = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: record.kind, recordId: record.recordId });
  assert.deepEqual(current, record, `Changed live ${record.kind}/${record.recordId}`);
  records.push(current);
}
const livePlan = records.find((r) => r?.kind === "plan")!;
const livePromptVersion = livePlan.inputs.find((i: AnalysisRecord["inputs"][number]) => i.kind === "prompt")?.version;
assert.equal(livePromptVersion, "2026-10-21-formless-presence-v3");
assert.notEqual(livePromptVersion, FORMLESS_PLAN_PROMPT_VERSION);
const credits = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
assert.ok(credits.ok); const { data } = await credits.json();
const catalog = await fetch("https://visibible.com/api/image-models");
assert.ok(catalog.ok); const publicCatalog = await catalog.json();
assert.ok(publicCatalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
const models = await fetch("https://openrouter.ai/api/v1/models");
assert.ok(models.ok); const modelCatalog = await models.json();
const textModel = modelCatalog.data.find((m: { id: string }) => m.id === json("plan.json").textModel);
assert.ok(textModel && Number(textModel.pricing.prompt) === 0.1e-6 && Number(textModel.pricing.completion) === 0.5e-6);
const result = { at: new Date().toISOString(), phase, sourceFiles: sources(), status, records,
  balanceUsd: data.total_credits - data.total_usage, publicCatalog, textModel, livePlanPromptVersion: livePromptVersion,
  localPlanPromptVersion: FORMLESS_PLAN_PROMPT_VERSION, packetAssemblySkipped: "The current repository marker would invalidate the live v3 plan; this run permits only local planning.",
  retainedBaseline: { file: "../2026-10-22-daniel-structured-candidate/after.json", sha256: hash(fs.readFileSync(priorFile)), packets: 3, assembledThisRun: false },
  paidCalls: 0, productionMutations: 0, publicActivation: false };
if (phase === "after") {
  const before = json("before.json");
  assert.deepEqual(result.records, before.records); assert.deepEqual(result.sourceFiles, before.sourceFiles);
}
save(`${phase}.json`, result);
console.log(JSON.stringify({ phase, scopedRecords: records.length, balanceUsd: result.balanceUsd, packetAssembly: false, paidCalls: 0, productionMutations: 0 }));
