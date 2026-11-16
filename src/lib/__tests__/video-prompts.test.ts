import { describe, expect, it } from "vitest";
import { SHARED_STYLES } from "../work-preparation";
import { buildVideoPrompt } from "../video-prompts";

const passage = {
  reference: "Genesis 8:11",
  verseText: "The dove came back to him at evening, and, behold, in her mouth was a freshly plucked olive leaf.",
  prevVerse: { number: 10, text: "He waited yet another seven days; and again he sent the dove out of the ship.", reference: "Genesis 8:10" },
  nextVerse: { number: 12, text: "He waited yet another seven days, and sent out the dove; and she didn't return to him any more.", reference: "Genesis 8:12" },
};

describe("buildVideoPrompt", () => {
  it("animates the painting in its own art style, keeping its composition, with the verse as context", () => {
    const storybook = SHARED_STYLES.get("storybook");
    const prompt = buildVideoPrompt(passage, 10, "storybook");
    expect(prompt).toMatch(/^Animate this painting/);
    expect(prompt).toContain("Storybook");
    expect(prompt).toContain(storybook.rendering);
    expect(prompt).toContain(storybook.palette);
    expect(prompt).toContain(storybook.materials);
    expect(prompt).toMatch(/same composition/i);
    expect(prompt).toContain(`Genesis 8:11: "${passage.verseText}"`);
    expect(prompt).toContain(passage.prevVerse.text);
    expect(prompt).toContain(passage.nextVerse.text);
    expect(prompt).toMatch(/10-second shot with no cuts/);
    expect(prompt).toMatch(/Restrained/);
    expect(prompt).toMatch(/No on-screen text/);
    expect(prompt).not.toMatch(/live-action/i);
  });

  it("takes each style's own description", () => {
    expect(buildVideoPrompt(passage, 5, "watercolor")).toContain(SHARED_STYLES.get("watercolor").materials);
    expect(buildVideoPrompt(passage, 5, "watercolor")).not.toContain(SHARED_STYLES.get("storybook").materials);
  });

  it("omits missing neighbors", () => {
    const prompt = buildVideoPrompt({ ...passage, prevVerse: null, nextVerse: null }, 5, "classical");
    expect(prompt).not.toMatch(/Surrounding context/);
  });
});
