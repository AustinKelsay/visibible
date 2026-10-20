/**
 * Derive works/bible-web/hints.json from the two Bible reference datasets (#169):
 * per-book story-section targets from Clear.Bible's pericope table, and the name forms that
 * STEPBible TIPNR attributes to two or more distinct individuals or places within one book.
 * Neither dataset is read at image time. Both are CC BY 4.0 and credited on /about.
 *
 *   npm run works:bible-hints -- <pericopes_eng_BSB.tsv> <TIPNR.txt>
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createWorkReader } from "@/lib/work-input";

const [pericopesPath, tipnrPath] = process.argv.slice(2);
if (!pericopesPath || !tipnrPath) throw new Error("Usage: npm run works:bible-hints -- <pericopes.tsv> <tipnr.txt>");
const root = fileURLToPath(new URL("../../", import.meta.url));
const work = createWorkReader(JSON.parse(await readFile(path.join(root, "works/bible-web/work.json"), "utf8")));
const books = work.work.divisions.map((d) => ({ key: d.key, label: d.label }));

const TIPNR_CODES: Record<string, string> = {
  Genesis: "Gen", Exodus: "Exo", Leviticus: "Lev", Numbers: "Num", Deuteronomy: "Deu", Joshua: "Jos", Judges: "Jdg", Ruth: "Rut",
  "1 Samuel": "1Sa", "2 Samuel": "2Sa", "1 Kings": "1Ki", "2 Kings": "2Ki", "1 Chronicles": "1Ch", "2 Chronicles": "2Ch", Ezra: "Ezr",
  Nehemiah: "Neh", Esther: "Est", Job: "Job", Psalms: "Psa", Proverbs: "Pro", Ecclesiastes: "Ecc", "Song of Solomon": "Sng", Isaiah: "Isa",
  Jeremiah: "Jer", Lamentations: "Lam", Ezekiel: "Ezk", Daniel: "Dan", Hosea: "Hos", Joel: "Jol", Amos: "Amo", Obadiah: "Oba", Jonah: "Jon",
  Micah: "Mic", Nahum: "Nam", Habakkuk: "Hab", Zephaniah: "Zep", Haggai: "Hag", Zechariah: "Zec", Malachi: "Mal", Matthew: "Mat", Mark: "Mrk",
  Luke: "Luk", John: "Jhn", Acts: "Act", Romans: "Rom", "1 Corinthians": "1Co", "2 Corinthians": "2Co", Galatians: "Gal", Ephesians: "Eph",
  Philippians: "Php", Colossians: "Col", "1 Thessalonians": "1Th", "2 Thessalonians": "2Th", "1 Timothy": "1Ti", "2 Timothy": "2Ti", Titus: "Tit",
  Philemon: "Phm", Hebrews: "Heb", James: "Jas", "1 Peter": "1Pe", "2 Peter": "2Pe", "1 John": "1Jn", "2 John": "2Jn", "3 John": "3Jn", Jude: "Jud", Revelation: "Rev",
};
const keyByCode = new Map(books.map((b) => [TIPNR_CODES[b.label], b.key]));

// Clear.Bible pericopes: startid/endid/title with a two-digit book number prefix in canon order.
const counts = new Map<number, number>();
for (const line of (await readFile(pericopesPath, "utf8")).split("\n").slice(1)) {
  const [start] = line.split("\t");
  if (!start?.trim()) continue;
  const book = Number(start.slice(0, 2));
  counts.set(book, (counts.get(book) ?? 0) + 1);
}
const sectionTargets: Record<string, number> = {};
for (const [index, book] of books.entries()) {
  const n = counts.get(index + 1);
  if (n) sectionTargets[book.key] = n;
}

// TIPNR: people and places with their name forms and the books they occur in.
const SIGS = new Set(["– Named", "– Spelled", "– Greek", "– Aramaic", "– Name combined", "– (same form with Variant)", "– (same ref[s] with Variant)", "– (same form with alt. meaning)", "– (same ref[s] with alt Tags)"]);
const entities = new Map<string, { forms: Set<string>; books: Set<string>; kind: "person" | "place" }>();
let section: string | null = null;
let current: string | null = null;
for (const line of (await readFile(tipnrPath, "utf8")).split("\n")) {
  if (line.startsWith("$==========")) { section = line.split("\t")[0].replace("$==========", "").trim(); current = "HEADER"; continue; }
  if (current === "HEADER") {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    const type = fields[8]?.trim() ?? "";
    const uid = fields[0].trim();
    if ((section === "PERSON(s)" && (type === "Male" || type === "Female")) || (section === "PLACE" && type === "Place")) {
      current = uid;
      entities.set(uid, { forms: new Set(), books: new Set(), kind: section === "PLACE" ? "place" : "person" });
    } else current = null;
    continue;
  }
  if (!current || current === "HEADER" || !line.startsWith("– ")) continue;
  const fields = line.split("\t");
  if (!SIGS.has(fields[0])) continue;
  const entity = entities.get(current)!;
  entity.forms.add(fields[1].split("@")[0].split("|")[0].replace(/_/g, " ").toLowerCase());
  for (const chunk of (fields[3] ?? "").split(";")) {
    const name = chunk.split("=")[0].trim().toLowerCase();
    if (name && !["he", "him", "she", "her", "they", "his"].includes(name)) entity.forms.add(name);
  }
  for (const ref of (fields[4] ?? "").split(";")) {
    const match = ref.trim().match(/^(\w+)\.(\d+)\.(\d+)[a-z]?$/);
    if (match) entity.books.add(match[1]);
  }
}
// People and places are counted apart: a person and a place sharing a name are not two individuals.
const byForm = new Map<string, Set<string>>();
for (const [uid, entity] of entities) for (const form of entity.forms) {
  const key = `${entity.kind}:${form}`;
  byForm.set(key, (byForm.get(key) ?? new Set()).add(uid));
}
const sameNames: Record<string, { individuals: number; kind: string; byBook: Record<string, number> }> = {};
for (const [key, uids] of [...byForm].sort()) {
  const form = key.slice(key.indexOf(":") + 1);
  if (uids.size < 2 || !/^[a-z][a-z' -]*$/.test(form) || sameNames[form]) continue;
  const perBook = new Map<string, number>();
  for (const uid of uids) for (const code of entities.get(uid)!.books) {
    const key = keyByCode.get(code);
    if (key) perBook.set(key, (perBook.get(key) ?? 0) + 1);
  }
  const multi = Object.fromEntries([...perBook].filter(([, n]) => n >= 2).sort());
  if (Object.keys(multi).length) sameNames[form] = { individuals: uids.size, kind: entities.get([...uids][0])!.kind, byBook: multi };
}
const hints = {
  schemaVersion: 1, workId: "bible-web",
  sources: [
    { name: "Clear.Bible pericopes (BSB)", use: "target story-section count per book", license: "CC BY 4.0", source: "https://github.com/Clear-Bible/pericopes" },
    { name: "STEPBible TIPNR", use: "same-name individuals and places per book, as merge hints", license: "CC BY 4.0", source: "https://github.com/STEPBible/STEPBible-Data" },
  ],
  sectionTargets, sameNames,
};
const out = path.join(root, "works/bible-web/hints.json");
await writeFile(out, JSON.stringify(hints, null, 1) + "\n");
console.log(`wrote ${path.relative(root, out)}: ${Object.keys(sectionTargets).length} section targets, ${Object.keys(sameNames).length} same-name forms`);
