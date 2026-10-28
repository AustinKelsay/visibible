import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createWorkReader, type WorkFile } from "../work-input";
import type { MergedEntry, MergedSection } from "../reading-pass/merge";
import type { TextModel } from "../reading-pass/model";
import { canonSourceUnits, canonUserPrompt, draftCanonEntry, mentionUnits } from "../reading-pass/canon";
import { readWorkInputs } from "../engine/work-inputs";
import type { WorkBrief } from "../work-preparation";

const nested: WorkFile = createWorkReader(JSON.parse(readFileSync(new URL("../../../tests/fixtures/nested-work.json", import.meta.url), "utf8"))).work;
const mira: MergedEntry = { id: "mira", kind: "character", readingKind: "person", name: "Mira", aliases: [], note: "The voyager.", members: ["voyage:character:mira"] };
const section = (firstUnitId: string, lastUnitId: string, changes: Partial<MergedSection> = {}): MergedSection => ({
  firstUnitId, lastUnitId, divisionId: "voyage", title: "The voyage", onStage: [{ id: "mira", named: true }], setting: [], mentionedOnly: [], ...changes,
});
const brief: WorkBrief = { schemaVersion: 1, workId: "nested-prose", tone: "Quiet.", depictionRules: [], styleIds: ["classical"],
  eras: [{ id: "sail", label: "Age of sail", people: "Sailors.", dress: "Wool.", buildingsAndObjects: "Boats.", technology: "Sail." }] };

describe("canon source context", () => {
  it("supplies WEB Daniel 7:9 to the real drafter despite its unmatched name form, and keeps its supporting quote", async () => {
    const inputs = await readWorkInputs("bible-web");
    const entry: MergedEntry = { id: "the_ancient_of_days", kind: "character", readingKind: "divine", name: "The Ancient of Days",
      aliases: ["the Ancient of Days", "the Most High"], note: "A divine figure in Daniel's vision.", members: ["daniel:character:ancient_of_days"] };
    const sections = [section("daniel-7-9", "daniel-7-14", { divisionId: "daniel", onStage: [{ id: entry.id, named: true }] })];
    const source = inputs.work.getUnit("daniel-7-9").text;
    const original = JSON.stringify(inputs.work.work);
    expect(mentionUnits(inputs.work, entry).some((u) => u.id === "daniel-7-9")).toBe(false);
    const quote = "one who was Ancient of Days sat";
    expect(source).toContain(quote);
    let calls = 0;
    const model: TextModel = { id: "scripted", async complete(request) {
      calls++;
      expect(request.user).toContain(`[daniel-7-9] ${source.replace(/\s+/g, " ").trim()}`);
      expect(request.user).toContain("section membership alone does not identify who a description belongs to");
      return { content: JSON.stringify({ kind: "character", has_form: false, appearance_from_text: "The source's bodily imagery is constrained by the brief.",
        stages: [{ id: "main", label: "Main", when: "Always", showing: [{ effect: "radiance", colour: "white", brightness: "brilliant" }, { effect: "cloud", colour: "unspecified", brightness: "unspecified" }], source: "mixed", quotes: [{ unit: "daniel-7-9", quote }] }],
        section_stages: [{ section: "daniel-7-9", stage: "main" }] }), model: "scripted", providerRequestId: null, finishReason: "stop",
        usage: { costUsd: 0, promptTokens: 0, completionTokens: 0 }, elapsedMs: 0 };
    } };
    const result = await draftCanonEntry({ work: inputs.work, entry, brief: inputs.brief, sections, sectionEras: {}, hints: [], model });
    expect(calls).toBe(1);
    expect(result.problems).toEqual([]);
    expect(result.stages[0].quotes).toEqual([{ unit: "daniel-7-9", quote }]);
    expect(JSON.stringify(inputs.work.work)).toBe(original);
  });

  it("includes pronoun descriptions across nested parts, deduplicates name matches and excludes unrelated context", () => {
    const file = structuredClone(nested);
    const firstPart = file.divisions[0].divisions![0];
    firstPart.units![1].text = "Her coat was blue and her hair was cropped short.";
    file.divisions[1].units![0].text = "Mira from another tale wore a red cloak.";
    const work = createWorkReader(file);
    const sections = [section("voyage-1-1", "voyage-2-1"), section("voyage-2-2", "voyage-2-2", { onStage: [], mentionedOnly: ["mira"] }),
      section("return-1", "return-2", { divisionId: "return", onStage: [], mentionedOnly: ["mira"] })];
    const before = JSON.stringify({ file, entry: mira, sections });
    const units = canonSourceUnits(work, mira, sections);
    expect(units.map((u) => u.id)).toEqual(["voyage-1-1", "voyage-1-2", "voyage-1-3", "voyage-2-1", "voyage-2-2"]);
    // The named later mention stays evidence; its unrelated neighboring section is not added.
    expect(units.find((u) => u.id === "voyage-1-2")?.text).toBe(firstPart.units![1].text);
    expect(units.some((u) => u.rootDivisionId === "return")).toBe(false);
    const prompt = canonUserPrompt({ work, entry: mira, sections, brief, sectionEras: {}, hints: [] });
    expect(prompt.user).toContain("Her coat was blue and her hair was cropped short.");
    expect(prompt.user).not.toContain("Mira from another tale");
    expect(prompt.sectionIds).toEqual(["voyage-1-1"]);
    expect(JSON.stringify({ file, entry: mira, sections })).toBe(before);
  });

  it("uses setting sections for locations and on-stage sections for objects even with no matching name", () => {
    const work = createWorkReader(nested);
    const entry: MergedEntry = { ...mira, id: "harbor", kind: "location", readingKind: "place", name: "Harbor", aliases: [], members: ["voyage:location:harbor"] };
    const sections = [section("voyage-1-1", "voyage-1-2", { onStage: [], setting: ["harbor"] }),
      section("voyage-1-3", "voyage-2-1", { onStage: [], mentionedOnly: ["harbor"] })];
    expect(canonSourceUnits(work, entry, sections).map((u) => u.id)).toEqual(["voyage-1-1", "voyage-1-2"]);
    const object: MergedEntry = { ...entry, id: "compass", kind: "object", readingKind: "other", name: "Compass", members: ["voyage:character:compass"] };
    expect(canonSourceUnits(work, object, [section("voyage-1-2", "voyage-1-3", { onStage: [{ id: "compass", named: false }] })]).map((u) => u.id))
      .toEqual(["voyage-1-2", "voyage-1-3"]);
  });

  it("caps full formatted source lines, preserves whole units and spreads evidence across sections and member divisions", () => {
    const file: WorkFile = { ...nested, divisions: ["early", "late"].map((key) => ({ key, label: key, level: "Story",
      units: Array.from({ length: 80 }, (_, i) => ({ number: i + 1, text: `${i % 3 ? "She" : "Mira"} wore a blue coat. ${"Description. ".repeat(8)}` })) })) };
    const work = createWorkReader(file);
    const entry = { ...mira, members: ["early:character:mira", "late:character:mira"] };
    const sections = [section("early-1", "early-80", { divisionId: "early" }), section("late-1", "late-80", { divisionId: "late" })];
    const selected = canonSourceUnits(work, entry, sections, 800);
    const formatted = selected.map((u) => `[${u.id}] ${u.text.replace(/\s+/g, " ").trim()}`).join("\n");
    expect(formatted.length).toBeLessThanOrEqual(800);
    expect(selected.length).toBeGreaterThan(2);
    expect(selected.length).toBeLessThan(work.units.length);
    expect(selected[0].id).toBe("early-1");
    expect(selected.at(-1)?.id).toBe("late-80");
    expect(new Set(selected.map((u) => u.id)).size).toBe(selected.length);
    expect(selected.every((u, i) => u === work.getUnit(u.id) && (!i || u.position > selected[i - 1].position))).toBe(true);
    expect(canonSourceUnits(work, entry, [...sections].reverse(), 800)).toEqual(selected);
    expect(canonSourceUnits(work, entry, sections, 0)).toEqual([]);
    const prompt = canonUserPrompt({ work, entry, sections, brief, sectionEras: {}, hints: [] }).user;
    const lines = prompt.split("\n").filter((line) => line.startsWith("["));
    expect(lines.join("\n").length).toBeLessThanOrEqual(14_000);
    expect(lines.length).toBeGreaterThan(selected.length);
    expect(lines.length).toBeLessThan(work.units.length);
  });

  it("skips an over-budget prose unit without truncating it or preventing smaller source units from fitting", () => {
    const file: WorkFile = { ...nested, divisions: [{ key: "voyage", label: "Voyage", level: "Story", units: [
      { number: 1, text: "Her cloak was blue. ".repeat(1000) }, { number: 2, text: "Mira reached the harbor." }, { number: 3, text: "Her hair was short." },
    ] }] };
    const work = createWorkReader(file);
    const sections = [section("voyage-1", "voyage-3")];
    expect(canonSourceUnits(work, mira, sections).map((u) => u.id)).toEqual(["voyage-2", "voyage-3"]);
    const prompt = canonUserPrompt({ work, entry: mira, sections, brief, sectionEras: {}, hints: [] }).user;
    expect(prompt).not.toContain("[voyage-1]");
    expect(prompt).toContain("[voyage-2] Mira reached the harbor.");
    expect(prompt).toContain("[voyage-3] Her hair was short.");
    const hugeOnly = createWorkReader({ ...file, divisions: [{ ...file.divisions[0], units: [file.divisions[0].units![0]] }] });
    expect(canonUserPrompt({ work: hugeOnly, entry: mira, sections: [section("voyage-1", "voyage-1")], brief, sectionEras: {}, hints: [] }).user)
      .toContain("(no whole source unit fits the selection limit)");
  });

  it.each([
    ["voyage-1-3", "voyage-1-1", "voyage"],
    ["voyage-1-1", "return-1", "voyage"],
    ["voyage-1-1", "voyage-1-2", "return"],
    ["voyage-1-1", "missing-1", "voyage"],
  ])("rejects invalid source sections before drafting (%s to %s)", async (first, last, divisionId) => {
    const model: TextModel = { id: "forbidden", complete: async () => { throw new Error("Model must not be called"); } };
    await expect(draftCanonEntry({ work: createWorkReader(nested), entry: mira, sections: [section(first, last, { divisionId })], brief, sectionEras: {}, hints: [], model }))
      .rejects.toThrow(/Invalid canon source section|Unknown unit/);
  });
});
