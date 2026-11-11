import { z } from "zod";
import { getChapter, TRANSLATIONS, DEFAULT_TRANSLATION, type Translation } from "@/lib/bible-api";
import { parseVerseLocation, getPreviousVerse, getNextVerse, formatReference } from "@/lib/navigation";
import { MAX_USER_MESSAGE_CHARS } from "@/lib/chat-limits";

export { MAX_USER_MESSAGE_CHARS };

/**
 * What a chat request may contain, and how the server turns it into the model's input. The client owns only the
 * conversation (user and assistant turns) and the passage reference; the system prompt and the Scripture text in it
 * are built here.
 */

/** Output cap for one answer; smaller when the model's context window is small. */
export const MAX_OUTPUT_TOKENS = 2048;
/** History sent to the model, at most, in estimated tokens. */
export const HISTORY_TOKEN_BUDGET = 6000;
/** Context window assumed when the model's is unknown. */
const DEFAULT_CONTEXT_TOKENS = 8192;
/** Room kept free for message framing and tokenizer differences. */
const CONTEXT_MARGIN_TOKENS = 256;

/** Part types the chat UI produces. Only text reaches the model; the others are display-only and ignored. */
const SUPPORTED_PART_TYPES = new Set(["text", "reasoning", "step-start", "source-url", "source-document"]);

const messagePartSchema = z.object({
  type: z.string().refine((type) => SUPPORTED_PART_TYPES.has(type), {
    message: "Unsupported message part",
  }),
  text: z.string().optional(),
}).passthrough();

const messageSchema = z.object({
  id: z.string().min(1, "Message id must be a non-empty string"),
  role: z.enum(["user", "assistant"], {
    message: "Role must be user or assistant",
  }),
  parts: z.array(messagePartSchema).min(1, "Message must have at least one part"),
});

/**
 * The passage the guest is reading. Older clients also send the verse text and captions; those fields are ignored
 * (and stripped), because the server reads the text itself.
 */
const passageSchema = z.object({
  book: z.string().min(1).max(100),
  chapter: z.number().int().positive(),
  verseRange: z.string().regex(/^\d{1,3}$/, "verseRange must be a verse number"),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1, "Request must include at least one message")
    .max(50, "Too many messages. Maximum 50 messages per request."),
  context: passageSchema.optional(),
  translation: z.string().optional(),
  model: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
type ChatMessageInput = ChatRequest["messages"][number];

export type ModelMessage = { role: "user" | "assistant"; content: string };

/**
 * Token count that errs high for natural text in any script: ASCII at three characters a token (English runs about
 * four), and every other character at its UTF-8 byte count, which no byte-level tokenizer exceeds (Chinese is about
 * one or two tokens a character, counted as three). Unnatural ASCII can still run denser; a request that then
 * overflows the window fails at the provider, which releases the hold.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let otherBytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) ascii++;
    else otherBytes += code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return Math.ceil(ascii / 3) + otherBytes;
}

function messageText(message: ChatMessageInput): string {
  return message.parts
    .filter((part): part is typeof part & { text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

export type BoundedHistory =
  | { ok: true; messages: ModelMessage[]; omitted: number; emptyDropped: number; maxOutputTokens: number }
  | { ok: false; status: 400; error: string; message: string };

/**
 * Fit the conversation to the model: drop empty turns, require the last turn to be the guest's question, and keep the
 * newest turns that fit the history budget (also bounded by the model's context window, after the system prompt and
 * the output cap). Older turns that do not fit are left out and counted.
 */
export function boundHistory(
  messages: ChatMessageInput[],
  options: { systemPrompt: string; contextLength?: number }
): BoundedHistory {
  // The question is the turn the guest just sent; an empty one must not let an earlier question be answered again.
  const submitted = messages.at(-1);
  if (!submitted || submitted.role !== "user" || messageText(submitted).trim().length === 0) {
    return { ok: false, status: 400, error: "Invalid request", message: "The last message must be your question." };
  }

  const withText = messages
    .map((message) => ({ role: message.role, content: messageText(message) }))
    .filter((message) => message.content.trim().length > 0);
  const emptyDropped = messages.length - withText.length;

  const latest = withText.at(-1);
  if (!latest) {
    return { ok: false, status: 400, error: "Invalid request", message: "All messages have empty content. At least one message with non-empty content is required." };
  }
  if (latest.role !== "user") {
    return { ok: false, status: 400, error: "Invalid request", message: "The last message must be your question." };
  }
  if (latest.content.length > MAX_USER_MESSAGE_CHARS) {
    return { ok: false, status: 400, error: "Message too long", message: `Questions can be up to ${MAX_USER_MESSAGE_CHARS.toLocaleString("en-US")} characters.` };
  }

  const contextTokens = options.contextLength && options.contextLength > 0 ? options.contextLength : DEFAULT_CONTEXT_TOKENS;
  const maxOutputTokens = Math.max(256, Math.min(MAX_OUTPUT_TOKENS, Math.floor(contextTokens / 4)));
  const budget = Math.min(
    HISTORY_TOKEN_BUDGET,
    contextTokens - maxOutputTokens - estimateTokens(options.systemPrompt) - CONTEXT_MARGIN_TOKENS
  );
  if (estimateTokens(latest.content) > budget) {
    return { ok: false, status: 400, error: "Message too long", message: "This question is too long for the selected model." };
  }

  const kept: ModelMessage[] = [];
  let used = 0;
  for (let index = withText.length - 1; index >= 0; index--) {
    const cost = estimateTokens(withText[index].content);
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(withText[index]);
  }

  return { ok: true, messages: kept, omitted: withText.length - kept.length, emptyDropped, maxOutputTokens };
}

const isTranslation = (value: string): value is Translation => Object.prototype.hasOwnProperty.call(TRANSLATIONS, value);
const TRANSLATION_COOKIE = "visibible-translation";

/**
 * The translation whose text grounds the answer: the one the request names (refused if unsupported), otherwise the
 * reader's saved translation cookie (clients from before the request named it), otherwise the default.
 */
export function resolveTranslation(requested: string | undefined, cookieHeader: string | null): Translation | null {
  if (requested !== undefined) return isTranslation(requested) ? requested : null;
  const saved = cookieHeader?.split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${TRANSLATION_COOKIE}=`))
    ?.slice(TRANSLATION_COOKIE.length + 1);
  const decoded = saved ? (() => { try { return decodeURIComponent(saved); } catch { return undefined; } })() : undefined;
  return decoded && isTranslation(decoded) ? decoded : DEFAULT_TRANSLATION;
}

const BASE_PROMPT = "You are Visibible, a reverent guide helping users connect deeply with Scripture.";
const GENERAL_GUIDANCE = "Help users understand and connect with God's Word. Be spiritually encouraging and keep responses grounded in Scripture.";
const PASSAGE_GUIDANCE = "Help users understand this verse in its biblical context. Share its meaning within the chapter and book, its theological significance, and how it connects to the broader story of Scripture. Be spiritually encouraging and help users connect personally with God's Word. Keep responses grounded but offer deeper insight when helpful.";

export type SystemPromptResult =
  | { ok: true; systemPrompt: string; scripture: "included" | "unavailable" | "none" }
  | { ok: false; status: 400; error: string; message: string };

/**
 * The system prompt for a chat: general guidance without a passage, or the passage's position with the previous,
 * current and next verse of the same chapter, read by the server in the requested translation. If the Scripture text
 * cannot be loaded, the prompt keeps the position without the text.
 */
export async function buildSystemPrompt(
  passage: ChatRequest["context"],
  translation: Translation
): Promise<SystemPromptResult> {
  if (!passage) {
    return { ok: true, systemPrompt: `${BASE_PROMPT}\n\n${GENERAL_GUIDANCE}`, scripture: "none" };
  }

  const location = parseVerseLocation(passage.book, passage.chapter, passage.verseRange);
  if (!location) {
    return { ok: false, status: 400, error: "Unknown passage", message: "That passage could not be found." };
  }

  let prompt = `${BASE_PROMPT}\n\nCurrent Position: ${formatReference(location)}`;
  let scripture: "included" | "unavailable" = "unavailable";
  try {
    const chapter = await getChapter(location.book.slug, location.chapter, translation);
    const textOf = (verse: number) => chapter?.verses.find((item) => item.verse === verse)?.text;
    const current = textOf(location.verse);
    if (current) {
      const sameChapter = (other: ReturnType<typeof getPreviousVerse>) =>
        other && other.book.id === location.book.id && other.chapter === location.chapter ? other : null;
      const previous = sameChapter(getPreviousVerse(location));
      const next = sameChapter(getNextVerse(location));
      const previousText = previous ? textOf(previous.verse) : undefined;
      const nextText = next ? textOf(next.verse) : undefined;

      prompt += "\n\nScripture Context:";
      if (previous && previousText) prompt += `\n- Previous (v${previous.verse}): "${previousText}"`;
      prompt += `\n- CURRENT (v${location.verse}): "${location.verse} ${current}"`;
      if (next && nextText) prompt += `\n- Next (v${next.verse}): "${nextText}"`;
      scripture = "included";
    }
  } catch {
    // The reference alone still grounds the answer; the Scripture service being down should not block chat.
  }

  return { ok: true, systemPrompt: `${prompt}\n\n${PASSAGE_GUIDANCE}`, scripture };
}
