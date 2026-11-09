"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { BIBLE_BOOKS, BibleBook } from "@/data/bible-structure";
import { useNavigation } from "@/context/navigation-context";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePreferences } from "@/context/preferences-context";
import { getExpandedTestamentForPathname } from "@/lib/book-menu";
import { TranslationSelector } from "./translation-selector";

type MenuView = "books" | "chapters" | "verses";

interface BookMenuBaseProps {
  booksWithImages: string[];
  chaptersWithImages: number[];
  versesWithImages: Map<number, number>;
}

export function BookMenu() {
  const isConvexEnabled = useConvexEnabled();
  const pathname = usePathname();

  if (!isConvexEnabled) {
    return (
      <BookMenuBase
        key={pathname}
        booksWithImages={[]}
        chaptersWithImages={[]}
        versesWithImages={new Map()}
      />
    );
  }

  return <BookMenuWithConvex />;
}

function BookMenuWithConvex() {
  const pathname = usePathname();
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  // Markers follow the selected art style; existing images count as Classical.
  const { artStyle } = usePreferences();
  const booksWithImages = useQuery(api.verseImages.getBooksWithImages, { artStyle }) ?? [];

  const chaptersWithImages =
    useQuery(
      api.verseImages.getChaptersWithImages,
      selectedBook ? { book: selectedBook.slug, artStyle } : "skip"
    ) ?? [];

  const versesImageStatus = useQuery(
    api.verseImages.getChapterImageStatus,
    selectedBook && selectedChapter
      ? { book: selectedBook.slug, chapter: selectedChapter, artStyle }
      : "skip"
  );

  const versesWithImages = new Map<number, number>(
    (versesImageStatus ?? []).map(
      (status: { verse: number; imageCount: number }) =>
        [status.verse, status.imageCount] as const
    )
  );

  return (
    <BookMenuBase
      key={pathname}
      booksWithImages={booksWithImages}
      chaptersWithImages={chaptersWithImages}
      versesWithImages={versesWithImages}
      selectedBookState={[selectedBook, setSelectedBook]}
      selectedChapterState={[selectedChapter, setSelectedChapter]}
    />
  );
}

interface BookMenuBasePropsWithState extends BookMenuBaseProps {
  selectedBookState?: [BibleBook | null, (book: BibleBook | null) => void];
  selectedChapterState?: [number | null, (chapter: number | null) => void];
}

function BookMenuBase({
  booksWithImages,
  chaptersWithImages,
  versesWithImages,
  selectedBookState,
  selectedChapterState,
}: BookMenuBasePropsWithState) {
  const { isMenuOpen, closeMenu } = useNavigation();
  const pathname = usePathname();
  const { translationInfo } = usePreferences();
  const [expandedTestament, setExpandedTestament] = useState<"old" | "new">(
    () => getExpandedTestamentForPathname(pathname)
  );

  // Use provided state or create local state
  const [localSelectedBook, setLocalSelectedBook] = useState<BibleBook | null>(null);
  const [localSelectedChapter, setLocalSelectedChapter] = useState<number | null>(null);

  const [selectedBook, setSelectedBook] = selectedBookState ?? [localSelectedBook, setLocalSelectedBook];
  const [selectedChapter, setSelectedChapter] = selectedChapterState ?? [localSelectedChapter, setLocalSelectedChapter];

  const [view, setView] = useState<MenuView>("books");
  const [bookQuery, setBookQuery] = useState("");
  // Current passage from the URL, used to mark where the reader is
  const [currentSlug, currentChapterRaw, currentVerseRaw] = pathname.split("/").filter(Boolean);
  const currentChapter = Number(currentChapterRaw) || null;
  const currentVerse = Number(currentVerseRaw) || null;
  const query = bookQuery.trim().toLowerCase();
  const filteredBooks = query ? BIBLE_BOOKS.filter((b) => b.name.toLowerCase().includes(query)) : [];

  const oldTestament = BIBLE_BOOKS.filter((b) => b.testament === "old");
  const newTestament = BIBLE_BOOKS.filter((b) => b.testament === "new");

  const booksWithImagesSet = new Set(booksWithImages);
  const chaptersWithImagesSet = new Set(chaptersWithImages);

  const handleBookSelect = (book: BibleBook) => {
    setSelectedBook(book);
    setView("chapters");
  };

  const handleChapterSelect = (chapter: number) => {
    setSelectedChapter(chapter);
    setView("verses");
  };

  const handleVerseSelect = () => {
    closeMenu();
    setBookQuery("");
    setView("books");
    setSelectedBook(null);
    setSelectedChapter(null);
  };

  const handleBack = () => {
    if (view === "verses") {
      setView("chapters");
      setSelectedChapter(null);
    } else if (view === "chapters") {
      setView("books");
      setSelectedBook(null);
    }
  };

  const toggleTestament = (testament: "old" | "new") => {
    setExpandedTestament(testament);
  };

  const getHeaderTitle = () => {
    if (view === "verses" && selectedBook && selectedChapter) {
      return `${selectedBook.name} ${selectedChapter}`;
    }
    if (view === "chapters" && selectedBook) {
      return selectedBook.name;
    }
    return "Select Passage";
  };

  const renderBookRow = (book: BibleBook, indent = true) => {
    const isCurrent = book.slug === currentSlug;
    return (
      <button
        key={book.id}
        onClick={() => handleBookSelect(book)}
        aria-current={isCurrent ? "location" : undefined}
        className={`w-full flex items-center justify-between px-4 py-2.5 ${indent ? "pl-10" : ""} text-left transition-colors ${
          isCurrent ? "bg-[var(--surface)] font-medium" : "hover:bg-[var(--surface)]"
        }`}
      >
        <span className="flex items-center gap-2">
          <span>{book.name}</span>
          {booksWithImagesSet.has(book.slug) && (
            <span className="w-2 h-2 rounded-full border border-[var(--background)]/30 bg-[var(--accent)]" />
          )}
        </span>
        <span className="text-sm text-[var(--muted)]">
          {isCurrent && currentChapter ? `Reading ${currentChapter}` : `${book.chapters.length} ch`}
        </span>
      </button>
    );
  };

  const showBackButton = view !== "books";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-[55] transition-opacity duration-300 ${
          isMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeMenu}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-80 sm:max-w-[85vw] bg-[var(--background)] z-[56] flex flex-col transform transition-transform duration-300 ease-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[var(--divider)]">
          {showBackButton ? (
            <>
              <button
                onClick={handleBack}
                className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
              </button>
              <h2 className="text-lg font-semibold flex-1 text-center">
                {getHeaderTitle()}
              </h2>
              <button
                onClick={closeMenu}
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Close menu"
                title="Close"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Select Passage</h2>
              <button
                onClick={closeMenu}
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Close menu"
                title="Close"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {view === "books" && (
            <>
              {/* Translation Selector */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)]">
                <span className="text-sm font-medium text-[var(--muted)]">Translation — {translationInfo.code}</span>
                <TranslationSelector variant="compact" />
              </div>
              <div className="px-4 py-3 border-b border-[var(--divider)]">
                <input
                  type="search"
                  value={bookQuery}
                  onChange={(event) => setBookQuery(event.target.value)}
                  placeholder="Find a book"
                  aria-label="Find a book"
                  className="w-full min-h-[40px] px-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--divider)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              {booksWithImagesSet.size > 0 && (
                <p className="flex items-center gap-2 px-4 py-2 text-xs text-[var(--muted)] border-b border-[var(--divider)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                  Has saved images
                </p>
              )}

              {query ? (
                <div className="py-2">
                  {filteredBooks.length > 0
                    ? filteredBooks.map((book) => renderBookRow(book, false))
                    : <p className="px-4 py-3 text-sm text-[var(--muted)]">No books match “{bookQuery.trim()}”.</p>}
                </div>
              ) : (
              <>
              {/* Old Testament Section */}
              <button
                onClick={() => toggleTestament("old")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface)] transition-colors"
              >
                {expandedTestament === "old" ? (
                  <ChevronDown
                    size={18}
                    strokeWidth={1.5}
                    className="text-[var(--muted)]"
                  />
                ) : (
                  <ChevronRight
                    size={18}
                    strokeWidth={1.5}
                    className="text-[var(--muted)]"
                  />
                )}
                <span className="font-medium">Old Testament</span>
                <span className="text-sm text-[var(--muted)] ml-auto">
                  39 books
                </span>
              </button>
              {expandedTestament === "old" && (
                <div className="pb-2">
                  {oldTestament.map((book) => renderBookRow(book))}
                </div>
              )}

              {/* New Testament Section */}
              <button
                onClick={() => toggleTestament("new")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface)] transition-colors border-t border-[var(--divider)]"
              >
                {expandedTestament === "new" ? (
                  <ChevronDown
                    size={18}
                    strokeWidth={1.5}
                    className="text-[var(--muted)]"
                  />
                ) : (
                  <ChevronRight
                    size={18}
                    strokeWidth={1.5}
                    className="text-[var(--muted)]"
                  />
                )}
                <span className="font-medium">New Testament</span>
                <span className="text-sm text-[var(--muted)] ml-auto">
                  27 books
                </span>
              </button>
              {expandedTestament === "new" && (
                <div className="pb-2">
                  {newTestament.map((book) => renderBookRow(book))}
                </div>
              )}
              </>
              )}
            </>
          )}

          {view === "chapters" && selectedBook && (
            <div className="p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--muted)]">Select a chapter</p>
                {/* Same legend as the book list, so the chapter dots explain themselves */}
                {chaptersWithImagesSet.size > 0 && (
                  <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                    Has saved images
                  </p>
                )}
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2">
                {Array.from(
                  { length: selectedBook.chapters.length },
                  (_, i) => i + 1
                ).map((chapter) => (
                  <button
                    key={chapter}
                    onClick={() => handleChapterSelect(chapter)}
                    aria-current={selectedBook.slug === currentSlug && chapter === currentChapter ? "location" : undefined}
                    className={`flex flex-col items-center justify-center h-12 sm:h-11 rounded-lg bg-[var(--surface)] hover:bg-[var(--divider)] transition-colors ${
                      selectedBook.slug === currentSlug && chapter === currentChapter ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                  >
                    <span className="text-sm font-medium">{chapter}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        chaptersWithImagesSet.has(chapter) ? "bg-[var(--accent)]" : "bg-transparent"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "verses" && selectedBook && selectedChapter && (
            <div className="p-4">
              <p className="text-sm text-[var(--muted)] mb-4">
                Select a verse
              </p>
              <div className="grid grid-cols-6 sm:grid-cols-5 gap-1.5 sm:gap-2">
                {Array.from(
                  { length: selectedBook.chapters[selectedChapter - 1] },
                  (_, i) => i + 1
                ).map((verse) => (
                  <Link
                    key={verse}
                    href={`/${selectedBook.slug}/${selectedChapter}/${verse}`}
                    onClick={handleVerseSelect}
                    aria-current={selectedBook.slug === currentSlug && selectedChapter === currentChapter && verse === currentVerse ? "location" : undefined}
                    className={`relative flex items-center justify-center h-12 sm:h-11 rounded-lg bg-[var(--surface)] hover:bg-[var(--divider)] transition-colors ${
                      selectedBook.slug === currentSlug && selectedChapter === currentChapter && verse === currentVerse ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                  >
                    <span className="text-sm font-medium">{verse}</span>
                    {versesWithImages.has(verse) && (
                      <span
                        aria-label={`${versesWithImages.get(verse)} image${versesWithImages.get(verse) !== 1 ? "s" : ""}`}
                        className="absolute -top-1 -right-1 flex items-center justify-center min-w-3.5 h-3.5 rounded-full bg-[var(--accent)] text-[var(--accent-text)] text-[9px] font-bold leading-none px-0.5"
                      >
                        {versesWithImages.get(verse)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
