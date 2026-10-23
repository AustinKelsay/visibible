# First live v4 stated-instant plans

**Both cases held; release remains held.** The v4 contract fixed the retained Luke 10:33 pose contradiction, but that reply describes the Samaritan's donkey without selecting its canon entry. Daniel 7:9 regressed from the [v3 reply](../2026-10-23-grounded-plan-check/README.md): narrator Daniel and the next verse's assembly are back in the vision. Luke 10:34 and Daniel 7:10 were not attempted. There were no images, semantic retries or response edits.

Bounded continuation of [#183](https://github.com/AustinKelsay/visibible/issues/183) on reviewed engine [PR #257](https://github.com/AustinKelsay/visibible/pull/257), merged as `3b8de2709a94dcb8c71fe0a748e6e4710f8d3332`, run locally against production analysis generation 1. This is agent preparation within the existing $43 allowance, not human release acceptance or public activation. No canon/section edit, whole-work reading, reference generation, guest grant, frontend deployment or admission change occurred.

## Backend schema deployment

The [deployment record](deployment.json) covers a backend-only `convex deploy` of `3b8de27` to `unique-impala-244`. Its only Convex difference from the morning's `296df42` deploy is the optional `grounding.instant` string. The dry run passed typecheck and schema validation, with no index deletions and no auth, definition or component differences. [Before](before-deploy.json) and [after](after-deploy.json) snapshots agree on sources, status, all 29 scoped records, preparation spend and the public catalog. The production frontend is still disabled deployment `dpl_4FE7JeXKq853nCxsrN2NYZYFdYjj`.

The first after-deploy snapshot hit one Cloudflare 520 from `api.visibible.com`, four minutes after the deploy finished, and wrote nothing. Within two minutes, readiness, both version endpoints and eight timed queries through both Convex URLs succeeded. The 200 most recent production executions (14:05–15:42 UTC) contain no function errors. The cause is unknown; the snapshot was retaken.

## First ordinary v4 outcomes

[Pre-declared criteria](plan.json) were committed before the first call. They add explicit pose consistency for Luke 10:33, and make a seated no-form presence a Daniel blocker, following the v3 [addendum](../2026-10-23-grounded-plan-check/review-daniel-7-9-addendum.json). Each moment ran once after a fresh snapshot and a [dry run](dry-run-luke-10-33.json); each was a plan refresh only.

| Moment | First outcome | Decision |
| --- | --- | --- |
| [Luke 10:33](scene-luke-10-33.json) | Samaritan, wounded traveler and road. Subject, action, composition and the stated instant all have the Samaritan stopped, standing and looking down. `secondaryElements` adds “The Samaritan's donkey stands nearby”, but the mount's entry is not selected. | [Hold](review-luke-10-33.json). Pose fixed; an unselected described figure would reach rendering without its canon. |
| Luke 10:34 | Not attempted. | Conditional on accepting 10:33. |
| [Daniel 7:9](scene-daniel-7-9.json) | Ancient of Days and ministering assembly selected. Scene fields keep an unoccupied seat with radiance and fire. Composition places “Daniel small at the edge”, unselected. The assembly's only current-verse quote is “I watched until thrones were placed”; its real presence evidence is the next verse. | [Hold](review-daniel-7-9.json). Narrator and imported attendants return, though v3 had removed both. The audit-only instant also calls the presence “seated”. |
| Daniel 7:10 | Not attempted. | Conditional on accepting 7:9. |

Every quote in both replies is exact, so the deterministic checks pass. That is the documented limit: they verify quote membership, not relevance or whether described figures were selected. [Six read-only packets](packets.json) rebuild the full prompts for both stored plans with no model calls, writes or images. They carry neither the stated instant nor any other audit field.

## What three contract versions show

Luke 10:33 and Daniel 7:9 have now each had a single first reply under v2, v3 and v4:

| Moment | v2 | v3 | v4 |
| --- | --- | --- | --- |
| Luke 10:33 | Accepted | Held: successive poses | Held: unselected donkey |
| Daniel 7:9 | Held: narrator and attendants | Held: seated presence (presence fixed) | Held: narrator and attendants |

Each version fixed the failure it targeted in its next reply, and a different or earlier failure appeared. One reply per moment cannot separate a contract's effect from ordinary variation between replies. More prompt rules alone have not converged on these cases.

## Cost, tokens and latency

| Call | Prompt tokens | Completion tokens | Cost | Provider round trip |
| --- | ---: | ---: | ---: | ---: |
| Luke 10:33 | 4,380 | 695 | $0.0007855 | 5.99 s |
| Daniel 7:9 | 5,052 | 698 | $0.0008542 | 6.86 s |

Compared with the v3 replies, v4 used 290–510 more prompt tokens and 70–220 more completion tokens per plan, still under the 900-token expected allowance. Local `prepareMoment` times were 8.5 and 10.8 s. These are descriptive local measurements, not the app's full-request p90.

## Separate allowances

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65680320 | $0.03 | $39.31319680 |
| Evaluation | $16.50 | $16.29800690 | $0.045 | $0.15699310 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This operation spent **$0.0016397** in two calls under its **$0.05** cap, with $0.005 reserved before each call and zero uncertain usage. The production preparation ledger rose from 112 to 114 calls by exactly that amount. Only `plan:luke-10-33` and `plan:daniel-7-9` changed. The OpenRouter balance fell by $0.0177554 over the same window, so about $0.0161 came from usage outside this operation. That was most likely live production traffic on the shared key, since public Classical generation still runs on the legacy path. The ledger and returned usage are authoritative here; the [summary](summary.json) records both figures.

## Offline audit

The manifest pins source files to `3b8de27`. Run the audit from a worktree at that commit with this directory overlaid:

```sh
git worktree add --detach ../instant-plan-audit 3b8de2709a94dcb8c71fe0a748e6e4710f8d3332
mkdir -p ../instant-plan-audit/llm/releases
cp -R llm/releases/2026-10-23-instant-plan-check ../instant-plan-audit/llm/releases/
cd ../instant-plan-audit && npm ci && npm run works:import
npx tsx llm/releases/2026-10-23-instant-plan-check/verify.mts
```

The audit forbids network access. It checks the [hash manifest](sha256.json), the source files against `3b8de27` and that the deploy changed no record. It replays both retained replies through the real adapter and `prepareMoment`, reproducing both stored plans, their v4 markers, stated instants and zero-call reuse. It compares every final record, checks gating and the one-shot rule, and checks ledger and allowance arithmetic. For the account balance it requires a fall of at least this operation's spend. It rebuilds all six packets and confirms no audit field or stated instant reaches a prompt. The execution scripts are evidence of this completed operation, not permission to repeat paid calls; `prepare.mts` refuses any moment that has already started.
