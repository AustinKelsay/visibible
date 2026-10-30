# No-review image experiment

This run renders the exact plans from [the no-review text candidate](../2026-10-30-no-plan-review-text/README.md), which passes the existing text holdout gate. It keeps source snapshots, canon, reference sheets, rendering settings, styles and the finished-image checks fixed. The run covers 206 images across the Bible, Holmes and Alice. Independent per-image and consistency scoring are required before any release decision.

The operator set a $12 hard cap under the owner’s full-send testing authorization. The runner must retain its $5 reader reserve and refuse unpriced or unaccounted calls. This grants no production data writes or provider spending-limit changes. The estimated cost is $8.24.

## Generation completed

All 206 images were produced using the saved plans, with zero text calls, 243 image calls (including retries), and 486 finished-image check calls. Measured cost was $8.5010879, with zero uncertain usage and zero production mutations. Blind scoring and adjudication are complete; this candidate is rejected by the existing release gates. The runtime source stayed frozen for the entire paid run at the commit recorded in `frozen-commit.json`; subsequent cleanup removes the unused review module and updates tests without changing its retained provider requests.

## Rejected result

Two independent scorers covered all 206 images. The 48 disputed items were adjudicated without the key; [the adjudication record](scoring/ADJUDICATION.md) describes the model judgments and six parent visual spot-checks. No disputes remain. Acceptability is 113/206 overall and 20/49 on holdout. The [image gate](report.json) fails: holdout lettering is 14/49 versus 9/49, scene mismatch 8/49 versus 2/49, and non-acceptable images 29/49 versus 21/49.

The [Bible consistency gate](consistency/bible-web/report.json) also fails. Both scorers agree on every pair: character identity is 93/93 decided, with nine unclear pairs, but settings agree in 21/27 versus the baseline's 24/27. The 11.1-point drop exceeds the unchanged ten-point regression allowance. Holmes has 38/50 character and 2/6 setting agreement; Alice has 22/24 character and 8/12 setting agreement. Their setting samples, and Alice's character sample, remain below the existing minimum sizes. These are model judgments on one run, not broad quality claims.

Do not release the combined removal. The final independent ablation will retain the baseline's generated guides and remove only semantic review, cast repair and feedback re-planning. It changes no source, style, canon, reference, scoring question or gate, and is not a prompt repair tuned to these cases. If that arm also fails, retain the existing production pipeline and limit delivery to safe cleanup and these findings.

Mechanical validation of the rejected implementation: 973 tests passed with one skipped; coverage, type checking, lint and production build passed, and the dependency audit found zero vulnerabilities. CodeRabbit reported one diagnostic-budget finding. Reserving the permitted malformed-reply retry fixes it; a focused regression failed before the fix and all 11 diagnostic-runner tests pass afterward. None of these checks overrides the quality failures.
