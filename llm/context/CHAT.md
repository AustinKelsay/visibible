# Chat

[The chat route](../../src/app/api/chat/route.ts) uses the AI SDK OpenAI adapter pointed at OpenRouter, with `streamText()` and a UI message stream response. [The client](../../src/components/chat.tsx) uses `useChat()` from `@ai-sdk/react`; messages use `parts` and may contain metadata.

Each request sends message history and page context. `buildSystemPrompt()` is the authoritative prompt: it incorporates the current passage and available adjacent verses. The server does not maintain conversation history. [ChatContextSetter](../../src/components/chat-context-setter.tsx) supplies page context through NavigationContext.

[chat-models.ts](../../src/lib/chat-models.ts) owns the default, catalog filtering, pricing and fallback behavior. The selector uses `/api/chat-models`. Do not assume a selected model is currently available simply because it was saved as a preference.

The route validates origin, signed session with current-IP tracking, request size, model pricing, rate limit and spending rules. Non-admin requests reserve the estimated charge before streaming. Settlement follows the model's outcome, not stream closure: the final chunk waits for the SDK to finish, and only nonempty output ending with `stop` or `length` charges the reserved estimate. Empty output, error chunks embedded in the stream, provider errors and cancellation release the hold, as does a failed charge. Request abort and response cancellation propagate to the provider. Calculated actual token cost is reported for comparison, not used to reconcile the charge. Durable provider-spend receipts and retryable settlement recovery are not implemented. See [Sessions and credits](SESSIONS_AND_CREDITS.md).

Final metadata includes model, token counts, finish reason (`error` for a failed stream), latency and `actualCredits`, plus the actual settlement: `billingStatus` (`charged`, `released`, `unresolved` when the release failed, or `not_required` without a reservation), `creditsCharged` and `creditsRefunded` (the reserved amount or 0), and `incomplete` for a charged response cut off by `length`. [chat-metadata.tsx](../../src/components/chat-metadata.tsx) renders tokens, latency, finish reason and the incomplete notice.

## Changing model behavior

Prompt, model, context, or provider changes must follow [Chat eval and release](../workflow/CHAT_EVAL_AND_RELEASE.md). Existing [credit-flow tests](../../src/app/api/__tests__/chat/credit-flow.test.ts) and [stream tests](../../src/app/api/__tests__/chat/stream-handling.test.ts) exercise mechanics, not theological quality or safety scoring.
