# Analytics Context

High-level view of analytics goals and events tracked. This describes product intent and user-facing insights, not internal implementation details.

## Summary

- Analytics use **Vercel Analytics** custom events.
- Event payloads are designed for behavior analysis without user identity.
- Every event includes `tier` and `hasCredits` for segmentation.
- Primary goals: measure engagement, locate friction, and improve conversion.

## Privacy Stance

- No user IDs, emails, or account identifiers are tracked.
- No fingerprinting fields are emitted in analytics payloads.
- Session-level state (`tier`, `hasCredits`) is used only for aggregate segmentation.

## Events Overview

| Event | When It Fires | Key Insights |
|-------|---------------|--------------|
| `verse_view` | Verse page analytics component fires | Content consumption by book/chapter/translation |
| `verse_images_state` | Verse image inventory resolves | Coverage (`hasImages`) and Convex availability (`known`/`unknown`) |
| `chat_opened` | Sidebar chat opens | Chat feature discovery |
| `chat_message_sent` | User sends chat message | Chat engagement depth and model usage |
| `chat_error_shown` | Chat UI shows an error | Reliability friction by normalized error type |
| `image_generation_started` | User starts image generation | Generation demand by model/ratio/resolution |
| `image_generated` | Generation succeeds | Successful generation volume and latency |
| `credits_insufficient` | Action blocked by low credits | Monetization friction points |
| `generation_error` | Image generation fails | Technical reliability issues |
| `credits_modal_opened` | Buy credits modal opens | Purchase intent by entry step |
| `credits_modal_closed` | Buy credits modal closes | Drop-off step, close state, time-in-modal |
| `invoice_created` | Lightning invoice is created | Strong purchase intent |
| `invoice_copied` | BOLT11 copied to clipboard | Payment intent progression |
| `invoice_cancelled` | User cancels invoice view | Mid-funnel abandonment signal |
| `payment_completed` | Invoice paid and confirmed | Conversion (credits purchase) |
| `payment_expired` | Invoice expires or fails | Payment friction/abandonment |
| `menu_opened` | Book menu opens | Navigation usage |
| `preference_changed` | User changes a preference | Customization behavior |
| `feedback_prompt_interaction` | Feedback CTA shown/clicked/dismissed | Feedback prompt exposure and response |
| `feedback_submitted` | Feedback form submit succeeds | Feedback conversion and context coverage |

## Funnel Analysis

### Primary Purchase Funnel

```text
verse_view -> credits_insufficient -> credits_modal_opened -> invoice_created -> payment_completed
```

Operational notes:
- `credits_modal_opened` can happen from onboarding or direct CTA (not only after `credits_insufficient`).
- `credits_modal_closed`, `invoice_copied`, `invoice_cancelled`, and `payment_expired` are diagnostic events around funnel drop-off.

Key metrics:
- **Discovery rate**: `credits_insufficient / verse_view`
- **Modal open rate**: `credits_modal_opened / credits_insufficient`
- **Invoice intent rate**: `invoice_created / credits_modal_opened`
- **Clipboard progression**: `invoice_copied / invoice_created`
- **Conversion rate**: `payment_completed / invoice_created`
- **Abandonment rate**: `(invoice_cancelled + payment_expired) / invoice_created`

### Engagement Funnels

```text
verse_view -> chat_opened -> chat_message_sent
verse_view -> image_generation_started -> image_generated
```

Diagnostic overlays:
- `chat_error_shown` helps explain chat conversion loss.
- `generation_error` helps explain image generation drop-off.

## Segmentation

All events carry `tier` and `hasCredits`.

| Segment | Tier | Has Credits | Interpretation |
|---------|------|-------------|----------------|
| No credits | `paid` | `false` | Users blocked from paid actions |
| Has credits | `paid` | `true` | Users able to use paid features |
| Admin | `admin` | `true` or `false` | Internal/testing traffic |

Useful cuts:
- Feature adoption with credits vs without credits.
- Purchase funnel performance with existing credits vs depleted balance.
- Reliability differences by model and user credit state.

## Event Categories

### Engagement

- `verse_view`
- `verse_images_state`
- `chat_opened`
- `chat_message_sent`
- `image_generation_started`
- `image_generated`
- `menu_opened`
- `preference_changed`
- `feedback_prompt_interaction`
- `feedback_submitted`

### Friction

- `credits_insufficient`
- `chat_error_shown`
- `generation_error`
- `credits_modal_closed`
- `invoice_cancelled`
- `payment_expired`

### Conversion

- `credits_modal_opened`
- `invoice_created`
- `invoice_copied`
- `payment_completed`

## Known Gaps

1. No user-level identity or retention cohorts.
2. No experiment ID in payloads for A/B attribution.
3. No downstream quality rating tied directly to image/chat outcomes.
4. No server-side guaranteed delivery for client analytics events.

## Interpretation Notes

- `verse_images_state.imageState` may be `"unknown"` when Convex is unavailable; exclude those rows from coverage calculations.
- `credits_modal_opened.step` and `credits_modal_closed.step` use `"welcome"`, `"selection"`, or `"invoice"`.
- `credits_modal_closed.state` can be `"welcome"`, `"selection"`, `"loading"`, `"invoice"`, `"success"`, or `"error"`.
- `chat_error_shown.errorType` is normalized to `"rate_limit"`, `"model_unavailable"`, `"service_busy"`, or `"unknown"`.
- `image_generated.hasCredits` prefers server-returned post-generation credits when available.
- Most other events derive `hasCredits` from `credits > 0`.

## Related Docs

- Technical implementation: `llm/implementation/ANALYTICS_IMPLEMENTATION.md`
- Navigation context: `llm/context/NAVIGATION.md`
- Feedback system: `llm/context/FEEDBACK.md`
- Session and credits: `llm/context/SESSIONS_AND_CREDITS.md`
- Payments flow: `llm/context/PAYMENTS.md`
