# vibible

Prototype. Vibe with the bible.

## Run

```bash
npm install
npm run dev
```

## Env

Copy `.env.example` to `.env.local`.

## Vercel AI SDK

Chat API lives in `src/app/api/chat/route.ts`.

- OpenAI: set `OPENAI_API_KEY`
- Anthropic: set `ANTHROPIC_API_KEY` and switch to `anthropic(...)`
- OpenRouter: set `OPENROUTER_API_KEY` to switch automatically (optional `OPENROUTER_REFERRER`, `OPENROUTER_TITLE`)
