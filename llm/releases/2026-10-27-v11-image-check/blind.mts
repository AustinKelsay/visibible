/** Copy every generated image under a shuffled opaque name with only the verse and scene needed to judge it. */
import fs from "node:fs";
import path from "node:path";
import { blobs, dir, hash, json, root, save } from "./common.mjs";

const rows = fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const images = rows.filter((r) => r.outcome === "image");
const prepared = Object.fromEntries(rows.filter((r) => r.prepared).map((r) => [r.case, r.prepared]));
const snapshot = json("snapshot.json");
let a = 2026102731 >>> 0;
const random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = images.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [images[i], images[j]] = [images[j], images[i]]; }
const out = path.join(blobs, "blind");
fs.mkdirSync(out, { recursive: true });
const key: Record<string, string> = {}, packet = images.map((row, i) => {
  const id = `img${String(i + 1).padStart(2, "0")}`; key[id] = row.key;
  const file = path.join(out, `${id}${path.extname(row.image.file)}`);
  fs.copyFileSync(path.join(root, row.image.file), file);
  const p = prepared[row.case], moment = snapshot.records[`moment:${row.case}`];
  const cast = (snapshot.records[`section:${moment.payload.sectionId}`].payload.cast as Array<{ entryId: string }>).map(({ entryId }) => {
    const e = snapshot.records[`entry:${entryId}`].payload; return { entryId, name: e.name, kind: e.entryKind, hasForm: e.hasForm !== false };
  });
  return { id, file: path.relative(root, file), sha256: hash(fs.readFileSync(file)), verse: row.case, selected: p.present.map((x: { entryId: string }) => x.entryId), availableCast: cast, scene: p.plan, conditions: p.situation };
});
save("blind-images.json", { masking: "Style and control labels omitted; style is visible in the image. Two independent model scorers, operator adjudication; not human acceptance.", packet });
save("blind-key.json", key);
console.log(JSON.stringify({ images: packet.length, dir: path.relative(root, out) }));
