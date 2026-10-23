# Documentation index

These guides describe the repository's current behavior. Source links identify the implementation to check when changing a feature; they do not assert that a particular revision is deployed. Keep each behavior in one guide and update it alongside code changes. Git history retains the former implementation walkthroughs.

| When changing | Read |
| --- | --- |
| Scripture fetching, translations, lookup errors | [Bible API](context/BIBLE-API.md) |
| Imported reference works, unit identities, moment ranges or source refreshes | [Work input](context/WORK-INPUT.md) |
| Reader, gallery, menus, keyboard or mobile navigation | [Navigation](context/NAVIGATION.md) |
| Model, translation, ratio or resolution preferences | [Preferences](context/PREFERENCES.md) |
| Image requests, planner cache or progress | [Image generation](context/IMAGE-GENERATION.md) |
| Image prompt construction | [Prompt specification](implementation/IMAGE_PROMPT_SPEC.md) |
| Work briefs, shared art styles, draft scope checks or preparation approval | [Work preparation](context/WORK-PREPARATION.md) |
| Bulk queues, pause/resume or scope selection | [Bulk generation](context/BULK-GENERATION.md) |
| Saved images, shared history or remote image storage | [Image persistence](context/IMAGE-PERSISTENCE.md) |
| A work's analysis: generations, canon versions, looks, plans, references and attention | [Analysis storage](context/ANALYSIS-STORAGE.md) |
| Reading a work into sections, moments, a cast and a draft brief | [Work preparation](context/WORK-PREPARATION.md) |
| Section looks and scene plans made lazily for the generic engine | [Scene preparation](context/SCENE-PREPARATION.md) (source-grounded scene choice, shared looks and lazy plan caching) |
| Correcting a work's analysis after the fact, attention items, wiping a work | [Owner corrections runbook](workflow/OWNER-CORRECTIONS.md) |
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

## Decisions

[Decision records](../docs/adr/) explain hard-to-reverse choices and why they were made. Read the one covering an area before changing it.

## Operations

- [Convex setup](../convex/README.md)
- [Vercel deployment](workflow/VERCEL_WORKFLOWS.md)
- [Proxy trust](workflow/PROXY_CONFIGURATION.md)
- [Chat eval and release requirements](workflow/CHAT_EVAL_AND_RELEASE.md)
- [Image eval and release requirements](workflow/IMAGE_EVAL_AND_RELEASE.md)
- [Generic engine release, rollback and retirement runbook](workflow/ENGINE_RELEASE.md)
- [Current generic-engine release status, remaining allowances and ordered gates](releases/STATUS.md)
- [Initial generic-engine release evaluation and retained failures](releases/2026-10-20-engine-evaluation/README.md)
- [Complete production Bible preparation, partial evaluation and disabled rollback evidence](releases/2026-10-20-engine-production/README.md)
- [Watercolor reference edge-check calibration and unexecuted rendering trial](releases/2026-10-20-watercolor-edge-check/README.md)
- [Funded Classical/Icon evaluation, rejected Watercolor trial and retained release blockers](releases/2026-10-20-engine-funded-evaluation/README.md)
- [Targeted no-form and Elisha corrections, retained visual failures and evaluation accounting](releases/2026-10-21-formless-corrections/README.md)
- [Daniel presence retest: corrected selection, retained rendering failures and remaining allowance](releases/2026-10-21-daniel-presence-retest/README.md)
- [Exact style-reference input audit and omission control](releases/2026-10-21-reference-input-audit/README.md)
- [Controlled 12-image reference comparison: retained failures and $16.50 evaluation accounting](releases/2026-10-21-reference-comparison/README.md)
- [Rejected Daniel canon candidate: exact drafting failure, source-context gap and unchanged image allowance](releases/2026-10-21-daniel-canon-candidate/README.md)
- [Daniel canon with section context: exact source quotes, retained drafting failure and text-only spend](releases/2026-10-22-daniel-context-candidate/README.md)
- [Structured Daniel canon and isolated plan: text improvement, retained canon-restatement failure and separate spend](releases/2026-10-22-daniel-structured-candidate/README.md)
- [Daniel v4 placement evaluation: cleaner subject, retained appearance copying in secondary elements](releases/2026-10-22-daniel-placement-v4/README.md)
- [Daniel v5 effect-input evaluation: no copied canon qualifiers, images held for unlisted attendants](releases/2026-10-22-daniel-effects-v5/README.md)
- [Daniel source/cast correction: an unapplied ministering-assembly entry and atomic owner repair](releases/2026-10-22-daniel-cast-correction/README.md)
- [Applied Daniel cast repair: disabled deployment, ordinary regeneration and retained section-look failure](releases/2026-10-22-daniel-cast-repair/README.md)
- [Fresh no-form look and Daniel plans: improved wording, held cast selection and separate accounting](releases/2026-10-22-formless-look-evaluation/README.md)
- [Selected-cast text check: retained presence failure, stopped sequence and 146-test compatibility rehearsal](releases/2026-10-22-moment-cast-evaluation/README.md)
- [Actual production request timings, guest billing, rollback replay and retained visual failures](releases/2026-10-22-owner-request-check/README.md)
- [Applied Luke cast repair, first v2 Luke/Daniel text outcomes and retained release holds](releases/2026-10-22-luke-cast-repair/README.md)

Exact dependencies and commands: [package.json](../package.json). Environment templates: [.env.example](../.env.example), [.env.convex.dev.example](../.env.convex.dev.example), [.env.convex.prod.example](../.env.convex.prod.example), [.env.vercel.preview.example](../.env.vercel.preview.example), [.env.vercel.prod.example](../.env.vercel.prod.example). Tables and scheduled jobs: [schema](../convex/schema.ts), [crons](../convex/crons.ts).

## Research data

[Market research query ideas](market-research/visibible-market-research-search-terms.md) is a brainstorming dataset used by its adjacent JSON generator, not current product requirements or validated demand.

[Scene planner free models](research/2026-10-14-scene-planner-free-models.md) records why the planner uses its current model and how to re-run the comparison when that model disappears.

[Image models](research/2026-10-14-image-models.md) records why Gemini 3.1 Flash Lite Image is the default image model, what the other candidates measured, and how to re-run the comparison.

## Proposed modernization

[Specs and implementation tickets](../docs/modernization/README.md) describe intended changes from the [rebuild assessment](research/2026-09-07-rebuild-assessment.md). They do not replace the current-behavior guides until the corresponding work is implemented.
