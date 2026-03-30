"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface VerseNavData {
  book: string;
  chapter: number;
  verseNumber: number;
  totalVerses: number;
  prevUrl?: string;
  nextUrl?: string;
}

interface VerseNavContextValue {
  data: VerseNavData | null;
  setData: (data: VerseNavData | null) => void;
}

const VerseNavContext = createContext<VerseNavContextValue | null>(null);

export function VerseNavProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<VerseNavData | null>(null);
  const contextValue = useMemo(() => ({ data, setData }), [data, setData]);

  return (
    <VerseNavContext.Provider value={contextValue}>
      {children}
    </VerseNavContext.Provider>
  );
}

export function useVerseNav(): VerseNavData | null {
  const ctx = useContext(VerseNavContext);
  if (!ctx) throw new Error("useVerseNav must be used within VerseNavProvider");
  return ctx.data;
}

export function useSetVerseNav() {
  const ctx = useContext(VerseNavContext);
  if (!ctx) throw new Error("useSetVerseNav must be used within VerseNavProvider");
  return ctx.setData;
}
