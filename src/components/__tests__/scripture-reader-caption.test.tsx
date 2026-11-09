/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTION_FULL_VERSE_CHARS, ScriptureReader } from "@/components/scripture-reader";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ currentImageId: null as string | null, captionClamped: null as boolean | null }));
vi.mock("@/context/navigation-context", () => ({ useNavigation: () => nav }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "free", credits: 0, isLoading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackVerseNavigation: vi.fn() }));

describe("ScriptureReader with the desktop image caption", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    nav.currentImageId = null;
    nav.captionClamped = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(text: string) {
    await act(async () => root.render(
      <ScriptureReader book="Genesis" chapter={1} verse={{ number: 1, text }} verseNumber={1} totalVerses={31} nextUrl="/genesis/1/2" />,
    ));
  }
  const heading = () => container.querySelector("header")!;
  const text = () => container.querySelector("article > div")!;

  it("hides the repeated heading and verse on desktop when an image caption shows the whole verse", async () => {
    nav.currentImageId = "image-1";
    await render("In the beginning, God created the heavens and the earth.");
    expect(heading().className).toContain("sm:hidden");
    expect(text().className).toContain("sm:hidden");
    expect(container.querySelector('a[aria-label="Next verse"]')).not.toBeNull();
  });

  it("keeps the verse below when it is too long for the caption", async () => {
    nav.currentImageId = "image-1";
    await render("x".repeat(CAPTION_FULL_VERSE_CHARS + 1));
    expect(heading().className).not.toContain("sm:hidden");
    expect(text().className).not.toContain("sm:hidden");
  });

  it("keeps the verse below when the measured caption is cut off, even for a short verse", async () => {
    nav.currentImageId = "image-1";
    nav.captionClamped = true;
    await render("In the beginning, God created the heavens and the earth.");
    expect(heading().className).not.toContain("sm:hidden");
    expect(text().className).not.toContain("sm:hidden");
  });

  it("trusts the measurement over the length rule when the caption fits", async () => {
    nav.currentImageId = "image-1";
    nav.captionClamped = false;
    await render("x".repeat(CAPTION_FULL_VERSE_CHARS + 20));
    expect(heading().className).toContain("sm:hidden");
  });

  it("keeps the verse below when there is no image", async () => {
    await render("In the beginning, God created the heavens and the earth.");
    expect(heading().className).not.toContain("sm:hidden");
    expect(text().className).not.toContain("sm:hidden");
  });
});
