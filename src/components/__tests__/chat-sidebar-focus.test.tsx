/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useNavigation } from "@/context/navigation-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => false }));
vi.mock("@/context/navigation-context", () => ({ useNavigation: vi.fn() }));
vi.mock("@/components/chat", () => ({ Chat: () => <button>Ask</button> }));
vi.mock("@/components/feedback", () => ({ Feedback: () => null }));

const useNavigationMock = vi.mocked(useNavigation);

describe("ChatSidebar focus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom has no layout, so treat elements as visible unless a test marks them hidden.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
      return (this.dataset.hidden ? [] : [{}]) as unknown as DOMRectList;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function render(isChatOpen: boolean, opener: React.ReactNode = null) {
    useNavigationMock.mockReturnValue({
      isChatOpen,
      closeChat: vi.fn(),
      chatContext: null,
      sidebarTab: "chat",
      setSidebarTab: vi.fn(),
      currentImageId: null,
    } as never);
    await act(async () => {
      root.render(<>{opener}<ChatSidebar /></>);
    });
  }

  const sidebar = () => container.querySelector("aside")!;

  it("is inert while closed and returns focus to the opener when closed from inside", async () => {
    const opener = <button aria-label="Toggle chat">Chat</button>;
    await render(false, opener);
    expect(sidebar().hasAttribute("inert")).toBe(true);

    container.querySelector<HTMLButtonElement>('button[aria-label="Toggle chat"]')!.focus();
    await render(true, opener);
    expect(sidebar().hasAttribute("inert")).toBe(false);

    sidebar().querySelector("button")!.focus();
    expect(sidebar().contains(document.activeElement)).toBe(true);
    await render(false, opener);
    expect(document.activeElement).toBe(container.querySelector('button[aria-label="Toggle chat"]'));
  });

  it("falls back to a visible chat toggle when the opener is hidden", async () => {
    const opener = <><button aria-label="Toggle chat" data-hidden="true">Desktop chat</button><button aria-label="Toggle chat">Mobile chat</button></>;
    await render(false, opener);
    container.querySelector<HTMLButtonElement>('button[data-hidden]')!.focus();
    await render(true, opener);
    sidebar().querySelector("button")!.focus();
    await render(false, opener);
    expect(document.activeElement?.textContent).toBe("Mobile chat");
  });

  it("leaves focus alone when it is already outside the sidebar", async () => {
    const opener = <><button aria-label="Toggle chat">Chat</button><button>Elsewhere</button></>;
    await render(true, opener);
    const elsewhere = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Elsewhere")!;
    elsewhere.focus();
    await render(false, opener);
    expect(document.activeElement).toBe(elsewhere);
  });
});
