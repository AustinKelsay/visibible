/**
 * The questions Ask suggests for a verse (#442). The page offers them; the server recognises them, since their answers
 * are stored and served to every reader who asks the same one (#505).
 */
export type SuggestionKind = "meaning" | "summary" | "context";

/** "What does John 1:5 mean?", then "Summarize John 1 so far", or at a chapter's first verse its historical context. */
export function suggestedQuestions(bookName: string, chapter: number, verse: number): { kind: SuggestionKind; text: string }[] {
  const reference = `${bookName} ${chapter}:${verse}`;
  return [
    { kind: "meaning", text: `What does ${reference} mean?` },
    verse > 1
      ? { kind: "summary", text: `Summarize ${bookName} ${chapter} so far` }
      : { kind: "context", text: `What is the historical context of ${reference}?` },
  ];
}
