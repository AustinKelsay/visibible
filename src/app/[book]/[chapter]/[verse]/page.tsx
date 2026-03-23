import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { BookMenu } from "@/components/book-menu";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { ChatContextSetter } from "@/components/chat-context-setter";
import { Footer } from "@/components/footer";
import { VerseAnalytics } from "@/components/verse-analytics";
import { VerseViewFlagValues } from "@/components/verse-view-flag-values";
import { VersePageContent } from "@/components/verse-page-content";
import { VerseViewProvider } from "@/context/verse-view-context";
import { genesis1Theme } from "@/data/genesis-1";
import { getChapter, getVerse } from "@/lib/bible-api";
import { defaultVerseViewFlag } from "@/lib/flags";
import { getTranslationFromCookies } from "@/lib/get-translation";
import {
  parseVerseUrl,
  getNavigationUrls,
  getPreviousVerse,
  getNextVerse,
  formatReference,
} from "@/lib/navigation";
import { getVerseViewOverrideFromCookies } from "@/lib/verse-view-server";

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
  const verseData = await getVerse(book, location.chapter, location.verse, translation);
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
    redirect("/genesis/1/1");
  }

  const bookData = location.book;

  // Get user's translation preference from cookie
  const translation = await getTranslationFromCookies();
  const overrideView = await getVerseViewOverrideFromCookies();
  const assignedView = overrideView ?? await defaultVerseViewFlag();

  const chapterData = await getChapter(location.book.slug, location.chapter, translation);
  if (!chapterData) {
    redirect("/genesis/1/1");
  }
  const verseData = chapterData.verses.find((item) => item.verse === location.verse);
  if (!verseData) {
    redirect("/genesis/1/1");
  }

  // Calculate navigation URLs
  const { prevUrl, nextUrl } = getNavigationUrls(location);
  const totalVerses = chapterData.verses.length;

  // Fetch prev/next verse data for contextual prompts
  const prevLocation = getPreviousVerse(location);
  const nextLocation = getNextVerse(location);

  // Fetch in parallel for efficiency (Bible API caches by chapter)
  const [prevVerseData, nextVerseData] = await Promise.all([
    prevLocation
      ? getVerse(prevLocation.book.slug, prevLocation.chapter, prevLocation.verse, translation)
      : Promise.resolve(null),
    nextLocation
      ? getVerse(nextLocation.book.slug, nextLocation.chapter, nextLocation.verse, translation)
      : Promise.resolve(null),
  ]);

  // Build context objects for prev/next verses (only if same chapter for relevant narrative context)
  const prevVerse = prevVerseData && prevLocation && prevLocation.chapter === location.chapter
    ? { number: prevLocation.verse, text: prevVerseData.text, reference: formatReference(prevLocation) }
    : undefined;
  const nextVerse = nextVerseData && nextLocation && nextLocation.chapter === location.chapter
    ? { number: nextLocation.verse, text: nextVerseData.text, reference: formatReference(nextLocation) }
    : undefined;

  // Build chat context for sidebar
  const chatContext = {
    book: bookData.name,
    chapter: location.chapter,
    verseRange: String(location.verse),
    heroCaption: verseData.text,
    verses: [{ number: location.verse, text: verseData.text }],
    prevVerse,
    nextVerse,
  };
  const currentReference = `${bookData.name} ${location.chapter}:${location.verse}`;
  const chapterTheme =
    location.book.slug === "genesis" && location.chapter === 1
      ? genesis1Theme
      : undefined;

  return (
    <LayoutWrapper>
      <VerseViewProvider
        assignedView={assignedView}
        initialOverrideView={overrideView}
        book={bookData.name}
        chapter={location.chapter}
        verse={location.verse}
        testament={bookData.testament}
      >
        <VerseViewFlagValues />

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
          prevVerse={prevVerse}
          nextVerse={nextVerse}
          currentReference={currentReference}
          chapterTheme={chapterTheme}
          testament={bookData.testament}
          verses={chapterData.verses.map((item) => ({
            verse: item.verse,
            text: item.text,
          }))}
        />

        {/* Footer */}
        <Footer />

        {/* Book Menu */}
        <BookMenu />
      </VerseViewProvider>
    </LayoutWrapper>
  );
}
