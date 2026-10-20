import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/nested-work.json";
import { createMomentReader, createWorkReader, type SectionInput } from "../work-input";

const sections: SectionInput[] = [
  {
    firstUnitId: "voyage-1-1", lastUnitId: "voyage-1-3",
    moments: [
      { firstUnitId: "voyage-1-1", lastUnitId: "voyage-1-2" },
      { firstUnitId: "voyage-1-3", lastUnitId: "voyage-1-3" },
    ],
  },
  {
    firstUnitId: "voyage-2-1", lastUnitId: "voyage-2-2",
    moments: [{ firstUnitId: "voyage-2-1", lastUnitId: "voyage-2-2" }],
  },
  {
    firstUnitId: "return-1", lastUnitId: "return-2",
    moments: [
      { firstUnitId: "return-1", lastUnitId: "return-1" },
      { firstUnitId: "return-2", lastUnitId: "return-2" },
    ],
  },
];

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

describe("registered moments", () => {
  const work = createWorkReader(fixture);

  it("returns the complete selected text and only neighbors in the same section", () => {
    const reader = createMomentReader(work, sections);
    const first = reader.getContext("voyage-1-1");
    expect(first.moment.text).toBe("At dawn, Mira found the boat.\n\nShe loosened the rope.");
    expect(first.moment.reference).toBe("The Voyage, Part I ¶1–The Voyage, Part I ¶2");
    expect(first.previous).toBeNull();
    expect(first.next?.id).toBe("voyage-1-3");
    expect(reader.getContext("voyage-1-3").next).toBeNull();
    expect(reader.getContext("voyage-2-1")).toMatchObject({ previous: null, next: null });
    expect(reader.getContext("return-1").previous).toBeNull();
    // A valid unit inside a multi-unit moment is not itself a registered image request.
    expect(() => reader.getMoment("voyage-1-2")).toThrow("Unknown moment");
    expect(() => reader.getMoment("voyage-1-1..return-2")).toThrow("Unknown moment");
  });

  it("derives exactly one stable moment per unit in unit mode", () => {
    const unitWork = createWorkReader({ ...fixture, momentMode: "unit" });
    const inputs = sections.map(({ firstUnitId, lastUnitId }) => ({ firstUnitId, lastUnitId }));
    const reader = createMomentReader(unitWork, inputs);
    expect(reader.moments.map((moment) => moment.id)).toEqual(unitWork.units.map((unit) => unit.id));
    expect(reader.getContext("voyage-1-3").next).toBeNull();
    expect(() => createMomentReader(unitWork, sections)).toThrow("derived from units");
  });

  it.each([
    ["missing section", (input: SectionInput[]) => { input.pop(); }],
    ["section gap", (input: SectionInput[]) => { input[0].firstUnitId = "voyage-1-2"; }],
    ["section overlap", (input: SectionInput[]) => { input[1].firstUnitId = "voyage-1-3"; }],
    ["inverted section", (input: SectionInput[]) => { input[0].firstUnitId = "voyage-2-1"; }],
    ["unknown unit", (input: SectionInput[]) => { input[0].lastUnitId = "missing"; }],
    ["missing moments", (input: SectionInput[]) => { delete input[0].moments; }],
    ["moment gap", (input: SectionInput[]) => { input[0].moments![0].lastUnitId = "voyage-1-1"; }],
    ["moment overlap", (input: SectionInput[]) => { input[0].moments![1].firstUnitId = "voyage-1-2"; }],
    ["inverted moment", (input: SectionInput[]) => { input[0].moments![0].firstUnitId = "voyage-1-3"; }],
    ["section-crossing moment", (input: SectionInput[]) => { input[0].moments![1].lastUnitId = "voyage-2-1"; }],
    ["incomplete moments", (input: SectionInput[]) => { input[0].moments!.pop(); }],
  ])("rejects %s", (_, corrupt) => {
    const input = structuredClone(sections);
    corrupt(input);
    expect(() => createMomentReader(work, input)).toThrow();
  });
});
