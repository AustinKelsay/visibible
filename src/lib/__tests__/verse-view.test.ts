import { describe, expect, it } from "vitest";
import {
  ANON_ID_COOKIE_NAME,
  getAnonIdCookieOptions,
} from "@/lib/verse-view";

describe("verse view helpers", () => {
  it("returns anon id cookie options", () => {
    const cookie = getAnonIdCookieOptions("anon-id");
    expect(cookie.name).toBe(ANON_ID_COOKIE_NAME);
    expect(cookie.value).toBe("anon-id");
    expect(cookie.httpOnly).toBe(true);
  });
});
