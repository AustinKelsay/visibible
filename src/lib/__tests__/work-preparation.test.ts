import { describe, expect, it } from "vitest";
import bible from "../../../tests/fixtures/work-briefs/bible.draft.json";
import holmes from "../../../tests/fixtures/work-briefs/holmes.draft.json";
import { DEFAULT_STYLE_PROFILE, STYLE_PROFILES } from "../image-prompts";
import {
  COMMON_CONTENT_FLOOR, PROMPT_PRECEDENCE, SHARED_STYLES,
  createStyleLibrary, formatBriefPrompt, formatStylePrompt, inspectStyleScope,
  resolveWorkStyle, reviewDraftBrief, selectMainEra, validateWorkBrief,
  type BriefEntry, type WorkBrief,
} from "../work-preparation";

describe("shared art styles", () => {
  it("registers the approved canonical IDs and labels while retaining the legacy default ID", () => {
    expect(SHARED_STYLES.styles.map(({ id, label }) => [id, label])).toEqual([
      ["classical", "Classical"], ["watercolor", "Ink & Watercolor"], ["fresco", "Fresco"], ["icon", "Byzantine Icon"],
    ]);
    expect(SHARED_STYLES.get(DEFAULT_STYLE_PROFILE).id).toBe(STYLE_PROFILES.classical.id);
    expect(() => SHARED_STYLES.get("watercolour")).toThrow("Unknown art style");
  });

  it("keeps world and depiction choices out of the new rendering files", () => {
    for (const style of SHARED_STYLES.styles) {
      expect(inspectStyleScope(style, [
        { kind: "work", name: "biblical" }, { kind: "work", name: "Bible" },
        { kind: "work", name: "Holmes" }, { kind: "era", name: "ancient Near Eastern" },
      ])).toEqual([]);
      expect(formatStylePrompt(style)).not.toMatch(/reverent tone|halos may appear/i);
    }
    expect(SHARED_STYLES.get("classical").negatives).toMatch(/fresco.*manuscript/);
    expect(SHARED_STYLES.get("watercolor").negatives).toContain("No white or cream paper margins");
    // The new contracts have not changed the deployed legacy prompt strings.
    expect(STYLE_PROFILES.classical.rendering).toContain("biblical-era");
  });

  it("formats exactly the six parts and keeps descriptions out of prompts", () => {
    const style = { id: "sample", label: "Selection label", description: "Selection description",
      rendering: "R", palette: "P", lighting: "L", materials: "M", composition: "C", negatives: "N" };
    expect(formatStylePrompt(style)).toBe("rendering: R\npalette: P\nlighting: L\nmaterials: M\ncomposition: C\nnegatives: N");
    expect(formatStylePrompt({ ...style, description: "Different selection guidance" })).toBe(formatStylePrompt(style));
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

  it("defines an engine-owned content floor and precedence shared by every work", () => {
    expect(COMMON_CONTENT_FLOOR.prohibited).toEqual(["Sexually explicit content", "Lingering gore"]);
    expect(COMMON_CONTENT_FLOOR.permitted).toContain("Non-sexual nudity");
    expect(PROMPT_PRECEDENCE).toEqual([
      "engine-rules", "brief-content-and-depiction", "style-rendering", "section-look", "scene-plan",
    ]);
  });
});

describe("era and style selection", () => {
  it("selects the era with most sections, breaking ties by brief order", () => {
    expect(selectMainEra(bible, ["roman-judea", "creation-patriarchs", "roman-judea"]).id).toBe("roman-judea");
    expect(selectMainEra(bible, ["roman-judea", "creation-patriarchs"]).id).toBe("creation-patriarchs");
    expect(selectMainEra(holmes, ["late-victorian"]).id).toBe("late-victorian");
    expect(() => selectMainEra(bible, [])).toThrow("requires section assignments");
    expect(() => selectMainEra(bible, ["missing"])).toThrow("Unknown section era");
  });

  it("uses an offered preference and retains an unoffered preference while falling back", () => {
    expect(resolveWorkStyle(bible, "icon")).toMatchObject({ style: { id: "icon" }, savedPreference: "icon", usedDefault: false, available: true });
    expect(resolveWorkStyle(holmes, "icon")).toMatchObject({ style: { id: "watercolor" }, savedPreference: "icon", usedDefault: true });
    expect(resolveWorkStyle(bible, null).style.id).toBe("classical");
    expect(resolveWorkStyle(holmes, "retired-style").savedPreference).toBe("retired-style");
    expect(resolveWorkStyle(bible, "icon").style.id).toBe("icon");
  });

  it("marks an offered but unavailable style unavailable instead of silently substituting", () => {
    expect(resolveWorkStyle(bible, "icon", ["classical", "watercolor"])).toMatchObject({
      style: { id: "icon" }, savedPreference: "icon", usedDefault: false, available: false,
    });
    expect(resolveWorkStyle(holmes, null, []).available).toBe(false);
    expect(() => resolveWorkStyle(bible, "icon", ["invented"])).toThrow("Unknown art style");
  });

  it("can validate a newly registered style without adding a work-specific engine branch", () => {
    const library = createStyleLibrary([{ ...SHARED_STYLES.get("classical"), id: "etching", label: "Etching" }]);
    const input = { ...holmes, styleIds: ["etching"] };
    expect(resolveWorkStyle(input, null, undefined, library).style.id).toBe("etching");
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
