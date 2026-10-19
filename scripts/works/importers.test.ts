import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { BIBLE_BOOKS } from "@/data/bible-structure";
import { formatReference, verseLocationToId, verseToUrl } from "@/lib/navigation";
import { createMomentReader, createWorkReader } from "@/lib/work-input";
import manifest from "../../works/sources/manifest.json";
import footnotes from "../../works/sources/web-footnotes.json";
import { importHolmes, importWeb, sha256 } from "./importers";

function source(name: "web" | "holmes") {
  const entry = manifest[name];
  const bytes = gunzipSync(readFileSync(new URL(`../../works/sources/${entry.file}`, import.meta.url)));
  expect(bytes.length).toBe(entry.bytes);
  expect(sha256(bytes)).toBe(entry.sha256);
  return bytes.toString("utf8");
}

const webSource = source("web");
const holmesSource = source("holmes");
const holmes = createWorkReader(importHolmes(holmesSource));

describe("WEB import", () => {
  let bible: ReturnType<typeof createWorkReader>;
  beforeAll(() => { bible = createWorkReader(importWeb(webSource)); });

  it("preserves every existing verse ID, reference and URL in reading order", () => {
    const expected = BIBLE_BOOKS.flatMap((book) => book.chapters.flatMap((count, index) =>
      Array.from({ length: count }, (_, verseIndex) => ({ book, chapter: index + 1, verse: verseIndex + 1 }))));
    expect(expected).toHaveLength(31_102);
    expect(bible.units).toHaveLength(expected.length);
    const mismatches = expected.filter((location, index) => {
      const unit = bible.units[index];
      return unit.id !== verseLocationToId(location)
        || unit.reference !== formatReference(location)
        || bible.getUnitByReference(unit.reference).id !== unit.id
        || `/${unit.rootDivisionId}/${location.chapter}/${unit.number}` !== verseToUrl(location);
    }).map(verseLocationToId);
    expect(mismatches).toEqual([]);
    expect(bible.units[0].id).toBe("genesis-1-1");
    expect(bible.units.at(-1)?.id).toBe("revelation-22-21");
  });

  it("moves only the three doxology texts and drops the empty marker", () => {
    for (let offset = 0; offset < 3; offset++) {
      const line = webSource.split("\n").find((line) => line.startsWith(`ROM 14:${24 + offset} `))!;
      expect(bible.getUnit(`romans-16-${25 + offset}`).text).toBe(line.slice(line.indexOf(" ", 4) + 1).trim());
      expect(() => bible.getUnit(`romans-14-${24 + offset}`)).toThrow("Unknown unit");
    }
    expect(bible.getUnit("romans-14-23").text).toContain("whatever is not of faith is sin");
    expect(bible.getUnit("romans-16-24").text).toBe("The grace of our Lord Jesus Christ be with you all! Amen.");
    expect(bible.work.referenceText.credit).toContain("eBible.org");
    expect(bible.work.referenceText.sha256).toBe(manifest.web.sha256);
    expect(sha256(JSON.stringify(importWeb(webSource)))).toBe(sha256(JSON.stringify(bible.work)));
  });

  it("supplies one moment per verse without crossing a supplied section boundary", () => {
    const sections = BIBLE_BOOKS.flatMap((book) => book.chapters.map((count, index) => ({
      firstUnitId: `${book.slug}-${index + 1}-1`, lastUnitId: `${book.slug}-${index + 1}-${count}`,
    })));
    const reader = createMomentReader(bible, sections);
    expect(reader.moments.map((moment) => moment.id)).toEqual(bible.units.map((unit) => unit.id));
    expect(reader.getContext("malachi-4-6").next).toBeNull();
    expect(reader.getContext("matthew-1-1").previous).toBeNull();
    expect(reader.getContext("romans-16-25").next?.id).toBe("romans-16-26");
    expect(reader.getMoment("luke-17-36").sourceNotes[0].note.reference).toBe("Luke 17:36");
    expect(reader.getMoment("genesis-1-1").sourceNotes).toEqual([]);
  });

  it("uses only the four pinned WEB footnote readings and retains their source evidence", () => {
    const supplemented = bible.units.filter((unit) => unit.sourceNote);
    expect(supplemented.map((unit) => unit.id)).toEqual(["luke-17-36", "acts-8-37", "acts-15-34", "acts-24-7"]);
    for (const reading of Object.values(footnotes)) {
      const bytes = gunzipSync(readFileSync(new URL(`../../works/sources/${reading.snapshot}`, import.meta.url)));
      expect(sha256(bytes)).toBe(reading.sourceNote.sha256);
      const anchor = `id="${new URL(reading.sourceNote.source).hash.slice(1)}"`;
      const paragraph = bytes.toString("utf8").split(anchor)[1].split("</p>")[0];
      const sourceText = paragraph.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
      expect(sourceText.includes(reading.sourceNote.note)).toBe(true);
      expect(reading.sourceNote.note.includes(reading.text)).toBe(true);
      const unit = bible.getUnitByReference(reading.sourceNote.reference);
      expect(unit.text).toBe(reading.text);
      expect(unit.sourceNote).toEqual(reading.sourceNote);
    }
  });

  it.each([
    ["duplicate", (input: string) => input.replace(/^GEN 1:1 .*$/m, "$&\n$&")],
    ["missing", (input: string) => input.replace(/^GEN 1:1 .*\n/m, "")],
    ["empty", (input: string) => input.replace(/^GEN 1:1 .*$/m, "GEN 1:1 ")],
    ["unexpected", (input: string) => input.replace(/^GEN 1:31 .*$/m, "$&\nGEN 1:32 Unexpected extra verse.")],
    ["changed doxology", (input: string) => input.replace(/^ROM 16:25.*$/m, "ROM 16:25 A different arrangement.")],
    ["missing doxology", (input: string) => input.replace(/^ROM 14:24 .*\n/m, "")],
    ["missing footnote-only marker", (input: string) => input.replace(/^ACT 8:37 .*\n/m, "")],
    ["changed footnote-only verse", (input: string) => input.replace(/^ACT 8:37.*$/m, "ACT 8:37 A changed main text.")],
    ["unrecognized book", (input: string) => input.replace(/^GEN 1:1/m, "UNKNOWN 1:1")],
  ])("rejects %s source data instead of filling or dropping it", (_, change) => {
    expect(() => importWeb(change(webSource))).toThrow();
  });
});

describe("Holmes import", () => {
  it("imports all twelve stories with actual parts and numbered paragraphs", () => {
    expect(holmes.work.divisions).toHaveLength(12);
    expect(holmes.units).toHaveLength(2527);
    expect(holmes.work.divisions[0].divisions?.map((part) => part.label)).toEqual(["I", "II", "III"]);
    expect(holmes.units[0].id).toBe("a-scandal-in-bohemia-1-1");
    expect(holmes.units[0].text).toMatch(/^To Sherlock Holmes she is always _the_ woman/);
    expect(holmes.getUnit("a-scandal-in-bohemia-2-1").reference).toBe("A Scandal in Bohemia, Part II ¶1");
    expect(holmes.work.divisions[1].divisions).toBeUndefined();
    expect(holmes.units.some((unit) => unit.text.includes("I should not think of leaving,’ said I."))).toBe(true);
    expect(holmes.units.some((unit) => /^[IVX]+\.$/.test(unit.text))).toBe(false);
    expect(holmes.units.some((unit) => unit.text.includes("PROJECT GUTENBERG"))).toBe(false);
    expect(holmes.work.referenceText.credit).toContain("Jose Menendez");
    for (const unit of holmes.units) expect(holmes.getUnitByReference(unit.reference)).toBe(unit);
  });

  it("retains source and license bytes while excluding the wrapper from story units", () => {
    expect(/FULL PROJECT GUTENBERG.* LICENSE/.test(holmesSource)).toBe(true);
    expect(holmes.work.referenceText.sha256).toBe(manifest.holmes.sha256);
    expect(sha256(JSON.stringify(importHolmes(holmesSource)))).toBe(sha256(JSON.stringify(holmes.work)));
  });

  it.each([
    ["missing end marker", (input: string) => input.replace("*** END OF THE PROJECT", "*** MISSING END OF THE PROJECT")],
    ["missing story", (input: string) => input.replace("II. THE RED-HEADED LEAGUE", "THE RED-HEADED LEAGUE")],
    ["unexpected story", (input: string) => input.replace("II. THE RED-HEADED LEAGUE", "II. ANOTHER STORY")],
    ["out-of-order part", (input: string) => input.replace(/\nII\.\r?\n/, "\nIV.\n")],
  ])("rejects %s", (_, change) => {
    expect(() => importHolmes(change(holmesSource))).toThrow();
  });
});
