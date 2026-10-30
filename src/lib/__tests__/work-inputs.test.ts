/** Deployed work inputs for the generic engine (#175): file versions, moment text and in-section neighbours, reference currency. */
import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkReader } from "../work-input";
import { momentContext, momentForUnit, readWorkInputs, loadWorkInputs, clearWorkInputsCache, SECTION_TEXT_MAX_CHARS } from "../engine/work-inputs";
import { referenceIsCurrent } from "../engine/generation";

const workFile = {
  schemaVersion: 1, id: "two-books", title: "Two Books", author: "Fixture", language: "en",
  referenceText: { name: "Fixture edition", source: "https://example.com", credit: "Test", sha256: "0".repeat(64) },
  levels: ["Book", "Chapter", "Verse"], referenceFormats: { Chapter: "{Book} {Chapter}:{Verse}" }, momentMode: "unit",
  divisions: [{ key: "alpha", label: "Alpha", level: "Book", divisions: [{ key: "1", label: "1", level: "Chapter", units: [1, 2, 3, 4].map((n) => ({ number: n, text: `Verse ${n}.` })) }] }],
};
const work = createWorkReader(workFile);

describe("moment context", () => {
  it("joins the moment's units and takes neighbours only inside the section", () => {
    const section = { firstUnit: "alpha-1-2", lastUnit: "alpha-1-4" };
    // Every moment also carries its whole section's text, which the section look reads (ADR 0009).
    const whole = { text: "Verse 2. Verse 3. Verse 4." };
    expect(momentContext(work, { id: "alpha-1-2", firstUnit: "alpha-1-2", lastUnit: "alpha-1-2" }, section)).toEqual({ moment: { id: "alpha-1-2", reference: "Alpha 1:2", text: "Verse 2." }, previous: null, next: { text: "Verse 3." }, section: whole });
    expect(momentContext(work, { id: "alpha-1-3", firstUnit: "alpha-1-3", lastUnit: "alpha-1-4" }, section)).toEqual({ moment: { id: "alpha-1-3", reference: "Alpha 1:3 to Alpha 1:4", text: "Verse 3. Verse 4." }, previous: { text: "Verse 2." }, next: null, section: whole });
    expect(() => momentContext(work, { id: "alpha-1-1", firstUnit: "alpha-1-1", lastUnit: "alpha-1-1" }, section)).toThrow(/inside its section/);
  });

  it("bounds the section text its look reads, ending a cut with an ellipsis", () => {
    const long = createWorkReader({ ...workFile, divisions: [{ key: "alpha", label: "Alpha", level: "Book", divisions: [{ key: "1", label: "1", level: "Chapter",
      units: [1, 2, 3].map((n) => ({ number: n, text: `${"word ".repeat(600)}end ${n}.` })) }] }] });
    const context = momentContext(long, { id: "alpha-1-2", firstUnit: "alpha-1-2", lastUnit: "alpha-1-2" }, { firstUnit: "alpha-1-1", lastUnit: "alpha-1-3" });
    expect(context.section!.text).toHaveLength(SECTION_TEXT_MAX_CHARS);
    expect(context.section!.text.endsWith("…")).toBe(true);
    expect(context.section!.text).toContain("end 1.");
    expect(context.section!.text).not.toContain("end 3.");
  });

  it("finds the moment holding a unit for multi-unit moments", () => {
    const moments = [{ id: "alpha-1-1", firstUnit: "alpha-1-1", lastUnit: "alpha-1-2" }, { id: "alpha-1-3", firstUnit: "alpha-1-3", lastUnit: "alpha-1-3" }];
    expect(momentForUnit(work, "alpha-1-2", moments)?.id).toBe("alpha-1-1");
    expect(momentForUnit(work, "alpha-1-3", moments)?.id).toBe("alpha-1-3");
    expect(momentForUnit(work, "alpha-1-4", moments)).toBeNull();
  });
});

describe("repo inputs", () => {
  const brief = { schemaVersion: 1, workId: "two-books", tone: "Quiet.", depictionRules: [], eras: [{ id: "lake", label: "Lake", people: "Fisherfolk.", dress: "Wool.", buildingsAndObjects: "Boats.", technology: "Sail." }], styleIds: ["classical", "watercolor"] };
  async function checkout() {
    const root = await mkdtemp(path.join(tmpdir(), "work-inputs-"));
    await mkdir(path.join(root, "works", "two-books"), { recursive: true });
    await mkdir(path.join(root, "styles"), { recursive: true });
    await writeFile(path.join(root, "works", "two-books", "work.json"), JSON.stringify(workFile));
    await writeFile(path.join(root, "works", "two-books", "brief.json"), JSON.stringify(brief, null, 2));
    for (const id of ["classical", "watercolor"]) await writeFile(path.join(root, "styles", `${id}.json`), await readFile(path.join(process.cwd(), "styles", `${id}.json`)));
    return root;
  }

  it("versions each file exactly as the owner scripts do and reads only the brief's styles", async () => {
    const root = await checkout();
    const inputs = await readWorkInputs("two-books", root);
    const sha = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(inputs.workVersion).toBe(sha(JSON.stringify(workFile)));
    expect(inputs.briefVersion).toBe(sha(JSON.stringify(brief, null, 2)));
    expect(Object.keys(inputs.styles)).toEqual(["classical", "watercolor"]);
    expect(inputs.styles.classical.version).toBe(sha(await readFile(path.join(root, "styles", "classical.json"), "utf8")));
    expect(inputs.work.getUnit("alpha-1-4").text).toBe("Verse 4.");
  });

  it("caches a successful read per instance and never a failed one", async () => {
    clearWorkInputsCache();
    const root = await checkout();
    await expect(loadWorkInputs("missing-work", root)).rejects.toThrow();
    await writeFile(path.join(root, "works", "two-books", "brief.json"), "{ not json");
    await expect(loadWorkInputs("two-books", root)).rejects.toThrow();
    await writeFile(path.join(root, "works", "two-books", "brief.json"), JSON.stringify(brief));
    const first = await loadWorkInputs("two-books", root);
    await writeFile(path.join(root, "works", "two-books", "brief.json"), JSON.stringify({ ...brief, tone: "Changed." }));
    expect(await loadWorkInputs("two-books", root)).toBe(first);
    await expect(readWorkInputs("../two-books", root)).rejects.toThrow(/Invalid work id/);
  });
});

describe("reference currency", () => {
  const reference = { storageId: "s", fingerprint: "f", pinned: false, inputs: [{ kind: "entry", recordId: "adam", version: "v1" }, { kind: "stage", recordId: "adam:main", version: "t1" }, { kind: "era", recordId: "x", version: "e" }] };
  it("accepts a reference whose known inputs match, skips one whose entry or stage moved, and keeps a pinned one regardless", () => {
    const required = [{ kind: "entry", recordId: "adam", version: "v1" }, { kind: "stage", recordId: "adam:main", version: "t1" }];
    expect(referenceIsCurrent(reference, required)).toBe(true);
    expect(referenceIsCurrent(reference, [{ kind: "entry", recordId: "adam", version: "v2" }])).toBe(false);
    expect(referenceIsCurrent({ ...reference, pinned: true }, [{ kind: "entry", recordId: "adam", version: "v2" }])).toBe(true);
  });
});
