/** Read-only preflight; this script never authorizes or makes a paid call. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { packetProvider, hash, requirePresence } from "../2026-10-21-daniel-schema-pilot/packets.mjs";
import { assembleForEval } from "../../../src/lib/image-evals/generic";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const phase = process.argv[2];
assert.ok(phase === "before" || phase === "after", "Pass before or after");
const output = path.join(dir, `${phase}.json`);
assert.ok(!fs.existsSync(output), "Snapshot already exists; no overwrite");
const envFile = process.env.VISIBIBLE_EVAL_ENV_FILE;
assert.ok(envFile, "Private production environment file required");
const env = parseEnv(fs.readFileSync(envFile, "utf8"));
assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
for (const key of ["NEXT_PUBLIC_CONVEX_URL", "CONVEX_SERVER_SECRET", "OPENROUTER_API_KEY"]) assert.ok(env[key], `Missing ${key}`);
const nativeFetch = globalThis.fetch;
let paidCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/chat/completions") || url.includes("/api/mutation") || url.includes("/api/action")) {
    paidCalls++;
    throw new Error("Preflight forbids paid calls and mutations");
  }
  return nativeFetch(input, init);
};
const model = { id: "forbidden", complete: async () => { throw new Error("No preparation permitted"); } };
const liveEnv = { NEXT_PUBLIC_CONVEX_URL: env.NEXT_PUBLIC_CONVEX_URL!, CONVEX_SERVER_SECRET: env.CONVEX_SERVER_SECRET!, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY! };
try {
  const client = new ConvexHttpClient(liveEnv.NEXT_PUBLIC_CONVEX_URL);
  const prior = JSON.parse(fs.readFileSync(`${root}/llm/releases/2026-10-21-daniel-schema-pilot/after.json`, "utf8"));
  const records = [];
  for (const record of prior.records) {
    const current = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: record.kind, recordId: record.recordId });
    assert.deepEqual(current, record, `Retained ${record.kind}/${record.recordId} changed`);
    records.push(current);
  }
  const provider = await packetProvider(liveEnv, model);
  const context = await provider.context("bible-web");
  const packets = [];
  for (const styleId of ["watercolor", "icon"]) {
    for (let n = 1; n <= 3; n++) {
      const pair = [];
      for (const omitStyleReference of [false, true]) {
        const assembled = await assembleForEval(provider, context, { workId: "bible-web", unitId: "daniel-7-9", styleId, variationNumber: n > 1 ? n : null, modelId: "google/gemini-3.1-flash-lite-image", aspectRatio: "16:9", resolution: "1K", preparationEstimateUsd: 0.0005, omitStyleReference });
        assert.ok(assembled.result.ok);
        const a = assembled.result;
        const packet = { styleId, n, omitStyleReference, preparationCalls: assembled.preparationCalls, preparationCostUsd: assembled.preparationCostUsd, preparationUsageMissing: assembled.preparationUsageMissing, quote: assembled.quote, prompt: a.prompt, promptSha256: hash(a.prompt), packet: a.packet, context: a.context, prepared: a.prepared, canon: a.canon, references: a.sentReferences.map((r) => ({ storageId: r.storageId, bytes: r.bytes.length, sha256: hash(r.bytes) })) };
        requirePresence(packet);
        assert.equal(packet.preparationCalls, 0);
        assert.equal(packet.packet.planVersion, "8cd89ee4aad16a597882ff9ccf05f0f0");
        assert.equal(packet.references.length, omitStyleReference ? 0 : 1);
        if (!omitStyleReference) assert.equal(packet.packet.references[0].kind, "styleReference");
        pair.push(packet);
        packets.push(packet);
      }
      assert.equal(pair[1].prompt, pair[0].prompt.replace(/\n\nREFERENCE IMAGES[\s\S]*?(?=\n\n)/, ""));
      assert.deepEqual(pair[1].prepared, pair[0].prepared);
      assert.deepEqual(pair[1].canon, pair[0].canon);
      assert.deepEqual(pair[1].context, pair[0].context);
      assert.deepEqual(pair[1].packet.flags, { ...pair[0].packet.flags, omitStyleReference: true });
    }
  }
  const balanceResponse = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${liveEnv.OPENROUTER_API_KEY}` } });
  assert.ok(balanceResponse.ok);
  const { data } = await balanceResponse.json();
  const catalogResponse = await fetch("https://visibible.com/api/image-models");
  assert.ok(catalogResponse.ok);
  const publicCatalog = await catalogResponse.json();
  assert.ok(publicCatalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
  assert.equal(paidCalls, 0);
  const result = { phase, sourceFiles: Object.fromEntries(["src/lib/engine/preparation.ts", "src/lib/engine/prompt.ts", "src/lib/engine/assemble.ts", "src/lib/image-evals/generic.ts", "src/lib/image-evals/runner.ts", "src/lib/image-evals/adapters.ts", "styles/watercolor.json", "styles/icon.json", "works/bible-web/work.json", "works/bible-web/brief.json", "llm/releases/2026-10-21-reference-comparison/run.mts", "llm/releases/2026-10-21-reference-comparison/preflight.mts"].map((file) => [file, hash(fs.readFileSync(path.join(root, file)))])), at: new Date().toISOString(), authorizationPending: false, paidCalls: 0, mutations: 0, newImages: 0, proposedCombinedCapUsd: 0.50, estimatedUsd: 0.432, evaluationAuthorizedUsd: 16.50, evaluationMeasuredUsd: 15.88858840, evaluationUncertaintyUsd: 0.045, evaluationRemainingBeforeUsd: 0.56641160, additionalAuthorizationUsd: 0.50, balanceUsd: data.total_credits - data.total_usage, records, publicCatalog, packets };
  if (phase === "after") {
    const before = JSON.parse(fs.readFileSync(path.join(dir, "before.json"), "utf8"));
    assert.deepEqual(result.records, before.records);
    assert.deepEqual(result.packets, before.packets);
    assert.deepEqual(result.sourceFiles, before.sourceFiles);
  }
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, at: result.at, packets: packets.length, unchangedRecords: records.length, paidCalls: 0, mutations: 0, authorizationPending: false, publicStyles: publicCatalog.artStyles.map((s: {id:string;available:boolean}) => ({ id: s.id, available: s.available })), versions: packets.filter((p) => p.n === 1).map((p) => ({ styleId: p.styleId, omitted: p.omitStyleReference, plan: p.packet.planVersion, look: p.packet.lookVersion, style: p.packet.styleVersion, references: p.references })) }));
} finally {
  globalThis.fetch = nativeFetch;
}
