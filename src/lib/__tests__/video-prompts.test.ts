import { describe, expect, it } from "vitest";
import { buildVideoPrompt } from "../video-prompts";

const passage = {
  reference: "Genesis 8:11",
  verseText: "The dove came back to him at evening, and, behold, in her mouth was a freshly plucked olive leaf.",
  prevVerse: { number: 10, text: "He waited yet another seven days; and again he sent the dove out of the ship.", reference: "Genesis 8:10" },
  nextVerse: { number: 12, text: "He waited yet another seven days, and sent out the dove; and she didn't return to him any more.", reference: "Genesis 8:12" },
};

describe("buildVideoPrompt", () => {
  it("focuses the verse, includes real surrounding context, and constrains style", () => {
    const prompt = buildVideoPrompt(passage, 10);
    expect(prompt).toContain(`Genesis 8:11: "${passage.verseText}"`);
    expect(prompt).toContain(passage.prevVerse.text);
    expect(prompt).toContain(passage.nextVerse.text);
    expect(prompt).toMatch(/depict only the focal verse/);
    expect(prompt).toMatch(/Historically grounded/);
    expect(prompt).toMatch(/10-second shot with no cuts/);
    expect(prompt).toMatch(/No on-screen text/);
  });

  it("omits missing neighbors", () => {
    const prompt = buildVideoPrompt({
      ...passage, prevVerse: null, nextVerse: null,
    }, 5);
    expect(prompt).not.toMatch(/Surrounding context/);
  });
});
