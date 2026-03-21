export interface ChapterGalleryImageRecord {
  verse: number;
  imageCount: number;
  imageUrl?: string;
  imageId?: string;
  model?: string;
  createdAt?: number;
  isLatest?: boolean;
}

export interface ChapterGalleryVerseRecord {
  verse: number;
  text: string;
}

export interface ChapterGalleryCard {
  imageUrl?: string;
  imageId?: string;
  model?: string;
  createdAt?: number;
  isLatest: boolean;
  isPlaceholder: boolean;
}

export interface ChapterGallerySection {
  verse: number;
  text: string;
  href: string;
  imageCount: number;
  hasImages: boolean;
  cards: ChapterGalleryCard[];
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
}: BuildChapterGalleryItemsOptions): ChapterGallerySection[] {
  const imagesByVerse = new Map<number, ChapterGalleryImageRecord[]>();

  for (const image of galleryImages ?? []) {
    const group = imagesByVerse.get(image.verse) ?? [];
    group.push(image);
    imagesByVerse.set(image.verse, group);
  }

  return verses.map((verse) => {
    const images = imagesByVerse.get(verse.verse) ?? [];

    return {
      verse: verse.verse,
      text: verse.text,
      href: `/${book}/${chapter}/${verse.verse}`,
      imageCount: images[0]?.imageCount ?? 0,
      hasImages: images.length > 0,
      cards: images.length > 0
        ? images.map((image, index) => ({
            imageUrl: image.imageUrl,
            imageId: image.imageId,
            model: image.model,
            createdAt: image.createdAt,
            isLatest: image.isLatest ?? index === 0,
            isPlaceholder: false,
          }))
        : [
            {
              isLatest: false,
              isPlaceholder: true,
            },
          ],
    };
  });
}
