// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "../session-context";

let auth = { isLoading: false, isAuthenticated: true };
let wallet: { sid: string; tier: string; credits: number; pendingCredits: number } | null | undefined;
const query = vi.fn(() => wallet);
const guest = { sid: "owner", isLoading: false, error: null, refetch: vi.fn(), buyCredits: vi.fn(), isBuyModalOpen: false, closeBuyModal: vi.fn() };
vi.mock("convex/react", () => ({ useConvexAuth: () => auth, useQuery: () => query() }));
vi.mock("../guest-session-context", () => ({ useGuestSession: () => guest }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
let current: ReturnType<typeof useSession>;
function Probe() {
  const session = useSession();
  useLayoutEffect(() => { current = session; }, [session]);
  return null;
}
function render() { act(() => root.render(createElement(SessionProvider, null, createElement(Probe)))); }
beforeEach(() => {
  auth = { isLoading: false, isAuthenticated: true };
  wallet = { sid: "owner", tier: "paid", credits: 100, pendingCredits: 0 };
  container = document.createElement("div"); root = createRoot(container);
  query.mockClear(); guest.refetch.mockClear();
});
afterEach(() => act(() => root.unmount()));
describe("reactive wallet display", () => {
  it("gives available credits and pending holds from each subscribed result", () => {
    render();
    expect(current).toMatchObject({ credits: 100, pendingCredits: 0, accessStatus: "ready" });
    wallet = { ...wallet!, credits: 70, pendingCredits: 30 }; render();
    expect(current).toMatchObject({ credits: 70, pendingCredits: 30 });
    wallet = { ...wallet, credits: 90, pendingCredits: 0 }; render();
    expect(current).toMatchObject({ credits: 90, pendingCredits: 0 });
    expect(guest.refetch).not.toHaveBeenCalled();
  });
  it("distinguishes loading and unavailable access from a ready zero balance", () => {
    wallet = undefined; render();
    expect(current.isLoading).toBe(true);
    wallet = null; render();
    expect(current.isLoading).toBe(false);
    expect(current.accessStatus).toBe("unavailable");
    wallet = { sid: "owner", tier: "paid", credits: 0, pendingCredits: 0 }; render();
    expect(current.accessStatus).toBe("ready");
    expect(current.credits).toBe(0);
  });
  it("never exposes a cached balance or admin tier after auth loss or subject mismatch", () => {
    wallet = { sid: "owner", tier: "admin", credits: 900, pendingCredits: 10 }; render();
    expect(current.tier).toBe("admin");
    auth = { isAuthenticated: false, isLoading: false }; render();
    expect(current).toMatchObject({ sid: null, tier: "paid", credits: 0, pendingCredits: 0 });
    auth.isAuthenticated = true;
    wallet.sid = "other"; render();
    expect(current).toMatchObject({ tier: "paid", credits: 0, accessStatus: "unavailable" });
  });
});
