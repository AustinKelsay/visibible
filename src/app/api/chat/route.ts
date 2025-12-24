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
    "X-Title": process.env.OPENROUTER_TITLE ?? "vibible",
  },
});

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

  const { messages } = validationResult.data;

  try {
    // Default OpenAI; set OPENROUTER_API_KEY to use OpenRouter.
    const result = streamText({
      model: process.env.OPENROUTER_API_KEY
        ? openRouter("openai/gpt-4o")
        : openai("gpt-4o"),
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
