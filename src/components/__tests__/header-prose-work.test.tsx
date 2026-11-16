/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/header";
import { useNavigation } from "@/context/navigation-context";
import { WorkScopeProvider } from "@/context/work-scope-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/genesis/1/1",
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/context/navigation-context", () => ({
  useNavigation: vi.fn(),
}));

vi.mock("@/context/session-context", () => ({
  useSession: () => ({ tier: "paid", credits: 0, buyCredits: vi.fn(), accessStatus: "ready" }),
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

describe("Header", () => {
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

  const buttons = (label: string) => Array.from(container?.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? []);

  it("on a prose work's page leads with its passage, opens its contents, and offers neither translation nor chat", async () => {
    const toggleMenu = vi.fn();
    useNavigationMock.mockReturnValue({ toggleMenu, toggleChat: vi.fn(), isHeaderMenuOpen: true, openHeaderMenu: vi.fn(), closeHeaderMenu: vi.fn() } as never);
    const scope = { workId: "alice-in-wonderland", unitId: "the-pool-of-tears-1", styleIds: ["watercolor"], passage: { full: "The Pool of Tears ¶1–3", short: "Ch. 2 ¶1–3" }, contentsHref: "/read/alice-in-wonderland" };
    await act(async () => {
      root?.render(<WorkScopeProvider scope={scope}><Header /></WorkScopeProvider>);
    });
    expect(container?.textContent).toContain("The Pool of Tears ¶1–3");
    expect(buttons("Translation")).toHaveLength(0);
    expect(buttons("Toggle chat")).toHaveLength(0);
    expect(buttons("Generate image")).toHaveLength(2);
    const contents = buttons("Open contents");
    expect(contents).toHaveLength(1);
    await act(async () => { contents[0].click(); });
    expect(routerPush).toHaveBeenCalledWith("/read/alice-in-wonderland");
    expect(toggleMenu).not.toHaveBeenCalled();
  });
});
