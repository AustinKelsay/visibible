# Documentation index

These guides describe the repository's current behavior. Source links identify the implementation to check when changing a feature; they do not assert that a particular revision is deployed. Keep each behavior in one guide and update it alongside code changes. Git history retains the former implementation walkthroughs.

| When changing | Read |
| --- | --- |
| Scripture fetching, translations, lookup errors | [Bible API](context/BIBLE-API.md) |
| Reader, gallery, menus, keyboard or mobile navigation | [Navigation](context/NAVIGATION.md) |
| Model, translation, ratio or resolution preferences | [Preferences](context/PREFERENCES.md) |
| Image requests, planner cache or progress | [Image generation](context/IMAGE-GENERATION.md) |
| Image prompt construction | [Prompt specification](implementation/IMAGE_PROMPT_SPEC.md) |
| Bulk queues, pause/resume or scope selection | [Bulk generation](context/BULK-GENERATION.md) |
| Saved images, shared history or remote image storage | [Image persistence](context/IMAGE-PERSISTENCE.md) |
| Public image API | [Public API](context/PUBLIC-IMAGE-API.md) |
| Chat streaming or context | [Chat](context/CHAT.md) |
| Sessions, credit estimates, reservations or settlement | [Sessions and credits](context/SESSIONS_AND_CREDITS.md) |
| Lightning invoices, purchases or admin login setup | [Payments](context/PAYMENTS.md) |
| Welcome flow | [Onboarding](context/ONBOARDING.md) |
| Origin, CSRF, IP tracking, rate limits or trust boundaries | [Security](context/SECURITY.md) |
| Feedback collection | [Feedback](context/FEEDBACK.md) |
| Client events or funnel interpretation | [Analytics](context/ANALYTICS.md) |
| Health, readiness, metrics or operational logs | [Observability](context/OBSERVABILITY.md) |
| Scheduled Nostr posts | [Nostr](context/NOSTR.md) |
| Styling and layout conventions | [Theme](context/THEME.md) |

## Operations

- [Convex setup](../convex/README.md)
- [Vercel deployment](workflow/VERCEL_WORKFLOWS.md)
- [Proxy trust](workflow/PROXY_CONFIGURATION.md)
- [Chat eval and release requirements](workflow/CHAT_EVAL_AND_RELEASE.md)

Exact dependencies and commands: [package.json](../package.json). Environment templates: [.env.example](../.env.example), [.env.convex.dev.example](../.env.convex.dev.example), [.env.convex.prod.example](../.env.convex.prod.example), [.env.vercel.preview.example](../.env.vercel.preview.example), [.env.vercel.prod.example](../.env.vercel.prod.example). Tables and scheduled jobs: [schema](../convex/schema.ts), [crons](../convex/crons.ts).

## Research data

[Market research query ideas](market-research/visibible-market-research-search-terms.md) is a brainstorming dataset used by its adjacent JSON generator, not current product requirements or validated demand.
