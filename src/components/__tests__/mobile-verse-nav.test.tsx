/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileVerseNav } from "@/components/mobile-verse-nav";
import { useNavigation } from "@/context/navigation-context";
import { useSession } from "@/context/session-context";
import { useVerseNav } from "@/context/verse-nav-context";
import { trackVerseNavigation } from "@/lib/analytics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: MouseEvent) => void;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event as never);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/context/navigation-context", () => ({
  useNavigation: vi.fn(),
}));

vi.mock("@/context/session-context", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/context/verse-nav-context", () => ({
  useVerseNav: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackVerseNavigation: vi.fn(),
}));

const useNavigationMock = vi.mocked(useNavigation);
const useSessionMock = vi.mocked(useSession);
const useVerseNavMock = vi.mocked(useVerseNav);
const trackVerseNavigationMock = vi.mocked(trackVerseNavigation);

describe("MobileVerseNav", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    useNavigationMock.mockReturnValue({
      isFullscreen: false,
      isChatOpen: false,
    } as never);

    useSessionMock.mockReturnValue({
      tier: "paid",
      credits: 3,
    } as never);

    useVerseNavMock.mockReturnValue({
      book: "Genesis",
      chapter: 1,
      verseNumber: 2,
      totalVerses: 31,
      prevUrl: "/genesis/1/1",
      nextUrl: "/genesis/1/3",
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

  async function renderNav() {
    await act(async () => {
      root?.render(<MobileVerseNav />);
    });
  }

  it("renders the fixed mobile verse navigation bar and tracks navigation clicks", async () => {
    await renderNav();

    const nav = container?.querySelector('nav[aria-label="Verse navigation"]');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute("aria-hidden")).toBe("false");
    expect(nav?.className).toContain("fixed");
    expect(nav?.className).toContain("bottom-0");
    expect(nav?.className).toContain("sm:hidden");
    expect(nav?.className).toContain("translate-y-0");

    const nextLink = container?.querySelector('a[aria-label="Next verse"]');
    expect(nextLink?.getAttribute("href")).toBe("/genesis/1/3");

    await act(async () => {
      nextLink?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(trackVerseNavigationMock).toHaveBeenCalledWith(expect.objectContaining({
      source: "mobile_nav",
      direction: "next",
      targetUrl: "/genesis/1/3",
      tier: "paid",
      hasCredits: true,
    }));
  });

  it("hides the bar during fullscreen mode", async () => {
    useNavigationMock.mockReturnValue({
      isFullscreen: true,
      isChatOpen: false,
    } as never);

    await renderNav();

    const nav = container?.querySelector('nav[aria-label="Verse navigation"]');
    expect(nav?.getAttribute("aria-hidden")).toBe("true");
    expect(nav?.className).toContain("translate-y-full");
  });
});
