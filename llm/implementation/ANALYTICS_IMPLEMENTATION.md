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

## Scope Note

This document covers Vercel Analytics only.
Nostr ranking does not read from the Vercel Web Analytics dashboard/API. Instead,
the app records lightweight image impressions directly into Convex when a
persisted image is displayed, so recurring Nostr scheduling can rank images
server-side with deterministic windowing.

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
- `settings_menu_opened`
- `preference_changed`
- `verse_navigation`
- `chapter_gallery_viewed`
- `chapter_gallery_layout_changed`
- `chapter_gallery_item_opened`
- `image_fullscreen_opened`
- `image_browsed`
- `saved_image_load_failed`
- `api_docs_viewed`
- `api_docs_link_clicked`
- `feedback_prompt_interaction`
- `feedback_submitted`

## Tracking Entry Points

| File | Analytics Calls |
|------|-----------------|
| `src/components/verse-analytics.tsx` | `verse_view` |
| `src/components/hero-image.tsx` | `verse_images_state`, `image_generation_started`, `image_generated`, `credits_insufficient`, `generation_error` |
| `src/context/navigation-context.tsx` | `menu_opened`, `chat_opened`, `settings_menu_opened` |
| `src/components/chat.tsx` | `chat_message_sent`, `chat_error_shown`, `credits_insufficient` |
| `src/context/preferences-context.tsx` | `preference_changed` |
| `src/components/scripture-reader.tsx` | `verse_navigation` |
| `src/components/chapter-gallery.tsx` | `chapter_gallery_viewed`, `chapter_gallery_layout_changed`, `chapter_gallery_item_opened`, `image_fullscreen_opened`, `saved_image_load_failed` |
| `src/components/verse-strip-bar.tsx` | `image_fullscreen_opened` |
| `src/components/api-docs-analytics.tsx` | `api_docs_viewed`, `api_docs_link_clicked` |
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
- Includes `source` so header CTA, hero CTA, auto-generate, and retry flows segment cleanly.

`image_generated` in `src/components/hero-image.tsx`:
- Fires after successful generation response.
- Fires regardless of Convex persistence (`onSaveImage` optional).
- Uses `resolveHasCreditsAfterGeneration` for post-action `hasCredits`.
- Includes `source` for attribution back to the initiating UI path.

`credits_insufficient` in `src/components/hero-image.tsx` and `src/components/chat.tsx`:
- Fires when an action is blocked for insufficient credits.
- `feature` is `"image"` or `"chat"`.
- Includes `source` for chat submit, image CTA/retry, and header buy-credits CTA.

`generation_error` in `src/components/hero-image.tsx`:
- Fires on generation failure paths (`disabled`, `unauthorized`, timeout/network/general failures).
- Includes `source` for retry/header/auto-generate attribution.

`image_browsed` in `src/components/hero-image.tsx`:
- Fires when users browse older/newer persisted image history.
- Includes `direction`, `surface`, `currentIndex`, and `totalImages`.

`image_fullscreen_opened` in `src/components/hero-image.tsx`, `src/components/verse-strip-bar.tsx`, and `src/components/chapter-gallery.tsx`:
- Fires when a fullscreen image viewer or lightbox is opened.
- Includes `source` to distinguish hero mobile, verse strip, and chapter gallery lightbox opens.

`saved_image_load_failed` in `src/components/hero-image.tsx` and `src/components/chapter-gallery.tsx`:
- Fires when a persisted image fails to load on hero, fullscreen, gallery cards, or gallery lightbox.
- Includes `surface`, image identifiers, and retry attempt when available.

### Chapter Gallery

`chapter_gallery_viewed` in `src/components/chapter-gallery.tsx`:
- Fires once per book/chapter/current-verse context when gallery mode is enabled and data is ready.
- Includes `layoutMode`, `savedImageCount`, and `placeholderCount`.

`chapter_gallery_layout_changed` in `src/components/chapter-gallery.tsx`:
- Fires when users switch between `"all"` and `"byVerse"` layouts.

`chapter_gallery_item_opened` in `src/components/chapter-gallery.tsx`:
- Fires when users click a gallery card or grouped verse link to enter the focused reader.
- Includes image presence and selected card metadata.

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

`settings_menu_opened` in `src/context/navigation-context.tsx`:
- Fires on mobile header settings menu open transition.

`preference_changed` in `src/context/preferences-context.tsx`:
- Fires when the user sets one of:
  - `translation`
  - `imageModel`
  - `imageAspectRatio`
  - `imageResolution`
  - `chatModel`
- `chapterGallery`
- Includes `source` to distinguish which UI control changed the preference.

`verse_navigation` in `src/components/scripture-reader.tsx`:
- Fires for keyboard, mobile nav, and desktop nav verse transitions.
- Includes `direction`, `source`, and `targetUrl`.

### API Docs

`api_docs_viewed` in `src/components/api-docs-analytics.tsx`:
- Fires once when the API docs page is opened.

`api_docs_link_clicked` in `src/components/api-docs-analytics.tsx`:
- Fires for hero CTA, quick link, and footer clicks into API docs and API endpoints.
- Includes `source`, `href`, and target classification.

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

Server-side verification for the public image API:

1. Hit `/api/public/images*` endpoints locally.
2. Inspect structured logs for `public_api.request`.
3. Confirm `public_api_requests_total` labels include `endpoint`, `status`, and `outcome`.

## Files Reference

| File | Purpose |
|------|---------|
| `src/app/layout.tsx` | Mounts Vercel `<Analytics />` |
| `src/lib/analytics.ts` | Typed event wrappers |
| `src/lib/analytics-event-utils.ts` | Helper derivation/normalization logic |
| `src/components/api-docs-analytics.tsx` | API docs page + link tracking |
| `src/lib/__tests__/analytics.test.ts` | Wrapper regression tests |
| `src/lib/__tests__/analytics-event-utils.test.ts` | Helper regression tests |
| `src/lib/public-image-api.ts` | Shared public API server-side request observability |

## Related Docs

- Product context: `llm/context/ANALYTICS.md`
- Feedback behavior: `llm/context/FEEDBACK.md`
- Payment flow: `llm/context/PAYMENTS.md`
