/**
 * Which address a wall tile or preview loads for a saved picture (#444): its thumbnail when it has one, otherwise the
 * full picture. Pictures saved before thumbnails existed, or whose thumbnail could not be made, have none.
 */
export function previewSource(picture: { imageUrl?: string | null; thumbnailUrl?: string | null }): string | null {
  return picture.thumbnailUrl ?? picture.imageUrl ?? null;
}
