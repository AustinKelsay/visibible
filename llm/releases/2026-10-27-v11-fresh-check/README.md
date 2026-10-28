# Unseen presence and speakers: fresh text check

This is the text half of the 27 October 2026 check of planner v13, review v11 and renderer v11 ([ADR 0006](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)). The owner delegated the decisions ("ok continue. Your call on all of these"). It repeats the [v12 fresh re-measurement](../2026-10-27-v10b-fresh-check/RESULTS.md) design on a new draw and measures only: no prompt or code changes, restart or replacement follow from its results.

The candidate is `10565b6`. It covers **23 fresh verses**, drawn with seed 2026102741 and excluding every earlier sample, plus the **7 standing retained cases**. Each case gets a cold memory store, the real preparation, and reference-free text packets in all three styles. Scoring is unchanged: two independent blind model scorers using [SCORING.md](SCORING.md), operator adjudication, and everything committed before unblinding. ADR 0006 retired the strict text gate as a launch gate, so the predeclared targets are diagnostic: at most 1 of 30 plans with a speaker inside the scene their words describe (5 of 30 before), and no refusals. The strict standard is reported alongside.

The plans no longer contain a separate `situation`, so the blind packet shows the five owner conditions only when the look is owner-written. Scorers judge setting and time from the scene fields.

**Money:** a $0.15 cap. Together with the paired [image check](../2026-10-27-v11-image-check/README.md), it uses a $0.50 evaluation increase to $22.00, decided by the operator under the owner's delegation. The run uses the owner's working local OpenRouter key. No images, production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-v11-fresh-check/dry-run.mts verify
npx tsx llm/releases/2026-10-27-v11-fresh-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-v11-fresh-check/run.mts --execute
npx tsx llm/releases/2026-10-27-v11-fresh-check/score.mts packet
npx tsx llm/releases/2026-10-27-v11-fresh-check/audit.mts finalize
```
