/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/header";
import { useNavigation } from "@/context/navigation-context";
import { useOptionalVerseView } from "@/context/verse-view-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  usePathname: () => "/genesis/1/1",
}));

vi.mock("@/context/navigation-context", () => ({
  useNavigation: vi.fn(),
}));

vi.mock("@/context/verse-view-context", () => ({
  useOptionalVerseView: vi.fn(),
}));

vi.mock("@/components/translation-selector", () => ({
  TranslationSelector: () => <button aria-label="Translation">Translation</button>,
}));

vi.mock("@/components/image-model-selector", () => ({
  ImageModelSelector: () => <button aria-label="Image model">Image model</button>,
}));

vi.mock("@/components/art-style-selector", () => ({
  ArtStyleSelector: () => <button aria-label="Art style">Art style</button>,
}));

vi.mock("@/components/credits-badge", () => ({
  CreditsBadge: () => <span>Credits</span>,
}));

vi.mock("@/components/header-settings-popover", () => ({
  HeaderSettingsPopover: () => <button aria-label="Image settings">Image settings</button>,
  MobileSettingsRows: () => <button aria-label="Image resolution">Image resolution</button>,
}));

vi.mock("@/components/header-generate-button", () => ({
  HeaderGenerateButton: () => <button aria-label="Generate image">Generate image</button>,
}));

const useNavigationMock = vi.mocked(useNavigation);
const useOptionalVerseViewMock = vi.mocked(useOptionalVerseView);

describe("Header Video mode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    useNavigationMock.mockReturnValue({
      toggleMenu: vi.fn(),
      toggleChat: vi.fn(),
      isHeaderMenuOpen: true,
      openHeaderMenu: vi.fn(),
      closeHeaderMenu: vi.fn(),
    } as never);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  async function renderHeader(effectiveView: "reader" | "video") {
    useOptionalVerseViewMock.mockReturnValue({
      effectiveView,
      isSettled: true,
      setEffectiveView: vi.fn(),
    });

    await act(async () => {
      root?.render(<Header />);
    });
  }

  function expectImageControls(visible: boolean) {
    for (const label of ["Image model", "Art style", "Generate image"]) {
      expect(container?.querySelectorAll(`button[aria-label="${label}"]`)).toHaveLength(visible ? 2 : 0);
    }
    for (const label of ["Image settings", "Image resolution"]) {
      expect(container?.querySelectorAll(`button[aria-label="${label}"]`)).toHaveLength(visible ? 1 : 0);
    }
  }

  it("hides desktop and mobile image controls in Video and restores them in reader", async () => {
    await renderHeader("reader");
    expectImageControls(true);

    await renderHeader("video");
    expectImageControls(false);
    expect(container?.querySelectorAll('button[aria-label="Translation"]')).toHaveLength(2);

    await renderHeader("reader");
    expectImageControls(true);
  });
});
