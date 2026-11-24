/**
 * The questions Ask suggests for a verse (#442), grouped by topic (#529). The page offers them; the server recognises
 * them, since their answers are stored and served to every reader who asks the same one (#505).
 */
export const QUESTION_TOPICS = [
  { id: "meaning", label: "Meaning" },
  { id: "context", label: "Context" },
  { id: "people", label: "People & places" },
  { id: "words", label: "Words" },
  { id: "today", label: "For today" },
] as const;

export type QuestionTopic = (typeof QUESTION_TOPICS)[number]["id"];

/**
 * Every question suggested for a verse, in topic order. Meaning comes first with "What does John 1:5 mean?", then
 * "Summarize John 1 so far", or at a chapter's first verse its historical context, which Context then leaves out.
 */
export function suggestedQuestions(bookName: string, chapter: number, verse: number): { topic: QuestionTopic; text: string }[] {
  const reference = `${bookName} ${chapter}:${verse}`;
  const historicalContext = `What is the historical context of ${reference}?`;
  const firstVerse = verse <= 1;
  return [
    { topic: "meaning", text: `What does ${reference} mean?` },
    { topic: "meaning", text: firstVerse ? historicalContext : `Summarize ${bookName} ${chapter} so far` },
    { topic: "meaning", text: `Why does ${reference} matter?` },
    { topic: "context", text: `What leads up to ${reference}?` },
    ...(firstVerse ? [] : [{ topic: "context" as const, text: historicalContext }]),
    { topic: "context", text: `Who wrote ${bookName}, and for whom?` },
    { topic: "people", text: `Who is in ${reference}?` },
    { topic: "people", text: `Where does ${reference} take place?` },
    { topic: "words", text: `What do the key words in ${reference} mean in the original language?` },
    { topic: "words", text: `How do other translations word ${reference}?` },
    { topic: "today", text: `How can I apply ${reference} today?` },
    { topic: "today", text: `What can I pray about from ${reference}?` },
  ];
}
