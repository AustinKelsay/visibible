import { createHash } from "node:crypto";
import { BIBLE_BOOKS } from "@/data/bible-structure";
import { createWorkReader, type WorkDivision, type WorkFile, type WorkUnit } from "@/lib/work-input";
import footnotes from "../../works/sources/web-footnotes.json";

export const sha256 = (source: string | Buffer) => createHash("sha256").update(source).digest("hex");

const WEB_ALIASES: Record<string, string> = {
  SOL: "SNG", EZE: "EZK", JOE: "JOL", NAH: "NAM", MAR: "MRK", JOH: "JHN",
  PHI: "PHP", JAM: "JAS", "1JO": "1JN", "2JO": "2JN", "3JO": "3JN",
};
const DEUTEROCANON = new Set(["TOB", "JDT", "ESG", "WIS", "SIR", "BAR", "1MA", "2MA", "1ES", "PRM", "PSX", "3MA", "4ES", "4MA", "DNG"]);

/** Source-specific import of eBible's classic WEB verse-per-line file. No network I/O. */
export function importWeb(source: string): WorkFile {
  const verses = new Map<string, string>();
  const bookIds = BIBLE_BOOKS.map((book) => book.id);
  const order: string[] = [];
  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^(\S+) ([1-9]\d*):([1-9]\d*) ?(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid WEB source line: ${line.slice(0, 80)}`);
    const [, sourceBook, chapter, verse, text] = match;
    if (DEUTEROCANON.has(sourceBook)) continue;
    const book = Object.hasOwn(WEB_ALIASES, sourceBook) ? WEB_ALIASES[sourceBook] : sourceBook;
    if (!bookIds.includes(book)) throw new Error(`Unknown WEB book: ${sourceBook}`);
    if (order.at(-1) !== book) order.push(book);
    const id = `${book} ${chapter}:${verse}`;
    if (verses.has(id)) throw new Error(`Duplicate WEB verse: ${id}`);
    verses.set(id, text.trim());
  }
  if (order.join(",") !== bookIds.join(",")) throw new Error("WEB book order does not match the app");

  // WEB puts this doxology at 14:24–26 and leaves an empty 16:25 marker.
  // Relocate the three texts intact; do not shift, duplicate or invent any verse.
  if (verses.get("ROM 16:25") !== "" || verses.has("ROM 16:26") || verses.has("ROM 16:27")) {
    throw new Error("Unexpected WEB Romans doxology arrangement");
  }
  for (let offset = 0; offset < 3; offset++) {
    const from = `ROM 14:${24 + offset}`;
    const text = verses.get(from);
    if (!text) throw new Error(`Missing WEB doxology verse: ${from}`);
    verses.set(`ROM 16:${25 + offset}`, text);
    verses.delete(from);
  }

  // Four canonical IDs have no main text in this edition. Use only the pinned
  // WEB footnote readings, with their variant attribution carried into the work.
  const notes = new Map<string, WorkUnit["sourceNote"]>();
  for (const [id, reading] of Object.entries(footnotes)) {
    if (verses.get(id) !== "") throw new Error(`Unexpected WEB footnote-only verse: ${id}`);
    verses.set(id, reading.text);
    notes.set(id, { ...reading.sourceNote, kind: "footnote" });
  }

  const divisions: WorkDivision[] = BIBLE_BOOKS.map((book) => ({
    key: book.slug, label: book.name, level: "Book",
    divisions: book.chapters.map((count, index) => ({
      key: String(index + 1), label: String(index + 1), level: "Chapter",
      units: Array.from({ length: count }, (_, verseIndex) => {
        const id = `${book.id} ${index + 1}:${verseIndex + 1}`;
        const text = verses.get(id);
        if (!text) throw new Error(`Missing or empty WEB verse: ${id}`);
        verses.delete(id);
        const sourceNote = notes.get(id);
        return { number: verseIndex + 1, text, ...(sourceNote ? { sourceNote } : {}) };
      }),
    })),
  }));
  if (verses.size) throw new Error(`Unexpected WEB verses outside the app: ${[...verses.keys()].slice(0, 5).join(", ")}`);
  return createWorkReader({
    schemaVersion: 1, id: "bible-web", title: "The Holy Bible", author: "Various", language: "en",
    referenceText: {
      name: "World English Bible (Classic)",
      source: "https://ebible.org/Scriptures/eng-web_vpl.zip",
      credit: "World English Bible (WEB), public domain, eBible.org. Classic 2020 stable text; 66-book selection with Romans doxology numbering normalized and four explicitly attributed footnote readings.",
      sha256: sha256(source),
    },
    levels: ["Book", "Chapter", "Verse"],
    referenceFormats: { Chapter: "{Book} {Chapter}:{Verse}" },
    momentMode: "unit", divisions,
  }).work;
}

const STORY_TITLES = [
  "A Scandal in Bohemia", "The Red-Headed League", "A Case of Identity",
  "The Boscombe Valley Mystery", "The Five Orange Pips", "The Man with the Twisted Lip",
  "The Adventure of the Blue Carbuncle", "The Adventure of the Speckled Band",
  "The Adventure of the Engineer’s Thumb", "The Adventure of the Noble Bachelor",
  "The Adventure of the Beryl Coronet", "The Adventure of the Copper Beeches",
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const START = "*** START OF THE PROJECT GUTENBERG EBOOK THE ADVENTURES OF SHERLOCK HOLMES ***";
const END = "*** END OF THE PROJECT GUTENBERG EBOOK THE ADVENTURES OF SHERLOCK HOLMES ***";

/** Import the twelve stories, preserving actual part headings and paragraph boundaries. */
export function importHolmes(source: string): WorkFile {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const start = normalized.indexOf(START);
  const end = normalized.indexOf(END);
  if (start < 0 || end < start || normalized.indexOf(START, start + 1) !== -1 || normalized.indexOf(END, end + 1) !== -1) {
    throw new Error("Missing or ambiguous Gutenberg text boundaries");
  }
  const body = normalized.slice(start + START.length, end);
  const headings = [...body.matchAll(/^([IVX]+)\. ([^\n]+)$/gm)];
  if (headings.length !== STORY_TITLES.length) throw new Error("Expected twelve Holmes story headings");
  const divisions: WorkDivision[] = headings.map((heading, index) => {
    const label = STORY_TITLES[index];
    if (heading[1] !== ROMAN[index] || heading[2] !== label.toUpperCase()) {
      throw new Error(`Unexpected Holmes story heading: ${heading[0]}`);
    }
    const key = label.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-");
    const segment = body.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? body.length);
    const paragraphs = segment.split(/\n\s*\n/).map((block) => block.replace(/\s+/g, " ").trim()).filter(Boolean);
    const parts: WorkDivision[] = [];
    let units: WorkUnit[] = [];
    for (const paragraph of paragraphs) {
      // Match a whole paragraph, not a wrapped line ending in the pronoun "I."
      if (/^[IVX]+\.$/.test(paragraph)) {
        const number = parts.length + 1;
        if (paragraph !== `${ROMAN[number - 1]}.` || (parts.length === 0 && units.length > 0)) {
          throw new Error(`Unexpected part heading in ${label}: ${paragraph}`);
        }
        units = [];
        parts.push({ key: String(number), label: ROMAN[number - 1], level: "Part", units });
      } else {
        units.push({ number: units.length + 1, text: paragraph });
      }
    }
    return parts.length
      ? { key, label, level: "Story", divisions: parts }
      : { key, label, level: "Story", units };
  });
  return createWorkReader({
    schemaVersion: 1, id: "holmes-adventures", title: "The Adventures of Sherlock Holmes",
    author: "Arthur Conan Doyle", language: "en",
    referenceText: {
      name: "Project Gutenberg eBook #1661",
      source: "https://www.gutenberg.org/ebooks/1661",
      credit: "Arthur Conan Doyle; Project Gutenberg eBook #1661. Produced by an anonymous Project Gutenberg volunteer and Jose Menendez. Public domain in the USA; full source and Gutenberg license retained.",
      sha256: sha256(source),
    },
    levels: ["Story", "Part", "Paragraph"],
    referenceFormats: { Story: "{Story} ¶{Paragraph}", Part: "{Story}, Part {Part} ¶{Paragraph}" },
    momentMode: "reading-pass", divisions,
  }).work;
}

const ALICE_CHAPTERS = [
  "Down the Rabbit-Hole", "The Pool of Tears", "A Caucus-Race and a Long Tale",
  "The Rabbit Sends in a Little Bill", "Advice from a Caterpillar", "Pig and Pepper",
  "A Mad Tea-Party", "The Queen’s Croquet-Ground", "The Mock Turtle’s Story",
  "The Lobster Quadrille", "Who Stole the Tarts?", "Alice’s Evidence",
];
const ALICE_START = "*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***";
const ALICE_END = "*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***";

/** Import the twelve chapters as numbered paragraphs, dropping only star separators and the closing "THE END". */
export function importAlice(source: string): WorkFile {
  const normalized = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const start = normalized.indexOf(ALICE_START);
  const end = normalized.indexOf(ALICE_END);
  if (start < 0 || end < start || normalized.indexOf(ALICE_START, start + 1) !== -1 || normalized.indexOf(ALICE_END, end + 1) !== -1) {
    throw new Error("Missing or ambiguous Gutenberg text boundaries");
  }
  const body = normalized.slice(start + ALICE_START.length, end);
  const headings = [...body.matchAll(/^CHAPTER ([IVX]+)\.\n([^\n]+)$/gm)];
  if (headings.length !== ALICE_CHAPTERS.length) throw new Error("Expected twelve Alice chapter headings");
  const divisions: WorkDivision[] = headings.map((heading, index) => {
    const label = ALICE_CHAPTERS[index];
    if (heading[1] !== ROMAN[index] || heading[2] !== label) throw new Error(`Unexpected Alice chapter heading: ${heading[0]}`);
    const key = label.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const segment = body.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? body.length);
    const paragraphs = segment.split(/\n\s*\n/).map((block) => block.replace(/\s+/g, " ").trim())
      .filter((paragraph) => paragraph && !/^(\* )+\*$/.test(paragraph) && !(index === headings.length - 1 && paragraph === "THE END"));
    return { key, label, level: "Chapter", units: paragraphs.map((text, n) => ({ number: n + 1, text })) };
  });
  return createWorkReader({
    schemaVersion: 1, id: "alice-in-wonderland", title: "Alice’s Adventures in Wonderland",
    author: "Lewis Carroll", language: "en",
    referenceText: {
      name: "Project Gutenberg eBook #11",
      source: "https://www.gutenberg.org/ebooks/11",
      credit: "Lewis Carroll; Project Gutenberg eBook #11, The Millennium Fulcrum Edition 3.0. Public domain in the USA; full source and Gutenberg license retained.",
      sha256: sha256(source),
    },
    levels: ["Chapter", "Paragraph"],
    referenceFormats: { Chapter: "{Chapter} ¶{Paragraph}" },
    momentMode: "reading-pass", divisions,
  }).work;
}
