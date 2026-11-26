/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UPDATE_CHECK_EVERY_MS, UpdateAvailable } from "../update-available";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const reload = vi.fn();

const button = () => container.querySelector<HTMLButtonElement>("button");
const answer = (version: string | null) => fetchMock.mockResolvedValue(new Response(JSON.stringify({ version })));
// Lets the check's fetch and JSON promises settle.
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
const returnToTab = () => act(() => { document.dispatchEvent(new Event("visibilitychange")); });

async function mount(pageVersion: string | null) {
  // Next.js builds the page's deployment ID into its client code as this variable.
  vi.stubEnv("NEXT_DEPLOYMENT_ID", pageVersion ?? "");
  await act(() => root.render(<UpdateAvailable />));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { ...window.location, reload });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  reload.mockReset();
});

it("shows nothing while the live version is the page's own", async () => {
  answer("dpl_same");
  await mount("dpl_same");
  vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS);
  await settle();
  expect(fetchMock).toHaveBeenCalledWith("/api/version", { cache: "no-store" });
  expect(button()).toBeNull();
  // The status region waits, empty, so a later update is announced.
  expect(container.querySelector('[role="status"]')?.textContent).toBe("");
});

it("offers a refresh once a newer version is live, and reloads when tapped", async () => {
  answer("dpl_new");
  await mount("dpl_old");
  await returnToTab();
  await settle();
  const refresh = button();
  expect(refresh?.getAttribute("aria-label")).toBe("Update available. Refresh to update");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("A newer version of Visibible is available.");
  act(() => refresh?.click());
  expect(reload).toHaveBeenCalledOnce();
});

it("checks every few minutes while the page stays open", async () => {
  answer("dpl_new");
  await mount("dpl_old");
  expect(fetchMock).not.toHaveBeenCalled();
  vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS);
  await settle();
  expect(button()).not.toBeNull();
});

it("asks at most once a minute when the reader flips between tabs", async () => {
  answer("dpl_same");
  await mount("dpl_same");
  await returnToTab();
  await returnToTab();
  act(() => { window.dispatchEvent(new Event("focus")); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("stays quiet when the check fails or the answer has no version", async () => {
  await mount("dpl_old");
  fetchMock.mockRejectedValueOnce(new TypeError("offline"));
  await returnToTab();
  await settle();
  vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS);
  fetchMock.mockResolvedValueOnce(new Response("busy", { status: 503 }));
  await settle();
  vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS);
  answer(null);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(button()).toBeNull();
});

it("never asks when the page has no deployment ID, as in local development", async () => {
  answer("dpl_new");
  await mount(null);
  await returnToTab();
  vi.advanceTimersByTime(UPDATE_CHECK_EVERY_MS);
  await settle();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(button()).toBeNull();
});
