# Image generation

[POST /api/generate-image](../../src/app/api/generate-image/route.ts) performs the OpenRouter request in Next.js. Convex tracks state, credits, cached scene plans and saved images; it is not a background worker for this request.

## Request lifecycle

1. Validate the feature flag, origin, CSRF token, signed session with current-IP tracking, body, model and rate limit.
2. Resolve the required single-verse reference and selected translation through [the canonical passage resolver](../../src/lib/generation-passage.ts). The reference endpoint resolves aliases; a validated canonical chapter supplies the text. Neighbors use the shared navigation rules. Client text, neighboring context and theme are compatibility fields only and never become prompt/cache input. Genesis 1 uses the server-owned theme. Missing/invalid current text and upstream failures stop before reservation or provider work; missing neighboring text is omitted, while neighboring lookup errors remain retryable.
3. Authenticated retries return the existing operation before catalog or Scripture reads. New requests query the scene plan by verse, translation and style; reuse also requires the full canonical-input fingerprint, prompt version and planner model. The fingerprint includes complete current/neighbor text, theme/style fields and the exact planner prompt. A lookup does not update hit counters; the separate hit mutation verifies the same identity so a delayed write cannot affect a replacement. Affordability (HTTP 402) and the daily spending limit (HTTP 429) are checked before the request is recorded, so a refused request does not consume its request ID; a retry with the same ID after a top-up, as bulk resume sends, is admitted normally. The reservation repeats both checks atomically to guard races. Atomically claim the owner/input fingerprint and billing ID before any paid work. Admission failure starts no provider call. A cache miss runs the optional planner with verified server inputs. If the planner model's pricing is unknown (missing or malformed catalog rates, or a failed pricing lookup), the request skips the planner and uses the direct verse prompt, so no unpriced provider work runs; a known-free planner still runs.
4. Assemble the bounded prompt, mark the request as generating, and call OpenRouter with the configured timeout.
5. Settle credits, persist the cost event (or enqueue its outbox fallback), attempt server-side image storage, and return the image and available saved-image ID. Failure to save does not imply that generation failed or that the image is permanently stored.

Lifecycle states are `queued`, `planning`, `generating`, `succeeded`, and `failed`. [verseImages.ts](../../convex/verseImages.ts) provides the lifecycle/cache/storage functions; [schema.ts](../../convex/schema.ts) defines their fields. [costs.ts](../../convex/costs.ts) handles Neutral Cost and outbox replay.

## UI and pricing

[HeroImage](../../src/components/hero-image.tsx) sends a request ID, subscribes to lifecycle status, and registers generation controls with [GenerationContext](../../src/context/generation-context.tsx). Header controls share that state. First-image auto-generation requires loaded empty history and strict affordability; explicit actions can use the spend-down grace. Empty history alone does not cause a paid request.

`/api/image-models` supplies per-resolution catalog quotes including the planner surcharge, plus timing information. Resolution support is normalized before lookup. The backend can quote less than the UI on a planner cache hit. [Sessions and credits](SESSIONS_AND_CREDITS.md) explains holds, settlement and fallback charges.

## Configuration and related behavior

- `ENABLE_IMAGE_GENERATION=true` enables the route. `ENABLE_SCENE_PLANNER=false` disables planning; planning is otherwise enabled.
- Timeout/model overrides are listed in [.env.example](../../.env.example); the route and [scene-planner.ts](../../src/lib/scene-planner.ts) define defaults. The planner request disables reasoning, because reasoning tokens count against its 220-token limit; a planner model must allow that (`openai/gpt-oss-*` does not). The [model comparison](../research/2026-10-14-scene-planner-free-models.md) explains the current default.
- A free planner model shares the OpenRouter account's free-model allowance: 20 requests per minute, and 1,000 per day for accounts that have bought at least $10 of credits (50 per day otherwise). Visibible's account had the 1,000 allowance on 2026-10-14. Reused scene plans make no request. When the allowance runs out, the planner gets HTTP 429 and generations continue without a scene plan until it resets; only very large bulk jobs are likely to reach it.
- Every generation that reaches planning records one `scene_planner_outcomes_total` count: `planned`, `cache_hit`, `disabled`, `skipped_unpriced`, `http_error`, `empty_content`, `invalid_plan`, `timeout` or `error`. A rise in anything but the first three means scene plans are being lost; see [Observability](OBSERVABILITY.md).
- [Prompt specification](../implementation/IMAGE_PROMPT_SPEC.md), [persistence](IMAGE-PERSISTENCE.md), and [bulk generation](BULK-GENERATION.md) cover those separate concerns.
- [Credit-flow](../../src/app/api/__tests__/generate-image/credit-flow.test.ts) and [scene-planner](../../src/app/api/__tests__/generate-image/scene-planner.test.ts) tests cover request behavior.

The canonical-input version boundary is `2026-09-08-canonical`. It prevents plans authored under the older client-text policy from being reused. Legacy entries without the full input fingerprint miss safely. One cache slot remains per verse/translation/style; a newer incompatible input replaces that slot rather than growing versions indefinitely. Saved image records and replay responses preserve the original reference, translation and verse text; existing historical images are not rewritten. The provider receives bounded canonical text with whitespace normalized, without removing words such as “instruction” from Scripture.

[Image prompts](../../src/lib/image-prompts.ts) owns scene-plan normalization, bounded image prompt construction, planner prompt construction, and cache fingerprinting. Its classical style strings, priority rules, trimming order, 180-character plan fields and 2,800-character image budget preserve the captured baseline. Model/prompt changes must update their declared version and follow the evaluation release policy.

## Catalog quotes and supported settings (T03)

[Image catalog](../../src/lib/image-catalog.ts) normalizes the general OpenRouter catalog for the existing chat-completion image request. It reads text input/output rates and `pricing.image_output` as USD per output token for the verified Gemini families; it never treats `pricing.image` as a generated-image price. Billing metadata contains its source, capture time, unit and policy version. Capabilities contain documentation provenance. The adapter does not switch generation APIs.

Google documents 1,290 output tokens for Gemini 2.5 Flash Image. Gemini 3 Pro uses 1,120 at 1K/2K and 2,000 at 4K; Gemini 3.1 Flash uses 1,120/1,680/2,520. Estimates additionally allow 1,000 text input and 1,000 text output tokens. These are estimation assumptions, not enforced spending caps. The combined decimal sum rounds to credits once. Sources: [Google image dimensions/token counts](https://ai.google.dev/gemini-api/docs/image-generation), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenRouter chat request contract](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request).

The verified registry covers the existing default and 3 Pro/3.1 Flash stable and preview identifiers. Unknown models remain visible but disabled until output units and request settings are verified. No default-model quality change is included. Explicit unsupported settings fail before reservation/provider work. Stored resolutions normalize when selecting a model; a removed saved model requires an explicit new selection.

Discovery and admission use the same catalog quote. Discovery includes the planner allowance (zero when planner pricing is unknown); an existing compatible scene plan can reduce admission by that allowance. Cost samples are still recorded, but unversioned historical/model/provider/global estimates do not override current quotes. T05 introduces validated learned estimates. The model-list GET no longer starts a historical backfill.

A catalog outage may use a labeled last-known snapshot for at most six hours. Without one, choices are unavailable; the configured default is never inserted into a successful catalog that removed it. Selectors refetch when reopened. Scripture remains available during pricing failure.

Holds use the bounded headroom described in [Sessions and credits](SESSIONS_AND_CREDITS.md); final settlement still uses actual usage where available. A visible accepted maximum, input/output exposure bounds and versioned quote acceptance (T04) are not implemented. Historical charges are unchanged.
