# Repeated v3/v4 scene-plan samples

**Not converging: neither contract reliably plans these moments.** Across 40 independent replies (5 per contract per moment), v3 produced an acceptable stored plan 10 times out of 20 and v4 8 times out of 20. That difference is within ordinary variation. Both pass at most 2 of 5 on Luke 10:33 and 1 of 5 on Luke 10:34. Per the [pre-declared rule](plan.json), the next step is a semantic plan check or accepting stated limits, not another prompt rule. No images, no production writes.

The owner chose option (a) from [release status](../STATUS.md) item 1: measure failure rates before more prompt changes. This run is charged to the existing evaluation allowance under [#183](https://github.com/AustinKelsay/visibible/issues/183). It is not human release acceptance or public activation.

## Method

The plan, scripts, read-only [snapshot](snapshot.json) and [dry run](dry-run.json) were committed before the first paid call. Each contract's own `prepareMoment` ran locally: v4 from this repository at `0676502`, v3 from a detached worktree at `6ab7bb4`. They differ only in the planner prompt and quote checks. Both ran over a fresh in-memory store per sample, seeded from one snapshot of production generation 1 with the four moments' plan records removed. Every sample therefore made one fresh plan request and reused the stored look. The dry run confirmed that both contracts send identical moment input.

The production OpenRouter adapter, routing and default sampling were used; the planner sets no temperature, so replies vary as they would for readers. Order alternated contracts within each round. All 40 samples completed with no malformed-reply retries and nothing blocked.

Scoring was blind. [`blind.mts`](blind.mts) shuffled the replies under random IDs. It kept only what reaches rendering (scene fields and selected IDs, plus the moment text and cast names) and withheld the contract, outcome and grounding audit. A fresh subagent ([scores](scores-subagent.json)) and the operator ([scores](scores-operator.json)) each scored all 40 against the [rubric](plan.json) before the [key](blind-key.json) was read:

- **U:** an unselected figure is described.
- **X:** a figure from the wrong scene appears.
- **I:** the fields don't describe one instant.
- **F:** the no-form subject has a body or is seated.

**The two scorers agreed on every blocker and every note for all 40 replies**, so no [adjudication](adjudication.json) was needed. A reply passes when it was stored, not refused, and has no blocker.

## Results

[Tally](tally.json), passes out of 5:

| Moment | v3 | v4 | Main failures |
| --- | ---: | ---: | --- |
| Luke 10:33 | 2 | 2 | v3: kneeling versus halting (I ×3), unselected donkey (U ×2). v4: unselected donkey (U ×3), mixed poses (I ×1). |
| Luke 10:34 | 1 | 1 | Refusals (v3 ×3, v4 ×4); inn selected at the roadside (X). |
| Daniel 7:9 | 4 | 1 | v4: four refusals, two of them clean plans; seated wording (F). |
| Daniel 7:10 | 3 | 4 | v3: “radiance and fire seated above a throne” (F ×2). |
| **Total** | **10 / 20** | **8 / 20** | |

The two contracts fail differently rather than one being better:

| Outcome | v3 | v4 |
| --- | ---: | ---: |
| Stored with a blocker (would render a defect) | 7 | 3 |
| Refused with a blocker (correct refusal) | 1 | 4 |
| Refused but clean (false refusal) | 2 | 5 |

V4's stated instant and quote rules reduced defective stored plans, but its stricter checks refused more good ones. Nine of the 12 refusals were the same structural rule: the evidence list must match the selected cast exactly. In eight of those, the model added an evidence record for a figure it had correctly left out (innkeeper or assembly as `uncertain`, or the inn as `in_scene` but unselected). The ninth listed the right entries in a different order.

## Sensitivity (post hoc)

[`sensitivity.json`](sensitivity.json) is not pre-declared:

- Clearing the borderline rubric readings (kneeling versus halting; effects “seated above”) raises v3 to 13/20 and leaves v4 at 8/20.
- A counterfactual evidence rule would ignore order and accept non-`in_scene` records for unselected figures. It would rescue two clean v4 Daniel 7:9 plans, bringing v4 to 10/20.

Neither changes the verdict: Luke 10:34 stays at 1 of 5 for both contracts in every count.

## What this means

- **Prompt iteration has stalled on these cases.** Each new rule moves failures around; it doesn't remove them.
- **A model can apply this rubric reliably.** An independent blind model scorer matched the operator on all 40 replies. A semantic check of each plan against its moment, followed by a re-plan on failure, is the evidence-backed option (b). It needs an amendment to the accepted design, which today forbids semantic retries. It also adds a call and roughly 4–7 s to a cold request, which would likely exceed the 20 s cold target (measured p90 17.75 s).
- **The exact evidence-list rule causes most false refusals.** Relaxing it to ignore order and to accept documented exclusions is a small deterministic change, separate from (b).
- **Five samples per cell is small.** The counts describe these four moments, not the whole Bible.

## Cost, tokens and latency

| Contract | Calls | Cost | Median prompt tokens | Median completion tokens |
| --- | ---: | ---: | ---: | ---: |
| v3 | 20 | $0.0145990 | 4,333 | 588 |
| v4 | 20 | $0.0165735 | 4,732 | 693 |

## Separate allowances

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65680320 | $0.03 | $39.31319680 |
| Evaluation | $16.50 | $16.32917940 | $0.045 | $0.12582060 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This run spent **$0.0311725** in 40 calls under its **$0.08** evaluation cap, with $0.005 reserved before each call and zero uncertain usage. It wrote nothing to production; preparation and smoke spend are unchanged. The [ledger](ledger.json) and returned usage in [provider replies](provider.ndjson) are authoritative. The account balance is not used as a cross-check, because the key is shared with live traffic.

## Offline audit

The manifest pins sources to `0676502`, with the planner files of each contract pinned to its own commit. Run the audit from a worktree at `0676502` with this directory overlaid, plus a v3 worktree:

```sh
git worktree add --detach ../rate-audit 06765022f482aaab13b9e925b57558c5a448cac9
git worktree add --detach ../rate-audit-v3 6ab7bb49a1921f86f0aeab7f605796ea2238b32e
mkdir -p ../rate-audit/llm/releases
cp -R llm/releases/2026-10-23-grounding-rate-check ../rate-audit/llm/releases/
cd ../rate-audit && npm ci && npm run works:import && ln -s "$PWD/node_modules" ../rate-audit-v3/node_modules
VISIBIBLE_V3_ROOT=../rate-audit-v3 npx tsx llm/releases/2026-10-23-grounding-rate-check/verify.mts
```

The audit forbids network access. It checks the [hash manifest](sha256.json) and both contracts' planner files against their commits. It replays all 40 retained replies through each contract's own `prepareMoment`, reproducing every stored plan, refusal message, call count and spend outcome, with looks reused. It checks that the blind packet carries exactly each sample's rendering-bound text with no contract or audit leak. It recounts every pass from the two score files, the adjudication and the key, and checks ledger and cap arithmetic. The run scripts refuse to start again once their ledger exists.
