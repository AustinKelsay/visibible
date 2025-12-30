# Chat Context

High-level overview of how Visibible chat works. Details may change.

## Overview

- Client uses the AI SDK chat hook to send messages to the API route.
- Server streams responses from the model via OpenRouter.
- Default model is `openai/gpt-oss-120b` (configurable via header dropdown).
- **Contextual awareness**: Chat receives prev/next verse context for fuller understanding.
- **Reverent tone**: System prompt guides AI to be spiritually encouraging.

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
- Token counts (prompt and completion)
- Response latency
- Model used
- Finish reason

This metadata is displayed in the chat UI via the `ChatMetadata` component.

## Entry Points

- API: `src/app/api/chat/route.ts`
- UI: `src/components/chat.tsx`
- Model selector: `src/components/chat-model-selector.tsx`
- Context source: `src/app/[book]/[chapter]/[verse]/page.tsx`
