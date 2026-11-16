"use client";

import { useEffect } from "react";
import { preload } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePictureStyles } from "@/context/work-scope-context";

interface PrefetchNextSpreadProps {
  nextUrl?: string;
  /** Where the next verse's pictures are kept ("john-1-6"). */
  nextVerseId?: string;
}

/**
 * Fetches the next spread ahead so turning the page is immediate: the page itself, the next verse's
 * picture by the picture rule (the same query and arguments SpreadPicture reads, so the next spread finds
 * it already loaded) and that picture's file. Renders nothing.
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
  const { order } = usePictureStyles();
  const picture = useQuery(api.verseImages.getSpreadPicture, { verseId, styles: order });
  if (picture?.thumbnailUrl) preload(picture.thumbnailUrl, { as: "image" });
  if (picture?.imageUrl) preload(picture.imageUrl, { as: "image" });
  return null;
}
