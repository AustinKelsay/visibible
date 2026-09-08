// @vitest-environment jsdom
import { act, createElement, startTransition, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuestAuth } from "../use-guest-auth";
let sid: string | null = "owner";
const refetch = vi.fn(async () => {});
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid, isLoading: false, refetch }) }));
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
const fetchMock = vi.fn();
beforeEach(() => { sid = "owner"; suspend = false; vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("localStorage", { setItem: vi.fn() }); vi.stubGlobal("sessionStorage", { setItem: vi.fn() }); fetchMock.mockReset(); refetch.mockClear(); document.cookie = "visibible_csrf=csrf"; });
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });
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
  it("returns no bearer on expiry or network failure and permits a later retry", async () => {
    const { result } = renderHook(useGuestAuth);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ token: "new" }));
    expect(await result.current.fetchAccessToken()).toBeNull();
    expect(await result.current.fetchAccessToken()).toBeNull();
    expect(await result.current.fetchAccessToken()).toBe("new");
  });
});
