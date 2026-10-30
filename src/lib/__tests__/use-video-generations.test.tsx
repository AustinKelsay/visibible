/* @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoGenerations } from "../use-video-generations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const input = { duration: 5 as const, resolution: "768p" as const, maxCredits: 50 };
const props = { sid: "session-a", verseId: "genesis-1-1", reference: "Genesis 1:1", translation: "web" };
const config = { enabled: true, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: [{ ...input, credits: 50, providerCostUsd: 0.4 }] };
const accepted = { id: "job-1", requestId: "request", status: "queued", ...input, ...props, createdAt: 1, estimatedCredits: 50 };
let state: ReturnType<typeof useVideoGenerations>;
function Harness() {
  const value = useVideoGenerations(props);
  useEffect(() => { state = value; }, [value]);
  return null;
}
let root: Root;
let container: HTMLDivElement;
let post: ReturnType<typeof vi.fn<(init: RequestInit) => Promise<Response>>>;
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
  post = vi.fn();
  vi.stubGlobal("fetch", vi.fn((_url, init) => init?.method === "POST" ? post(init) : Promise.resolve(Response.json(config))));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() { await act(async () => root.render(<Harness />)); }

describe("durable video submission", () => {
  it("loads pricing and submits when AbortSignal static helpers are unavailable", async () => {
    vi.stubGlobal("AbortSignal", {});
    post.mockResolvedValue(Response.json(accepted));
    await mount();
    expect(state.config).toEqual(config);
    await act(async () => { await state.generate(input); });
    expect(state.accepted?.id).toBe("job-1");
  });

  it("shows a pricing deadline error instead of leaving generation unavailable without an explanation", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(state.config).toBeNull();
    expect(state.configError).toMatch(/pricing timed out/i);
  });

  it("guards double clicks and leaves status polling to the server", async () => {
    post.mockResolvedValue(Response.json(accepted));
    await mount();
    await act(async () => { await Promise.all([state.generate(input), state.generate(input)]); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(state.accepted?.id).toBe("job-1");
    expect(state.request).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2); // configuration + enqueue, no browser polling
  });

  it("reuses the request identity after an ambiguous response, even after remount", async () => {
    post.mockRejectedValueOnce(new Error("Network unavailable"));
    await mount();
    await act(async () => { await state.generate(input); });
    const firstBody = JSON.parse(String(post.mock.calls[0][0].body));
    expect(state.request?.requestId).toBe(firstBody.requestId);
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    post.mockResolvedValue(Response.json(accepted));
    await act(async () => { await state.retrySubmission(); });
    expect(JSON.parse(String(post.mock.calls[1][0].body))).toEqual(firstBody);
    expect(state.request).toBeNull();
  });

  it("refreshes changed pricing without silently accepting a higher charge", async () => {
    post.mockResolvedValueOnce(Response.json({ error: "Price changed" }, { status: 409 }));
    await mount();
    await act(async () => { await state.generate(input); });
    expect(state.error).toBe("Price changed");
    expect(state.request).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3); // re-read quote, no automatic resubmit
  });

  it("retains the same identity after a server error but clears a definite rejection", async () => {
    post.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
    await mount();
    await act(async () => { await state.generate(input); });
    expect(state.request).not.toBeNull();
    post.mockResolvedValueOnce(Response.json({ error: "Session expired" }, { status: 401 }));
    await act(async () => { await state.retrySubmission(); });
    expect(state.request).toBeNull();
  });

  it("handles blocked local storage while keeping safe retries in memory", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    post.mockRejectedValueOnce(new Error("Network unavailable"));
    await mount();
    expect(state.ready).toBe(true);
    await act(async () => { await state.generate(input); });
    const firstBody = JSON.parse(String(post.mock.calls[0][0].body));
    post.mockResolvedValue(Response.json(accepted));
    await act(async () => { await state.retrySubmission(); });
    expect(JSON.parse(String(post.mock.calls[1][0].body)).requestId).toBe(firstBody.requestId);
  });
});
