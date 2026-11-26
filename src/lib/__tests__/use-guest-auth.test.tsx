// @vitest-environment jsdom
import { act, createElement, startTransition, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProviderWithAuth } from "convex/react";
import { useGuestAuth } from "../use-guest-auth";
let sid: string | null = "owner";
const refetch = vi.fn(async () => {});
vi.mock("@/context/guest-session-context", () => ({ useGuestSession: () => ({ sid, isLoading: false, refetch }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let suspend = false;
const neverResolves = new Promise<void>(() => {});
function renderHook(hook: typeof useGuestAuth) {
  const result = { current: undefined as unknown as ReturnType<typeof useGuestAuth> };
  function Probe() { const auth = hook(); if (suspend) throw neverResolves; result.current = auth; return null; }
  root = createRoot(document.createElement("div"));
  const rerender = () => root.render(createElement(Suspense, { fallback: null }, createElement(Probe)));
  act(rerender);
  return { result, rerender };
}
/**
 * Mounts the hook under the real ConvexProviderWithAuth with a client that behaves like Convex's: a fetch with no token
 * signs the page out, and it never retries by itself. Only a new setAuth (a new fetchAccessToken) starts another
 * sign-in. Returns each sign-in's token, null for a failed one.
 */
async function mountUnderConvex() {
  const signIns: Array<string | null> = [];
  const client = {
    setAuth: (fetchToken: () => Promise<string | null>, onChange: (ok: boolean) => void) => {
      void fetchToken().then((token) => { signIns.push(token); onChange(token !== null); });
    },
    clearAuth: () => {},
  };
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(createElement(ConvexProviderWithAuth, { client: client as never, useAuth: useGuestAuth }, null));
  });
  return signIns;
}
const fetchMock = vi.fn();
beforeEach(() => { sid = "owner"; suspend = false; vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("localStorage", { setItem: vi.fn() }); vi.stubGlobal("sessionStorage", { setItem: vi.fn() }); fetchMock.mockReset(); refetch.mockClear(); document.cookie = "visibible_csrf=csrf"; });
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("in-memory guest refresh", () => {
  it("coalesces concurrent requests and sends CSRF without persisting tokens", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const { result } = renderHook(useGuestAuth);
    const first = result.current.fetchAccessToken();
    const second = result.current.fetchAccessToken();
    resolve(Response.json({ token: "bearer" }));
    expect(await first).toBe("bearer");
    expect(await second).toBe("bearer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "x-csrf-token": "csrf" });
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("bearer");
  });
  it("discards in-flight credentials after a subject change", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const { result, rerender } = renderHook(useGuestAuth);
    const pending = result.current.fetchAccessToken();
    act(() => { sid = null; rerender(); });
    resolve(Response.json({ token: "old-owner" }));
    expect(await pending).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(await result.current.fetchAccessToken()).toBeNull();
  });
  it("does not let a suspended render alter the committed subject", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const { result, rerender } = renderHook(useGuestAuth);
    const pending = result.current.fetchAccessToken();
    await act(async () => {
      sid = "uncommitted-other";
      suspend = true;
      startTransition(rerender);
    });
    resolve(Response.json({ token: "committed-owner" }));
    expect(await pending).toBe("committed-owner");
  });
  it("restarts bearer acquisition on reconnect and renews HTTP access only on user focus", () => {
    const { result } = renderHook(useGuestAuth);
    const previous = result.current.fetchAccessToken;
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current.fetchAccessToken).not.toBe(previous);
    expect(refetch).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  it("signs Convex in again when the reader returns after a failed token fetch (#574)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({ token: "fresh" }));
    const signIns = await mountUnderConvex();
    expect(signIns).toEqual([null]);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(signIns).toEqual([null, "fresh"]);
    // Healthy now: returning again starts no sign-in.
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(signIns).toEqual([null, "fresh"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("retries a failed sign-in on its own after 5 s, doubling to at most a minute, until one succeeds (#574)", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new Error("offline"));
      const signIns = await mountUnderConvex();
      const after = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); return signIns.length; };
      expect(signIns.length).toBe(1);
      expect(await after(4_999)).toBe(1);
      expect(await after(1)).toBe(2);
      expect(await after(10_000)).toBe(3);
      expect(await after(20_000)).toBe(4);
      expect(await after(40_000)).toBe(5);
      expect(await after(60_000)).toBe(6);
      fetchMock.mockResolvedValue(Response.json({ token: "fresh" }));
      expect(await after(59_999)).toBe(6);
      expect(await after(1)).toBe(7);
      expect(signIns.at(-1)).toBe("fresh");
      // Signed in: no more retries.
      expect(await after(300_000)).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });
  it("starts one sign-in when a return fires both visibility and focus (#574)", async () => {
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => "visible");
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockReturnValue(new Promise<Response>(() => {}));
    await mountUnderConvex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A browser fires them as separate tasks, so each renders on its own.
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not retry after a superseded attempt fails once a newer one has signed in (#574)", async () => {
    vi.useFakeTimers();
    try {
      let failOld!: (error: Error) => void;
      fetchMock.mockReturnValueOnce(new Promise<Response>((_, reject) => { failOld = reject; }))
        .mockResolvedValue(Response.json({ token: "fresh" }));
      await mountUnderConvex();
      await act(async () => { window.dispatchEvent(new Event("online")); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await act(async () => { failOld(new Error("offline")); await vi.advanceTimersByTimeAsync(120_000); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("drops a failed sign-in's retry when the session changes (#574)", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValueOnce(new Error("offline"));
      const { result, rerender } = renderHook(useGuestAuth);
      await act(async () => { await result.current.fetchAccessToken(); });
      act(() => { sid = "other"; rerender(); });
      const forOther = result.current.fetchAccessToken;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(result.current.fetchAccessToken).toBe(forOther);
    } finally {
      vi.useRealTimers();
    }
  });
  it("retries a failed sign-in when the page becomes visible, and not while it is hidden (#574)", async () => {
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(useGuestAuth);
    const failedOnce = result.current.fetchAccessToken;
    await act(async () => { await failedOnce(); });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.fetchAccessToken).toBe(failedOnce);
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.fetchAccessToken).not.toBe(failedOnce);
  });
  it("returns no bearer on expiry or network failure and permits a later retry", async () => {
    const { result } = renderHook(useGuestAuth);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ token: "new" }));
    expect(await result.current.fetchAccessToken()).toBeNull();
    expect(await result.current.fetchAccessToken()).toBeNull();
    expect(await result.current.fetchAccessToken()).toBe("new");
  });
});
