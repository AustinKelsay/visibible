# Analytics Context

High-level view of analytics goals and events tracked. This describes product intent and user-facing insights, not internal implementation.

## Summary

- Analytics use **Vercel Analytics** for privacy-preserving, aggregate insights
- Events are designed to track **behavior without PII** (no user IDs, emails, or device fingerprints)
- Every event includes `tier` and `hasCredits` for user segmentation
- Purpose: understand feature adoption, identify friction points, optimize conversion

## Privacy Stance

- No personally identifiable information (PII) collected
- No user accounts means no user IDs tracked
- Session-only context (tier, credits) used for segmentation
- All data is aggregate — no individual user tracking

## Events Overview

| Event | When It Fires | Key Insights |
|-------|---------------|--------------|
| `verse_view` | Verse page loads | Content consumption, popular books/chapters |
| `verse_images_state` | Image inventory resolves | Image coverage, discovery vs creation |
| `chat_opened` | Chat sidebar opens | Chat feature discovery and interest |
| `chat_message_sent` | User sends message | Chat engagement depth, model preferences |
| `image_generated` | Successful generation | Image feature usage, model preferences |
| `credits_insufficient` | Feature blocked by low credits | Friction points, monetization opportunities |
| `generation_error` | Image generation fails | Technical issues, model reliability |
| `credits_modal_opened` | Buy credits modal opens | Purchase intent |
| `invoice_created` | Lightning invoice created | Strong purchase intent |
| `payment_completed` | Payment confirmed | Conversion (revenue event) |
| `payment_expired` | Invoice times out | Abandonment, payment friction |
| `menu_opened` | Book menu opens | Navigation patterns |
| `preference_changed` | User changes setting | Feature customization |

## Funnel Analysis

### Primary Conversion Funnel

```
verse_view → credits_insufficient → credits_modal_opened → invoice_created → payment_completed
```

Note: This funnel is conceptual. `credits_modal_opened` can be triggered by onboarding or direct CTAs (not only after `credits_insufficient`).

Key metrics:
- **Discovery rate**: `credits_insufficient` / `verse_view`
- **Modal open rate**: `credits_modal_opened` / `credits_insufficient`
- **Intent rate**: `invoice_created` / `credits_modal_opened`
- **Conversion rate**: `payment_completed` / `invoice_created`
- **Abandonment rate**: `payment_expired` / `invoice_created`

### Feature Engagement Funnel

```
verse_view → image_generated
verse_view → chat_opened → chat_message_sent
```

Key metrics:
- **Image feature adoption**: `image_generated` / `verse_view`
- **Chat feature adoption**: `chat_opened` / `verse_view`
- **Chat engagement depth**: `chat_message_sent` / `chat_opened`

## Segmentation

All events include `tier` and `hasCredits` enabling segmentation:

| Segment | Tier | Has Credits | Characteristics |
|---------|------|-------------|-----------------|
| Users without credits | `paid` | `false` | Paid tier users exploring without credits (no "free" tier exists) |
| Paying users | `paid` | `true` | Have purchased credits |
| Admin | `admin` | `true` or `false` | Internal testing, unlimited access |

Useful analyses:
- Compare feature adoption between users with credits vs. without
- Track how credit depletion affects engagement
- Identify which features drive credit purchases

## Event Categories

### Engagement Events
- `verse_view` — Core content consumption
- `verse_images_state` — Image inventory state (coverage analysis)
- `chat_opened`, `chat_message_sent` — AI chat engagement
- `image_generated` — AI image engagement
- `menu_opened` — Navigation discovery
- `preference_changed` — Customization

### Friction Events
- `credits_insufficient` — Monetization friction point
- `generation_error` — Technical friction
- `payment_expired` — Payment friction

### Conversion Events
- `credits_modal_opened` — Purchase consideration
- `invoice_created` — Purchase intent
- `payment_completed` — Revenue (key business metric)

## Known Gaps

1. **No session tracking**: Can't measure unique users or return visits
2. **No funnel timing**: Don't know how long between events
3. **No A/B testing**: Single experience for all users
4. **No model comparison analytics**: Can't correlate model choice with satisfaction
5. **No retention metrics**: Can't track credit repurchases (would need user accounts)

## Interpretation Notes

- `verse_images_state` can be **`imageState: "unknown"`** when Convex is disabled. Exclude those rows from coverage calculations.
- `hasCredits` is derived from `credits > 0` for all tiers; admins may still report `hasCredits: false` despite unlimited access.

## Related Docs

- Technical implementation: `llm/implementation/ANALYTICS_IMPLEMENTATION.md`
- Session and credits: `llm/context/SESSIONS_AND_CREDITS.md`
- Payments flow: `llm/context/PAYMENTS.md`
