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

### Per-Verse Chat IDs

Each verse maintains a **separate chat history** via unique chat IDs. This ensures conversation context is preserved per verse.

```typescript
const chatId = useMemo(() => {
  if (!context) return `${variant}-global`;
  const book = (context.book ?? "book").replace(/\s+/g, "-");
  const chapter = typeof context.chapter === "number" ? context.chapter : "chapter";
  const verseRange = (context.verseRange ?? "verse").replace(/\s+/g, "-");
  return `${variant}-${book}-${chapter}-${verseRange}`.toLowerCase();
}, [context, variant]);
```

- **With context**: ID is `{variant}-{book}-{chapter}-{verseRange}` (e.g., `sidebar-genesis-1-3`)
- **Without context**: ID is `{variant}-global` (e.g., `sidebar-global`)
- The `useChat` hook maintains separate message histories per ID
- Switching verses clears the message input and resets the expanded state

### Input State Management

The chat component **manually manages input state** because AI SDK v6's `useChat` hook does not return `input` or `handleInputChange`:

```typescript
const { messages, sendMessage, status, error } = useChat({ id: chatId });
const [input, setInput] = useState("");  // Manual state
```

The input is cleared after send and when switching verses (via `chatId` change).

### Message Send

- `sendMessage` is called with the user text.
- An extra JSON body is attached to each request: `{ context, model }`.
- This context is the only way the server knows which verse is on screen.
- The model parameter passes the user-selected chat model ID.

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
  prevLocation ? getVerse(prevLocation.book.slug, prevLocation.chapter, prevLocation.verse, translation) : null,
  nextLocation ? getVerse(nextLocation.book.slug, nextLocation.chapter, nextLocation.verse, translation) : null,
]);
```

Note: Context only includes prev/next verses when they are in the **same chapter** as the current verse.

This is efficient because the Bible API caches by chapter—fetching 3 verses from the same chapter typically uses 1 API call.

---

## Server Flow

### API Endpoint

- `src/app/api/chat/route.ts` is the single chat API route.
- Request body:
  - `messages` (array of UI messages)
  - optional `context` (string or structured object)
  - optional `model` (string, defaults to `DEFAULT_CHAT_MODEL`)

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

**Note:** `formatVerses()` truncates verse text at **1200 characters** (with `...`) to prevent excessively long system prompts when verses contain extended passages.

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

Chat uses **OpenRouter exclusively** for all models. The default model is `openai/gpt-oss-120b:free`.

- Users can select any chat-capable model via the header dropdown.
- The selected model ID is passed in the request body.
- If no model is specified, the default is used.
- **Models must have valid pricing** - unpriced models are rejected with 400 error.

OpenRouter is configured with a custom base URL and headers (`HTTP-Referer`, `X-Title`).

---

## Credit System

Chat messages now cost credits based on the selected model's pricing.

### Pricing Calculation

Credits are calculated dynamically using `computeChatCreditsCost()`:

- Estimates ~2000 tokens per message (1000 prompt + 1000 completion)
- Uses OpenRouter's per-token pricing with 25% markup
- Minimum cost: 1 credit (for free models with `:free` suffix or $0 pricing)
- Formula: `Math.ceil((tokens × price × 1.25) / $0.01)`

### Credit Flow

1. **Validate model** - `getChatModelPricing()` fetches pricing; returns 400 if null
2. **Calculate cost** - `computeChatCreditsCost()` returns estimated credits
3. **Check balance** - Return 402 if `session.credits < creditAmount`
4. **Reserve credits** - `reserveCredits()` atomically deducts from balance
5. **Stream response** - OpenRouter streaming via AI SDK
6. **Log actual usage** - `computeActualChatCreditsCost()` logs variance for monitoring
7. **Finalize** - `deductCredits()` on success, `releaseReservation()` on failure

### Daily Spending Limit

Sessions have a **$5/day spending limit** enforced during credit reservation:
- Tracked in `dailySpendUsd` field
- Resets at UTC midnight
- Admin users bypass this limit
- Returns error with remaining budget when exceeded

### Model Validation

Models must have valid OpenRouter pricing to be used:

```typescript
const modelPricing = await getChatModelPricing(modelId, apiKey);
if (!modelPricing) {
  return Response.json({
    error: "Model not available",
    message: `The model "${modelId}" is not available or cannot be priced.`,
  }, { status: 400 });
}
```

### ChatModelSelector Variants

`src/components/chat-model-selector.tsx` supports two display variants:

| Variant | Location | Description |
|---------|----------|-------------|
| `compact` | Header | Full dropdown with model name and provider |
| `indicator` | Chat input area | Minimal badge showing current model |

```tsx
// Header usage (default variant)
<ChatModelSelector />
<ChatModelSelector variant="compact" />

// Chat input usage
<ChatModelSelector variant="indicator" />
```

### Preferences Integration

`src/context/preferences-context.tsx` stores the selected chat model:

- Persisted in `localStorage` (`visibible-preferences`)
- Stored as cookie `visibible-chat-model` for server-side reading
- No page refresh on change—takes effect on next message send

### Model Fetch Fallback

When the `/api/chat-models` fetch fails, `ChatModelSelector` sets a fallback model automatically:

```typescript
.catch((err) => {
  setError("Failed to load models");
  setModels([{
    id: DEFAULT_CHAT_MODEL,
    name: "GPT-OSS 120B (Default)",
    provider: "Openai",
    contextLength: 131072,
  }]);
})
```

This ensures users can always send messages even if the models API is unavailable.

---

## Streaming Response

- `streamText` is used to stream tokens from the provider.
- `toUIMessageStreamResponse({ messageMetadata })` returns a stream the client can render live.
- The `messageMetadata` callback injects per-message metadata (token counts, latency, model, finish reason).

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | Validation, prompt, model selection, credit flow, streaming |
| `src/lib/chat-models.ts` | Model pricing functions (`computeChatCreditsCost`, `getChatModelPricing`) |
| `src/components/chat.tsx` | Request body wiring |
| `src/app/[book]/[chapter]/[verse]/page.tsx` | Context assembly for single verse |
| `src/lib/bible-api.ts` | Bible API client for fetching verse data |
| `convex/sessions.ts` | Credit reservation and daily spending limit |
