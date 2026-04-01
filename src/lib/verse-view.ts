export type VerseViewValue = "reader" | "gallery";

export type VerseViewEngagementTrigger =
  | "verse_navigation"
  | "chapter_gallery_item_opened"
  | "image_fullscreen_opened"
  | "image_generation_started";

export const ANON_ID_COOKIE_NAME = "visibible_anon_id";
export const VERSE_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const ANON_ID_HEADER_NAME = "x-visibible-anon-id";

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
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
