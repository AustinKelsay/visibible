import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VerseAnalytics } from "@/components/verse-analytics";
import { PassageUnavailable } from "@/components/passage-unavailable";
import { Spread } from "@/components/spread/spread";
import { BibleApiLookupError, TRANSLATIONS } from "@/lib/bible-api";
import { getChapter, getVerse } from "@/lib/scripture";
import { getTranslationFromCookies } from "@/lib/get-translation";
import { verseSetting } from "@/lib/verse-setting";
import {
  parseVerseUrl,
  getNavigationUrls,
  getNextVerse,
  formatReference,
  verseLocationToId,
} from "@/lib/navigation";
import { readableReference } from "@/lib/readable-reference";

interface VersePageProps {
  params: Promise<{
    book: string;
    chapter: string;
    verse: string;
  }>;
}

export async function generateMetadata({
  params,
}: VersePageProps): Promise<Metadata> {
  const { book, chapter, verse } = await params;

  const location = parseVerseUrl(book, chapter, verse);
  const bookData = location?.book;

  if (!location || !bookData) {
    return {
      title: "Visibible",
      description: "Explore Scripture with AI-powered insights and imagery",
    };
  }

  const reference = readableReference(`${bookData.name} ${location.chapter}:${location.verse}`);

  // Fetch verse text for description
  const translation = await getTranslationFromCookies();
  const verseData = await getVerse(book, location.chapter, location.verse, translation).catch(() => null);
  const description = verseData
    ? verseData.text.slice(0, 155) + (verseData.text.length > 155 ? "..." : "")
    : `Read ${reference} with AI-powered insights and imagery`;

  return {
    title: `${reference} - Visibible`,
    description,
    openGraph: {
      title: `${reference} - Visibible`,
      description,
      type: "article",
      siteName: "Visibible",
    },
    twitter: {
      card: "summary",
      title: `${reference} - Visibible`,
      description,
    },
  };
}

export default async function VersePage({ params }: VersePageProps) {
  const { book, chapter, verse } = await params;

  // Parse and validate the URL
  const location = parseVerseUrl(book, chapter, verse);
  if (!location) {
    notFound();
  }

  const bookData = location.book;

  // Get user's translation preference from cookie
  const translation = await getTranslationFromCookies();
  let chapterData;
  let retryable = false;
  try {
    chapterData = await getChapter(location.book.slug, location.chapter, translation);
  } catch (error) {
    if (!(error instanceof BibleApiLookupError)) throw error;
    retryable = error.retryable;
  }
  const verseData = chapterData?.verses.find((item) => item.verse === location.verse);
  if (!chapterData || !verseData) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--background)]">
        <SiteHeader />
        <PassageUnavailable reference={readableReference(formatReference(location))} translation={translation} retryable={retryable} />
      </div>
    );
  }

  const { prevUrl, nextUrl } = getNavigationUrls(location);
  const nextVerse = getNextVerse(location);

  return (
    <>
      <VerseAnalytics
        book={bookData.name}
        chapter={location.chapter}
        verse={location.verse}
        testament={bookData.testament}
        translation={translation}
      />
      <Spread
        verseId={verseLocationToId(location)}
        path={`/${bookData.slug}/${location.chapter}/${location.verse}`}
        bookSlug={bookData.slug}
        bookName={bookData.name}
        chapter={location.chapter}
        verseNumber={location.verse}
        reference={`${bookData.name} ${location.chapter}:${location.verse}`}
        verseText={verseData.text}
        totalVerses={chapterData.verses.length}
        translationName={TRANSLATIONS[translation].name}
        prevUrl={prevUrl ?? undefined}
        nextUrl={nextUrl ?? undefined}
        nextVerseId={nextVerse ? verseLocationToId(nextVerse) : undefined}
        setting={verseSetting(bookData.id, location.chapter, location.verse)}
      />
    </>
  );
}
