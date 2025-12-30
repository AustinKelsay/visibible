import { redirect } from "next/navigation";
import { HeroImage } from "@/components/hero-image";
import { ScriptureDetails } from "@/components/scripture-details";
import { ScriptureReader } from "@/components/scripture-reader";
import { Header } from "@/components/header";
import { BookMenu } from "@/components/book-menu";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { ChatContextSetter } from "@/components/chat-context-setter";
import { VerseStrip } from "@/components/verse-strip";
import { BOOK_BY_SLUG } from "@/data/bible-structure";
import { getVerse } from "@/lib/bible-api";
import { getTranslationFromCookies } from "@/lib/get-translation";
import {
  parseVerseUrl,
  getNavigationUrls,
  getPreviousVerse,
  getNextVerse,
  formatReference,
} from "@/lib/navigation";

interface VersePageProps {
  params: Promise<{
    book: string;
    chapter: string;
    verse: string;
  }>;
}

export default async function VersePage({ params }: VersePageProps) {
  const { book, chapter, verse } = await params;

  // Parse and validate the URL
  const location = parseVerseUrl(book, chapter, verse);
  if (!location) {
    redirect("/genesis/1/1");
  }

  const bookData = BOOK_BY_SLUG[book.toLowerCase()];
  if (!bookData) {
    redirect("/genesis/1/1");
  }

  // Get user's translation preference from cookie
  const translation = await getTranslationFromCookies();

  // Fetch verse data from API with user's translation preference
  const verseData = await getVerse(book, location.chapter, location.verse, translation);
  if (!verseData) {
    redirect("/genesis/1/1");
  }

  // Calculate navigation URLs
  const { prevUrl, nextUrl } = getNavigationUrls(location);
  const totalVerses = bookData.chapters[location.chapter - 1];

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

  return (
    <LayoutWrapper>
      {/* Set chat context for sidebar */}
      <ChatContextSetter context={chatContext} />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Hero Image */}
        <HeroImage
          verseText={verseData.text}
          caption={verseData.text}
          prevUrl={prevUrl}
          nextUrl={nextUrl}
          prevVerse={prevVerse}
          nextVerse={nextVerse}
          currentReference={currentReference}
        />

        {/* Verse Strip Navigator */}
        <div className="border-b border-[var(--divider)]">
          <VerseStrip
            book={book}
            chapter={location.chapter}
            currentVerse={location.verse}
            totalVerses={totalVerses}
          />
        </div>

        {/* Scripture Reader */}
        <div className="flex-1 py-8">
          <ScriptureReader
            book={bookData.name}
            chapter={location.chapter}
            verse={{ number: location.verse, text: verseData.text }}
            verseNumber={location.verse}
            totalVerses={totalVerses}
            prevUrl={prevUrl}
            nextUrl={nextUrl}
          />
        </div>

        {/* Scripture Details */}
        <div className="max-w-2xl mx-auto w-full">
          <ScriptureDetails
            book={bookData.name}
            chapter={location.chapter}
            verseRange={String(location.verse)}
            verseText={verseData.text}
            chapterVerseCount={totalVerses}
            testament={bookData.testament}
            reference={currentReference}
          />
        </div>
      </main>

      {/* Book Menu */}
      <BookMenu />
    </LayoutWrapper>
  );
}
