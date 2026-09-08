import { describe, expect, it } from "vitest";
import { buildImagePrompt, buildScenePlannerPrompt, normalizeScenePlan, scenePlanInputFingerprint, STYLE_PROFILES, type ImagePromptInput } from "../image-prompts";

const input: ImagePromptInput = {
  verseId: "genesis-1-1", translationId: "web", reference: "Genesis 1:1",
  verseText: "In the beginning God created the heavens and the earth.",
  prevVerse: null, nextVerse: { number: 2, text: "The earth was formless and empty." },
  chapterTheme: { setting: "cosmos", palette: "blues", elements: "light", style: "classical" },
  styleProfile: STYLE_PROFILES.classical, aspectRatio: "16:9", resolution: "1K",
  generationNumber: 2, scenePlan: null, scenePlannerUsed: false, scenePlanFromCache: false,
};

describe("image prompt contracts", () => {
  it.each([null, [], {}, { primarySubject: " ", action: "emerging", setting: "cosmos" }, { primarySubject: 5, action: "a", setting: "b" }])(
    "rejects an unusable plan", (plan) => expect(normalizeScenePlan(plan)).toBeNull()
  );
  it("normalizes and bounds every accepted planner field", () => {
    const plan = normalizeScenePlan({ primarySubject: " world\u0000 ", action: "a".repeat(1000), setting: "cosmos", mood: "  ", composition: "b".repeat(1000) });
    expect(plan).toMatchObject({ primarySubject: "world", setting: "cosmos" });
    expect(plan?.action).toHaveLength(180);
    expect(plan?.composition).toHaveLength(180);
    expect(plan?.mood).toBeUndefined();
  });
  it("bounds final prompts and retains the existing priority and scene rules", () => {
    const result = buildImagePrompt({ ...input, verseText: "Text ".repeat(1000), generationNumber: 10000,
      scenePlan: normalizeScenePlan({ primarySubject: "a".repeat(1000), action: "b".repeat(1000), setting: "c".repeat(1000) }) });
    expect(result.prompt.length).toBeLessThanOrEqual(2800);
    expect(result.prompt).toContain("PRIORITY RULES:");
    expect(result.prompt).toContain("Single unified scene only");
    expect(result.promptPacket.budget.finalChars).toBe(result.prompt.length);
  });
  it.each([
    { reference: "Genesis 1:2" }, { verseText: "Different passage" },
    { prevVerse: { number: 1, text: "New previous verse" } },
    { nextVerse: { number: 2, text: "Changed neighboring translation text" } },
    { chapterTheme: { ...input.chapterTheme!, palette: "gold" } },
    { styleProfile: { ...STYLE_PROFILES.classical, negative: "Changed style constraints" } },
  ])("invalidates changed canonical planning input", (change) => {
    expect(scenePlanInputFingerprint({ ...input, ...change })).not.toBe(scenePlanInputFingerprint(input));
  });
  it("fingerprints full canonical text even past the planner clipping limit", () => {
    const prefix = "a".repeat(350);
    const a = { ...input, verseText: prefix + "first" };
    const b = { ...input, verseText: prefix + "second" };
    expect(buildScenePlannerPrompt(a)).toBe(buildScenePlannerPrompt(b));
    expect(scenePlanInputFingerprint(a)).not.toBe(scenePlanInputFingerprint(b));
  });
  it("keeps variation and output dimensions out of the canonical scene identity", () => {
    const variation: ImagePromptInput = { ...input, generationNumber: 9, aspectRatio: "3:2", resolution: "2K" };
    expect(scenePlanInputFingerprint(variation)).toBe(scenePlanInputFingerprint(input));
  });
});
