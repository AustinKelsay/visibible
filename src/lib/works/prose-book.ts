/**
 * A prose work as the reader shows it: its imported text (`works/<id>/work.json`, deployed with the server) cut into
 * the moments of its active analysis, the same moments the image engine draws. Each moment is one page with one
 * image; the root divisions (Holmes's stories, Alice's chapters) are its contents.
 */
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { listAnalysisRecords } from "../engine/analysis-records";
import { loadWorkInputs } from "../engine/work-inputs";
import type { ReferenceUnit, WorkReader } from "../work-input";
import type { ProseWork } from "./catalog";

export type ProseParagraph = Readonly<{ id: string; number: number; text: string }>;

export type ProseMoment = Readonly<{
  /** Its first unit's id: the page's address and the key its images are saved under. */
  id: string;
  /** Position in the work's reading order, from 0. */
  index: number;
  chapterIndex: number;
  /** "The Pool of Tears ¶3–6" or "A Scandal in Bohemia, Part 2 ¶1–4". */
  reference: string;
  /** "Ch. 2 ¶3–6", for narrow headers. */
  shortReference: string;
  paragraphs: readonly ProseParagraph[];
}>;

export type ProseChapter = Readonly<{ key: string; label: string; moments: readonly ProseMoment[] }>;

export type ProseBook = Readonly<{
  work: ProseWork;
  /** The work's top level, e.g. "Chapter" or "Story". */
  chapterLevel: string;
  chapters: readonly ProseChapter[];
  moments: readonly ProseMoment[];
  credit: string;
}>;

type MomentRecord = { firstUnit: string; lastUnit: string };

const LEVEL_ABBREVIATIONS: Record<string, string> = { Chapter: "Ch." };

function paragraphRange(first: ReferenceUnit, last: ReferenceUnit): string {
  return first.id === last.id ? `¶${first.number}` : `¶${first.number}–${last.number}`;
}

/** Build the book from the imported text and the active generation's moments. Moments naming unknown units are skipped. */
export function buildProseBook(work: ProseWork, reader: WorkReader, momentRecords: readonly MomentRecord[]): ProseBook {
  const file = reader.work;
  const chapterLevel = file.levels[0];
  const abbreviation = LEVEL_ABBREVIATIONS[chapterLevel] ?? chapterLevel;
  const units = reader.units;
  const position = new Map(units.map((unit) => [unit.id, unit.position]));
  const ranges = momentRecords
    .flatMap((record) => {
      const from = position.get(record.firstUnit);
      const to = position.get(record.lastUnit);
      if (from === undefined || to === undefined || to < from) return [];
      if (units[from].rootDivisionId !== units[to].rootDivisionId) return [];
      return [{ from, to }];
    })
    .sort((a, b) => a.from - b.from);
  const chapterIndexById = new Map(file.divisions.map((division, index) => [division.key, index]));
  const moments: ProseMoment[] = ranges.map(({ from, to }, index) => {
    const first = units[from];
    const last = units[to];
    const chapterIndex = chapterIndexById.get(first.rootDivisionId) ?? 0;
    // The first unit's reference without its paragraph, e.g. "The Pool of Tears" or "A Scandal in Bohemia, Part 2".
    const place = first.reference.replace(/\s*¶\d+$/, "");
    const range = first.divisionId === last.divisionId ? paragraphRange(first, last) : `¶${first.number}–${last.reference}`;
    return Object.freeze({
      id: first.id,
      index,
      chapterIndex,
      reference: `${place} ${range}`,
      shortReference: `${abbreviation} ${chapterIndex + 1} ${range}`,
      paragraphs: Object.freeze(units.slice(from, to + 1).map((unit) => Object.freeze({ id: unit.id, number: unit.number, text: unit.text }))),
    });
  });
  const chapters = file.divisions.map((division, chapterIndex) => Object.freeze({
    key: division.key,
    label: division.label,
    moments: Object.freeze(moments.filter((moment) => moment.chapterIndex === chapterIndex)),
  }));
  return Object.freeze({ work, chapterLevel, chapters: Object.freeze(chapters), moments: Object.freeze(moments), credit: file.referenceText.credit });
}

/**
 * How long a server instance reuses a book. An owner correction can change a moment inside the active generation
 * without a new generation, so the cache also expires: pages catch up within a minute.
 */
export const PROSE_BOOK_TTL_MS = 60_000;
const books = new Map<string, { book: Promise<ProseBook>; at: number }>();

/**
 * The book for the work's active generation, cached briefly per generation on this server. Null while the work has
 * no active analysis, so its pages are not found rather than empty.
 */
export async function loadProseBook(work: ProseWork, convex: Pick<ConvexHttpClient, "query">, now: () => number = Date.now): Promise<ProseBook | null> {
  const status = await convex.query(api.analysis.getWorkStatus, { workId: work.id });
  if (status.activeGeneration === null) return null;
  const key = `${work.id}#${status.activeGeneration}`;
  const cached = books.get(key);
  let book = cached && now() - cached.at < PROSE_BOOK_TTL_MS ? cached.book : undefined;
  if (!book) {
    const generation = status.activeGeneration;
    book = (async () => {
      const [inputs, records] = await Promise.all([loadWorkInputs(work.id), listAnalysisRecords(convex, work.id, generation, "moment")]);
      const momentRecords = records.flatMap((record) => record.payload.kind === "moment" ? [record.payload as unknown as MomentRecord] : []);
      return buildProseBook(work, inputs.work, momentRecords);
    })().catch((error) => { books.delete(key); throw error; });
    books.set(key, { book, at: now() });
  }
  return book;
}
