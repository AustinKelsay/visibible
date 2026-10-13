import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/.well-known/lnurlp/[username]/route";

function callRoute(url: string, username: string) {
  return GET(new Request(url), { params: Promise.resolve({ username }) });
}

describe("GET /.well-known/lnurlp/[username]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the username and query string and returns the upstream JSON uncached", async () => {
    const body = JSON.stringify({ tag: "payRequest", callback: "https://visibible.com/lnurlp/pay" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callRoute("https://visibible.com/.well-known/lnurlp/pay?nostr=1", "pay");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://tower.taila60b27.ts.net:10000/.well-known/lnurlp/pay?nostr=1"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.text()).toBe(body);
  });

  it("propagates upstream error statuses and bodies", async () => {
    const body = JSON.stringify({ status: "ERROR", reason: "unknown user" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 404 })));

    const response = await callRoute("https://visibible.com/.well-known/lnurlp/nobody", "nobody");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(body);
  });

  it("encodes the username so it cannot change the upstream path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await callRoute("https://visibible.com/.well-known/lnurlp/x", "../admin");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://tower.taila60b27.ts.net:10000/.well-known/lnurlp/..%2Fadmin"
    );
  });

  it("returns an LNURL error with 502 when the upstream is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const response = await callRoute("https://visibible.com/.well-known/lnurlp/pay", "pay");

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({ status: "ERROR", reason: "Lightning service unavailable" });
  });
});
