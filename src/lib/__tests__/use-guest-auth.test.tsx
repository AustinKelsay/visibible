// @vitest-environment jsdom
import { act, createElement, startTransition, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexProviderWithAuth } from "convex/react";
// @ts-expect-error -- the Convex client's sign-in logic is internal and ships its types elsewhere
import { AuthenticationManager } from "../../../node_modules/convex/dist/esm/browser/sync/authentication_manager.js";
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
 * Mounts the hook under the real ConvexProviderWithAuth and the Convex client's own sign-in logic (#574). A token it
 * gets is sent to the server (`sent`). A fetch with no token is followed by one forced fetch, and if that fails too the
 * page is signed out, with no retry until a new fetchAccessToken reaches setAuth (`signIns` counts them).
 */
async function mountUnderConvex() {
  const sent: string[] = [];
  let signIns = 0;
  const noop = () => {};
  const manager = new AuthenticationManager(
    { hasAuth: () => false, isNewAuth: () => true },
    { authenticate: (token: string) => { sent.push(token); }, stopSocket: async () => {}, tryRestartSocket: noop,
      pauseSocket: noop, resumeSocket: noop, clearAuth: noop },
    { logger: { logVerbose: noop, warn: noop, error: noop }, refreshTokenLeewaySeconds: 2, initialAuthTokenReuse: false },
  );
  const client = {
    setAuth: (...config: unknown[]) => { signIns++; void manager.setConfig(...config); },
    clearAuth: () => manager.stop(),
  };
  root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(createElement(ConvexProviderWithAuth, { client: client as never, useAuth: useGuestAuth }, null));
  });
  return { sent, signIns: () => signIns };
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
  it("signs Convex in again when the reader returns after a failed sign-in (#574)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ token: "fresh" }));
    const convex = await mountUnderConvex();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(convex.sent).toEqual([]);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(convex.sent).toEqual(["fresh"]);
    // Healthy now: returning again starts no sign-in.
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("signs in on return only after the session refresh has renewed the CSRF cookie (#574)", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>)["x-csrf-token"] === "renewed"
        ? Response.json({ token: "fresh" }) : new Response(null, { status: 403 }));
    const convex = await mountUnderConvex();
    expect(convex.sent).toEqual([]);
    // The session refresh is a network round trip: the cookie comes back with its reply.
    refetch.mockImplementationOnce(async () => {
      await new Promise((done) => setTimeout(done, 20));
      document.cookie = "visibible_csrf=renewed";
    });
    await act(async () => { window.dispatchEvent(new Event("focus")); await new Promise((done) => setTimeout(done, 60)); });
    expect(convex.sent).toEqual(["fresh"]);
  });
  it("retries a failed sign-in on its own after 5 s, doubling to at most a minute, until one succeeds (#574)", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValue(new Error("offline"));
      const convex = await mountUnderConvex();
      const after = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); return convex.signIns(); };
      expect(convex.signIns()).toBe(1);
      expect(await after(4_999)).toBe(1);
      expect(await after(1)).toBe(2);
      expect(await after(10_000)).toBe(3);
      expect(await after(20_000)).toBe(4);
      expect(await after(40_000)).toBe(5);
      expect(await after(60_000)).toBe(6);
      fetchMock.mockResolvedValue(Response.json({ token: "fresh" }));
      expect(await after(59_999)).toBe(6);
      expect(await after(1)).toBe(7);
      expect(convex.sent).toEqual(["fresh"]);
      // Signed in: no more retries.
      expect(await after(300_000)).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });
  it("lets a reconnect take the place of a waiting retry (#574)", async () => {
    vi.useFakeTimers();
    try {
      let signIn!: (response: Response) => void;
      fetchMock.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"))
        .mockReturnValueOnce(new Promise<Response>((done) => { signIn = done; }));
      const convex = await mountUnderConvex();
      await act(async () => { await vi.advanceTimersByTimeAsync(4_000); window.dispatchEvent(new Event("online")); });
      expect(convex.signIns()).toBe(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(convex.signIns()).toBe(2);
      await act(async () => { signIn(Response.json({ token: "fresh" })); });
      expect(convex.sent).toEqual(["fresh"]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not retry after a superseded attempt fails while a reconnect is still being applied (#574)", async () => {
    vi.useFakeTimers();
    try {
      let failOld!: (error: Error) => void;
      let signIn!: (response: Response) => void;
      fetchMock.mockRejectedValueOnce(new Error("offline"))
        .mockReturnValueOnce(new Promise<Response>((_, reject) => { failOld = reject; }))
        .mockReturnValueOnce(new Promise<Response>((done) => { signIn = done; }));
      const convex = await mountUnderConvex();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The old attempt's forced fetch fails after the reconnect is queued, before React applies it.
      window.dispatchEvent(new Event("online"));
      failOld(new Error("offline"));
      // The reconnect's sign-in is still on its way when a retry for the old failure would be due.
      for (let step = 0; step < 6; step++) await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(convex.signIns()).toBe(2);
      await act(async () => { signIn(Response.json({ token: "fresh" })); });
      expect(convex.sent).toEqual(["fresh"]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("holds a waiting retry back while the return's session refresh renews the CSRF cookie (#574)", async () => {
    vi.useFakeTimers();
    try {
      // Convex's plain fetch fails at once; its forced fetch is refused only after a while, as over a slow network.
      let calls = 0;
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        calls++;
        if ((init.headers as Record<string, string>)["x-csrf-token"] === "renewed") return Response.json({ token: "fresh" });
        if (calls % 2 === 0) await new Promise((done) => setTimeout(done, 400));
        return new Response(null, { status: 403 });
      });
      const convex = await mountUnderConvex();
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(convex.sent).toEqual([]);
      // The first retry is due at 5.4 s. The reader returns at 5.3 s, and the session refresh takes 300 ms.
      await act(async () => { await vi.advanceTimersByTimeAsync(4_900); });
      refetch.mockImplementationOnce(async () => {
        await new Promise((done) => setTimeout(done, 300));
        document.cookie = "visibible_csrf=renewed";
      });
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      // Step through the next second as the browser would, rendering between steps.
      for (let step = 0; step < 10; step++) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(convex.sent).toEqual(["fresh"]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps one short hold on a waiting retry when the session refresh stalls across returns (#574)", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(Response.json({ token: "fresh" }));
      refetch.mockImplementation(() => new Promise<void>(() => {}));
      const convex = await mountUnderConvex();
      for (let second = 1; second <= 12; second++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
        if (second === 1 || second === 6 || second === 9) await act(async () => { window.dispatchEvent(new Event("focus")); });
      }
      expect(convex.sent).toEqual(["fresh"]);
    } finally {
      refetch.mockReset();
      refetch.mockImplementation(async () => {});
      vi.useRealTimers();
    }
  });
  it("lets only the latest return's session refresh release the waiting retry (#574)", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
        (init.headers as Record<string, string>)["x-csrf-token"] === "renewed"
          ? Response.json({ token: "fresh" }) : new Response(null, { status: 403 }));
      const convex = await mountUnderConvex();
      // Two returns: the first refresh settles without renewing the cookie, the second renews it later.
      refetch.mockImplementationOnce(() => new Promise<void>((done) => { setTimeout(done, 100); }))
        .mockImplementationOnce(async () => {
          await new Promise((done) => setTimeout(done, 300));
          document.cookie = "visibible_csrf=renewed";
        });
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      for (let step = 0; step < 5; step++) await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(convex.sent).toEqual(["fresh"]);
      expect(convex.signIns()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("drops a failed sign-in's retry when the session changes (#574)", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockRejectedValueOnce(new Error("offline"));
      const { result, rerender } = renderHook(useGuestAuth);
      await act(async () => { await result.current.fetchAccessToken({ forceRefreshToken: true }); });
      act(() => { sid = "other"; rerender(); });
      const forOther = result.current.fetchAccessToken;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(result.current.fetchAccessToken).toBe(forOther);
    } finally {
      vi.useRealTimers();
    }
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
