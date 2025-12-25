import { cookies } from "next/headers";
import { Translation, DEFAULT_TRANSLATION } from "./bible-api";

const COOKIE_NAME = "vibible-translation";

/**
 * Get the user's translation preference from cookies (server-side)
 */
export async function getTranslationFromCookies(): Promise<Translation> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;

  if (value === 'web' || value === 'kjv') {
    return value;
  }

  return DEFAULT_TRANSLATION;
}
