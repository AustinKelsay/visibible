# Watercolor reference edge-check calibration — 20 October 2026

The revised style-reference checker rejects the retained paper-margin examples in every repeat and accepts the full-frame Icon control. This is a narrow calibration of the existing Claude Haiku 5.5 vision checker, **not a successful rendering correction or release approval**. Public generic admission remains disabled and [#183](https://github.com/AustinKelsay/visibible/issues/183) remains open.

The [production evidence](../2026-10-20-engine-production/README.md) records repeated Watercolor margins in Bible and Holmes scenes. Inspection of the original style references found the same defect in the checker-accepted Bible and Holmes examples. Their original provider answers and successful preparation records remain unchanged in that evidence and the retained preparation files. The [attention proof](attention-proof.json) records two owner attention items against the exact current reference fingerprints. It does not remove, invalidate, unpin or replace those images.

## Check and retained inputs

The [checker question](../../../src/lib/engine/references.ts) now explicitly inspects the entire perimeter and all four corners. Fading or irregular paper margins fail even when most of an image is painted; pale sky/clouds inside a continuous scene are not alone margins. Retry reasons should contain observed faults, avoiding feedback such as asking a generator to fix “no people or text”. Reference-generation templates, the checker model/schema, reference-selection priority and the scene rendering prompt are unchanged. The check's exact text/hash is saved in both manifests. `GENERIC_PROMPT_VERSION` stays `2026-10-20-generic-v2` because that scene prompt did not change.

The [initial plan](plan.json) reserved at most $0.10 for 15 vision checks of five existing images, three repeats each. No image-generation call was made. The agent labelled the images by visual inspection; those labels are not human release acceptance.

| Retained fixture | Original checker | Revised check, three repeats |
| --- | --- | --- |
| [Bible Watercolor attempt 1](fixtures/bible-watercolor-1.jpg) | Fail | Fail, fail, fail |
| [Bible Watercolor attempt 2](fixtures/bible-watercolor-2.jpg) | Fail | Fail, fail, fail |
| [Bible Watercolor attempt 3](fixtures/bible-watercolor-3.jpg) | **Pass despite visible paper margins** | Fail, fail, fail |
| [Holmes accepted Watercolor reference](fixtures/holmes-watercolor.png) | **Pass despite visible paper margins** | Fail, fail, fail |
| [Bible accepted Icon control](fixtures/bible-icon-control.jpg) | Pass | Pass, pass, pass |

The original Bible answers/image hashes are in [reference attempts](../2026-10-20-engine-production/bible-reference-attempts.ndjson.gz). Holmes's accepted reference fingerprint matches the [original preparation state](../2026-10-20-engine-production/holmes-references.json) and the newly inspected [production reference](attention-proof.json). Full-resolution fixture bytes and their SHA-256 hashes are checked here; none was cropped, retouched or regenerated for this calibration.

The initial round completed nine checks, then one Holmes request was rejected with HTTP 400: the historical download had a `.png` filename but JPEG bytes. That failed attempt and raw error remain in [attempts.ndjson](attempts.ndjson). The [follow-up plan](followup-plan.json) corrected MIME detection and ran only the remaining six checks, preserving the paid prefix. [Follow-up attempts](followup-attempts.ndjson) retain those exact answers. Provider response bodies retain IDs, usage and content; the account `user_id` field is omitted. The original failed MIME request can be reconstructed from its saved error, original plan and image bytes; the current script correctly detects JPEG bytes.

All **15 completed checks matched the agent labels**: 12 paper-margin failures and three full-frame passes. There was one rejected request, separate from completions. This five-image calibration does not establish general checker accuracy. It has no separate pale-cloud/no-margin control, and it does not prove future rendered scenes will fill the frame. The checker-accepted production references still require correction/remake; an attention item or changed checker question does not change their eligibility.

## Spend and offline verification

Measured calibration usage is **$0.00391200**, charged to the separately authorized **$16 all-evaluation bucket**. The MIME error has no returned usage; retain a conservative **$0.005 reserve** rather than silently count it as a free call. Including prior evaluation usage of $6.46915215, the new measured total is **$6.47306415**, total evaluation uncertainty is **$0.045**, and **$9.48193585** remains after uncertainty. The $43 preparation and $1 smoke buckets are unchanged. [The summary](summary.json) and [follow-up report](followup-report.json) retain the arithmetic. The account's [balance query](provider-balance.json) remains below the $1 image-output floor and may lag individual usage settlement.

Run these without a key or network:

```sh
npx tsx llm/releases/2026-10-20-watercolor-edge-check/run.mts
npx tsx llm/releases/2026-10-20-watercolor-edge-check/run.mts --plan followup-plan.json
node llm/releases/2026-10-20-watercolor-edge-check/verify.mjs
```

The runner defaults to a fixture/hash/budget dry run. `--live` requires `OPENROUTER_API_KEY`, and refuses to overwrite either existing paid trace. Reproducing paid checks requires a new explicitly bounded plan and separate output location; do not remove the traces to force a rerun. [Artifact hashes](sha256.json) cover this directory except the hash file itself. Verification checks hashes, both plans and question snapshots, raw answers/usage, all 15 unique completions, the retained error, the trial manifest and aggregate budget arithmetic.

## Rendering correction prepared for the next funded run

The [underwash trial](../../../evals/images/style-trials/watercolor-full-frame.json) is separate from `styles/watercolor.json`. An earlier field-study wording removal already failed; it is not being silently retried as a new success. This trial instead specifies a continuous coloured underwash beneath the entire scene, painted peripheral space, and a crop through scenery. It retains transparent washes and expressive ink. The registered style, approved briefs, existing packets and saved images are unchanged.

The [nine-image manifest](style-trial-manifest.json) covers Genesis 1:3, Job 38:4 and the Holmes sitting room, three repeats each: $0.324 estimated, **$0.35 subcap inside the remaining evaluation allowance**, not additional authorization. It is unexecuted and records no images. Reproduce its dry run:

```sh
npm run evals:images -- --dry-run \
  --run release-2026-10-20-watercolor-underwash \
  --arms generic:watercolor \
  --style-file evals/images/style-trials/watercolor-full-frame.json \
  --cases genesis-1-3-light,job-38-4-foundations,holmes-scandal-the-woman \
  --repeats 3 --budget 0.35
```

After account funding, refresh readiness/current reference versions, then run the bounded targeted images. The trial's content version makes the unpinned old Watercolor style reference stale, so it is omitted; confirm that in every actual packet. Do not pin the known faulty reference to bypass staleness. Do not infer from this no-reference trial whether a corrected reference would improve results. A later reference remake must use the revised check and receive visual inspection.

Only promote a correction after inspecting the affected outputs. Keep both failures and original source inputs, use a new run for changed rendering inputs, and retain all fixed Bible/continuity/Holmes cases for the release comparison. The nine-image trial does not replace the matrix or grant a release pass. Finishing a changed Watercolor matrix can require rerendering earlier successes; re-cost it together with the remaining Classical/Icon samples inside the existing $16 cap. Stop and retain the baseline if the budget cannot complete it. Missing actual-app cold/prepared latency samples, human acceptance, the public switch and first-24-hour outcome remain outstanding.
