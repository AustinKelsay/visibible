// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GuestSessionProvider, useGuestSession } from "../guest-session-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

it("keeps established identity available during background renewal and clears it on invalid access", async () => {
  let current: ReturnType<typeof useGuestSession>;
  function Probe() {
    const guest = useGuestSession();
    useLayoutEffect(() => { current = guest; }, [guest]);
    return createElement("span", null, `${guest.sid}:${guest.isLoading}`);
  }
  let resolveInitial!: (response: Response) => void;
  let resolveRenewal!: (response: Response) => void;
  const fetcher = vi.fn()
    .mockReturnValueOnce(new Promise<Response>(resolve => { resolveInitial = resolve; }))
    .mockReturnValueOnce(new Promise<Response>(resolve => { resolveRenewal = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GuestSessionProvider, null, createElement(Probe))));
    expect(container.textContent).toBe("null:true");
    await act(async () => resolveInitial(Response.json({ sid: "owner", tier: "paid", credits: 100 })));
    expect(container.textContent).toBe("owner:false");
    let renewal!: Promise<void>;
    act(() => { renewal = current.refetch(); });
    expect(container.textContent).toBe("owner:false");
    await act(async () => {
      resolveRenewal(Response.json({ sid: null, status: "invalid", invalidReason: "expired" }));
      await renewal;
    });
    expect(container.textContent).toBe("null:false");
    expect(current!.error).toContain("expired");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
  }
});
