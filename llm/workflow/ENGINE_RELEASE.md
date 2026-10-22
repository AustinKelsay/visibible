# Generic engine release, rollback and retirement runbook

How the generic image engine ([spec #165](https://github.com/AustinKelsay/visibible/issues/165)) goes from disabled to public, how it comes back, and what a later retirement of the legacy engine has to account for. Switching engines is a configuration change on the existing request executor; it is not the separate durable-executor migration.

## Rehearsal

`npm run rehearse` runs the compatibility matrix below against controlled providers and writes `evals/rehearsal/latest.json` (ignored by git; attach it to the release PR). Every row names the test that proves it; a row without a passing test is not rehearsed. Rerun after any fix until the file reports no failures.

| Contract | Proof |
| --- | --- |
| Existing verse URLs and images stay served; historical images read as Classical; style filters, counts, markers, pages | `tests/convex/art-style-library.test.ts` |
| Generic images save WEB text with `translationId: "web"`; the reader's translation stays request context; provenance saved | `tests/convex/generic-provenance.test.ts`, `credit-flow.test.ts` › "renders a cold moment…" |
| Public API with no filter returns all styles; unknown style is 400; Nostr quotes the saved text across styles | `src/app/api/__tests__/public-images/route.test.ts`, `art-style-library.test.ts` › Nostr |
| Reports resolve the exact image; dispositions; edits never close a report | `tests/convex/image-reports.test.ts`, `src/lib/__tests__/corrections.test.ts` |
| Full reread activates; incomplete or invalid reread keeps the old analysis; brief change makes the work not ready | `tests/convex/analysis.test.ts`, `tests/convex/rehearsal.test.ts` › readiness matrix |
| Disabled, owner-only and public admission; readiness gates; optional references and attention never gate | `src/lib/__tests__/engine-admission.test.ts`, `credit-flow.test.ts` › engine admission, `rehearsal.test.ts` |
| Legacy and generic accepted side by side; rollback replays accepted generic work, refuses new Watercolor/Icon, admits Classical on legacy, keeps images | `credit-flow.test.ts` › "rehearsal: legacy and generic…" |
| Duplicate and concurrent delivery, uncertain provider outcomes, interrupted save, thrown settlement: one paid attempt, one settlement, replay | `credit-flow.test.ts` › generic engine generation, `tests/convex/generation-intent.test.ts` |
| Bulk jobs bound to style and engine; interrupted items reconciled; rollback pauses generic jobs; legacy backfill; release counts | `tests/convex/bulk-binding.test.ts` |
| Looks and plans made once, shared, invalidated by their inputs; missing cast, unknown selections or changed canon fail before guest reservation/image calls | `src/lib/__tests__/preparation.test.ts`, `src/lib/__tests__/moment-cast-contract.test.ts`, `credit-flow.test.ts` › missing-cast reply |
| Retirement dry run classifies accepted obligations and cancellation candidates without touching data | `tests/convex/rehearsal.test.ts` › retirement inventory |
| Evaluation harness renders through the engine's own assembly | `src/lib/__tests__/image-evals-generic.test.ts` |

Not rehearsed by tests: browser screenshots of the reader's style controls, the feedback form and bulk pause states. Click through them on the preview deployment and attach captures to the release PR.

## Before any switch

1. Merge the engine PRs in order and deploy with `GENERIC_ENGINE_MODE` unset (disabled). Nothing changes for readers except that Watercolor and Icon answer a retryable 503.
2. Commit the approved Bible brief at `works/bible-web/brief.json` and deploy it; the route reads `works/bible-web/work.json`, the brief and `styles/*.json` at request time.
3. Prepare the Bible against the production deployment: `npm run works:read -- bible-web`, `npm run works:canon -- bible-web --activate`, then `npm run works:references -- bible-web --budget <usd>`. Readiness (`getWorkStatus`) requires the registered work and brief versions to match the deployed files and a complete, structurally valid active analysis; failed references and open attention do not block.
4. Run `npx convex run bulkGenerations:bindLegacyJobs '{"serverSecret":"…"}'` once so every existing bulk job is bound to legacy and Classical (idempotent).
5. Run `npm run engine:retirement-inventory -- --env-file .env.convex.prod` and keep the output: it is the baseline of what legacy owes. The command queries only the deployment named in that file and prints its host; without `--env-file` it uses the shell or `.env.local`, which is the development deployment.

## Preview → owner production → public

1. **Preview:** set `GENERIC_ENGINE_MODE=public` on a preview deployment whose Convex deployment has the prepared analysis; generate in all three styles; confirm `/api/image-models` reports every style available and the saved images carry `engine: "generic"`, `translationId: "web"` and provenance.
2. **Owner production check:** set `GENERIC_ENGINE_MODE=owner` in production. Admin sessions reach the generic engine. To exercise real guest reservation and settlement, use one fresh, funded non-admin browser session under the release owner's control; set server-only `GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256` to the SHA-256 hex digest of that session's SID. Only that exact existing, valid session receives additional owner-mode admission. It keeps its normal tier, credits, spend limits, reservations and settlement; the setting grants no admin billing or other admin access. All other readers stay on legacy for Classical and see the other styles as temporarily unavailable. The setting has no effect when admission is disabled. Do not log or commit the SID or its signed cookie; remove the digest when the check ends.
   The reader automatically generates an empty selected style when the session can cover its estimate. Install and verify the recorder/guard before entering such a reader page, or make explicit requests from a page without generation (such as About). Retain and account for any unrecorded automatic request; exclude it from full-request timing rather than inventing latency or silently replacing the sample.

   Make actual image requests through the app in that controlled session, across all three styles and both cold and already-prepared moments, within the separate smoke budget. Record wall-clock request latency, sample sizes, five-credit Lite quotes versus actual settlement, saved WEB/provenance, and the reservation/debit records. Replaying a completed request must not pay again. Record any bound bulk-job checks as well. The evaluation command (`npm run evals:images -- --run release --arms generic --analysis convex --budget <usd>`) provides separate visual/provider evidence: it does not exercise HTTP admission, guest billing, saving or settlement, and its timings do not prove the full-request latency gates. Admin audit-only requests also do not prove guest reservation. Disclose any target misses; do not infer human acceptance from a report flag.
3. **Public:** set `GENERIC_ENGINE_MODE=public`. Every new request, including bulk items, is admitted on the generic engine; accepted legacy requests finish on legacy. Watch `engine_admission`, `generic_preparation`, `engine_binding_refused`, settlement events and the attention list for the first 24 hours; the named owner answers reports with `works:correct reports`.

## Rollback

Set `GENERIC_ENGINE_MODE=disabled` (or `owner`) and redeploy. Accepted generic requests keep their engine, commitments and billing and replay their saved results; in-flight ones finish or are reconciled by their request records. New Classical requests run on legacy; Watercolor and Icon report unavailable while every saved image and preference stays. Bulk jobs bound to generic pause with `engine_unavailable` before their next item and resume when the engine is admitted again; nothing is charged twice. No data is migrated in either direction.

## Fresh-quote recovery

An item a retirement closes as unstarted (never admitted) is not lost work: the reader creates a new job for those verses, quoted afresh under the engine admitted at that time. An uncertain paid attempt (a request still `generating`) is never closed as unstarted; it is reconciled from its request record first (`reconcileInterrupted` for bulk, replay for single requests).

## Retirement (later ticket)

Legacy execution can be retired only when `npm run engine:retirement-inventory -- --env-file .env.convex.prod` reports no accepted obligations for legacy and nothing unbound. The inventory lists the cancellation candidates (unstarted legacy bulk items) the retirement will close with an explanation to their readers, who may recreate them under a fresh quote. Completed images, metadata, accounting and completed-request replay are kept.

## Budgets and estimates

Projections, not authorization; each command takes its own `--budget`.

| Step | Basis | Estimate |
| --- | --- | --- |
| Reading pass (whole Bible) | prior runs | about $0.50 |
| Canon drafting | prior runs | about $1 |
| Reference sheets and style references | about $0.045 per attempt, recurring cast | about $45 |
| Release evaluation | 33 cases × 3 styles × 3 repeats ≈ 300 images at about $0.035, plus looks and plans at about $0.001 each | about $11 (`npm run evals:images -- --dry-run --arms generic` prints the exact manifest) |
| Owner production check | a few dozen images | under $2 |

## Release evidence template

- Rehearsal: `evals/rehearsal/latest.json` summary (files, tests, failures) and the commit it ran against.
- Readiness: `getWorkStatus` output for `bible-web` on the production deployment, with the deployed work and brief versions.
- Evaluation: `report.json`, scored `scores.json` and the contact sheet for the release run; the comparison sheet against the legacy baseline run; every fail and accepted limitation listed with notes.
- Measured: mean and p90 latency for prepared and cold requests, mean quoted and actual credits, variance, provider and preparation spend.
- Retirement inventory before and after the switch.
- Rollback configuration (the exact env change), the human owner for the first 24 hours, and the known limitations carried into release.
