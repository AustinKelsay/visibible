// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GuestSessionProvider } from "@/context/guest-session-context";
import RecoverPage from "./page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it("waits for both guest initialization requests before submitting recovery", async () => {
  window.history.replaceState(null, "", "/recover");
  let resolveGet!: (response: Response) => void;
  let resolvePost!: (response: Response) => void;
  const fetcher = vi.fn()
    .mockReturnValueOnce(new Promise<Response>(resolve => { resolveGet = resolve; }))
    .mockReturnValueOnce(new Promise<Response>(resolve => { resolvePost = resolve; }))
    .mockResolvedValueOnce(Response.json({ sid: "fresh", tier: "paid", credits: 0 }))
    .mockResolvedValueOnce(Response.json({ error: "Invalid test code" }, { status: 400 }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GuestSessionProvider, null, createElement(RecoverPage))));
    const form = container.querySelector("form")!;
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    // Even a direct form-submit event cannot bypass the initialization guard.
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => resolveGet(Response.json({ sid: null, status: "missing" })));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(button.disabled).toBe(true);
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => resolvePost(Response.json({ sid: "fresh", tier: "paid", credits: 0 })));
    expect(button.disabled).toBe(false);
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/session", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "/api/session/recover", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Invalid test code");
  } finally {
    act(() => root.unmount());
  }
});
