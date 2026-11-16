/**
 * A fake of the Convex reads that choose a verse's picture, for whole-page tests. It answers them as the database
 * half of the picture rule does (convex/verseImages.ts): the newest saved picture in the first of the given styles
 * that has one. It does not drop owner-only styles, as the real server also does, so a page test proves the reader
 * never asks for one.
 *
 * Saved pictures are named "<verseId>:<name>".
 */
import { getFunctionName, type FunctionReference } from "convex/server";

export type SavedPicture = { id: string; imageUrl: string; thumbnailUrl?: string | null; artStyle: string; createdAt: number };

export const verseOf = (picture: SavedPicture) => picture.id.split(":")[0];

const summary = (picture: SavedPicture) => ({
  id: picture.id,
  imageUrl: picture.imageUrl,
  thumbnailUrl: picture.thumbnailUrl ?? null,
  artStyle: picture.artStyle,
});

export function spreadPicture(saved: readonly SavedPicture[], verseId: string, styles: readonly string[]) {
  const mine = saved.filter((picture) => verseOf(picture) === verseId).sort((a, b) => b.createdAt - a.createdAt);
  for (const style of styles) {
    const newest = mine.find((picture) => picture.artStyle === style);
    if (newest) return summary(newest);
  }
  return null;
}

/** Answers a picture read, or returns `unhandled` for any other query. */
export function answerPictureRead(saved: readonly SavedPicture[], query: FunctionReference<"query">, args: unknown, unhandled: unknown = undefined) {
  const name = getFunctionName(query);
  if (name === "verseImages:getSpreadPicture") {
    const { verseId, styles } = args as { verseId: string; styles: string[] };
    return spreadPicture(saved, verseId, styles);
  }
  if (name === "verseImages:getChapterContents") {
    const { verseIds, styles } = args as { verseIds: string[]; styles: string[] };
    return verseIds.map((verseId) => {
      const count = saved.filter((picture) => verseOf(picture) === verseId).length;
      return { verseId, picture: spreadPicture(saved, verseId, styles), pictureCount: Math.min(count, 9), morePictures: count > 9, hasVideo: false };
    });
  }
  if (name === "verseImages:getNearestEarlierPicture") {
    const { verseId, styles, earlier } = args as { verseId: string; styles: string[]; earlier?: string[] };
    const match = /^(.+-\d+)-(\d+)$/.exec(verseId);
    const candidates = earlier
      ?? (match ? Array.from({ length: Number(match[2]) - 1 }, (_, index) => `${match[1]}-${Number(match[2]) - 1 - index}`) : []);
    for (const candidate of candidates) {
      const picture = spreadPicture(saved, candidate, styles);
      if (picture) return { verseId: candidate, id: picture.id, imageUrl: picture.imageUrl, thumbnailUrl: picture.thumbnailUrl };
    }
    return null;
  }
  if (name === "verseImages:getStyleExamples") {
    const { verseId, styles } = args as { verseId: string; styles: string[] };
    return styles.map((style) => ({ style, picture: spreadPicture(saved, verseId, [style]) ?? spreadPicture(saved, "genesis-1-1", [style]) }));
  }
  if (name === "verseImages:getImageHistory") {
    const { verseId, artStyle, otherStyles } = args as { verseId: string; artStyle?: string; otherStyles?: boolean };
    return saved
      .filter((picture) => verseOf(picture) === verseId && (artStyle === undefined || (otherStyles ? picture.artStyle !== artStyle : picture.artStyle === artStyle)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  return unhandled;
}
