# No-form canon out of preparation: fresh text check

This is the text half of the 27 October 2026 check of planner v14, look v2, review v12 and renderer v12 (the [ADR 0006 amendment](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md#amendment-no-canon-for-a-no-form-subject-anywhere-in-preparation)), decided by the operator under the owner's delegation ("ok continue. Your call on all of these"). It repeats the [v13 fresh check](../2026-10-27-v11-fresh-check/RESULTS.md) design on a new draw. It measures only: no prompt or code changes, restart or replacement follow from its results.

The candidate is `af2abbb`. It covers **23 fresh verses**, drawn with seed 2026102751 and excluding every earlier sample, plus the **7 standing retained cases**. Each case gets a cold memory store, the real preparation, and reference-free text packets in all three styles. Scoring is unchanged: two independent blind model scorers using [SCORING.md](SCORING.md), operator adjudication, and everything committed before unblinding. The predeclared targets are diagnostic:

- At most 1 of 30 plans with a speaker or writer inside the scene their words describe (3 before).
- At most 1 plan that copies a no-form subject's canon or adds its effect unselected (5 before).
- No refusals.

The strict standard is reported alongside.

The plans no longer contain a separate `situation`, so the blind packet shows the five owner conditions only when the look is owner-written. Scorers judge setting and time from the scene fields.

**Money:** a $0.15 cap. Together with the paired [image check](../2026-10-27-v12-image-check/README.md), it uses a $1.00 evaluation increase to $23.00, decided by the operator under the owner's delegation. The run uses the owner's working local OpenRouter key. No images, production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-27-v12-fresh-check/dry-run.mts verify
npx tsx llm/releases/2026-10-27-v12-fresh-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-27-v12-fresh-check/run.mts --execute
npx tsx llm/releases/2026-10-27-v12-fresh-check/score.mts packet
npx tsx llm/releases/2026-10-27-v12-fresh-check/audit.mts finalize
```
