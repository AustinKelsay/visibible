# Image engine release and rollback runbook

How a change to the image engine ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)), a new art style or a new work reaches readers, and how to take it back. Earlier engines are under [History](#history).

## Rehearsal

`npm run rehearse` runs the compatibility matrix below against controlled providers and writes `evals/rehearsal/latest.json` (ignored by git; attach it to the release PR). Every row names the test that proves it; a row without a passing test is not rehearsed. Rerun after any fix until the file reports no failures.

| Contract | Proof |
| --- | --- |
| Existing verse URLs and images stay served; historical images read as Classical; style filters, counts, markers, pages | `tests/convex/art-style-library.test.ts` |
| Generic images save WEB text with `translationId: "web"`; the reader's translation stays request context; provenance saved | `tests/convex/generic-provenance.test.ts`, `credit-flow.test.ts` › "renders a moment with references and WEB text…" |
| Public API with no filter returns all styles; unknown style is 400; Nostr quotes the saved text across styles | `src/app/api/__tests__/public-images/route.test.ts`, `art-style-library.test.ts` › Nostr |
| Reports resolve the exact image; dispositions; edits never close a report | `tests/convex/image-reports.test.ts`, `src/lib/__tests__/corrections.test.ts` |
| Full reread activates; incomplete or invalid reread keeps the old analysis; brief change makes the work not ready; a whole-Bible analysis (31,102 moments, run at full scale only by `rehearse`) activates | `tests/convex/analysis.test.ts`, `tests/convex/rehearsal.test.ts` › readiness matrix |
| Public (the default), owner-only and disabled admission; readiness gates; optional references and attention never gate | `src/lib/__tests__/engine-admission.test.ts`, `credit-flow.test.ts` › engine admission, `rehearsal.test.ts` |
| Owner mode admits only the owner; rollback replays accepted generic work, refuses new work in every style, keeps images; accepted legacy requests replay | `credit-flow.test.ts` › "rehearsal: owner mode admits only the owner…", › engine admission |
| Duplicate and concurrent delivery, uncertain provider outcomes, interrupted save, thrown settlement: one paid attempt, one settlement, replay | `credit-flow.test.ts` › generic engine generation, `tests/convex/generation-intent.test.ts` |
| Bulk jobs bound to style and engine; interrupted items reconciled; rollback pauses generic jobs; release counts | `tests/convex/bulk-binding.test.ts` |
| One image call built from the text: the whole section cast's canon, no text-model call, a cast member without canon refused before any reservation or call; each work's exact prompts pinned | `src/lib/__tests__/engine-lean.test.ts`, `src/lib/__tests__/lean-engine-golden.test.ts`, `credit-flow.test.ts` › "makes no text-model call…", › "refuses before any charge when a section cast member's canon is missing…" |
| Evaluation spend is reserved at catalog ceilings, stops on missing usage and never logs the key | `src/lib/__tests__/image-evals-ledger.test.ts` |

Not rehearsed by tests: browser screenshots of the reader's style controls, the feedback form and bulk pause states. Click through them on the preview deployment and attach captures to the release PR.

## Engine modes

`ENABLE_IMAGE_GENERATION=true` is the master switch: without it no image is made. `GENERIC_ENGINE_MODE` then decides who is admitted:

- **public** (the default when unset): every new request in a released style (`PUBLIC_GENERIC_STYLE_IDS`: Classical, Watercolor, Fresco and Storybook) for a ready work, including bulk items. Icon stays owner-only.
- **owner**: only owner sessions, in any style. Use it to keep readers out while a work or style is checked in production.
- **disabled**: nothing new is admitted; accepted requests still replay. Any other value also reads as disabled, so a misspelling is noticed rather than opening the engine.

Production sets `public` explicitly. A work is ready only when `getWorkStatus` reports its registered work and brief versions match the deployed files and a complete active analysis exists; failed references and open attention never gate.

## Releasing a work or a style

1. Prepare the work against the production deployment: `npm run works:read -- <work-id>`. It writes `brief.draft.json` for the owner's one-file brief PR at `works/<work-id>/brief.json` ([work preparation](../context/WORK-PREPARATION.md)); merging that PR approves the brief. Deploy it before activating canon, because readiness compares the registered brief version with the deployed file. Then run `npm run works:canon -- <work-id> --activate` and `npm run works:references -- <work-id> --budget <usd>`.
2. Measure it with `npm run evals:lean` ([image evaluation](IMAGE_EVAL_AND_RELEASE.md)) before readers see it.
3. **Owner check in production.** Owner sessions reach every style, Icon included, in public mode too; set `GENERIC_ENGINE_MODE=owner` only when readers must be kept out entirely (for example while a work's first analysis is checked). To exercise real guest reservation and settlement, use one fresh, funded non-admin browser session under the release owner's control; set server-only `GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256` to the SHA-256 hex digest of that session's SID. Only that exact existing, valid session receives additional owner-mode admission. It keeps its normal tier, credits, spend limits, reservations and settlement; the setting grants no admin billing or other admin access. All other readers see every style as temporarily unavailable. The setting has no effect when admission is disabled. Do not log or commit the SID or its signed cookie; remove the digest when the check ends.
   The reader automatically generates an empty selected style when the session can cover its estimate. Install and verify the recorder/guard before entering such a reader page, or make explicit requests from a page without generation (such as About). Retain and account for any unrecorded automatic request; exclude it from full-request timing rather than inventing latency or silently replacing the sample.

   Make actual image requests through the app in that controlled session, across every released style, within the separate smoke budget. Record wall-clock request latency, sample sizes, quotes versus actual settlement, saved WEB/provenance, and the reservation/debit records. Replaying a completed request must not pay again. Record any bound bulk-job checks as well. The suite run (`npm run evals:lean`, steps in [Image eval and release requirements](IMAGE_EVAL_AND_RELEASE.md#the-regression-suite)) provides separate visual/provider evidence: it does not exercise HTTP admission, guest billing, saving or settlement, and its timings do not prove the full-request latency gates. Admin audit-only requests also do not prove guest reservation. Disclose any target misses; do not infer human acceptance from a report flag.
4. Release: if step 3 set `GENERIC_ENGINE_MODE=owner`, set it back to `public` and redeploy (an explicit `owner` setting overrides the default), and remove the check session's digest. A new style joins `PUBLIC_GENERIC_STYLE_IDS` and the brief's `styleIds` (below); a new work is served once its readiness passes and the reader links to it.

## Changing a work's approved styles

A brief change that only adds or removes art styles (`styleIds`) needs no reread: nothing in the analysis reads the style list. Deploy the new brief, then immediately run `npm run works:amend-brief-styles -- <work-id> --previous <git ref of the registered brief>` with the production `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_SERVER_SECRET` (`--dry-run` first prints both versions and the work status). `analysis.amendBriefStyles` checks that the previous file hashes to the registered and active versions and that only `styleIds` differ, then moves both versions together. Between the deploy and the amendment, generic requests answer a retryable "preparing" 503 before any reservation. A new style also needs its file in `styles/`, an entry in `SHARED_STYLES`, its id in the dependency-free `KNOWN_STYLE_IDS` that `analysis.amendBriefStyles` checks (so the Convex deploy must precede the amendment) and, to reach readers, `PUBLIC_GENERIC_STYLE_IDS`. Retained suite runs name the previous brief version; a paired run against them needs a fresh text base after the change.

## Rollback

- **Code:** promote the previous production deployment (Vercel instant rollback). Accepted requests keep their engine, commitments and billing and replay their saved results. A deployment from before 10 November 2026 no longer runs against today's Convex functions ([History](#history)).
- **Stop new images:** set `GENERIC_ENGINE_MODE=disabled` (or `owner`) and redeploy. In-flight requests finish or are reconciled from their request records; bulk jobs pause with an engine-unavailable reason and resume afterwards.

## Budgets and estimates

Projections, not authorization; each command takes its own `--budget`. Before a paid run, check the OpenRouter key's own limit as well as the account balance (`GET https://openrouter.ai/api/v1/key`, `limit_remaining`). The production key is shared with readers, and image calls need at least $1 left on the key; on 30 October a $50 key limit stopped an evaluation and production images together.

| Step | Basis | Estimate |
| --- | --- | --- |
| Reading pass (whole Bible) | prior runs | about $0.50 |
| Canon drafting | prior runs | about $1 |
| Reference sheets and style references | about $0.045 per attempt, recurring cast | about $45 |
| Release evaluation | the suite's 206 shown images at about $0.043 on Nano Banana 2.1 | about $9 (`npm run evals:lean -- plan --run <name> --from <snapshot run> --model <id>` prints the estimate and cap) |
| Owner production check | a few dozen images | under $2 |

## Release evidence template

- Rehearsal: `evals/rehearsal/latest.json` summary (files, tests, failures) and the commit it ran against.
- Readiness: `getWorkStatus` output for the work on the production deployment, with the deployed work and brief versions.
- Evaluation: the `evals:lean` report, scores and pairing for the release run, against the previous release's; every fail and accepted limitation listed with notes.
- Measured: mean and p90 latency, mean quoted and actual credits, provider spend.
- Rollback (the deployment to promote, or the env change), the human owner for the first 24 hours, and the known limitations carried into release.

## History

- **Legacy engine retired (28 October 2026).** The cutoff, its inventory and the code removal are recorded in [2026-10-28-legacy-retirement](../releases/2026-10-28-legacy-retirement/README.md) and [2026-10-29-legacy-code-removal](../releases/2026-10-29-legacy-code-removal/README.md). `legacy` remains only on historical request records and bulk bindings, so accepted legacy requests still replay; the retirement inventory command and the `bindLegacyJobs` backfill were removed once nothing legacy was left (10 November 2026).
- **Full engine's preparation removed (9–10 November 2026).** Section looks, scene plans, plan review and the image check were replaced by one image call ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)); see [2026-11-09-lean-switch](../releases/2026-11-09-lean-switch/deployment.json) and [2026-11-10-remove-preparation](../releases/2026-11-10-remove-preparation/README.md).
