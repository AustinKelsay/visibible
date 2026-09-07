# Feedback

[The sidebar form](../../src/components/feedback.tsx) submits to [POST /api/feedback](../../src/app/api/feedback/route.ts). The server validates origin, a 10 KiB body limit, a nonempty message up to 5,000 characters, and the IP-based rate limit. It attributes a session only when session validation succeeds.

[convex/feedback.ts](../../convex/feedback.ts) stores submissions through a server-authenticated mutation. Records can include verse/image context, session ID, user agent and timestamp; review them in the Convex dashboard. Feedback storage contains more identifying context than the client analytics event payload.

[FeedbackPrompt](../../src/components/feedback-prompt.tsx) is a desktop CTA suppressed while the sidebar is open. Its localStorage state (`visibible_feedback_prompt`) controls a random 5–15 visit threshold, a 24-hour cooldown after interaction, and an eight-second auto-dismiss.

The form emits `feedback_submitted` after success; the prompt emits shown/clicked/dismissed interactions. [Analytics](ANALYTICS.md) covers event interpretation. [Navigation](NAVIGATION.md) owns opening the Feedback tab.
