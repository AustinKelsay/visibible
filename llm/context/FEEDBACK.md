# Feedback

High-level overview of how Visibible collects user feedback. Details may change.

## Overview

Visibible provides a simple feedback mechanism for users to share thoughts, report issues, or suggest improvements. Feedback is stored in Convex and viewable via the Convex dashboard.

## Entry Points

Users can submit feedback through two entry points:

1. **Sidebar Tab** — The chat sidebar has a "Feedback" tab alongside the "Chat" tab. Users can switch to the Feedback tab at any time to submit feedback.

2. **Feedback Prompt** — A popout CTA that occasionally appears near the chat FAB, prompting users to share feedback. Clicking it opens the sidebar directly to the Feedback tab.

## What Gets Captured

Each feedback submission includes:

| Field | Description |
|-------|-------------|
| `message` | The feedback text (max 5000 characters) |
| `verseContext` | Auto-captured book/chapter/verse if user is on a verse page |
| `sid` | Session ID (for rate limiting context) |
| `userAgent` | Browser user agent (for debugging) |
| `createdAt` | Submission timestamp |

## Feedback Prompt Behavior

The FeedbackPrompt popout uses smart timing to avoid being intrusive:

- **Trigger**: Shows after 5-15 random verse visits (threshold varies per user)
- **Cooldown**: After dismissing or submitting, won't show again for 24 hours
- **Position**: Above the ChatPrompt on mobile, same position on desktop
- **Auto-dismiss**: Disappears after 8 seconds if not interacted with
- **Persistence**: Visit count and cooldown state stored in localStorage

## Storage

Feedback is stored in the Convex `feedback` table with an index by `createdAt` for easy admin review.

## Admin Access

Admins view feedback directly in the Convex dashboard:
1. Go to Convex dashboard
2. Navigate to the `feedback` table
3. Sort by `createdAt` descending to see recent submissions

## Rate Limiting

Feedback submissions are rate limited to 5 per minute per IP address to prevent spam.

## Prompt Behavior

The feedback prompt appears after a random number of verse visits (5-15), tracked in local storage.
Visibility re-evaluates on each verse navigation, so the CTA can surface as soon as the threshold is reached.

## Entry Points (Files)

- Feedback form: `src/components/feedback.tsx`
- Feedback prompt: `src/components/feedback-prompt.tsx`
- Sidebar with tabs: `src/components/chat-sidebar.tsx`
- API route: `src/app/api/feedback/route.ts`
- Convex mutation: `convex/feedback.ts`

## Related Docs

- Navigation & sidebar: `llm/context/NAVIGATION.md`
- Rate limiting: `llm/implementation/RATE_LIMIT_IMPLEMENTATION.md`
