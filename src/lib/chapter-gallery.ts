export interface ChapterGalleryImageRecord {
  verse: number;
  imageCount: number;
  imageUrl?: string;
  imageId?: string;
  model?: string;
  createdAt?: number;
}

export interface ChapterGalleryVerseRecord {
  verse: number;
  text: string;
}

export interface ChapterGalleryItem {
  verse: number;
  text: string;
  href: string;
  imageCount: number;
  imageUrl?: string;
  imageId?: string;
  model?: string;
  createdAt?: number;
  hasImage: boolean;
}

interface BuildChapterGalleryItemsOptions {
  book: string;
  chapter: number;
  verses: ChapterGalleryVerseRecord[];
  galleryImages?: ChapterGalleryImageRecord[] | null;
}

export function buildChapterGalleryItems({
  book,
  chapter,
  verses,
  galleryImages,
}: BuildChapterGalleryItemsOptions): ChapterGalleryItem[] {
  const imagesByVerse = new Map(
    (galleryImages ?? []).map((image) => [image.verse, image])
  );

  return verses.map((verse) => {
    const image = imagesByVerse.get(verse.verse);

    return {
      verse: verse.verse,
      text: verse.text,
      href: `/${book}/${chapter}/${verse.verse}`,
      imageCount: image?.imageCount ?? 0,
      imageUrl: image?.imageUrl,
      imageId: image?.imageId,
      model: image?.model,
      createdAt: image?.createdAt,
      hasImage: Boolean(image?.imageUrl),
    };
  });
}
