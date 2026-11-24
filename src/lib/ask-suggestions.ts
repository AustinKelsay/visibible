/**
 * The questions Ask suggests for a verse (#442), grouped by topic (#529). The page offers them; the server recognises
 * them, since their answers are stored and served to every reader who asks the same one (#505).
 */
const QUESTION_TOPICS = [
  { id: "meaning", label: "Meaning" },
  { id: "context", label: "Context" },
  { id: "people-places", label: "People & places" },
  { id: "words", label: "Words" },
  { id: "for-today", label: "For today" },
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
    { topic: "people-places", text: `Who is in ${reference}?` },
    { topic: "people-places", text: `Where does ${reference} take place?` },
    { topic: "words", text: `What do the key words in ${reference} mean in the original language?` },
    { topic: "words", text: `How do other translations word ${reference}?` },
    { topic: "for-today", text: `How can I apply ${reference} today?` },
    { topic: "for-today", text: `What can I pray about from ${reference}?` },
  ];
}

/** A verse's suggested questions under each topic, in topic order, as the page shows them. */
export function questionsByTopic(bookName: string, chapter: number, verse: number): { id: QuestionTopic; label: string; questions: string[] }[] {
  const questions = suggestedQuestions(bookName, chapter, verse);
  return QUESTION_TOPICS.map(({ id, label }) => ({
    id, label, questions: questions.filter((question) => question.topic === id).map((question) => question.text),
  }));
}
