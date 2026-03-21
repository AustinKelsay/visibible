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

export interface ChapterGalleryFlatItem extends ChapterGalleryCard {
  verse: number;
  text: string;
  href: string;
  imageCount: number;
  cardIndex: number;
  hasImages: boolean;
}

interface BuildChapterGalleryItemsOptions {
  book: string;
  chapter: number;
  verses: ChapterGalleryVerseRecord[];
  galleryImages?: ChapterGalleryImageRecord[] | null;
}

function isChapterGalleryImageRecord(value: unknown): value is ChapterGalleryImageRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.verse === "number" &&
    Number.isFinite(candidate.verse) &&
    typeof candidate.imageCount === "number" &&
    Number.isFinite(candidate.imageCount) &&
    (candidate.imageUrl === undefined || typeof candidate.imageUrl === "string") &&
    (candidate.imageId === undefined || typeof candidate.imageId === "string") &&
    (candidate.model === undefined || typeof candidate.model === "string") &&
    (candidate.createdAt === undefined || typeof candidate.createdAt === "number") &&
    (candidate.isLatest === undefined || typeof candidate.isLatest === "boolean")
  );
}

export function normalizeChapterGalleryImages(
  galleryImages: unknown
): ChapterGalleryImageRecord[] | null {
  if (!Array.isArray(galleryImages)) {
    return null;
  }

  return galleryImages.filter(isChapterGalleryImageRecord);
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
      imageCount: images.length,
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

export function buildFlatChapterGalleryItems(
  options: BuildChapterGalleryItemsOptions
): ChapterGalleryFlatItem[] {
  return buildChapterGalleryItems(options).flatMap((section) =>
    section.cards.map((card, cardIndex) => ({
      verse: section.verse,
      text: section.text,
      href: section.href,
      imageCount: section.imageCount,
      cardIndex,
      hasImages: section.hasImages,
      ...card,
    }))
  );
}
