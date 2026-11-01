/** After the run: one contact sheet of every shown image in a three-column grid, plus thumbnails. Offline; no paid calls. */
import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { blobs, dir, json, root } from "./common.mjs";

const plan = json("plan.json"), cases = plan.cases as Array<{ id: string; reference: string }>;
const rows = fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.outcome === "image");
const W = 400, H = 225, LABEL = 24, PAD = 6, COLS = 3, thumbs = path.join(dir, "thumbs");
fs.mkdirSync(thumbs, { recursive: true });
const composites: OverlayOptions[] = [];
const header = (text: string) => Buffer.from(`<svg width="${W}" height="${LABEL}"><rect width="${W}" height="${LABEL}" fill="#202020"/><text x="6" y="17" fill="white" font-size="13" font-family="sans-serif">${text.replaceAll("&", "&amp;")}</text></svg>`);
let i = 0;
for (const c of cases) {
  const row = rows.find((r) => r.case === c.id);
  const left = (i % COLS) * (W + PAD), top = Math.floor(i / COLS) * (H + LABEL + PAD); i++;
  composites.push({ input: header(`${c.reference}${row ? (row.attempts.length === 2 ? ` · retry, shown #${row.chosen}` : "") : " · none"}`), left, top });
  if (!row) continue;
  const chosen = row.attempts[row.chosen - 1];
  const thumb = await sharp(path.join(root, chosen.file)).resize(W, H, { fit: "contain", background: "#303030" }).jpeg({ quality: 88 }).toBuffer();
  fs.writeFileSync(path.join(thumbs, `${c.id}.jpg`), thumb);
  composites.push({ input: thumb, left, top: top + LABEL });
}
const gridRows = Math.ceil(cases.length / COLS);
await sharp({ create: { width: COLS * (W + PAD) - PAD, height: gridRows * (H + LABEL + PAD) - PAD, channels: 3, background: "#303030" } }).composite(composites).jpeg({ quality: 90 }).toFile(path.join(dir, "contact-sheet.jpg"));
console.log(JSON.stringify({ shown: rows.length, thumbs: fs.readdirSync(thumbs).length, paidCalls: 0 }));
