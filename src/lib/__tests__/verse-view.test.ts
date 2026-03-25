import { describe, expect, it } from "vitest";
import {
  ANON_ID_COOKIE_NAME,
  VIEW_OVERRIDE_COOKIE_NAME,
  buildViewOverrideCookieString,
  getAnonIdCookieOptions,
  parseVerseViewValue,
  readLegacyChapterGalleryPreference,
  syncLegacyChapterGalleryPreference,
} from "@/lib/verse-view";

describe("parseVerseViewValue", () => {
  it("accepts reader and gallery", () => {
    expect(parseVerseViewValue("reader")).toBe("reader");
    expect(parseVerseViewValue("gallery")).toBe("gallery");
  });

  it("rejects invalid values", () => {
    expect(parseVerseViewValue("other")).toBeNull();
    expect(parseVerseViewValue(null)).toBeNull();
  });
});

describe("legacy chapter gallery preference helpers", () => {
  it("reads a legacy gallery preference", () => {
    const storage: Pick<Storage, "getItem"> = {
      getItem: () => JSON.stringify({ chapterGalleryEnabled: true }),
    };

    expect(readLegacyChapterGalleryPreference(storage)).toBe("gallery");
  });

  it("reads a legacy reader preference", () => {
    const storage: Pick<Storage, "getItem"> = {
      getItem: () => JSON.stringify({ chapterGalleryEnabled: false }),
    };

    expect(readLegacyChapterGalleryPreference(storage)).toBe("reader");
  });

  it("returns null when the legacy preference is absent", () => {
    const storage: Pick<Storage, "getItem"> = {
      getItem: () => JSON.stringify({ translation: "kjv" }),
    };

    expect(readLegacyChapterGalleryPreference(storage)).toBeNull();
  });

  it("syncs the legacy preference without dropping other fields", () => {
    let stored = JSON.stringify({ translation: "niv" });
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    syncLegacyChapterGalleryPreference(storage, "gallery");

    expect(JSON.parse(stored)).toEqual({
      translation: "niv",
      chapterGalleryEnabled: true,
    });
  });

  it("syncs a reader preference without dropping other fields", () => {
    let stored = JSON.stringify({ translation: "niv" });
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    syncLegacyChapterGalleryPreference(storage, "reader");

    expect(JSON.parse(stored)).toEqual({
      translation: "niv",
      chapterGalleryEnabled: false,
    });
  });
});

describe("verse view cookies", () => {
  it("builds the reader override cookie string", () => {
    expect(buildViewOverrideCookieString("reader")).toContain(`${VIEW_OVERRIDE_COOKIE_NAME}=reader`);
  });

  it("returns anon id cookie options", () => {
    const cookie = getAnonIdCookieOptions("anon-id");
    expect(cookie.name).toBe(ANON_ID_COOKIE_NAME);
    expect(cookie.value).toBe("anon-id");
    expect(cookie.httpOnly).toBe(true);
  });
});
