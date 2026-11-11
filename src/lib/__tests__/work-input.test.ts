import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/nested-work.json";
import { createWorkReader } from "../work-input";

describe("imported reference work", () => {
  it("derives positional IDs, reading order and round-trip references through optional nesting", () => {
    const work = createWorkReader(fixture);
    expect(work.units.map((unit) => unit.id)).toEqual([
      "voyage-1-1", "voyage-1-2", "voyage-1-3", "voyage-2-1", "voyage-2-2", "return-1", "return-2",
    ]);
    expect(work.getUnit("voyage-2-1").reference).toBe("The Voyage, Part II ¶1");
    expect(work.getUnit("return-2").reference).toBe("The Return ¶2");
    for (const unit of work.units) expect(work.getUnitByReference(unit.reference)).toBe(unit);
    expect(work.work.referenceText).toEqual(fixture.referenceText);
    expect(() => work.getUnit("missing")).toThrow("Unknown unit");
    expect(() => work.getUnitByReference("Unknown ¶1")).toThrow("Unknown reference");
  });

  it("retains the full reference text rather than a prompt-sized truncation", () => {
    const input = structuredClone(fixture);
    const longText = "A long paragraph. ".repeat(200);
    input.divisions[1].units![0].text = longText;
    expect(createWorkReader(input).getUnit("return-1").text).toBe(longText);
  });

  it.each([
    ["duplicate positional identities", (input: typeof fixture) => { input.divisions.push(input.divisions[0]); }],
    ["missing unit number", (input: typeof fixture) => { input.divisions[1].units![1].number = 3; }],
    ["empty text", (input: typeof fixture) => { input.divisions[1].units![0].text = " "; }],
    ["unknown level", (input: typeof fixture) => { input.divisions[1].level = "Unknown"; }],
    ["wrong hierarchy", (input: typeof fixture) => { input.divisions[0].divisions![0].level = "Story"; }],
    ["duplicate level names", (input: typeof fixture) => { input.levels[1] = "Story"; }],
    ["unknown reference level", (input: typeof fixture) => { input.referenceFormats.Story = "{Missing} ¶{Paragraph}"; }],
    ["malformed template", (input: typeof fixture) => { input.referenceFormats.Story = "{{Story} ¶{Paragraph}"; }],
    ["missing unit reference", (input: typeof fixture) => { input.referenceFormats.Story = "{Story}"; }],
    ["duplicate references", (input: typeof fixture) => { input.referenceFormats.Part = "{Story} ¶{Paragraph}"; }],
  ])("rejects %s", (_, corrupt) => {
    const input = structuredClone(fixture);
    corrupt(input);
    expect(() => createWorkReader(input)).toThrow();
  });
});
