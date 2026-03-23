import { cookies } from "next/headers";

export type VerseViewValue = "reader" | "gallery";

export type VerseViewEngagementTrigger =
  | "verse_navigation"
  | "chapter_gallery_item_opened"
  | "image_fullscreen_opened"
  | "image_generation_started";

export const ANON_ID_COOKIE_NAME = "visibible_anon_id";
export const VIEW_OVERRIDE_COOKIE_NAME = "visibible_view_override";
export const LEGACY_PREFERENCES_STORAGE_KEY = "visibible-preferences";
export const VERSE_VIEW_FLAG_KEY = "default-verse-view-v1";
export const VERSE_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const ANON_ID_HEADER_NAME = "x-visibible-anon-id";

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

export function parseVerseViewValue(value: unknown): VerseViewValue | null {
  return value === "reader" || value === "gallery" ? value : null;
}

export async function getVerseViewOverrideFromCookies(): Promise<VerseViewValue | null> {
  const cookieStore = await cookies();
  return parseVerseViewValue(cookieStore.get(VIEW_OVERRIDE_COOKIE_NAME)?.value);
}

export function createAnonId(): string {
  return crypto.randomUUID();
}

export function getAnonIdCookieOptions(value: string) {
  return {
    name: ANON_ID_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: VERSE_VIEW_COOKIE_MAX_AGE,
  };
}

export function getViewOverrideCookieAttributes(): string {
  return [
    `path=/`,
    `max-age=${VERSE_VIEW_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    ...(isSecureCookie() ? ["Secure"] : []),
  ].join("; ");
}

export function buildViewOverrideCookieString(view: VerseViewValue): string {
  return `${VIEW_OVERRIDE_COOKIE_NAME}=${view}; ${getViewOverrideCookieAttributes()}`;
}

function parseLegacyPreferences(rawValue: string | null): Record<string, unknown> | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function readLegacyChapterGalleryPreference(storage: Pick<Storage, "getItem">): VerseViewValue | null {
  const prefs = parseLegacyPreferences(storage.getItem(LEGACY_PREFERENCES_STORAGE_KEY));
  const chapterGalleryEnabled = prefs?.chapterGalleryEnabled;
  if (typeof chapterGalleryEnabled !== "boolean") {
    return null;
  }

  return chapterGalleryEnabled ? "gallery" : "reader";
}

export function syncLegacyChapterGalleryPreference(
  storage: Pick<Storage, "getItem" | "setItem">,
  view: VerseViewValue
) {
  const current = parseLegacyPreferences(storage.getItem(LEGACY_PREFERENCES_STORAGE_KEY)) ?? {};
  current.chapterGalleryEnabled = view === "gallery";
  storage.setItem(LEGACY_PREFERENCES_STORAGE_KEY, JSON.stringify(current));
}
