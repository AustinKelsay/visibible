# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server at localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
npm start            # Start production server
npm test             # Run Vitest tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

## Architecture

Next.js 16 App Router application for exploring Scripture with AI-powered chat and image generation. **All AI features use OpenRouter exclusively.**

### Core Data Flow

1. **Bible API** (`src/lib/bible-api.ts`) - Fetches Scripture from bible-api.com with in-memory chapter caching. Supports 16 translations (WEB default).

2. **Verse Pages** (`src/app/[book]/[chapter]/[verse]/page.tsx`) - Server component that:
   - Fetches current verse + prev/next verses in parallel
   - Reads translation preference from cookies
   - Passes full context (location, text, prev/next) to child components

3. **AI Chat** (OpenRouter-only):
   - Server (`src/app/api/chat/route.ts`): Uses Vercel AI SDK `streamText()` via OpenRouter. Default model: `openai/gpt-oss-120b`. Streams metadata (tokens, latency) via `messageMetadata` callback.
   - Client (`src/components/chat.tsx`): Uses `useChat()` hook with model selector and metadata display.
   - Models (`src/lib/chat-models.ts`): Fetches available chat models from OpenRouter API.

4. **Image Generation** (`src/app/api/generate-image/route.ts`) - OpenRouter API with multimodal models (Gemini default). Builds prompts with prev/next verse context for storyboard continuity.

### Model Selection

Both chat and image generation have user-selectable models:
- **Chat Model Selector** (`src/components/chat-model-selector.tsx`) - In header + chat input area
- **Image Model Selector** (`src/components/image-model-selector.tsx`) - In header
- Models fetched from OpenRouter `/api/v1/models` endpoint, filtered by capability

### AI SDK v6 Patterns

React hooks are in `@ai-sdk/react`, not `ai/react`:
- `useChat()` returns `{ messages, sendMessage, status, error }` - no `input` or `handleInputChange`
- Send messages with `sendMessage({ text: string }, { body: { model, context } })`
- Check loading: `status === "streaming" || status === "submitted"`
- Messages use `message.parts` array (each part has `type` and `text`)
- Messages can have `message.metadata` with token counts, latency, etc.
- Server returns `result.toUIMessageStreamResponse({ messageMetadata })`

### State Management

- **PreferencesContext** (`src/context/preferences-context.tsx`) - Manages translation, image model, and chat model preferences via localStorage + cookies
- **NavigationContext** (`src/context/navigation-context.tsx`) - Manages book menu state (isMenuOpen, openMenu, closeMenu, toggleMenu), chat sidebar state (isChatOpen, openChat, closeChat, toggleChat), and chat context (chatContext, setChatContext for verse data passed to AI)

### Key Libraries

- `@ai-sdk/react`, `@ai-sdk/openai`, `ai` - Vercel AI SDK v6 (OpenRouter via `createOpenAI()`)
- `zod` - Request validation in API routes
- `lucide-react` - Icons

## Environment

Copy `.env.example` to `.env.local`:

```env
OPENROUTER_API_KEY=     # Required for all AI features (chat + images)
ENABLE_IMAGE_GENERATION=true  # Set to enable image generation
```
