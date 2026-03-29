"use client";

import { useEffect, useLayoutEffect } from "react";
import { useSetVerseNav } from "@/context/verse-nav-context";

interface VerseNavSetterProps {
  book: string;
  chapter: number;
  verseNumber: number;
  totalVerses: number;
  prevUrl?: string;
  nextUrl?: string;
}

/**
 * Client component that sets the verse navigation context when mounted.
 * Use this in verse pages to provide navigation data to the sticky bottom bar.
 * Clears the data on unmount (navigating away from a verse page).
 */
export function VerseNavSetter({
  book,
  chapter,
  verseNumber,
  totalVerses,
  prevUrl,
  nextUrl,
}: VerseNavSetterProps) {
  const setVerseNav = useSetVerseNav();

  useLayoutEffect(() => {
    setVerseNav({ book, chapter, verseNumber, totalVerses, prevUrl, nextUrl });
  }, [book, chapter, verseNumber, totalVerses, prevUrl, nextUrl, setVerseNav]);

  useEffect(() => {
    return () => {
      setVerseNav(null);
    };
  }, [setVerseNav]);

  return null;
}
