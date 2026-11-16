"use client";

import { useEffect } from "react";
import { preload } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useEffectiveArtStyle } from "@/context/work-scope-context";

interface PrefetchNextSpreadProps {
  nextUrl?: string;
  /** Where the next verse's pictures are kept ("john-1-6"). */
  nextVerseId?: string;
}

/**
 * Fetches the next spread ahead so turning the page is immediate: the page itself, the next verse's
 * pictures (the same query and arguments SpreadPicture reads, so the next spread finds them already
 * loaded) and the picture it will show. Renders nothing.
 */
export function PrefetchNextSpread({ nextUrl, nextVerseId }: PrefetchNextSpreadProps) {
  const router = useRouter();
  const isConvexEnabled = useConvexEnabled();

  useEffect(() => {
    if (nextUrl) router.prefetch(nextUrl);
  }, [nextUrl, router]);

  return isConvexEnabled && nextVerseId ? <NextPicture verseId={nextVerseId} /> : null;
}

function NextPicture({ verseId }: { verseId: string }) {
  const { artStyle } = useEffectiveArtStyle();
  const pictures = useQuery(api.verseImages.getImageHistory, { verseId, artStyle });
  const imageUrl = pictures?.[0]?.imageUrl;
  if (imageUrl) preload(imageUrl, { as: "image" });
  return null;
}
