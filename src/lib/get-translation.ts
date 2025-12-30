import { cookies } from "next/headers";
import { Translation, DEFAULT_TRANSLATION, TRANSLATIONS } from "./bible-api";

const COOKIE_NAME = "visibible-translation";

/**
 * Get the user's translation preference from cookies (server-side)
 */
export async function getTranslationFromCookies(): Promise<Translation> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;

  // Validate that the cookie value is a valid translation key
  if (value && Object.prototype.hasOwnProperty.call(TRANSLATIONS, value)) {
    return value as Translation;
  }

  return DEFAULT_TRANSLATION;
}
