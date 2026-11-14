import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { BookMenu } from "@/components/book-menu";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { ChatContextSetter } from "@/components/chat-context-setter";
import { Footer } from "@/components/footer";
import { MobileVerseNav } from "@/components/mobile-verse-nav";
import { VerseAnalytics } from "@/components/verse-analytics";
import { PassageUnavailable } from "@/components/passage-unavailable";
import { VersePageContent } from "@/components/verse-page-content";
import { VerseViewProvider } from "@/context/verse-view-context";
import { BibleApiLookupError } from "@/lib/bible-api";
import { getChapter, getVerse } from "@/lib/scripture";
import { getTranslationFromCookies } from "@/lib/get-translation";
import { MOBILE_VERSE_NAV_OFFSET } from "@/lib/mobile-verse-nav";
import {
  parseVerseUrl,
  getNavigationUrls,
  formatReference,
} from "@/lib/navigation";

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

  const reference = `${bookData.name} ${location.chapter}:${location.verse}`;

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
      <LayoutWrapper>
        <Header />
        <PassageUnavailable reference={formatReference(location)} translation={translation} retryable={retryable} />
        <Footer />
        <BookMenu />
      </LayoutWrapper>
    );
  }

  // Calculate navigation URLs
  const { prevUrl, nextUrl } = getNavigationUrls(location);
  const totalVerses = chapterData.verses.length;

  // Build chat context for sidebar
  const chatContext = {
    book: bookData.name,
    chapter: location.chapter,
    verseRange: String(location.verse),
  };
  const currentReference = `${bookData.name} ${location.chapter}:${location.verse}`;

  return (
    <LayoutWrapper>
      <VerseViewProvider
      >
        {/* Analytics tracking */}
        <VerseAnalytics
          book={bookData.name}
          chapter={location.chapter}
          verse={location.verse}
          testament={bookData.testament}
          translation={translation}
        />

        {/* Set chat context for sidebar */}
        <ChatContextSetter context={chatContext} />

        {/* Header */}
        <Header />

        <VersePageContent
          bookSlug={location.book.slug}
          bookName={bookData.name}
          chapter={location.chapter}
          verseNumber={location.verse}
          verseText={verseData.text}
          totalVerses={totalVerses}
          prevUrl={prevUrl ?? undefined}
          nextUrl={nextUrl ?? undefined}
          currentReference={currentReference}
          testament={bookData.testament}
          verses={chapterData.verses.map((item) => ({
            verse: item.verse,
            text: item.text,
          }))}
        />

        {/* Footer */}
        <Footer />

        {/* Spacer so sticky mobile verse nav bar doesn't cover footer */}
        <div className="sm:hidden" style={{ height: MOBILE_VERSE_NAV_OFFSET }} aria-hidden="true" />

        <MobileVerseNav
          book={bookData.name}
          chapter={location.chapter}
          verseNumber={location.verse}
          totalVerses={totalVerses}
          prevUrl={prevUrl ?? undefined}
          nextUrl={nextUrl ?? undefined}
        />

        {/* Book Menu */}
        <BookMenu />
      </VerseViewProvider>
    </LayoutWrapper>
  );
}
