import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

    expect(setCookie).toContain("visibible_anon_id=anon-id-123");
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
