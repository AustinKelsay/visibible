import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { createWorkReader } from "@/lib/work-input";
import { importWeb, importHolmes, importAlice, sha256 } from "./importers";
import footnotes from "../../works/sources/web-footnotes.json";

const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
const root = fileURLToPath(new URL("../../", import.meta.url));
const sources = path.join(root, "works/sources");
const manifest: Record<string, { file: string; sha256: string; bytes: number }> =
  JSON.parse(await readFile(path.join(sources, "manifest.json"), "utf8"));

for (const reading of Object.values(footnotes)) {
  const bytes = gunzipSync(await readFile(path.join(sources, reading.snapshot)));
  if (sha256(bytes) !== reading.sourceNote.sha256) throw new Error(`Footnote snapshot checksum mismatch: ${reading.snapshot}`);
  const anchor = `id="${new URL(reading.sourceNote.source).hash.slice(1)}"`;
  const paragraph = bytes.toString("utf8").split(anchor)[1]?.split("</p>")[0];
  const note = paragraph?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  if (!note?.includes(reading.sourceNote.note) || !reading.sourceNote.note.includes(reading.text)) {
    throw new Error(`Footnote reading does not match its source: ${reading.sourceNote.reference}`);
  }
}

for (const [sourceId, importer] of Object.entries({ web: importWeb, holmes: importHolmes, alice: importAlice })) {
  const entry = manifest[sourceId];
  const bytes = gunzipSync(await readFile(path.join(sources, entry.file)));
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
    throw new Error(`Source checksum/length mismatch: ${sourceId}`);
  }
  const work = importer(bytes.toString("utf8"));
  const reader = createWorkReader(work);
  const json = JSON.stringify(work, null, 2) + "\n";
  if (!values.check) {
    const directory = path.join(root, "works", work.id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "work.json"), json);
  }
  console.log(`${values.check ? "Validated" : "Imported"} ${work.id}: ${reader.units.length} units; work sha256 ${sha256(json)}`);
}
