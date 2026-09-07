# Chat

[The chat route](../../src/app/api/chat/route.ts) uses the AI SDK OpenAI adapter pointed at OpenRouter, with `streamText()` and a UI message stream response. [The client](../../src/components/chat.tsx) uses `useChat()` from `@ai-sdk/react`; messages use `parts` and may contain metadata.

Each request sends message history and page context. `buildSystemPrompt()` is the authoritative prompt: it incorporates the current passage and available adjacent verses. The server does not maintain conversation history. [ChatContextSetter](../../src/components/chat-context-setter.tsx) supplies page context through NavigationContext.

[chat-models.ts](../../src/lib/chat-models.ts) owns the default, catalog filtering, pricing and fallback behavior. The selector uses `/api/chat-models`. Do not assume a selected model is currently available simply because it was saved as a preference.

The route validates origin, signed session with current-IP tracking, request size, model pricing, rate limit and spending rules. Non-admin requests reserve the estimated charge before streaming. A successful completed stream deducts that estimate; calculated actual token cost is reported for comparison, not used to reconcile the chat charge. Stream failure/cancellation releases the reservation. See [Sessions and credits](SESSIONS_AND_CREDITS.md).

Metadata includes model, token counts, finish reason, latency, `creditsCharged`, and `actualCredits`; [chat-metadata.tsx](../../src/components/chat-metadata.tsx) renders it.

## Changing model behavior

Prompt, model, context, or provider changes must follow [Chat eval and release](../workflow/CHAT_EVAL_AND_RELEASE.md). Existing [credit-flow tests](../../src/app/api/__tests__/chat/credit-flow.test.ts) and [stream tests](../../src/app/api/__tests__/chat/stream-handling.test.ts) exercise mechanics, not theological quality or safety scoring.
