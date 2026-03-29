import { describe, expect, it } from "vitest";
import {
  ANON_ID_COOKIE_NAME,
  createAnonId,
  getAnonIdCookieOptions,
} from "@/lib/verse-view";

describe("verse view helpers", () => {
  it("creates UUID anon ids", () => {
    const anonId = createAnonId();
    expect(anonId).toHaveLength(36);
    expect(anonId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("returns anon id cookie options", () => {
    const cookie = getAnonIdCookieOptions("anon-id");
    expect(cookie.name).toBe(ANON_ID_COOKIE_NAME);
    expect(cookie.value).toBe("anon-id");
    expect(cookie.httpOnly).toBe(true);
  });
});
