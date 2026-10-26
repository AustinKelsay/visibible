# Exact-citation validation — awaiting separate authorization

Issue #183 remains on hold. This is a distinct text-only proposal comparing actual review v6 at `599fcca70c1ff49536ab3dc2b4088dcf2dfbd7ee` with citation-fix v7 at `dbcdab6cfac8ad4ffd5aee4b789f54c7c7cdc2a7`. Both use identical semantic prompts, schemas, source-first planner v9, shared-look generation, model settings and renderer v7 wording. Only review citation acceptance and its version marker differ. Actual immutable preparation/review modules are loaded from git; baseline imports alone are rewritten. Shared dependencies must match.

The [preceding attempt](../2026-10-24-rendering-review-check/RESULTS.md) ended incomplete at 3/92 operations after two correct night-versus-midday reports copied exact JSON property syntax that v6 rejected. Four calls cost $0.00148710. No cold preparation or clean control ran. That attempt and its funding file remain immutable, and cannot restart. The [offline v7 fix](../2026-10-25-look-citations/README.md) accepts exact supported JSON citations without changing semantic prompts. It provides no paid quality or availability result.

## Fixed cases, outcomes and gates

`plan.json` reuses the exact **seven retained and 23 fresh fixtures** in `../2026-10-24-rendering-review-check/sample-set.json`. Those cold fixtures remain unexecuted. No draw, filtering, replacement or production query is needed. The 23 remain outside the earlier 123. The original source/canon bytes, separate record versions, pair order and masking seeds are retained and hashed. Each arm starts in a separate cold memory store with the same input snapshot. Independently generated looks and one draw per arm prevent isolated semantic-causality claims.

The original 16 constructed control inputs and required kinds/IDs/fields are imported unchanged: nine adverse and seven clean cases, in both arms. The new gate accepts exact v7 JSON citations only when supported by the intended offending field; another field cannot satisfy the control. Extra negative reports need exact-problem, source-based disposition. Clean controls require zero reports. Baseline controls are descriptive. These constructed isolates are not historical provider replies or independent new failure discovery.

All **92 operations** must complete: 32 controls first, then 30 cold pairs, with the frozen alternating arm order. First replies, refusals, malformed retries, one permitted plan repair and uncertainty are retained. A review still unavailable after its two bounded attempts fails that control or refuses that preparation, and **ends only that operation**. Unrelated fixed operations continue while global guards permit. This deliberately replaces the prior runner's global unavailable-review stop. It never permits an unchecked plan to be stored. Provider errors, missing/uncertain usage, request/source drift, cap/headroom or interruption remain global stops; there is no paid restart, automatic resume or tuning loop.

Candidate gates are **all 16 controls passing, zero clean false alarms, zero flawed/uncertain stored packets or look contradictions, at least 22/23 acceptable fresh and 7/7 retained**. It must have at least as many acceptable packets overall and on retained cases as baseline, with no more total refusals. **Ties now qualify**, replacing the preceding protocol's strict-superiority requirement before this run: identical semantic prompts make strict superiority inappropriate for a technical citation fix. Absolute quality and availability thresholds are unchanged. Refusals are not repairs; missing pairs remain incomplete. Report paired acceptable tables, exact discordance tests, 95% Wilson intervals and score sensitivities, with no population-reliability claim. A pass supports proposing further validation only.

Shared-look generation is unchanged and previously caused many contradictions/refusals. The candidate can refuse an incompatible look but cannot repair it, so this gate may fail again. Semantic accuracy, look repair, complete-request latency/accounting, images, human acceptance and activation remain outstanding.

## Authorization, costs and guards

Evaluation authorization is **$17.50**, measured spend **$17.05672590**, retained uncertainty **$0.045**, remaining **$0.39827410**. This proposal requests **one distinct $0.30 capped operation within that existing allowance, with a $0 increase**. The prior grant covered one ended attempt, not this execution. Unused allowance is not a new run authorization. This file grants nothing; no `funding.json` exists here. Preparation and smoke allowances remain separate.

`pricing.json` records a fresh public [OpenRouter model catalog](https://openrouter.ai/api/v1/models) response, requiring no credential or billable completion. `dry-run.json` captures exact first requests, actual immutable baseline hashes, current source/fixture/protocol/dependency hashes and cost scenarios. First-pass estimate: **$0.15988163**; one re-plan for every preparation: **$0.28293259**. Maximum completion lengths on every first-pass call estimate **$0.38238163**, exceeding the cap; the largest padded call estimates **$0.003194**. Estimates pad both arms' review inputs for complete section canon and generated look/scene prose at 2.7 characters/token. They are not total-cost guarantees; malformed retries and stochastic lengths may exhaust the cap before completion.

Each HTTP call reserves **$0.005**, each actual request is rechecked, and **664 calls** is the hard maximum (32 controls × two attempts + 60 preparations × ten attempts). Production Anthropic-only routing, no fallback, schemas, reasoning, completion limits and sampling defaults remain unchanged. The execution adapter refreshes prices and balance, refuses price drift and persists every usage/reserve. A non-JSON HTTP reply retains its status, bounded body excerpt, body hash/length and empty parsed payload; replay matches the production adapter's empty-payload behavior, and missing usage keeps the reserve and stops globally. Shared account balance changes never replace per-call usage.

`run.mts --execute` refuses before credentials/network while funding is absent. Only a new explicit owner authorization permits a committed `funding.json` with `increaseUsd: 0`, `authorizedUsd: 17.50`, `operationCapUsd: 0.30`, and exact authorization/time/proposal reference. The pre-call committed manifest and one-shot artifacts are checked before credentials. No production writer/query, images, application/backend deployment or public activation is included.

## Reproduction and scoring

```sh
# Public pricing capture only; already done once. No paid completion or production query.
npx tsx llm/releases/2026-10-25-citation-validation/pricing.mts

# Entirely offline; capture before freeze, verify afterwards.
npx tsx llm/releases/2026-10-25-citation-validation/dry-run.mts capture
npx tsx llm/releases/2026-10-25-citation-validation/dry-run.mts verify
npx tsx llm/releases/2026-10-25-citation-validation/rehearse.mts
```

The rehearsal uses disposable local clones with every HTTP request intercepted. Synthetic grants/usage exist only in removed clones. Its eight scenarios cover full completion, exact JSON citations, candidate look refusal, exhausted cap, bounded unavailable review continuing to subsequent operations, JSON and non-JSON provider errors, and missing usage. Each verifies offline replay, masked score validation and one-shot restart refusal. It also proves intended-field citation boundaries and unfunded refusal before credentials. The non-JSON regression first failed because one of two provider replies was absent; it now retains the HTTP 502 with $0.005 uncertain and replays the failed operation. `offline-rehearsal.json` is mechanical evidence, not semantic quality, real spend or owner authorization. Free mechanical rehearsals may be repeated after protocol-code changes. Historical frozen artifacts are unchanged and replay only at their original evidence commits.

After separate authorization and committed preflight only:

```sh
VISIBIBLE_EVAL_ENV_FILE=/private/tmp/visibible-owner-final-environment.private.env \
  npx tsx llm/releases/2026-10-25-citation-validation/run.mts --execute
npx tsx llm/releases/2026-10-25-citation-validation/score.mts packet
```

Read only `blind-packet.json`. Score every opaque ID in `operator-scores.json` with `scorer`, `scoredBeforeUnblinding: true`, and rows containing `id`, `verdict` (`acceptable`, `flawed`, `uncertain`), `reason`, `lookContradiction`, and `defects` (exact scene/look `quote` plus `reason`). Complete packets include source/neighbors, section bounds/title, assigned stage IDs, full available canon, selected IDs, five-field look and seven-field plan; arm/review/outcome/version/grounding labels are omitted.

Judge source-supported instant/identities, complete selected cast, fixed canon, permitted no-form effects, compatible look and simultaneous object/pose states. Source-compatible generic roles, props and scenery are allowed. Uncertainty counts against acceptance. Preserve first scores and explicit sensitivity to disputed readings. Commit packet and scores **before opening `blind-key.json` or running scored audit**. One familiar operator with progress knowledge is procedurally masked, not independent adjudication.

Extra negative reports need `review-disposition.json` rows with operation `id`, exact `problemSha256`, `acceptable` and source-based `reason`; clean controls still require zero reports. Finally `audit.mts finalize` verifies every exact replayed request/result, usage/provenance and paired scores and retains failures or incomplete outcomes. Release hold remains regardless of this diagnostic's result.
