# Public launch: Classical and Watercolor on the generic engine (28 October 2026)

**Live since 15:38 UTC.** New reader requests in Classical and Watercolor run on the generic engine. Icon stays unavailable to readers and owner-only ([ADR 0006, amendment 3](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)). [Deployment record](deployment.json).

## Authorization and evidence

- The owner chose to launch Classical and Watercolor first ("1"), then approved the launch ("go!") after seeing the contact sheets ([Classical](../2026-10-28-launch-matrix-v2/signoff-classical.jpg), [Watercolor](../2026-10-28-launch-matrix-v2/signoff-watercolor.jpg)).
- Evidence: the [launch matrix rerun](../2026-10-28-launch-matrix-v2/RESULTS.md).
  - Classical 84% and Watercolor 78% acceptable, together 52/64 (81%), against a 75% bar.
  - Across both runs, God was drawn as a figure in 1 of 26 Classical and Watercolor images of scenes that select him.
  - These are model scores with operator adjudication. The owner's sign-off is the human acceptance.
- Release PR #287 (`1308580`) also carried a security patch (#290) for critical Next.js advisories that applied to the previous production build.

## Steps

1. Merged release PR #287. The production build deployed Convex (additive optional fields only), then the app, with `GENERIC_ENGINE_MODE=disabled`.
2. Checked the disabled deployment: Classical available and Watercolor and Icon unavailable, as before; `/api/readiness` ready; `getWorkStatus` ready, generation 1, with matching work and brief versions; pages 200.
3. Set `GENERIC_ENGINE_MODE=public` in production and redeployed.
4. Checked the live deployment: `/api/image-models` reports Classical and Watercolor available and Icon "temporarily unavailable"; readiness ready; no errors in the first minutes of logs.

## Deviations from the runbook

- **No separate preview or owner-mode production stage this time.** The 22 October [owner check](../2026-10-22-owner-request-check/README.md) proved the full request path in production: admission, reservation, settlement, saved WEB text, provenance and replay. The paths added since (plan review, finished-image check and retry, owner spend) are covered by route tests. The owner's first live images take the place of the owner-mode check.
- **No new full-request latency measurement.** The check adds about 5–8 s per image and a retry about 20–25 s ([ADR 0007](../../../docs/adr/0007-check-each-finished-image.md)). The 22 October prepared-request target (p90 at most 10 s) is likely exceeded with the check.
- **The OpenRouter account had $5.02 at the switch**, and it is shared by evaluation and production. That is about 140 images; the owner was advised to top it up.

## Known limitations at launch

- **Icon** is held at 50% acceptable (halo letters, scribbles, gold border bands).
- **Soft white Watercolor edges** are accepted. The check also ignores a hard blank band in Watercolor; none appeared in 52 images.
- **About 1 in 5 Classical or Watercolor images has a fault** in the measured cases, mostly scenes only partly matched or small marks.

## First 24 hours

Owner: Austin Kelsay. Watch:
- Admission and preparation outcomes.
- `generic.scene_check` outcomes and owner check spend (preparation ledger, `kind: "check"`).
- Settlement and refunds, image reports, the OpenRouter balance, and route errors.

Roll back with the two commands in the [deployment record](deployment.json).
