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

vi.mock("@/context/session-context", () => ({
  useSession: () => ({ tier: "paid", credits: 0, buyCredits: vi.fn() }),
}));

vi.mock("@/lib/analytics", () => ({
  trackCreditsInsufficient: vi.fn(),
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

  const buttons = (label: string) => Array.from(container?.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? []);

  function expectReaderControls() {
    for (const label of ["Art style", "Generate image"]) {
      expect(buttons(label)).toHaveLength(2);
    }
    // Desktop chooses the model inside the image settings popover; mobile keeps its own row.
    for (const label of ["Image model", "Image settings", "Image resolution"]) {
      expect(buttons(label)).toHaveLength(1);
    }
    for (const button of [...buttons("Art style"), ...buttons("Image settings")]) {
      expect(button.closest("[inert]")).toBeNull();
    }
  }

  it("keeps desktop image controls in place but inert in Video, and restores them in reader", async () => {
    await renderHeader("reader");
    expectReaderControls();

    await renderHeader("video");
    // Desktop: same slots, disabled; mobile menu and generation drop image-only controls.
    for (const label of ["Art style", "Image settings"]) {
      expect(buttons(label)).toHaveLength(1);
      expect(buttons(label)[0].closest("[inert]")).not.toBeNull();
    }
    for (const label of ["Image model", "Image resolution", "Generate image"]) {
      expect(buttons(label)).toHaveLength(0);
    }
    expect(Array.from(container?.querySelectorAll("button") ?? []).filter((b) => b.textContent === "Get Credits")).toHaveLength(1);
    expect(buttons("Translation")).toHaveLength(2);

    await renderHeader("reader");
    expectReaderControls();
  });
});
