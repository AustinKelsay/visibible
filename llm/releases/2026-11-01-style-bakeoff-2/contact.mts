/** After the run: one contact sheet of every shown image (rows = cases, columns = candidate styles) and thumbnails. Offline; no paid calls. */
import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { blobs, dir, json, root } from "./common.mjs";

const plan = json("plan.json"), styles = plan.styles as string[], cases = plan.cases as Array<{ id: string; reference: string }>;
const rows = fs.readFileSync(path.join(dir, "results.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.outcome === "image");
const W = 400, H = 225, LABEL = 24, PAD = 6, thumbs = path.join(dir, "thumbs");
fs.mkdirSync(thumbs, { recursive: true });
const composites: OverlayOptions[] = [];
const header = (text: string, width: number) => Buffer.from(`<svg width="${width}" height="${LABEL}"><rect width="${width}" height="${LABEL}" fill="#202020"/><text x="6" y="17" fill="white" font-size="13" font-family="sans-serif">${text.replaceAll("&", "&amp;")}</text></svg>`);
for (const [ci, c] of cases.entries()) {
  for (const [si, style] of styles.entries()) {
    const row = rows.find((r) => r.case === c.id && r.style === style);
    const left = si * (W + PAD), top = ci * (H + LABEL + PAD);
    const label = `${c.reference} · ${style}${row ? (row.attempts.length === 2 ? ` · retry, shown #${row.chosen}` : "") : " · none"}`;
    composites.push({ input: header(label, W), left, top });
    if (!row) continue;
    const chosen = row.attempts[row.chosen - 1];
    const thumb = await sharp(path.join(root, chosen.file)).resize(W, H, { fit: "contain", background: "#303030" }).jpeg({ quality: 88 }).toBuffer();
    fs.writeFileSync(path.join(thumbs, `${c.id}__${style}.jpg`), thumb);
    composites.push({ input: thumb, left, top: top + LABEL });
  }
}
await sharp({ create: { width: styles.length * (W + PAD) - PAD, height: cases.length * (H + LABEL + PAD) - PAD, channels: 3, background: "#303030" } }).composite(composites).jpeg({ quality: 90 }).toFile(path.join(dir, "contact-sheet.jpg"));
console.log(JSON.stringify({ shown: rows.length, thumbs: fs.readdirSync(thumbs).length, paidCalls: 0 }));
