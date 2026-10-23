# Plan-review checker benchmark

**The third declared arm met every target and is wired into preparation.** The owner chose option (b) on 23 October 2026: check each scene plan against its moment before storage, re-plan once on failure, and relax the exact evidence-list rule. Before wiring the check, this benchmark ran it on the 40 blind-scored replies from the [repeated-sample run](../2026-10-23-grounding-rate-check/README.md), whose correct answers were already known.

Charged to the evaluation allowance under [#183](https://github.com/AustinKelsay/visibible/issues/183). No production read or write, no images, no human acceptance.

## Method

The [plan](plan.json) fixed the targets before the first call:

- **Recall:** at least 13 of the 15 defective replies are flagged.
- **False alarms:** at most 3 of the 25 clean replies are flagged.
- **Unavailable:** at most 2 of 40 reviews end with two unreadable reports.

Truth is the scorers' agreed blocker flags. Each review saw only what reaches rendering (scene fields and selected IDs), the moment and its neighbor excerpts, the section cast with `hasForm`, and the depiction rules. It saw no grounding audit, contract or outcome. Code accepts a reported problem only if its quote is in the plan and its cast ID fits its kind ([`plan-review.ts`](../../../src/lib/engine/plan-review.ts)).

Each later arm was declared in the plan before it ran:

| Arm | Change | Recall | False alarms | Unavailable | Decision |
| --- | --- | ---: | ---: | ---: | --- |
| [`haiku-none`](results.json) | Haiku 5.5, reasoning off, prompt v1 | 13/14 | **25/25** | 1 | do not wire |
| [`haiku-low`](haiku-low/results.json) | Reasoning low, same prompt | 12/15 | 7/25 | 0 | do not wire |
| [`haiku-low-v2`](haiku-low-v2/results.json) | Reasoning low, prompt v2 | **13/15** | **3/25** | 0 | **wire** |

Without reasoning, the checker flagged every clean plan, often citing a real but unrelated phrase. Reasoning cut false alarms to 7. Six of those flagged the river of fire in Daniel 7:9 as later-verse content. The rubric treats that as scenery, and it comes from the shared section look, so a re-plan could never remove it. Prompt v2 changes only the problem definitions, with no moment-specific names:

- Out-of-instant problems cover figures and selected place entries, not scenery or effects.
- Successive steps ("then") and effects called "seated" get generic examples.

[`system-v1.txt`](system-v1.txt) archives the first prompt.

By kind, v2 is reliable for unselected figures (5/5, no extras) and seated or embodied no-form subjects (5/5, no extras). It is weak for a single instant (1/5) and adds two out-of-instant extras: it reads the Samaritan kneeling as 10:34's "came to him". Its third false alarm flags a traveler both "lying" and "half-raised", a real inconsistency both scorers missed.

**This arm was tuned on the benchmark, so its result here is optimistic.** The fresh blind-scored repeated run of the whole plan-and-review pipeline is the held-out test.

## Cost and latency

| Arm | Calls | Cost | Median review latency |
| --- | ---: | ---: | ---: |
| `haiku-none` | 46 | $0.0136893 | — |
| `haiku-low` | 41 | $0.0190818 | — |
| `haiku-low-v2` | 41 | $0.0189183 | 4.7 s (p90 6.1 s) |

A v2 review costs about $0.00046 (median 2,242 prompt and 447 completion tokens). Every arm stayed under its separate cap with zero uncertain usage.

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Evaluation | $16.50 | $16.38086880 | $0.045 | $0.07413120 |

Preparation and smoke allowances are unchanged.

## Offline audit

Run from a checkout containing this directory and the repeated-sample directory, after `npm run works:import`:

```sh
npx tsx llm/releases/2026-10-23-plan-review-check/verify.mts
```

The audit forbids network access and checks the [hash manifest](sha256.json), including the checker module. It replays all 120 retained replies through `reviewPlan`, checking each arm's exact prompt, reasoning setting and token limit and reproducing every result. It recounts each arm's score and decision from the agreed flags, and checks ledger and cap arithmetic. The manifest pins the checker module and text adapter. A later change moved review reasoning onto each request; `review.mts` and `verify.mts` now pass each arm's setting explicitly, so they produce the same provider bodies as the original runs. The manifest was refreshed with that change, and any later checker change makes the audit fail on newer checkouts.
