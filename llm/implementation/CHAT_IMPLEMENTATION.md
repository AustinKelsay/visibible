# Chat Implementation Guide

This document describes the current chat implementation. It is intentionally high-level and will evolve.

---

## Architecture Overview

Visibible chat is a client-to-server streaming flow built on the Vercel AI SDK.

- Client UI uses `useChat` to send messages to `src/app/api/chat/route.ts`.
- The API validates input, builds a compact system prompt, and streams tokens back.
- Page context is sent with every chat request to keep the model grounded.

---

## Client Flow

### UI Entry Points

- `src/components/chat.tsx` (chat window, input, and send behavior)
- `src/app/[book]/[chapter]/[verse]/page.tsx` (page context wiring)

### Message Send

- `sendMessage` is called with the user text.
- An extra JSON body is attached to each request: `{ context }`.
- This context is the only way the server knows which verse is on screen.

### Context Source

- `src/lib/bible-api.ts` fetches verse data from bible-api.com.
- `src/app/[book]/[chapter]/[verse]/page.tsx` fetches the current verse AND prev/next verses, and passes:
  - `book`, `chapter`, `verseRange` (single verse number as string)
  - `heroCaption` (the verse text)
  - `verses` (single-item array with the current verse)
  - `prevVerse` (previous verse with number, text, reference)
  - `nextVerse` (next verse with number, text, reference)

Example context assembly:

```tsx
<Chat
  context={{
    book: bookData.name,
    chapter: location.chapter,
    verseRange: String(location.verse),
    heroCaption: verseData.text,
    verses: [{ number: location.verse, text: verseData.text }],
    prevVerse,  // { number, text, reference }
    nextVerse,  // { number, text, reference }
  }}
/>
```

### Prev/Next Verse Fetching

The page fetches prev/next verses in parallel for efficiency:

```typescript
const prevLocation = getPreviousVerse(location);
const nextLocation = getNextVerse(location);

const [prevVerseData, nextVerseData] = await Promise.all([
  prevLocation ? getVerse(prevLocation.book.slug, prevLocation.chapter, prevLocation.verse) : null,
  nextLocation ? getVerse(nextLocation.book.slug, nextLocation.chapter, nextLocation.verse) : null,
]);
```

This is efficient because the Bible API caches by chapter—fetching 3 verses from the same chapter typically uses 1 API call.

---

## Server Flow

### API Endpoint

- `src/app/api/chat/route.ts` is the single chat API route.
- Request body:
  - `messages` (array of UI messages)
  - optional `context` (string or structured object)

### Validation

- Zod schemas validate:
  - message shape (`id`, `role`, `parts`)
  - context fields (optional)
- Invalid payloads return `400` with details.

### System Prompt Construction

The server builds a rich, contextual system prompt using `buildSystemPrompt()`:

```typescript
const system = buildSystemPrompt(context);
```

The function constructs a prompt that:
1. **Establishes identity**: Positions the AI as a reverent, spiritually encouraging guide.
2. **Shows position**: Includes the current location (e.g., "Genesis 1:3").
3. **Provides scripture context**: Shows prev/current/next verses for narrative awareness.
4. **Guides tone**: Encourages devotional, grounded responses.

Example system prompt for Genesis 1:3:

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
- Understand the narrative flow
- Answer questions about the verse in context
- Provide spiritually encouraging responses

---

## Model Selection

The API picks a model in this order:

1. **Anthropic** (preferred): `claude-3-haiku-20240307` if `ANTHROPIC_API_KEY` is set.
2. **OpenRouter**: `anthropic/claude-3-haiku` if `OPENROUTER_API_KEY` is set.
3. **OpenAI fallback**: `gpt-4o-mini`.

OpenRouter is configured with a custom base URL and optional headers.

---

## Streaming Response

- `streamText` is used to stream tokens from the provider.
- `toUIMessageStreamResponse()` returns a stream the client can render live.

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | Validation, prompt, model selection, streaming |
| `src/components/chat.tsx` | Request body wiring |
| `src/app/[book]/[chapter]/[verse]/page.tsx` | Context assembly for single verse |
| `src/lib/bible-api.ts` | Bible API client for fetching verse data |
