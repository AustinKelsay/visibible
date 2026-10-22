/** Read-only assembly of both actual prepared moments; no model calls, overlays or mutations. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { assembleRendering, type ReferenceRecord } from "../../../src/lib/engine/assemble";
import type { AnalysisRecord, PreparationStore } from "../../../src/lib/engine/preparation";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { dir, root, json, hash, sources } from "./run.mjs";

assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE && process.env.VISIBIBLE_CURRENT_ENV_FILE);
const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
const current = parseEnv(fs.readFileSync(process.env.VISIBIBLE_CURRENT_ENV_FILE, "utf8"));
for (const config of [env, current]) {
  assert.equal(config.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!config.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  assert.equal(config.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com");
}
assert.ok(env.CONVEX_SERVER_SECRET);
assert.ok(env.NEXT_PUBLIC_CONVEX_URL);
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const snapshot = json("after-10.json"); assert.deepEqual(sources(), snapshot.sources);
assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
for (const r of snapshot.records) assert.deepEqual(await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: r.kind, recordId: r.recordId }), r.record);
const forbidden = async (): Promise<never> => { throw Error("Read-only assembly forbids preparation and mutations"); };
const store: PreparationStore = {
  getActiveRecord: async (kind, recordId) => structuredClone(snapshot.records.find((r: { kind: string; recordId: string }) => r.kind === kind && r.recordId === recordId)?.record as AnalysisRecord | null ?? null),
  putDerivedRecord: forbidden, claim: forbidden, release: forbidden, recordSpend: forbidden,
};
const inputs = await readWorkInputs("bible-web", root);
const referenceReads: unknown[] = [], packets = [];
for (const unitId of ["daniel-7-9", "daniel-7-10"]) for (const styleId of ["classical", "watercolor", "icon"]) {
  const skipped: unknown[] = [], unavailable: unknown[] = [];
  const result = await assembleRendering({ inputs, store, listMoments: async () => [], model: { id: "forbidden", complete: forbidden },
    getReference: async (kind, recordId) => {
      const record = await client.query(api.analysis.getReference, { workId: "bible-web", kind, recordId });
      referenceReads.push({ unitId, styleId, kind, recordId, record }); return record as ReferenceRecord | null;
    },
    loadReference: async (storageId) => {
      const located = await client.query(api.analysis.getReferenceBlobUrl, { serverSecret: env.CONVEX_SERVER_SECRET!, storageId: storageId as never });
      assert.ok(located?.url); const response = await fetch(located.url, { signal: AbortSignal.timeout(10_000) }); assert.ok(response.ok);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return located.contentType === "image/jpeg" ? bytes : new Uint8Array(await sharp(bytes).jpeg({ quality: 88 }).toBuffer());
    },
    onReferenceSkipped: (kind, id, reason) => skipped.push({ kind, id, reason }),
    onReferenceUnavailable: (kind, id, error) => unavailable.push({ kind, id, error: String(error) }),
  }, { workId: "bible-web", unitId, styleId, variationNumber: null, aspectRatio: "16:9" });
  assert.ok(result.ok, JSON.stringify(result)); assert.equal(result.prepared.calls, 0);
  assert.ok(result.canon.some((c) => c.entryId === "ministering_assembly_in_daniels_vision"));
  assert.ok(result.canon.some((c) => c.entryId === "the_ancient_of_days" && !c.hasForm));
  assert.ok(!result.references.some((r) => r.kind === "sheet" && r.entryId === "the_ancient_of_days"));
  const { sentReferences, ...packet } = result;
  packets.push({ unitId, styleId, ...packet, sentReferences: sentReferences.map(({ storageId, bytes }) => ({ storageId, bytes: bytes.length, sha256: hash(bytes) })), skipped, unavailable });
}
fs.writeFileSync(path.join(dir, "packets.json"), JSON.stringify({ at: new Date().toISOString(), packets, referenceReads, paidCalls: 0, productionMutations: 0, imagesGenerated: 0, releaseAccepted: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ packets: packets.length, paidCalls: 0, productionMutations: 0, imagesGenerated: 0 }));
