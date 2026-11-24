/**
 * Scratch harness for the told-events climb. Builds each case's real lean prompt from production's Bible analysis
 * (public reads, nothing paid) with the checkout's lean.ts, Classical style, 16:9.
 *   npx tsx evals/images/runs/told/build.mts <out.json> [--refs]   (--refs downloads the attached reference bytes)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ConvexHttpClient } from "convex/browser";
import { assembleLean } from "@/lib/engine/lean-assemble";
import { readWorkInputs } from "@/lib/engine/work-inputs";

const { api } = createRequire(import.meta.url)("../../../../convex/_generated/api") as typeof import("../../../../convex/_generated/api");
const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2];
const withRefs = process.argv.includes("--refs");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const client = new ConvexHttpClient("https://unique-impala-244.convex.cloud");
const workId = "bible-web";
const inputs = await readWorkInputs(workId);
const cases = (JSON.parse(readFileSync(path.join(here, "cases.json"), "utf8")) as Array<{ unit: string; label: string; note: string }>)
  .filter((c) => !only || only.includes(c.unit));
const refDir = path.join(here, "refs"); mkdirSync(refDir, { recursive: true });
const results = [];
for (const c of cases) {
  const r = await assembleLean({
    inputs,
    getRecord: async (kind, recordId) => await client.query(api.analysis.getActiveRecord, { workId, kind, recordId }) as never,
    listMoments: async () => [],
    getReference: async (kind, recordId) => await client.query(api.analysis.getReference, { workId, kind, recordId }) as never,
    loadReference: async (storageId) => {
      if (!withRefs) return new Uint8Array();
      const file = path.join(refDir, `${storageId}.bin`);
      if (!existsSync(file)) {
        const res = await fetch(`https://unique-impala-244.convex.site/image/${storageId}`);
        if (!res.ok) throw new Error(`ref ${storageId}: ${res.status}`);
        writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
      }
      return new Uint8Array(readFileSync(file));
    },
  }, { workId, unitId: c.unit, styleId: "classical", aspectRatio: "16:9" });
  if (!r.ok) { console.error(c.unit, r.reason, r.message); results.push({ ...c, error: r.message }); continue; }
  results.push({ ...c, reference: r.context.moment.reference, prompt: r.prompt, refs: r.references.map((x) => x.storageId), present: r.present.map((m) => m.entryId) });
  console.error(c.unit, r.prompt.length, r.references.length);
}
writeFileSync(out, JSON.stringify(results, null, 1));
