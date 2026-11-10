// Restage Alice's active generation unchanged against a corrected brief (no model calls).
// Generated records are copied as they are; owner versions carry forward on activation by id.
//   node llm/releases/2026-11-10-alice-court-fix/restage-alice.mjs <newBriefSha> [--execute]
// Needs NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET; writes alice-gen-records.json in the working directory.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { ConvexHttpClient } = require("convex/browser");
const { anyApi } = require("convex/server");
const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const serverSecret = process.env.CONVEX_SERVER_SECRET;
const workId = "alice-in-wonderland";
const [briefVersion, flag] = process.argv.slice(2);
if (!/^[0-9a-f]{64}$/.test(briefVersion ?? "")) throw new Error("brief sha256 required");

const status = await c.query(anyApi.analysis.getWorkStatus, { workId });
console.log(JSON.stringify({ ready: status.ready, active: status.activeGeneration, candidate: status.candidateGeneration, brief: status.briefVersion?.slice(0, 12), reasons: status.reasons }));
const generation = status.activeGeneration;
const records = [];
let owners = 0;
for (const kind of ["entry", "section", "moment"]) {
  let cursor = null;
  do {
    const page = await c.query(anyApi.analysis.listActiveRecordsPage, { workId, generation, kind, cursor });
    for (const r of page.records) {
      let generated = r;
      if (r.source !== "generated") {
        owners++;
        const history = await c.query(anyApi.analysis.listRecordHistory, { workId, kind, recordId: r.recordId });
        const g = history.find((h) => h.generation === generation && h.source === "generated");
        if (!g) throw new Error(`${kind} ${r.recordId}: no generated version in generation ${generation}`);
        generated = await c.query(anyApi.analysis.getRecordVersion, { workId, generation, kind, recordId: r.recordId, version: g.version });
      }
      records.push({ kind, recordId: generated.recordId, payload: generated.payload, inputs: generated.inputs ?? [], version: generated.version });
    }
    cursor = page.nextCursor;
  } while (cursor);
}
const counts = records.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
console.log(`generation ${generation}: ${records.length} records ${JSON.stringify(counts)}, ${owners} owner-edited (their generated versions copied)`);
writeFileSync("alice-gen-records.json", JSON.stringify(records));
if (flag !== "--execute") process.exit(0);

await c.mutation(anyApi.analysis.registerWork, { serverSecret, workId, workVersion: status.workVersion, briefVersion });
const { generation: next } = await c.mutation(anyApi.analysis.stageGeneration, {
  serverSecret, workId, workVersion: status.workVersion, briefVersion,
  note: `generation ${generation} restaged unchanged against the corrected card rule (brief ${briefVersion.slice(0, 12)}); no canon redrafted`,
});
console.log(`staged generation ${next}`);
const put = (batch) => c.mutation(anyApi.analysis.putRecords, { serverSecret, workId, generation: next, records: batch.map(({ kind, recordId, payload, inputs }) => ({ kind, recordId, payload, inputs })) });
for (const kind of ["entry", "section", "moment"]) {
  const ofKind = records.filter((r) => r.kind === kind);
  for (let i = 0; i < ofKind.length; i += 50) {
    const { versions } = await put(ofKind.slice(i, i + 50));
    for (const v of versions) {
      const want = records.find((r) => r.kind === v.kind && r.recordId === v.recordId).version;
      if (v.version !== want) throw new Error(`${v.kind} ${v.recordId}: version ${v.version} != ${want}`);
    }
  }
}
const result = await c.mutation(anyApi.analysis.activateGeneration, { serverSecret, workId, generation: next });
console.log(`activated ${result.generation}; carried ${result.carriedOwnerVersions.length}, unmatched ${result.unmatchedOwnerVersions.length}: ${result.unmatchedOwnerVersions.join(", ")}`);
const after = await c.query(anyApi.analysis.getWorkStatus, { workId });
console.log(JSON.stringify({ ready: after.ready, active: after.activeGeneration, brief: after.briefVersion?.slice(0, 12), reasons: after.reasons }));
