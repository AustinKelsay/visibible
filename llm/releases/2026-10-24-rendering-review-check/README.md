# Combined rendering review comparison — awaiting funding

Issue #183 remains on hold. This is a frozen text-only proposal for candidate `599fcca` against actual pre-change `a35f102`. Both arms use source-first planner v9 and the unchanged shared-look generator. The candidate supplies the exact look and complete selected canon to review v6, stops reported look conflicts/canon gaps, and permits one re-plan for other plan faults. The baseline uses actual review v5 and preparation modules from git; import paths alone change. Shared dependencies must match. Renderer v7 ownership wording is pinned, but no image or final style-prompt behavior is measured.

The earlier comparison stored only 7/30 acceptable candidate complete packets. Shared looks caused many contradictions. This candidate can refuse those looks but cannot repair them, so availability may fail again. This one-shot check measures containment, false alarms and complete preparation availability. A control pass cannot replace the pipeline gate. It funds no iterative tuning or look-repair loop.

## Fixed cases and gates

`plan.json` freezes seeds, thresholds, budgets and stop rules. `sample-set.json` preserves seven unchanged hard cases and 23 fresh ordinary verses, uniformly drawn outside the union of the earlier 100 and 23 fresh cases. There is no quality/cast/genre filtering or replacement. The 23 first draws were retained using 115 read-only queries and no paid calls or mutations. Fixtures are collected through read-only production queries once; all subsequent source/canon use is local. Every fresh mapping must equal the drawn verse or collection aborts. Separate fixture keys preserve retained versus fresh record versions.

`controls.mts` declares nine adverse controls (look place/time, unselected effect, canon robe, missing canon, unsupported Aaron/Moses, object state and forbidden look embodiment) and seven clean controls (ordinary light, section ranges, selected effects, situational pose, wardrobe inventory, incidental roles and compatible object state). These are explicitly constructed isolates of retained failure classes, with their source/basis visible; they are not unchanged historical replies or new model evidence. Both versions receive the same control input, although v5 ignores the extra rendering context by design. Required candidate kinds/IDs and the offending field to quote are frozen; reporting a different look field cannot satisfy the intended control. Extra negative reports require exact-problem, source-based disposition; clean controls require zero reports. Baseline controls are descriptive.

All **92 operations** must complete: 32 direct controls first, then 30 cold pairs. Seeded order alternates the first arm, 15 each for cold pairs and eight each for controls. Each arm has identical source/canon and a separate empty memory store, independently generating a look. This measures a full preparation bundle; independent look randomness prevents isolated reviewer causality claims. Every first response, refusal, malformed retry, re-plan and uncertainty remains. There is no semantic early stop, replacement or paid restart; technical/accounting stop rules still apply.

The candidate must pass all 16 controls with no clean false alarm, store **zero flawed or uncertain packets**, have no look contradiction, achieve **22/23 acceptable fresh and 7/7 retained**, and exceed baseline acceptable totals overall and on retained cases without increasing total refusals. A reported bad look is a refusal, never an accepted scene. Missing pairs stay incomplete. This small diagnostic reports paired tables, exact discordance tests and Wilson intervals; a pass only permits proposing broader validation. Images, current full-request latency/accounting and human acceptance remain before activation.

## Funding and guards

Current evaluation authorization is **$17.20**, measured spend **$17.05523880**, retained uncertainty **$0.045**, remaining **$0.09976120**. Proposed separate increase: **$0.30**, raising authorization to **$17.50**, with a **$0.30 one-shot operation cap**. This file grants nothing. Preparation/smoke allowances stay separate. The previous grant funded its completed comparison only.

`dry-run.json` captures exact first requests, source/fixture/protocol/lockfile hashes and cost scenarios using the [OpenRouter model catalog](https://openrouter.ai/api/v1/models). The first-pass estimate is **$0.148713**; adding one re-plan to every preparation estimates **$0.26221411**. Maximum completion lengths on every first-pass call estimate **$0.371213**, above the operation cap. Candidate review estimates include all section-canon payload characters as padding for a full selection plus room for look/scene prose. Estimates do not guarantee completion within the cap; malformed retries and variable lengths can stop it early. The largest padded per-call estimate is **$0.003194**. The execution guard rechecks each actual request, reserves **$0.005** before each HTTP request and limits the run to **664 calls** (32 controls × 2 attempts + 60 preparations × 10 attempts). The adapter keeps the production [Anthropic-only, no-fallback routing](https://openrouter.ai/docs/guides/routing/provider-selection), reasoning, schema, completion limits and sampling defaults.

`run.mts --execute` refuses before credentials/network while `funding.json` is absent. Only an explicit owner grant allows an exact authorization record with `increaseUsd: 0.30`, `authorizedUsd: 17.50`, `operationCapUsd: 0.30`. Commit it before calls. The runner verifies the pre-call committed manifest, prices and balance, saves one-shot markers before requests, and persists per-call usage/reserves. Provider errors, missing usage, unavailable review, request drift or exhausted headroom stop the run. An interruption cannot resume. Shared balance deltas do not substitute for per-call usage. No production writer, images, deployment or public activation are included.

## Reproduction

```sh
# Already completed once: read-only fixture collection, never print private env contents.
VISIBIBLE_EVAL_ENV_FILE=/private/tmp/visibible-owner-final-environment.private.env \
  npx tsx llm/releases/2026-10-24-rendering-review-check/snapshot.mts

# Entirely offline; capture once, verify after freeze.
npx tsx llm/releases/2026-10-24-rendering-review-check/dry-run.mts capture
npx tsx llm/releases/2026-10-24-rendering-review-check/dry-run.mts verify
npx tsx llm/releases/2026-10-24-rendering-review-check/rehearse.mts
```

The rehearsal uses disposable local clones. Every HTTP call is intercepted and synthetic grants/usage are confined to removed clones. It covers completion, reported look refusal, exhausted cap, unavailable review, missing usage, replay, score validation and restart refusal, and proves unfunded refusal before credentials. `offline-rehearsal.json` is controller evidence, never actual spend, semantic quality or owner authorization. Frozen historical evaluation files are unchanged; their replays belong at their original commits.

After a separate explicit grant and committed preflight only:

```sh
VISIBIBLE_EVAL_ENV_FILE=/private/tmp/visibible-owner-final-environment.private.env \
  npx tsx llm/releases/2026-10-24-rendering-review-check/run.mts --execute
npx tsx llm/releases/2026-10-24-rendering-review-check/audit.mts
npx tsx llm/releases/2026-10-24-rendering-review-check/score.mts packet
```

Read only `blind-packet.json`. Score each opaque ID in `operator-scores.json` with `scorer`, `scoredBeforeUnblinding: true` and `scores` rows containing `id`, `verdict` (`acceptable`, `flawed`, `uncertain`), `reason`, `lookContradiction` and `defects` (exact scene/look `quote` plus `reason`). Complete packets include all five look fields, seven plan fields, source/neighbors, section bounds, section-assigned stage IDs, full available canon and selected IDs. Judge source-supported identities/instant, complete selected cast, fixed canon, permitted no-form effects, compatible look and simultaneous object/pose states. Incidental roles/props/scenery are allowed. Uncertainty counts against acceptance. Preserve first scores and explicit sensitivities for disputed readings.

Commit packet and scores before opening `blind-key.json` or scored audit. One familiar operator with progress knowledge is only procedurally masked, not independent adjudication. Extra negative control reports require `review-disposition.json` rows with `id` (operation ID including arm), exact problem `problemSha256`, `acceptable` and source-based `reason`; positive controls still require no problems. Then `audit.mts finalize` verifies exact offline replay, usage/provenance and paired scores, retaining any failure or incomplete outcome. The release hold remains regardless of this diagnostic's result.
