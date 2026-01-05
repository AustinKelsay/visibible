# Chat Context

High-level overview of how Visibible chat works. Details may change.

## Overview

- Client uses the AI SDK chat hook (`useChat` from `@ai-sdk/react`) to send messages to the API route.
- Server streams responses from the model via OpenRouter using `@openrouter/ai-sdk-provider`.
- Default model is `openai/gpt-oss-120b` (configurable via model selector dropdown).
- **Contextual awareness**: Chat receives prev/next verse context for fuller understanding.
- **Reverent tone**: System prompt guides AI to be spiritually encouraging.

## Access Control

Chat requires authentication and credits (except for admin users):

1. **Session Required**: Valid session cookie must be present. Returns 401 if missing.
2. **Credit System**:
   - Credits are reserved before streaming begins
   - On successful completion, reservation converts to deduction
   - On failure/cancellation, credits are refunded
   - Cost is dynamic based on model pricing via `computeChatCreditsCost()`
3. **Admin Bypass**: Users with `tier: "admin"` skip credit checks entirely.
4. **Insufficient Credits**: Returns 402 (Payment Required) with required/available amounts.

## Rate Limiting

The API enforces rate limits via Convex:

- Identifier: Combined IP hash + session ID (prevents multi-session bypass)
- Endpoint-specific limits configured in `convex/rateLimit.ts`
- Returns 429 with `Retry-After` header when exceeded

## Security

- **Origin Validation**: Requests must pass `validateOrigin()` check
- **Server Secret**: Convex mutations require server secret for credit operations
- **Input Limits**:
  - Maximum 50 messages per request (prevents token inflation)
  - Maximum 2000 character context string
  - Maximum 100KB request body (enforced via streaming reader, handles chunked encoding)
- **Cost Protection**:
  - Per-request cap of 100 credits ($1.00 maximum)
  - Daily spending limit of $5 per session
- **Admin Audit**: Admin usage is logged even though credits aren't charged

## Context Handling

- Chat requests are stateless; the server only sees what is sent per request.
- The client sends a rich page context with every message.
- Context includes:
  - Passage metadata (book, chapter, verse number)
  - Current verse text
  - **Previous verse** (text and reference) - only included if in the same chapter
  - **Next verse** (text and reference) - only included if in the same chapter
- The server builds a contextual system prompt that positions the AI as a reverent guide.

## Verse Context Structure

The app displays one verse at a time. Chat context reflects this with surrounding verses (when they are in the same chapter):

```json
{
  "book": "Genesis",
  "chapter": 1,
  "verseRange": "3",
  "heroCaption": "And God said, Let there be light: and there was light.",
  "verses": [{ "number": 3, "text": "And God said, Let there be light..." }],
  "prevVerse": {
    "number": 2,
    "text": "And the earth was without form, and void...",
    "reference": "Genesis 1:2"
  },
  "nextVerse": {
    "number": 4,
    "text": "And God saw the light, that it was good...",
    "reference": "Genesis 1:4"
  }
}
```

## System Prompt

The API builds a rich, contextual system prompt:

```
You are Visibible, a reverent guide helping users connect deeply with Scripture.

Current Position: Genesis 1:3

Scripture Context:
- Previous (v2): "And the earth was without form, and void..."
- CURRENT (v3): "And God said, Let there be light: and there was light."
- Next (v4): "And God saw the light, that it was good..."

Help users understand this verse in its biblical context. Share its meaning within
the chapter and book, its theological significance, and how it connects to the
broader story of Scripture. Be spiritually encouraging and help users connect
personally with God's Word. Keep responses grounded but offer deeper insight
when helpful.
```

This enables the AI to:
- Know exactly where it is in Scripture
- Understand the narrative flow (what came before, what comes after)
- Answer questions about the verse in context of the chapter and book
- Provide spiritually encouraging, devotional responses

## Message Metadata

Each streamed message includes metadata for transparency:
- `model`: Model ID used for generation
- `promptTokens`: Input token count
- `completionTokens`: Output token count
- `totalTokens`: Combined token count
- `finishReason`: Why generation stopped (e.g., "stop", "length")
- `latencyMs`: Response time in milliseconds
- `creditsCharged`: Credits deducted for this message
- `actualCredits`: Actual cost based on real token usage (for monitoring)

This metadata is displayed in the chat UI via the `MessageMetadataDisplay` component.

## Error Handling

The API returns user-friendly errors for common failure modes:
- **400**: Invalid JSON body or validation failed (with details)
- **401**: Session required
- **402**: Insufficient credits (with required/available amounts)
- **413**: Payload too large (request body exceeds 100KB)
- **429**: Rate limit exceeded (with retry guidance)
- **503**: Model temporarily unavailable or max retries exceeded
- **500**: Generic failure with retry suggestion

## Entry Points

- API: `src/app/api/chat/route.ts`
- UI: `src/components/chat.tsx`
- Model selector: `src/components/chat-model-selector.tsx`
- Context source: `src/app/[book]/[chapter]/[verse]/page.tsx`
- Chat models lib: `src/lib/chat-models.ts`
