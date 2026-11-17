/**
 * Stored answers to Ask's suggested questions (#505), on the server. Convex keeps them (convex/storedAnswers.ts).
 */
import { createHash } from "node:crypto";
import { suggestedQuestions } from "./ask-suggestions";

type Turn = { role: string; parts: Array<{ type: string; text?: string }> };
type Passage = { book: string; chapter: number; verseRange: string };

/** The suggested question a request asks, when it is a first turn asking exactly one of the passage's; else null. */
export function storableQuestion(messages: readonly Turn[], passage: Passage | undefined): string | null {
  if (!passage || messages.length !== 1 || messages[0].role !== "user") return null;
  const text = messages[0].parts.map((part) => (part.type === "text" ? part.text ?? "" : "")).join("").trim();
  return passageSuggestions(passage).includes(text) ? text : null;
}

/** The passage's suggested questions, as the page shows them. */
export function passageSuggestions(passage: Passage): string[] {
  return suggestedQuestions(passage.book, passage.chapter, Number(passage.verseRange)).map((suggestion) => suggestion.text);
}

/**
 * The key of a stored answer: the model, the whole system prompt (rules and the Scripture given) and the question, so
 * a change to any of them asks the model afresh.
 */
export function storedAnswerKey(modelId: string, systemPrompt: string, question: string): string {
  return createHash("sha256").update(JSON.stringify([modelId, systemPrompt, question])).digest("hex");
}
