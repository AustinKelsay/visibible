# Analytics Implementation Guide

This document describes the current Vercel Analytics implementation in Visibible.

## Architecture

Analytics is implemented through four layers:

1. `src/app/layout.tsx` mounts `<Analytics />` from `@vercel/analytics/next`.
2. `src/lib/analytics.ts` defines typed wrapper functions around `track()`.
3. Feature components call wrappers at action/effect boundaries.
4. `src/lib/analytics-event-utils.ts` centralizes shared analytics derivation logic.

## Dependencies

- `@vercel/analytics` for `track(eventName, payload)`
- `@vercel/analytics/next` for `<Analytics />`

## Event Surface

### Base Props

All events include:

```typescript
type BaseProps = {
  tier: "paid" | "admin";
  hasCredits: boolean;
};
```

### Event Names

`src/lib/analytics.ts` currently wraps these events:

- `verse_view`
- `verse_images_state`
- `chat_opened`
- `chat_message_sent`
- `chat_error_shown`
- `image_generation_started`
- `image_generated`
- `credits_insufficient`
- `generation_error`
- `credits_modal_opened`
- `credits_modal_closed`
- `invoice_created`
- `invoice_copied`
- `invoice_cancelled`
- `payment_completed`
- `payment_expired`
- `menu_opened`
- `preference_changed`
- `feedback_prompt_interaction`
- `feedback_submitted`

## Tracking Entry Points

| File | Analytics Calls |
|------|-----------------|
| `src/components/verse-analytics.tsx` | `verse_view` |
| `src/components/hero-image.tsx` | `verse_images_state`, `image_generation_started`, `image_generated`, `credits_insufficient`, `generation_error` |
| `src/context/navigation-context.tsx` | `menu_opened`, `chat_opened` |
| `src/components/chat.tsx` | `chat_message_sent`, `chat_error_shown`, `credits_insufficient` |
| `src/context/preferences-context.tsx` | `preference_changed` |
| `src/components/buy-credits-modal.tsx` | `credits_modal_opened`, `credits_modal_closed`, `invoice_created`, `invoice_copied`, `invoice_cancelled`, `payment_completed`, `payment_expired` |
| `src/components/feedback-prompt.tsx` | `feedback_prompt_interaction` |
| `src/components/feedback.tsx` | `feedback_submitted` |

## Shared Analytics Helpers

`src/lib/analytics-event-utils.ts` contains normalization helpers used by components.

### `resolveCreditsModalOpenedStep(...)`

Returns the step users enter on open:
- `"invoice"` if a valid active invoice exists
- `"welcome"` for first-time flow
- `"selection"` otherwise

### `resolveCreditsModalClosedStep(...)`

Normalizes close-step segmentation for close states like `success`/`error`:
- Returns direct step for `welcome`/`selection`/`invoice`
- Falls back to `"invoice"` if active invoice exists
- Otherwise returns `"selection"` if welcome was shown in-session, else `"welcome"`

### `resolveHasCreditsAfterGeneration(...)`

For `image_generated.hasCredits`:
- Uses server returned credits when present
- Falls back to current session credits otherwise

### `resolveChatErrorType(error)`

Maps free-form chat errors to stable categories:
- `"rate_limit"`
- `"model_unavailable"`
- `"service_busy"`
- `"unknown"`

## Event Semantics By Area

### Verse + Image Discovery

`verse_view` in `src/components/verse-analytics.tsx`:
- Fires once per verse/translation key after session loads.

`verse_images_state` in `src/components/hero-image.tsx`:
- Fires once per verse view after image history is known.
- Uses discriminated payload:
  - `imageState: "known"` with `imageCount` and `hasImages`
  - `imageState: "unknown"` when Convex image history is unavailable

### Chat

`chat_opened` in `src/context/navigation-context.tsx`:
- Fires on `isChatOpen` false -> true transition.
- Includes `hasContext` from `chatContext !== null`.

`chat_message_sent` in `src/components/chat.tsx`:
- Fires on submit immediately after `sendMessage` call.
- Includes `variant`, `chatModel`, `messageCount`, and `hasContext`.

`chat_error_shown` in `src/components/chat.tsx`:
- Fires when `useChat` exposes an error that is rendered to users.
- Uses `resolveChatErrorType`.
- Dedupes repeated renders with `lastTrackedErrorKeyRef`.

### Image Generation

`image_generation_started` in `src/components/hero-image.tsx`:
- Fires immediately before `/api/generate-image` request.
- Includes model, aspect ratio, resolution, and intended generation number.

`image_generated` in `src/components/hero-image.tsx`:
- Fires after successful generation response.
- Fires regardless of Convex persistence (`onSaveImage` optional).
- Uses `resolveHasCreditsAfterGeneration` for post-action `hasCredits`.

`credits_insufficient` in `src/components/hero-image.tsx` and `src/components/chat.tsx`:
- Fires when an action is blocked for insufficient credits.
- `feature` is `"image"` or `"chat"`.

`generation_error` in `src/components/hero-image.tsx`:
- Fires on generation failure paths (`disabled`, `unauthorized`, timeout/network/general failures).

### Payments / Credits Modal

`credits_modal_opened` in `src/components/buy-credits-modal.tsx`:
- Fires once per modal open transition.
- Step derived via `resolveCreditsModalOpenedStep`.

`credits_modal_closed` in `src/components/buy-credits-modal.tsx`:
- Fires for explicit close flows (`handleClose`, browse free, admin-login close path).
- Includes:
  - normalized `step`
  - raw modal `state`
  - `hadInvoice`
  - `timeOpenSeconds` from open timestamp

`invoice_created` in `src/components/buy-credits-modal.tsx`:
- Fires after invoice API success.

`invoice_copied` in `src/components/buy-credits-modal.tsx`:
- Fires after successful clipboard copy of BOLT11.

`invoice_cancelled` in `src/components/buy-credits-modal.tsx`:
- Fires when user cancels an in-progress invoice.

`payment_completed` in `src/components/buy-credits-modal.tsx`:
- Fires once poller confirms invoice paid.

`payment_expired` in `src/components/buy-credits-modal.tsx`:
- Fires when invoice becomes expired/failed.
- Guarded by `hasTrackedExpiredRef` to avoid duplicates.

### UI + Preferences

`menu_opened` in `src/context/navigation-context.tsx`:
- Fires on menu open transition.

`preference_changed` in `src/context/preferences-context.tsx`:
- Fires when the user sets one of:
  - `translation`
  - `imageModel`
  - `imageAspectRatio`
  - `imageResolution`
  - `chatModel`

### Feedback

`feedback_prompt_interaction` in `src/components/feedback-prompt.tsx`:
- Fires with `action: "shown" | "clicked" | "dismissed"`.
- Includes `visitCount` at time of interaction.
- Skips tracking when session context is still loading.

`feedback_submitted` in `src/components/feedback.tsx`:
- Fires after successful feedback POST.
- Includes `hasContext`, `hasImageContext`, and `sidebarTab: "feedback"`.
- Skips tracking when session context is still loading.

## Deduplication Patterns

- Ref transition guards in effects (for modal/menu/chat open transitions).
- Keyed refs for once-per-context analytics (`verse_view`, `verse_images_state`, `chat_error_shown`).
- Explicit one-shot guard for invoice expiry (`hasTrackedExpiredRef`).

## Testing

Automated tests:

- `src/lib/__tests__/analytics.test.ts`
  - Mocks `@vercel/analytics` and verifies wrapper event names + payload base props.
- `src/lib/__tests__/analytics-event-utils.test.ts`
  - Verifies helper semantics for modal step resolution, post-generation credits derivation, and chat error normalization.

Recommended verification commands:

```bash
npm run lint
npm run typecheck
npm test
```

Manual verification in browser:

1. Open DevTools Network tab.
2. Filter for `/_vercel/insights/event`.
3. Trigger actions and inspect event names/payload properties.

## Files Reference

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Mounts Vercel `<Analytics />` |
| `src/lib/analytics.ts` | Typed event wrappers |
| `src/lib/analytics-event-utils.ts` | Helper derivation/normalization logic |
| `src/lib/__tests__/analytics.test.ts` | Wrapper regression tests |
| `src/lib/__tests__/analytics-event-utils.test.ts` | Helper regression tests |

## Related Docs

- Product context: `llm/context/ANALYTICS.md`
- Feedback behavior: `llm/context/FEEDBACK.md`
- Payment flow: `llm/context/PAYMENTS.md`
