# Client analytics

[src/app/layout.tsx](../../src/app/layout.tsx) mounts Vercel Analytics only for `VERCEL_ENV=preview` or `production`. [analytics.ts](../../src/lib/analytics.ts) defines the typed custom-event contract and tracking functions. Consult it for exact event names/properties rather than maintaining a second schema here.

Payloads use `tier` and `hasCredits` for segmentation, without session IDs or message text. This describes the custom client events, not all stored application data: feedback, billing and operational records have their own fields.

## Interpretation

- `verse_images_state` can be `unknown` without resolved Convex data; exclude unknown inventory from image-coverage calculations.
- Purchase events measure modal opening/closing, invoice creation/copy/cancellation/expiry, and confirmed payment. A modal can open from onboarding or a purchase CTA, so event-count ratios are not a strict sequential user funnel.
- Generation/navigation/preference events carry a source to distinguish the originating control. Gallery and fullscreen events distinguish their surfaces.
- `image_generated.hasCredits` prefers the server-returned balance; most other events use the client balance. Admins can have `hasCredits=false` while still being allowed to generate.
- [analytics-event-utils.ts](../../src/lib/analytics-event-utils.ts) normalizes modal steps, chat errors and post-generation credit state. Preserve deduplication in the calling components when changing effects.

Client events are best effort and do not establish billing truth, model answer quality, or per-user retention. Public API requests use server counters; Nostr selection uses Convex image impressions. See [Observability](OBSERVABILITY.md) and [Nostr](NOSTR.md).

Verification: [analytics tests](../../src/lib/__tests__/analytics.test.ts), [event utility tests](../../src/lib/__tests__/analytics-event-utils.test.ts), and event-specific component tests.
