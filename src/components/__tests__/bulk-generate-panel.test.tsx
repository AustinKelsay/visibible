/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkGeneratePanel } from "@/components/bulk-generate-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useBulkGeneration: vi.fn(),
  usePreferences: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("@/context/bulk-generation-context", () => ({
  useBulkGeneration: mocks.useBulkGeneration,
}));

vi.mock("@/context/preferences-context", () => ({
  usePreferences: mocks.usePreferences,
}));

vi.mock("@/context/session-context", () => ({
  useSession: mocks.useSession,
}));

describe("BulkGeneratePanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.usePathname.mockReturnValue("/genesis/1/2");

    mocks.useSession.mockReturnValue({
      credits: 100,
      tier: "paid",
      buyCredits: vi.fn(),
    } as never);

    mocks.usePreferences.mockReturnValue({
      translation: "web",
    } as never);
    mocks.useBulkGeneration.mockReturnValue({
      state: { status: "idle" },
      startBulkGeneration: vi.fn(),
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

  async function renderPanel() {
    await act(async () => {
      root?.render(
        <BulkGeneratePanel
          perVerseCost={5}
          modelId="test-model"
          aspectRatio="1:1"
          resolution="1K"
          onClose={vi.fn()}
        />
      );
    });
  }

  it("increments verse count one step at a time", async () => {
    await renderPanel();

    const increaseButton = container?.querySelector('button[aria-label="Increase count by 1"]') as HTMLButtonElement | null;
    const countInput = container?.querySelector('input[aria-label="Number of verses"]') as HTMLInputElement | null;

    await act(async () => {
      increaseButton?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(countInput?.value).toBe("6");
    expect(container?.textContent).toContain("Next 6 verses");
    expect(container?.textContent).toContain("~30 credits");
  });

  it("uses the current verse route to build the queue", async () => {
    await renderPanel();

    expect(container?.textContent).not.toContain("Navigate to a verse to use bulk generation.");
    expect(container?.textContent).toContain("Next 5 verses");
    expect(container?.textContent).toContain("Genesis 1:3");
  });
});
