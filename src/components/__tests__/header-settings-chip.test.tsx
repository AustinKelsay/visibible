// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HeaderSettingsPopover } from "../header-settings-popover";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const generation = { isRegistered: true };
vi.mock("@/context/generation-context", () => ({
  useGeneration: () => ({
    state: { aspectRatio: "16:9", resolution: "1K", modelId: "google/gemini-2.5-flash-image", showCreditsCost: false },
    isRegistered: generation.isRegistered,
    setAspectRatio: vi.fn(),
    setResolution: vi.fn(),
  }),
}));
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({ imageModel: "google/gemini-2.5-flash-image", setImageModel: vi.fn(), imageAspectRatio: "16:9", imageResolution: "1K" }),
}));

afterEach(() => { generation.isRegistered = true; });

async function render() {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(HeaderSettingsPopover)));
  return { container, unmount: () => act(() => root.unmount()) };
}

it("names the chip Image settings on wide screens and keeps the same parts when read-only", async () => {
  const active = await render();
  const button = active.container.querySelector("button")!;
  // Wide screens read "Image settings · 16:9 · 1K"; the label hides where space is short
  expect(button.textContent).toContain("Image settings");
  expect(button.querySelector(".xl\\:inline")?.textContent).toContain("Image settings");
  const activeIcons = button.querySelectorAll("svg").length;
  active.unmount();

  // On the Video tab the chip is read-only, but it keeps the label and chevron, so the header does not shift
  generation.isRegistered = false;
  const readOnly = await render();
  const chip = readOnly.container.firstElementChild as HTMLElement;
  expect(chip.tagName).toBe("SPAN");
  expect(chip.textContent).toBe(button.textContent);
  expect(chip.querySelectorAll("svg").length).toBe(activeIcons);
  readOnly.unmount();
});
