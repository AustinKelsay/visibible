import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ANON_ID_HEADER_NAME,
  getAnonIdCookieOptions,
} from "@/lib/verse-view";

vi.mock("@/lib/verse-view", async () => {
  const actual = await vi.importActual<typeof import("@/lib/verse-view")>("@/lib/verse-view");
  return {
    ...actual,
    createAnonId: vi.fn(() => "anon-id-123"),
  };
});

import { middleware } from "../../middleware";

describe("middleware", () => {
  it("sets an anon id cookie for html navigations without one", () => {
    const request = new NextRequest("http://localhost:3000/genesis/1/1", {
      headers: {
        accept: "text/html",
      },
    });

    const response = middleware(request);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const overrideHeaders = response.headers.get("x-middleware-override-headers") ?? "";
    const forwardedAnonId = response.headers.get(`x-middleware-request-${ANON_ID_HEADER_NAME}`);
    const cookieOptions = getAnonIdCookieOptions("anon-id-123");

    expect(overrideHeaders).toContain(ANON_ID_HEADER_NAME);
    expect(forwardedAnonId).toBe("anon-id-123");
    expect(setCookie).toContain(`${cookieOptions.name}=${cookieOptions.value}`);
  });

  it("does not set the anon id cookie for non-document requests", () => {
    const request = new NextRequest("http://localhost:3000/api/session", {
      method: "POST",
      headers: {
        accept: "application/json",
      },
    });

    const response = middleware(request);

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
