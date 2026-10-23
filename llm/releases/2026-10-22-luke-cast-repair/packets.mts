/** Read-only assembly from the actual prepared records; no cache overlay, model call or image generation. */
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
import { dir, root, json, hash, sources } from "./inspect.mjs";

assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
assert.equal(env.GENERIC_ENGINE_MODE, "disabled"); assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
assert.equal(env.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com"); assert.ok(env.CONVEX_SERVER_SECRET);
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const snapshot = json("final.json"); assert.deepEqual(sources(), snapshot.sources);
assert.ok(Date.now() - Date.parse(snapshot.at) < 30 * 60_000);
for (const r of snapshot.records) assert.deepEqual(await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: r.kind, recordId: r.recordId }), r.record);
const forbidden = async (): Promise<never> => { throw Error("Read-only assembly forbids preparation and mutations"); };
const store: PreparationStore = {
  getActiveRecord: async (kind, recordId) => structuredClone(snapshot.records.find((r: { kind: string; recordId: string }) => r.kind === kind && r.recordId === recordId)?.record as AnalysisRecord | null ?? null),
  putDerivedRecord: forbidden, claim: forbidden, release: forbidden, recordSpend: forbidden,
};
const inputs = await readWorkInputs("bible-web", root);
const referenceReads: unknown[] = [], packets = [];
for (const unitId of json("plan.json").textOrder) {
  if (!fs.existsSync(path.join(dir, `scene-${unitId}.json`))) continue;
  if (!json(`scene-${unitId}.json`).result) continue;
  for (const styleId of ["classical", "watercolor", "icon"]) {
    const skipped: unknown[] = [], unavailable: unknown[] = [];
    const result = await assembleRendering({ inputs, store, listMoments: async () => [], model: { id: "forbidden", complete: forbidden },
      getReference: async (kind, recordId) => {
        const record = await client.query(api.analysis.getReference, { workId: "bible-web", kind, recordId });
        referenceReads.push({ kind, recordId, record }); return record as ReferenceRecord | null;
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
    assert.deepEqual(result.prepared.plan, json(`scene-${unitId}.json`).result.plan);
    const { sentReferences, ...packet } = result;
    packets.push({ unitId, styleId, textVerdict: json(`review-${unitId}.json`).verdict, ...packet, sentReferences: sentReferences.map(({ storageId, bytes }) => ({ storageId, bytes: bytes.length, sha256: hash(bytes) })), skipped, unavailable });
  }
}
fs.writeFileSync(path.join(dir, "packets.json"), JSON.stringify({ at: new Date().toISOString(), packets, referenceReads, paidCalls: 0, productionMutations: 0, imagesGenerated: 0, releaseAccepted: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ packets: packets.length, paidCalls: 0, productionMutations: 0, imagesGenerated: 0 }));
