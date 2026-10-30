/** One read-only production snapshot for the symbol-mode check: case records, both entries and the references production would offer. No paid calls or writes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import type { AnalysisRecord } from "../../../src/lib/engine/preparation";
import { blobs, dir, hash, json, readEnvironment, root, save } from "./common.mjs";

assert.ok(!fs.existsSync(path.join(dir, "snapshot.json")), "Keep the first snapshot");
const env = readEnvironment();
assert.ok(env.CONVEX_SERVER_SECRET);
const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL!);
const plan = json("plan.json"), inputs = await readWorkInputs("bible-web", root);
const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
assert.ok(status.ready && status.activeGeneration === 1);
assert.equal(status.workVersion, inputs.workVersion); assert.equal(status.briefVersion, inputs.briefVersion);
let queries = 1;
const records: Record<string, AnalysisRecord> = {}, references: Record<string, unknown> = {}, files: Record<string, { sha256: string; bytes: number; contentType: string | null }> = {};
const get = async (kind: string, recordId: string) => {
  const key = `${kind}:${recordId}`;
  if (!records[key]) { queries++; const r = await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: kind as never, recordId }); assert.ok(r, `Missing ${key}`); records[key] = r as AnalysisRecord; }
  return records[key];
};
fs.mkdirSync(path.join(blobs, "references"), { recursive: true });
const reference = async (kind: "sheet" | "styleReference", recordId: string) => {
  const key = `${kind}:${recordId}`;
  if (key in references) return;
  queries++;
  const record = await client.query(api.analysis.getReference, { workId: "bible-web", kind, recordId }) as { storageId: string } | null;
  references[key] = record;
  if (!record || files[record.storageId]) return;
  queries++;
  const located = await client.query(api.analysis.getReferenceBlobUrl, { serverSecret: env.CONVEX_SERVER_SECRET!, storageId: record.storageId as never });
  assert.ok(located?.url, `Reference blob ${record.storageId} is missing`);
  const response = await fetch(located.url, { signal: AbortSignal.timeout(20_000) }); assert.ok(response.ok);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if ((located.contentType ?? "") !== "image/jpeg") { const sharp = (await import("sharp")).default; bytes = new Uint8Array(await sharp(Buffer.from(bytes)).jpeg({ quality: 88 }).toBuffer()); }
  fs.writeFileSync(path.join(blobs, "references", `${record.storageId}.jpg`), bytes);
  files[record.storageId] = { sha256: hash(bytes), bytes: bytes.length, contentType: located.contentType ?? null };
};
for (const style of plan.styles as string[]) await reference("styleReference", style);
const cases = [];
for (const c of plan.cases) {
  const moment = await get("moment", c.id);
  assert.equal(moment.payload.firstUnit, c.id); assert.equal(moment.payload.lastUnit, c.id);
  const section = await get("section", String(moment.payload.sectionId));
  const cast = section.payload.cast as Array<{ entryId: string; stageId: string }>;
  for (const member of cast) { await get("entry", member.entryId); await reference("sheet", `${member.entryId}:${member.stageId}`); }
  assert.ok(cast.some((m) => m.entryId === c.entry), `${c.id}: its section does not cast ${c.entry}`);
  cases.push({ id: c.id, sectionId: section.recordId, cast: cast.map((m) => `${m.entryId}:${m.stageId}`) });
}
// Both entries are subjects without form in production; the symbol arm changes only that.
for (const id of plan.entries as string[]) { const entry = await get("entry", id); assert.equal(entry.payload.hasForm, false, `${id} is not without form`); assert.equal(entry.payload.depiction, undefined); }
save("snapshot.json", { at: new Date().toISOString(), status, cases, records, references, files, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 });
console.log(JSON.stringify({ cases: cases.length, records: Object.keys(records).length, references: Object.values(references).filter(Boolean).length, missingReferences: Object.entries(references).filter(([, r]) => !r).map(([k]) => k), readOnlyProductionQueries: queries, productionMutations: 0 }));
