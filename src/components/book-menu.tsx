"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { BIBLE_BOOKS, BibleBook } from "@/data/bible-structure";
import { useNavigation } from "@/context/navigation-context";
import { useConvexEnabled } from "@/components/convex-client-provider";

type MenuView = "books" | "chapters" | "verses";

interface BookMenuBaseProps {
  booksWithImages: string[];
  chaptersWithImages: number[];
  versesWithImages: Set<number>;
}

export function BookMenu() {
  const isConvexEnabled = useConvexEnabled();

  if (!isConvexEnabled) {
    return (
      <BookMenuBase
        booksWithImages={[]}
        chaptersWithImages={[]}
        versesWithImages={new Set()}
      />
    );
  }

  return <BookMenuWithConvex />;
}

function BookMenuWithConvex() {
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const booksWithImages = useQuery(api.verseImages.getBooksWithImages) ?? [];

  const chaptersWithImages =
    useQuery(
      api.verseImages.getChaptersWithImages,
      selectedBook ? { book: selectedBook.slug } : "skip"
    ) ?? [];

  const versesImageStatus = useQuery(
    api.verseImages.getChapterImageStatus,
    selectedBook && selectedChapter
      ? { book: selectedBook.slug, chapter: selectedChapter }
      : "skip"
  );

  const versesWithImages = new Set(versesImageStatus?.map((v) => v.verse) ?? []);

  return (
    <BookMenuBase
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
  const [expandedTestament, setExpandedTestament] = useState<"old" | "new">(
    "old"
  );

  // Use provided state or create local state
  const [localSelectedBook, setLocalSelectedBook] = useState<BibleBook | null>(null);
  const [localSelectedChapter, setLocalSelectedChapter] = useState<number | null>(null);

  const [selectedBook, setSelectedBook] = selectedBookState ?? [localSelectedBook, setLocalSelectedBook];
  const [selectedChapter, setSelectedChapter] = selectedChapterState ?? [localSelectedChapter, setLocalSelectedChapter];

  const [view, setView] = useState<MenuView>("books");

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

  const showBackButton = view !== "books";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeMenu}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-[var(--background)] z-50 transform transition-transform duration-300 ease-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--divider)]">
          {showBackButton ? (
            <>
              <button
                onClick={handleBack}
                className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Back"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
              </button>
              <h2 className="text-lg font-semibold flex-1 text-center pr-8">
                {getHeaderTitle()}
              </h2>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Select Passage</h2>
              <button
                onClick={closeMenu}
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Close menu"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-60px)]">
          {view === "books" && (
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
                  {oldTestament.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => handleBookSelect(book)}
                      className="w-full flex items-center justify-between px-4 py-2.5 pl-10 text-left hover:bg-[var(--surface)] transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span>{book.name}</span>
                        {booksWithImagesSet.has(book.slug) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                        )}
                      </span>
                      <span className="text-sm text-[var(--muted)]">
                        {book.chapters.length} ch
                      </span>
                    </button>
                  ))}
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
                  {newTestament.map((book) => (
                    <button
                      key={book.id}
                      onClick={() => handleBookSelect(book)}
                      className="w-full flex items-center justify-between px-4 py-2.5 pl-10 text-left hover:bg-[var(--surface)] transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span>{book.name}</span>
                        {booksWithImagesSet.has(book.slug) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                        )}
                      </span>
                      <span className="text-sm text-[var(--muted)]">
                        {book.chapters.length} ch
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {view === "chapters" && selectedBook && (
            <div className="p-4">
              <p className="text-sm text-[var(--muted)] mb-4">
                Select a chapter
              </p>
              <div className="grid grid-cols-5 gap-2">
                {Array.from(
                  { length: selectedBook.chapters.length },
                  (_, i) => i + 1
                ).map((chapter) => (
                  <button
                    key={chapter}
                    onClick={() => handleChapterSelect(chapter)}
                    className="flex flex-col items-center justify-center h-11 rounded-lg bg-[var(--surface)] hover:bg-[var(--divider)] transition-colors"
                  >
                    <span className="text-sm font-medium">{chapter}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        chaptersWithImagesSet.has(chapter)
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--muted)]/30"
                      }`}
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
              <div className="grid grid-cols-5 gap-2">
                {Array.from(
                  { length: selectedBook.chapters[selectedChapter - 1] },
                  (_, i) => i + 1
                ).map((verse) => (
                  <Link
                    key={verse}
                    href={`/${selectedBook.slug}/${selectedChapter}/${verse}`}
                    onClick={handleVerseSelect}
                    className="flex flex-col items-center justify-center h-11 rounded-lg bg-[var(--surface)] hover:bg-[var(--divider)] transition-colors"
                  >
                    <span className="text-sm font-medium">{verse}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        versesWithImages.has(verse)
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--muted)]/30"
                      }`}
                    />
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
