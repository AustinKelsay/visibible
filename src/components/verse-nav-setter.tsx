"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type VerseNavData, useSetVerseNav } from "@/context/verse-nav-context";

interface VerseNavSetterProps {
  book: string;
  chapter: number;
  verseNumber: number;
  totalVerses: number;
  prevUrl?: string;
  nextUrl?: string;
}

function isSameVerseNavData(
  current: VerseNavData | null,
  next: VerseNavData | null
): boolean {
  if (!current || !next) {
    return false;
  }

  return current.book === next.book &&
    current.chapter === next.chapter &&
    current.verseNumber === next.verseNumber &&
    current.totalVerses === next.totalVerses &&
    current.prevUrl === next.prevUrl &&
    current.nextUrl === next.nextUrl;
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
  const navDataRef = useRef<VerseNavData | null>(null);
  const navData = useMemo(
    () => ({ book, chapter, verseNumber, totalVerses, prevUrl, nextUrl }),
    [book, chapter, verseNumber, totalVerses, prevUrl, nextUrl]
  );

  useLayoutEffect(() => {
    navDataRef.current = navData;
    setVerseNav(navData);
  }, [navData, setVerseNav]);

  useEffect(() => {
    return () => {
      const navData = navDataRef.current;

      setVerseNav((current) => {
        if (isSameVerseNavData(current, navData)) {
          return null;
        }

        return current;
      });
    };
  }, [setVerseNav]);

  return null;
}
