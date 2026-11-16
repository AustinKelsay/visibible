"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useEffectiveArtStyle } from "@/context/work-scope-context";
import { UnpaintedPicture } from "@/components/spread/unpainted-picture";
import { PictureMenu } from "@/components/spread/picture-menu";
import { useChosenPicture } from "@/components/spread/chosen-picture";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
}

/**
 * The spread's picture: the newest saved picture of the verse in the stored art style, cropped from
 * its centre to cover its frame. Its thumbnail shows first and the full picture replaces it once
 * loaded. The picture menu's chip sits on it; a version chosen there shows instead until the page turns. A verse
 * without one is unpainted: it glows with an earlier picture and offers to paint
 * it. While the verse's pictures load the frame stays plain dark.
 */
export function SpreadPicture(props: SpreadPictureProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedPicture {...props} /> : null;
}

function SavedPicture({ verseId, reference }: SpreadPictureProps) {
  const { artStyle } = useEffectiveArtStyle();
  // The same query and arguments the picture menu will read, so both share one subscription.
  const pictures = useQuery(api.verseImages.getImageHistory, { verseId, artStyle });
  const { chosen } = useChosenPicture();
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const newest = pictures?.[0];
  if (pictures === undefined) return null;
  if (!newest?.imageUrl) return <UnpaintedPicture key={verseId} verseId={verseId} reference={reference} artStyle={artStyle} />;
  const picture = chosen ?? newest;
  const showThumbnail = Boolean(picture.thumbnailUrl) && loadedId !== picture.id;
  const cover = "absolute inset-0 h-full w-full object-cover object-center";

  // Saved pictures come from Convex storage at their full size; there is no resizing service.
  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      {showThumbnail ? <img key={`${picture.id}-thumbnail`} src={picture.thumbnailUrl!} alt="" aria-hidden="true" className={cover} /> : null}
      <img
        key={picture.id}
        src={picture.imageUrl}
        alt={`Picture of ${reference}`}
        className={`${cover} transition-opacity duration-300 motion-reduce:transition-none`}
        style={showThumbnail ? { opacity: 0 } : undefined}
        onLoad={() => {
          setLoadedId(picture.id);
          if (recordedRef.current.has(picture.id)) return;
          recordedRef.current.add(picture.id);
          void recordImpression({ imageId: picture.id }).catch(() => recordedRef.current.delete(picture.id));
        }}
      />
      <PictureMenu key={verseId} verseId={verseId} reference={reference} pictures={pictures} shown={picture} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
