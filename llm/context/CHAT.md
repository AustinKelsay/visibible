# Chat

[The chat route](../../src/app/api/chat/route.ts) uses the AI SDK OpenAI adapter pointed at OpenRouter, with `streamText()` and a UI message stream response. [The client](../../src/components/chat.tsx) uses `useChat()` from `@ai-sdk/react`; messages use `parts` and may contain metadata.

Each request sends the conversation, the passage reference (book, chapter, verse), the reader's translation and the model. The server does not maintain conversation history. [ChatContextSetter](../../src/components/chat-context-setter.tsx) supplies the passage through NavigationContext.

[chat-request.ts](../../src/lib/chat-request.ts) owns what a request may contain and what the model receives:

- **Messages.** Only `user` and `assistant` turns are accepted; a client `system` turn is refused with 400. Parts may be `text`, `reasoning`, `step-start`, `source-url` or `source-document`, and only text reaches the model. Empty turns are left out, and the last turn must be the guest's question, at most 4,000 characters ([chat-limits.ts](../../src/lib/chat-limits.ts), also the input's `maxLength`).
- **System prompt.** `buildSystemPrompt()` is the only system instruction. From the reference it reads the chapter in the requested translation (`getChapter`, cached like the verse page) and adds the current verse and its neighbours in the same chapter. Verse text, captions or a string context sent by the client are ignored or refused. An unknown passage or translation is refused; if the Scripture service fails, the prompt keeps the position without the text. The prompt is the same one the verse page's context produced before the server built it (checked across every chapter on 11 November 2026).
- **Bounds.** Answers are capped at 2,048 output tokens, or a quarter of a smaller model's context window. History gets up to 6,000 estimated tokens (characters ÷ 3), also limited by the context window after the system prompt and the answer cap; the newest turns that fit are sent and older ones are left out. All refusals happen before credits are reserved.

[chat-models.ts](../../src/lib/chat-models.ts) owns the default, catalog filtering, pricing and fallback behavior. The selector uses `/api/chat-models`. Do not assume a selected model is currently available simply because it was saved as a preference.

The route validates origin, signed session with current-IP tracking, request size, model pricing, rate limit and spending rules. Non-admin requests reserve the estimated charge before streaming. Settlement follows the model's outcome, not stream closure: the final chunk waits for the SDK to finish, and only nonempty output ending with `stop` or `length` charges the reserved estimate. Empty output, error chunks embedded in the stream, provider errors and cancellation release the hold, as does a failed charge. Request abort and response cancellation propagate to the provider. Calculated actual token cost is reported for comparison, not used to reconcile the charge. Durable provider-spend receipts and retryable settlement recovery are not implemented. See [Sessions and credits](SESSIONS_AND_CREDITS.md).

Final metadata includes model, token counts, finish reason (`error` for a failed stream), latency and `actualCredits`, plus the actual settlement: `billingStatus` (`charged`, `released`, `unresolved` when the release failed, or `not_required` without a reservation), `creditsCharged` and `creditsRefunded` (the reserved amount or 0), `incomplete` for a charged response cut off by `length`, `maxOutputTokens`, and `earlierMessagesOmitted`, the number of older turns not sent. [chat-metadata.tsx](../../src/components/chat-metadata.tsx) renders tokens, latency, finish reason, and notices when an answer was cut short or earlier messages were not sent.

The charge is still the flat estimate (about 1,000 prompt and 1,000 completion tokens), so a request at the bounds can cost the provider several times what the guest pays; showing and enforcing a maximum charge is #60.

## Changing model behavior

Prompt, model, context, or provider changes must follow [Chat eval and release](../workflow/CHAT_EVAL_AND_RELEASE.md). Existing [admission tests](../../src/app/api/__tests__/chat/admission.test.ts), [credit-flow tests](../../src/app/api/__tests__/chat/credit-flow.test.ts) and [stream tests](../../src/app/api/__tests__/chat/stream-handling.test.ts) exercise mechanics, not theological quality or safety scoring.
