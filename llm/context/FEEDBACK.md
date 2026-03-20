# Feedback

High-level overview of how Visibible collects user feedback.

## Overview

Visibible provides two feedback entry points:

1. Sidebar Feedback tab
2. Feedback prompt CTA

Submissions are stored in Convex for admin review.

## Entry Points

1. **Sidebar Tab**: Chat sidebar includes a `Feedback` tab users can open anytime.
2. **Feedback Prompt**: A desktop CTA that appears occasionally and opens the sidebar directly to the `Feedback` tab.

## Submission Payload

Successful feedback submission includes:

| Field | Description |
|-------|-------------|
| `message` | Feedback text (max 5000 chars) |
| `verseContext` | Optional book/chapter/verseRange context |
| `imageContext` | Optional image details when feedback is image-related |
| `sid` | Session ID (server-side context) |
| `userAgent` | Browser user-agent (debug context) |
| `createdAt` | Submission timestamp |

## Prompt Behavior

Prompt state is stored in localStorage (`visibible_feedback_prompt`).

- Trigger threshold: random visit count between 5 and 15 verse navigations
- Cooldown: 24 hours after dismissal/click
- Auto-dismiss: 8 seconds after showing
- Visibility: desktop only (`md+`)
- Suppression: hidden while sidebar is open

## Feedback Analytics

### `feedback_prompt_interaction`

Tracked in `src/components/feedback-prompt.tsx` with:

- `action`: `shown` | `clicked` | `dismissed`
- `visitCount`
- `tier`, `hasCredits`

### `feedback_submitted`

Tracked in `src/components/feedback.tsx` after successful POST with:

- `hasContext`
- `hasImageContext`
- `sidebarTab: "feedback"`
- `tier`, `hasCredits`

## Storage

Convex table: `feedback`.

## Admin Access

1. Open Convex dashboard.
2. Query the `feedback` table.
3. Sort by `createdAt` descending.

## Rate Limiting

Feedback API limits submissions to 5/minute per IP.

## Entry Points (Files)

- Feedback form: `src/components/feedback.tsx`
- Feedback prompt: `src/components/feedback-prompt.tsx`
- Sidebar tabs: `src/components/chat-sidebar.tsx`
- API route: `src/app/api/feedback/route.ts`
- Convex mutation: `convex/feedback.ts`

## Related Docs

- Analytics overview: `llm/context/ANALYTICS.md`
- Navigation context: `llm/context/NAVIGATION.md`
- Rate limiting details: `llm/implementation/RATE_LIMIT_IMPLEMENTATION.md`
