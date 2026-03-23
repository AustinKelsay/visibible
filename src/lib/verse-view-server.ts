import { cookies } from "next/headers";
import {
  parseVerseViewValue,
  VIEW_OVERRIDE_COOKIE_NAME,
  type VerseViewValue,
} from "@/lib/verse-view";

export async function getVerseViewOverrideFromCookies(): Promise<VerseViewValue | null> {
  const cookieStore = await cookies();
  return parseVerseViewValue(cookieStore.get(VIEW_OVERRIDE_COOKIE_NAME)?.value);
}
