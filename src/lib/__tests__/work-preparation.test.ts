import { KNOWN_STYLE_IDS } from "../../../convex/_helpers/styleIds";
import { describe, expect, it } from "vitest";
import bible from "../../../tests/fixtures/work-briefs/bible.draft.json";
import holmes from "../../../tests/fixtures/work-briefs/holmes.draft.json";
import {
  COMMON_CONTENT_FLOOR, SHARED_STYLES, STYLE_PARTS,
  createStyleLibrary, formatBriefPrompt, inspectStyleScope,
  reviewDraftBrief, validateWorkBrief,
  type BriefEntry, type WorkBrief,
} from "../work-preparation";

describe("shared art styles", () => {
  it("registers the approved canonical IDs and labels", () => {
    expect(SHARED_STYLES.styles.map(({ id, label }) => [id, label])).toEqual([
      ["classical", "Classical"], ["watercolor", "Ink & Watercolor"], ["fresco", "Fresco"], ["storybook", "Storybook"], ["icon", "Byzantine Icon"],
    ]);
    // Convex checks brief styles against this dependency-free copy of the library's ids.
    expect([...KNOWN_STYLE_IDS].sort()).toEqual(SHARED_STYLES.styles.map(({ id }) => id).sort());
    expect(() => SHARED_STYLES.get("watercolour")).toThrow("Unknown art style");
  });

  it("keeps world and depiction choices out of the new rendering files", () => {
    for (const style of SHARED_STYLES.styles) {
      expect(inspectStyleScope(style, [
        { kind: "work", name: "biblical" }, { kind: "work", name: "Bible" },
        { kind: "work", name: "Holmes" }, { kind: "era", name: "ancient Near Eastern" },
      ])).toEqual([]);
      expect(STYLE_PARTS.map((part) => style[part]).join("\n")).not.toMatch(/reverent tone|halos may appear/i);
    }
    expect(SHARED_STYLES.get("classical").negatives).toMatch(/fresco.*manuscript/);
    expect(SHARED_STYLES.get("watercolor").negatives).toContain("No white or cream paper margins");
  });

  it.each([
    ["empty library", []],
    ["duplicate IDs", [SHARED_STYLES.get("classical"), SHARED_STYLES.get("classical")]],
    ["invalid ID", [{ ...SHARED_STYLES.get("icon"), id: "Byzantine Icon" }]],
    ["blank part", [{ ...SHARED_STYLES.get("icon"), palette: " " }]],
    ["missing part", [{ ...SHARED_STYLES.get("icon"), lighting: undefined }]],
    ["multiline description", [{ ...SHARED_STYLES.get("icon"), description: "One\nTwo" }]],
    ["extra policy field", [{ ...SHARED_STYLES.get("icon"), depictionRules: [] }]],
  ])("rejects %s", (_, input) => {
    expect(() => createStyleLibrary(input)).toThrow();
  });

  it("flags known work, people, place and era names with phrase boundaries and normalized punctuation", () => {
    const style = { ...SHARED_STYLES.get("classical"),
      rendering: "A BIBLICAL-era scene with Sherlock—Holmes.",
      materials: "The Baker Street rooms of Victorian England.", palette: "Johnstone blue" };
    expect(inspectStyleScope(style, [
      { kind: "work", name: "biblical" }, { kind: "person", name: "Sherlock Holmes" },
      { kind: "place", name: "Baker Street" }, { kind: "era", name: "Victorian England" },
      { kind: "person", name: "John" },
    ])).toEqual([
      { field: "rendering", kind: "work", name: "biblical" },
      { field: "rendering", kind: "person", name: "Sherlock Holmes" },
      { field: "materials", kind: "place", name: "Baker Street" },
      { field: "materials", kind: "era", name: "Victorian England" },
    ]);
  });
});

describe("work brief contract", () => {
  it.each([bible, holmes])("validates the $workId example and every era's complete prompt form", (input) => {
    const brief = validateWorkBrief(input);
    expect(brief).toEqual(input);
    for (const era of brief.eras) {
      const prompt = formatBriefPrompt(brief, era.id);
      expect(prompt.length).toBeLessThanOrEqual(1200);
      expect(prompt).toContain(brief.tone);
      expect(prompt).toContain(era.people);
      expect(prompt).toContain(era.dress);
      expect(prompt).toContain(era.buildingsAndObjects);
      expect(prompt).toContain(era.technology);
      for (const rule of brief.depictionRules) expect(prompt).toContain(rule.text);
    }
    expect(() => formatBriefPrompt(brief, "missing-era")).toThrow("Unknown era");
  });

  it("preserves registered style conditions as conditions in the style-neutral brief form", () => {
    const prompt = formatBriefPrompt(bible, "roman-judea");
    expect(prompt).toContain("Depiction [styles: icon]: Where the work's depiction rules call for a halo");
    expect(prompt).not.toContain("No cast shadows");
  });

  it.each([
    ["unsupported version", (input: WorkBrief) => ({ ...input, schemaVersion: 2 })],
    ["self-declared approval", (input: WorkBrief) => ({ ...input, approved: true })],
    ["content-floor override", (input: WorkBrief) => ({ ...input, contentFloor: { allowExplicit: true } })],
    ["section assignments", (input: WorkBrief) => ({ ...input, sectionEraIds: ["late-victorian"] })],
    ["empty tone", (input: WorkBrief) => ({ ...input, tone: " " })],
    ["control characters", (input: WorkBrief) => ({ ...input, tone: "tone\u0000" })],
    ["no eras", (input: WorkBrief) => ({ ...input, eras: [] })],
    ["duplicate eras", (input: WorkBrief) => ({ ...input, eras: [...input.eras, input.eras[0]] })],
    ["missing technology", (input: WorkBrief) => ({ ...input, eras: [{ ...input.eras[0], technology: undefined }] })],
    ["no styles", (input: WorkBrief) => ({ ...input, styleIds: [] })],
    ["unknown style", (input: WorkBrief) => ({ ...input, styleIds: ["invented"] })],
    ["duplicate styles", (input: WorkBrief) => ({ ...input, styleIds: ["classical", "classical"] })],
    ["unknown conditional style", (input: WorkBrief) => ({ ...input, depictionRules: [{ text: "A rule", styleIds: ["invented"] }] })],
    ["duplicate conditional styles", (input: WorkBrief) => ({ ...input, depictionRules: [{ text: "A rule", styleIds: ["icon", "icon"] }] })],
    ["empty style condition", (input: WorkBrief) => ({ ...input, depictionRules: [{ text: "A rule", styleIds: [] }] })],
  ])("rejects %s", (_, change) => {
    expect(() => validateWorkBrief(change(validateWorkBrief(holmes)))).toThrow();
  });

  it("accepts exactly 1,200 characters and rejects one extra without truncating", () => {
    const input = structuredClone(holmes);
    const length = formatBriefPrompt(input, "late-victorian").length;
    input.tone += "x".repeat(1200 - length);
    const prompt = formatBriefPrompt(input, "late-victorian");
    expect(prompt).toHaveLength(1200);
    expect(prompt).toContain(input.tone);
    input.tone += "x";
    expect(() => validateWorkBrief(input)).toThrow("exceeds 1200 characters: 1201");
  });

  it("checks a later era even if the first era's prompt fits", () => {
    const input = structuredClone(bible);
    input.eras[4].technology = "x".repeat(1201);
    expect(() => validateWorkBrief(input)).toThrow("Brief prompt for roman-judea exceeds");
  });

  it("enforces the 400-word page limit across eras independently of per-era character limits", () => {
    const input = { ...holmes, tone: "one two three four five", depictionRules: [], eras:
      Array.from({ length: 5 }, (_, index) => ({ id: `era-${index}`, label: "Era", people: Array(75).fill("folk").join(" "),
        dress: "clothes", buildingsAndObjects: "buildings", technology: "tools" })) };
    expect(() => validateWorkBrief(input)).not.toThrow();
    expect(() => validateWorkBrief({ ...input, tone: `${input.tone} six` })).toThrow("exceeds 400 words: 401");
  });

  it("defines an engine-owned content floor shared by every work", () => {
    expect(COMMON_CONTENT_FLOOR.prohibited).toEqual(["Sexually explicit content", "Lingering gore"]);
    expect(COMMON_CONTENT_FLOOR.permitted).toContain("Non-sexual nudity");
  });
});

describe("style registration", () => {
  it("validates a newly registered style without adding a work-specific engine branch", () => {
    const library = createStyleLibrary([{ ...SHARED_STYLES.get("classical"), id: "etching", label: "Etching" }]);
    const input = { ...holmes, styleIds: ["etching"] };
    expect(() => validateWorkBrief(input, library)).not.toThrow();
    expect(() => validateWorkBrief(input)).toThrow("Unknown art style");
  });
});

describe("draft brief scope review", () => {
  const entries: BriefEntry[] = [
    { id: "detective", kind: "character", names: ["Sherlock Holmes", "Holmes"] },
    { id: "rooms", kind: "location", names: ["221B Baker Street", "Baker Street"] },
  ];

  it("routes character and place rules into attributed canon hints without mutating the draft", () => {
    const input = { ...holmes, depictionRules: [
      { text: "HOLMES wears a dark coat." },
      { text: "Baker—Street has a red armchair." },
      { text: "Use plain gold discs when a halo is called for.", styleIds: ["icon"] },
    ] };
    const result = reviewDraftBrief(input, entries);
    expect(result.brief?.depictionRules).toEqual([input.depictionRules[2]]);
    expect(result.canonHints).toEqual([
      { entryId: "detective", kind: "character", sourcePath: "depictionRules.0", text: input.depictionRules[0].text },
      { entryId: "rooms", kind: "location", sourcePath: "depictionRules.1", text: input.depictionRules[1].text },
    ]);
    expect(result.scopeIssues).toEqual([]);
    expect(input.depictionRules).toHaveLength(3);
  });

  it("keeps required tone/era text intact and blocks a candidate until named details are rewritten", () => {
    const input = structuredClone(holmes);
    input.tone = "Holmes always wears a dark coat.";
    input.eras[0].buildingsAndObjects = "The Baker Street rooms have a red armchair.";
    const result = reviewDraftBrief(input, entries);
    expect(result.brief).toBeNull();
    expect(result.scopeIssues.map(({ path, destination }) => [path, destination])).toEqual([
      ["tone", "canon"], ["eras.0.buildingsAndObjects", "canon"],
    ]);
    expect(result.scopeIssues[0].text).toBe(input.tone);
    expect(result.canonHints.map(({ sourcePath, text }) => [sourcePath, text])).toEqual([
      ["tone", input.tone], ["eras.0.buildingsAndObjects", input.eras[0].buildingsAndObjects],
    ]);
  });

  it("flags supplied chapter/episode references for section-look review", () => {
    const result = reviewDraftBrief({ ...holmes, depictionRules: [{ text: "In Chapter 3 the room is foggy." }] }, entries, ["Chapter 3"]);
    expect(result.brief).toBeNull();
    expect(result.scopeIssues).toContainEqual({ path: "depictionRules.0", text: "In Chapter 3 the room is foggy.", name: "Chapter 3", destination: "section-look" });
  });

  it("does not confuse conditional style IDs with entry names or silently accept invalid conditions", () => {
    const input = { ...holmes, depictionRules: [{ text: "Gold discs remain unlettered.", styleIds: ["icon"] }] };
    expect(reviewDraftBrief(input, [{ id: "icon-object", kind: "object", names: ["icon"] }]).canonHints).toEqual([]);
    expect(() => reviewDraftBrief({ ...input, depictionRules: [{ text: "Holmes wears a coat.", styleIds: ["unknown"] }] }, entries)).toThrow("Unknown art style");
  });
});
