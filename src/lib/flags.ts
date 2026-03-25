import type { Adapter } from "flags";
import { flag, dedupe } from "flags/next";
import { vercelAdapter } from "@flags-sdk/vercel";
import {
  ANON_ID_COOKIE_NAME,
  ANON_ID_HEADER_NAME,
  VERSE_VIEW_FLAG_KEY,
  type VerseViewValue,
} from "@/lib/verse-view";

type FlagEntities = {
  visitor?: {
    id: string;
  };
};

export function getDefaultVerseViewAdapter(): Adapter<VerseViewValue, FlagEntities> {
  if (process.env.FLAGS) {
    return vercelAdapter<VerseViewValue, FlagEntities>();
  }

  return {
    config: { reportValue: false },
    decide(): VerseViewValue {
      return "reader";
    },
  };
}

export const identifyVisitor = dedupe(async ({ cookies, headers }): Promise<FlagEntities> => {
  const visitorId =
    cookies.get(ANON_ID_COOKIE_NAME)?.value ??
    headers.get(ANON_ID_HEADER_NAME) ??
    undefined;

  return visitorId
    ? {
        visitor: {
          id: visitorId,
        },
      }
    : {};
});

export const defaultVerseViewFlag = flag<VerseViewValue, FlagEntities>({
  key: VERSE_VIEW_FLAG_KEY,
  description: "Controls the default verse-page view for reader-vs-gallery experiments.",
  options: [
    { label: "Reader", value: "reader" },
    { label: "Gallery", value: "gallery" },
  ],
  defaultValue: "reader",
  adapter: getDefaultVerseViewAdapter(),
  identify: identifyVisitor,
});
