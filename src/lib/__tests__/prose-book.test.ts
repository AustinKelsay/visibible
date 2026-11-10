import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createWorkReader } from "@/lib/work-input";
import { buildProseBook, loadProseBook, PROSE_BOOK_TTL_MS } from "@/lib/works/prose-book";
import { canViewProseWork, findProseWork, PROSE_WORKS } from "@/lib/works/catalog";

const reader = (workId: string) => createWorkReader(JSON.parse(readFileSync(`works/${workId}/work.json`, "utf8")));
const brief = (workId: string) => JSON.parse(readFileSync(`works/${workId}/brief.json`, "utf8")) as { styleIds: string[] };

describe("prose works", () => {
  it("lists each prose work with its brief's styles, kept to the owner until opened", () => {
    expect(PROSE_WORKS.map((work) => work.id)).toEqual(["holmes-adventures", "alice-in-wonderland"]);
    for (const work of PROSE_WORKS) {
      expect(work.styleIds).toEqual(brief(work.id).styleIds);
      expect(reader(work.id).work.title).toBe(work.title);
      expect(canViewProseWork(work, false)).toBe(work.visibility === "public");
      expect(canViewProseWork(work, true)).toBe(true);
    }
    expect(findProseWork("bible-web")).toBeNull();
  });

  it("cuts the text into the analysis's moments, in reading order, with chapter contents", () => {
    const alice = findProseWork("alice-in-wonderland")!;
    // Out of order on purpose, plus one moment naming a unit the text does not have.
    const book = buildProseBook(alice, reader(alice.id), [
      { firstUnit: "the-pool-of-tears-1", lastUnit: "the-pool-of-tears-4" },
      { firstUnit: "down-the-rabbit-hole-4", lastUnit: "down-the-rabbit-hole-4" },
      { firstUnit: "down-the-rabbit-hole-1", lastUnit: "down-the-rabbit-hole-3" },
      { firstUnit: "down-the-rabbit-hole-99", lastUnit: "down-the-rabbit-hole-99" },
    ]);
    expect(book.chapterLevel).toBe("Chapter");
    expect(book.moments.map((m) => [m.id, m.index, m.reference, m.shortReference])).toEqual([
      ["down-the-rabbit-hole-1", 0, "Down the Rabbit-Hole ¶1–3", "Ch. 1 ¶1–3"],
      ["down-the-rabbit-hole-4", 1, "Down the Rabbit-Hole ¶4", "Ch. 1 ¶4"],
      ["the-pool-of-tears-1", 2, "The Pool of Tears ¶1–4", "Ch. 2 ¶1–4"],
    ]);
    expect(book.moments[0].paragraphs.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(book.moments[0].paragraphs[0].text).toMatch(/^Alice was beginning to get very tired/);
    expect(book.chapters.slice(0, 3).map((c) => [c.label, c.moments.length])).toEqual([
      ["Down the Rabbit-Hole", 2], ["The Pool of Tears", 1], ["A Caucus-Race and a Long Tale", 0],
    ]);
    expect(book.credit).toMatch(/Project Gutenberg/);
  });

  it("names a story's part in Holmes's references", () => {
    const holmes = findProseWork("holmes-adventures")!;
    const text = reader(holmes.id);
    const first = text.units[0];
    const book = buildProseBook(holmes, text, [{ firstUnit: first.id, lastUnit: text.units[1].id }]);
    expect(book.moments[0].reference).toBe("A Scandal in Bohemia, Part I ¶1–2");
    expect(book.moments[0].shortReference).toBe("Story 1 ¶1–2");
  });

  it("rereads a generation's moments after a minute, so an owner's moment correction reaches the page", async () => {
    const alice = findProseWork("alice-in-wonderland")!;
    let lastUnit = "the-pool-of-tears-1";
    const query = vi.fn(async (_ref: unknown, args: Record<string, unknown>) => "kind" in args
      ? { records: [{ recordId: "the-pool-of-tears-1", payload: { kind: "moment", firstUnit: "the-pool-of-tears-1", lastUnit } }], nextCursor: null }
      : { activeGeneration: 7 });
    let clock = 1_000_000;
    const load = () => loadProseBook(alice, { query } as never, () => clock);
    const paragraphs = async () => (await load())!.moments[0].paragraphs.map((p) => p.number);
    expect(await paragraphs()).toEqual([1]);
    lastUnit = "the-pool-of-tears-3";
    clock += PROSE_BOOK_TTL_MS - 1;
    expect(await paragraphs()).toEqual([1]);
    clock += 2;
    expect(await paragraphs()).toEqual([1, 2, 3]);
  });
});
