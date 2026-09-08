// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuestAuth } from "../use-guest-auth";
let sid: string | null = "owner";
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid, isLoading: false }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
function renderHook(hook: typeof useGuestAuth) {
  const result = { current: undefined as unknown as ReturnType<typeof useGuestAuth> };
  function Probe() { result.current = hook(); return null; }
  root = createRoot(document.createElement("div"));
  const rerender = () => root.render(createElement(Probe));
  act(rerender);
  return { result, rerender };
}
const fetchMock = vi.fn();
beforeEach(() => { sid = "owner"; vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("localStorage", { setItem: vi.fn() }); vi.stubGlobal("sessionStorage", { setItem: vi.fn() }); fetchMock.mockReset(); document.cookie = "visibible_csrf=csrf"; });
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
  it("returns no bearer on expiry or network failure and permits a later retry", async () => {
    const { result } = renderHook(useGuestAuth);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ token: "new" }));
    expect(await result.current.fetchAccessToken()).toBeNull();
    expect(await result.current.fetchAccessToken()).toBeNull();
    expect(await result.current.fetchAccessToken()).toBe("new");
  });
});
