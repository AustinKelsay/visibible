/* @vitest-environment jsdom */

/**
 * The header's generate controls show the server's quote (#60), never the catalog's flat estimate, and say when a
 * fresh price is waiting to be accepted.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderGenerateButton } from "@/components/header-generate-button";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const generate = vi.fn();
const state = {
  canGenerate: true, isGenerating: false, pricingPending: false, pricingUnavailable: undefined, showCreditsCost: true,
  quoteLabel: null as string | null, priceChanged: false, generationPhaseLabel: "Generating...",
  aspectRatio: "16:9", resolution: "1K", baseCost: 5, effectiveCost: 5, effectiveEta: 12, displayBaseCost: 5,
  displayCostByResolution: { "1K": 5 }, modelId: "test-model",
};
vi.mock("@/context/generation-context", () => ({ useGeneration: () => ({ state, isRegistered: true, generate, buyCredits: vi.fn() }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 100 }) }));
vi.mock("@/context/work-scope-context", () => ({ useWorkScope: () => null, imageModelsUrl: () => "/api/image-models" }));
vi.mock("@/components/bulk-generate-panel", () => ({ BulkGeneratePanel: () => null }));
vi.mock("@/components/image-generation-settings-panel", () => ({ ImageGenerationSettingsPanel: () => null }));
vi.mock("@/lib/analytics", () => ({ trackCreditsInsufficient: vi.fn() }));

describe("HeaderGenerateButton and the server's quote", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = () => act(async () => { root.render(<HeaderGenerateButton />); });
  const desktopButton = () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Generate new image"]')].find((button) => button.textContent?.includes("Generate"))!;
  const dialogButton = () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.includes("Generate"))!;

  beforeEach(() => {
    generate.mockClear();
    Object.assign(state, { quoteLabel: null, priceChanged: false });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ models: [] }))));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows no number until the quote is read, then the quote's estimate and maximum", async () => {
    await render();
    expect(desktopButton().textContent).toBe("Generate");
    state.quoteLabel = "About 2 credits · at most 4";
    await render();
    expect(desktopButton().textContent).toBe("GenerateAbout 2 credits · at most 4");
    // The catalog's flat estimate of 5 is not what the guest is charged, so it is not on the control.
    expect(desktopButton().textContent).not.toContain("5");

    await act(async () => desktopButton().click());
    expect(dialogButton().textContent).toBe("GenerateAbout 2 credits · at most 4");
    await act(async () => dialogButton().click());
    expect(generate).toHaveBeenCalledWith("header_generate");
  });

  it("asks the guest to accept a fresh price before generating at it", async () => {
    Object.assign(state, { quoteLabel: "About 3 credits · at most 6", priceChanged: true });
    await render();
    await act(async () => desktopButton().click());
    expect(document.querySelector('[role="dialog"] [role="status"]')?.textContent).toBe("Please confirm the price to generate.");
    expect(dialogButton().textContent).toBe("Generate at this priceAbout 3 credits · at most 6");
    await act(async () => dialogButton().click());
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
