import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { z } from "zod";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const openRouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  headers: {
    "HTTP-Referer": process.env.OPENROUTER_REFERRER ?? "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_TITLE ?? "visibible",
  },
});

// Verse context for prev/next verses
const verseContextSchema = z.object({
  number: z.number(),
  text: z.string(),
  reference: z.string().optional(),
});

const pageContextSchema = z
  .object({
    book: z.string().optional(),
    chapter: z.number().optional(),
    verseRange: z.string().optional(),
    heroCaption: z.string().optional(),
    imageTitle: z.string().optional(),
    verses: z
      .array(
        z.object({
          number: z.number().optional(),
          text: z.string().optional(),
        })
      )
      .optional(),
    prevVerse: verseContextSchema.optional(),
    nextVerse: verseContextSchema.optional(),
  })
  .passthrough();

type PageContext = z.infer<typeof pageContextSchema>;

const formatVerses = (verses?: PageContext["verses"]) => {
  if (!verses?.length) return null;

  const compact = verses
    .map((verse) => {
      if (!verse?.text) return null;
      const trimmed = verse.text.trim();
      if (!trimmed) return null;
      return typeof verse.number === "number" ? `${verse.number} ${trimmed}` : trimmed;
    })
    .filter(Boolean)
    .join(" ");

  if (!compact) return null;

  const maxLength = 1200;
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trim()}...` : compact;
};

/**
 * Build a rich, contextual system prompt for the AI.
 * This gives the AI full awareness of where we are in Scripture.
 */
const buildSystemPrompt = (context?: PageContext | string): string => {
  const basePrompt = `You are Visibible, a reverent guide helping users connect deeply with Scripture.`;

  if (!context) {
    return `${basePrompt}\n\nHelp users understand and connect with God's Word. Be spiritually encouraging and keep responses grounded in Scripture.`;
  }

  if (typeof context === "string") {
    const trimmed = context.trim();
    return trimmed.length > 0
      ? `${basePrompt}\n\nContext: ${trimmed}`
      : basePrompt;
  }

  const { book, chapter, verseRange, prevVerse, nextVerse } = context;
  const currentVerseText = formatVerses(context.verses);

  // Build location string (e.g., "Genesis 1:3")
  let location = "";
  if (book) location = book;
  if (typeof chapter === "number") {
    location = location ? `${location} ${chapter}` : `Chapter ${chapter}`;
  }
  if (verseRange) {
    location = location ? `${location}:${verseRange}` : `Verse ${verseRange}`;
  }

  // Build the full system prompt
  let prompt = basePrompt;

  // Add current position
  if (location) {
    prompt += `\n\nCurrent Position: ${location}`;
  }

  // Add scripture context with prev/current/next
  prompt += "\n\nScripture Context:";
  if (prevVerse) {
    prompt += `\n- Previous (v${prevVerse.number}): "${prevVerse.text}"`;
  }
  if (currentVerseText) {
    prompt += `\n- CURRENT${verseRange ? ` (v${verseRange})` : ""}: "${currentVerseText}"`;
  }
  if (nextVerse) {
    prompt += `\n- Next (v${nextVerse.number}): "${nextVerse.text}"`;
  }

  // Add guidance
  prompt += `\n\nHelp users understand this verse in its biblical context. Share its meaning within the chapter and book, its theological significance, and how it connects to the broader story of Scripture. Be spiritually encouraging and help users connect personally with God's Word. Keep responses grounded but offer deeper insight when helpful.`;

  return prompt;
};

/**
 * Schema for message parts. Each part must have a type and corresponding content.
 * For text parts, the text field is required.
 */
const messagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
}).passthrough(); // Allow additional fields for extensibility

/**
 * Schema for a single message. Validates id, role (must be one of allowed values),
 * and parts array structure.
 */
const messageSchema = z.object({
  id: z.string().min(1, "Message id must be a non-empty string"),
  role: z.enum(["user", "assistant", "system"], {
    message: "Role must be one of: user, assistant, system",
  }),
  parts: z.array(messagePartSchema).min(1, "Message must have at least one part"),
});

/**
 * Schema for the request body. Must contain a non-empty messages array.
 */
const requestBodySchema = z.object({
  messages: z.array(messageSchema).min(1, "Request must include at least one message"),
  context: z.union([z.string().min(1), pageContextSchema]).optional(),
});

/**
 * POST handler for chat API endpoint.
 * Validates request body using Zod schema and streams AI responses.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request body structure and message format
  const validationResult = requestBodySchema.safeParse(body);
  if (!validationResult.success) {
    const errors = validationResult.error.issues.map((err: z.ZodIssue) => {
      const path = err.path.join(".");
      return path ? `${path}: ${err.message}` : err.message;
    });
    return Response.json(
      { 
        error: "Validation failed",
        details: errors,
      },
      { status: 400 }
    );
  }

  const { messages, context } = validationResult.data;

  try {
    // Prefer Anthropic Haiku when configured.
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-3-haiku-20240307")
      : process.env.OPENROUTER_API_KEY
        ? openRouter("anthropic/claude-3-haiku")
        : openai("gpt-4o-mini");
    const system = buildSystemPrompt(context);

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages as UIMessage[]),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
