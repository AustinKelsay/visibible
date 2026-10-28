/** Fresco matrix: copy every generated image (first attempts and retries) under a shuffled opaque name, in batches for the scorers. */
import fs from "node:fs";
import path from "node:path";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { blobs, dir, hash, json, root, save } from "./common.mjs";

const BATCHES = 3;
const read = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const rows = read("results.ndjson");
const prepared = Object.fromEntries(rows.filter((r) => r.prepared).map((r) => [r.case, r.prepared]));
const snapshot = json("snapshot.json"), inputs = await readWorkInputs("bible-web", root);
const images = rows.filter((r) => r.outcome === "image").flatMap((r) => r.attempts.map((a: { n: number; file: string }) => ({ row: r, attempt: a })));
let a = 2026102895 >>> 0;
const random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = images.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [images[i], images[j]] = [images[j], images[i]]; }
const out = path.join(blobs, "blind");
fs.mkdirSync(out, { recursive: true });
const key: Record<string, { key: string; attempt: number; shown: boolean }> = {};
const packet = images.map(({ row, attempt }, i) => {
  const id = `img${String(i + 1).padStart(3, "0")}`;
  key[id] = { key: row.key, attempt: attempt.n, shown: row.chosen === attempt.n };
  const file = path.join(out, `${id}${path.extname(attempt.file)}`);
  fs.copyFileSync(path.join(root, attempt.file), file);
  const p = prepared[row.case], moment = snapshot.records[`moment:${row.case}`];
  const cast = (snapshot.records[`section:${moment.payload.sectionId}`].payload.cast as Array<{ entryId: string }>).map(({ entryId }) => {
    const e = snapshot.records[`entry:${entryId}`].payload; return { entryId, name: e.name, kind: e.entryKind, hasForm: e.hasForm !== false };
  });
  return { id, batch: (i % BATCHES) + 1, file: path.relative(root, file), sha256: hash(fs.readFileSync(file)), verse: row.case, verseText: inputs.work.getUnit(row.case).text,
    selected: p.present.map((x: { entryId: string }) => x.entryId), availableCast: cast, scene: p.plan, conditions: p.situation };
});
save("blind-images.json", { masking: "Style, attempt and shown labels omitted; style is visible in the image. Batches of about 12 split the images for scorers. Two independent model scorers per batch, operator adjudication; not human acceptance.", packet });
save("blind-key.json", key);
console.log(JSON.stringify({ images: packet.length, batches: BATCHES, dir: path.relative(root, out) }));
