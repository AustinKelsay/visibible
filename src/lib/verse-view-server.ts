import { cookies } from "next/headers";
import {
  NEXT_VIEW_COOKIE_NAME,
  parseVerseViewValue,
  VIEW_OVERRIDE_COOKIE_NAME,
  type VerseViewValue,
} from "@/lib/verse-view";

export async function getVerseViewOverrideFromCookies(): Promise<VerseViewValue | null> {
  const cookieStore = await cookies();
  return parseVerseViewValue(cookieStore.get(VIEW_OVERRIDE_COOKIE_NAME)?.value);
}

export async function getVerseViewNavigationFromCookies(): Promise<VerseViewValue | null> {
  const cookieStore = await cookies();
  return parseVerseViewValue(cookieStore.get(NEXT_VIEW_COOKIE_NAME)?.value);
}
