# Image generation

[POST /api/generate-image](../../src/app/api/generate-image/route.ts) performs the OpenRouter request in Next.js. Convex tracks state, credits, cached scene plans and saved images; it is not a background worker for this request.

## Request lifecycle

1. Validate the feature flag, origin, CSRF token, signed session with current-IP tracking, body, model, rate limit and credit eligibility.
2. Resolve the required single-verse reference and selected translation through [the canonical passage resolver](../../src/lib/generation-passage.ts). The reference endpoint resolves aliases; a validated canonical chapter supplies the text. Neighbors use the shared navigation rules. Client text, neighboring context and theme are compatibility fields only and never become prompt/cache input. Genesis 1 uses the server-owned theme. Missing/invalid current text and upstream failures stop before reservation or provider work; missing neighboring text is omitted, while neighboring lookup errors remain retryable.
3. Authenticated retries return the existing operation before catalog or Scripture reads. New requests look up the scene plan by verse, translation and style; only entries matching the canonical prompt-policy version and planner model are reused. Atomically claim the owner/input fingerprint and billing ID before any paid work. Admission failure starts no provider call. A cache miss runs the optional planner with verified server inputs.
4. Assemble the bounded prompt, mark the request as generating, and call OpenRouter with the configured timeout.
5. Settle credits, persist the cost event (or enqueue its outbox fallback), attempt server-side image storage, and return the image and available saved-image ID. Failure to save does not imply that generation failed or that the image is permanently stored.

Lifecycle states are `queued`, `planning`, `generating`, `succeeded`, and `failed`. [verseImages.ts](../../convex/verseImages.ts) provides the lifecycle/cache/storage functions; [schema.ts](../../convex/schema.ts) defines their fields. [costs.ts](../../convex/costs.ts) handles Neutral Cost and outbox replay.

## UI and pricing

[HeroImage](../../src/components/hero-image.tsx) sends a request ID, subscribes to lifecycle status, and registers generation controls with [GenerationContext](../../src/context/generation-context.tsx). Header controls share that state. First-image auto-generation requires loaded empty history and strict affordability; explicit actions can use the spend-down grace. Empty history alone does not cause a paid request.

`/api/image-models` supplies learned estimates, planner surcharge and timing information. Estimate fallback order is model → provider → global → catalog. Resolution support is normalized before lookup. The backend can quote less than the UI on a planner cache hit. [Sessions and credits](SESSIONS_AND_CREDITS.md) explains holds, settlement and fallback charges.

## Configuration and related behavior

- `ENABLE_IMAGE_GENERATION=true` enables the route. `ENABLE_SCENE_PLANNER=false` disables planning; planning is otherwise enabled.
- Timeout/model overrides are listed in [.env.example](../../.env.example); the route and [scene-planner.ts](../../src/lib/scene-planner.ts) define defaults.
- [Prompt specification](../implementation/IMAGE_PROMPT_SPEC.md), [persistence](IMAGE-PERSISTENCE.md), and [bulk generation](BULK-GENERATION.md) cover those separate concerns.
- [Credit-flow](../../src/app/api/__tests__/generate-image/credit-flow.test.ts) and [scene-planner](../../src/app/api/__tests__/generate-image/scene-planner.test.ts) tests cover request behavior.

The canonical-input version boundary is `2026-09-08-canonical`. It prevents plans authored under the older client-text policy from being reused. Full content/style/theme cache identity remains T19. Saved image records and replay responses preserve the original reference, translation and verse text; existing historical images are not rewritten. The provider receives bounded canonical text with whitespace normalized, without removing words such as “instruction” from Scripture.
