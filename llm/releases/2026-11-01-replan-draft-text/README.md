# Does a correction preserve more when it receives its draft?

**Prepared text diagnostic; not executed or active.** The [offline candidate](../2026-10-31-replan-draft-candidate/README.md) supplies the existing correction call with its normalized draft and effective cast. This package tests that handoff without adding a production call or applying the candidate. It follows the [captured Cat/Queen trace](../2026-10-31-cat-queen-state-trace/README.md).

Four fixed cases × two request variants × three repetitions = **24 correction calls**. Only the correction is paid. No new guides, initial plans, semantic reviews, images or vision checks are scheduled. Both arms use Claude Haiku 5.5 with reasoning off, the same provider restriction, schema and 2,400-token output limit. The complete user prefix, including source, cast and guide, stays exact. The candidate adds the draft **and changes the revision instruction** as the reviewed patch does; this is not an isolation of the draft bytes alone.

```text
Frozen source + guide + first draft + review complaints
                   ├─ current correction request           × 3
                   └─ correction request including draft   × 3
                               ↓
                 Inspect every returned field and failure
```

## Cases and decision rule

[cases.json](cases.json) fixes source line numbers, the one synthetic edit and the per-case criteria before spending. The saved baseline provider exchanges and result contexts come from the [fresh v2 reference run](../2026-10-31-suite-v2-baseline-text/README.md).

| Case | What must change | What should survive |
| --- | --- | --- |
| Floating Cat head | Mushroom-shaped hoops | A free-floating head without a body or perch; the source-stated Queen smile when that instant is depicted |
| Cat on a branch | Alice described as both standing and seated | A complete Cat on its legitimate branch; either coherent Alice pose |
| Dormouse | Speaking with a raised paw while simultaneously dozing | A coherent instant involving the Dormouse that the source supports |
| Encamped Israelites | A day-to-night sequence in one image | Resting cloud, tabernacle and stationary camp |

The branch control is **synthetic**. Its retained first draft was not semantically retried in the reference run. We replace one composition phrase to seat Alice while the primary subject still stands, and append one `not_one_instant` complaint to the original review. The original missing-canon/unselected-house findings stay; the existing engine adds that house to the effective cast. No scene facts, complaint or identity rules are added to production. The other three cases use the actual first drafts and reviews, and their reconstructed baseline correction requests match the historical requests exactly.

The threshold is deliberately narrow: all three candidate repetitions must satisfy each case's declared target, without a new clear source or depiction contradiction from preserving the draft. Missing, malformed, refused or ambiguous answers do not pass. A valid alternative instant may be reasonable yet fail to demonstrate the particular preservation target. Report baseline performance and all other faults separately; a target pass does not make a scene acceptable. A complete targeted pass would justify considering a broader existing-suite comparison, **not activation**. Failure or incomplete execution supports no broadening on this evidence.

## Limits established before execution

These cases and the corpus have already been inspected. Assessment will be unblinded model inspection, not human acceptance, independent blind scoring or an unexposed holdout. Three samples per arm cannot establish general efficacy, cross-model behavior, fewer retries, lower cost or visual quality. The correction receives a larger prompt; original draft errors may be reinforced.

The Cat head's explicit appearance in earlier ¶45–47, and the legitimate branch in *Pig and Pepper* ¶49, lie outside their respective frozen planner source windows. Broader-source inspection may establish those facts but must be labeled; **the experiment does not add that text**. The floating-head draft also compresses the Queen overhearing and smiling. The tea-party draft can conflict with the existing instruction to illustrate narrated content rather than its speakers. Other known incidental inventions and cast issues remain visible. No output will be repaired or rerolled to improve a score.

This isolated call omits the post-correction semantic review and later rendering. `normalizedCorrection` applies the existing string trim and cast deduplication for inspection; it is not an admitted or stored production plan. Reconstructed final replies used by the offline replay are placeholders, never simulated evidence of improvement.

## Mechanical proof and funding

[replay.mts](replay.mts) drives the actual preparation and OpenRouter text-adapter paths with fake responses. It reconstructs the four [baseline requests](baseline-requests.json) against unchanged runtime code and the four [candidate requests](with-draft-requests.json) when only the reviewed preparation patch is applied temporarily. Initial source requests stay exact. For the three historical corrections, the baseline request bodies are byte-equivalent after JSON parsing. Both variants share system message, schema, provider settings and the full user prefix; only the reviewed correction suffix differs. The candidate remains unapplied in this checkout.

[run.mts](run.mts) uses the existing suite ledger and request-ceiling function. Default execution is network-free: it replays the baseline requests, exercises all 24 fake requests, and proves that HTTP error, malformed schema, missing usage, an over-ceiling charge and a thrown provider exception each stop after one attempted call. The raw exchange is retained on a live schema failure. Source hashes are rechecked before each call; live execution requires reviewed preparation committed in a clean working tree, and an exclusive start marker prevents restart.

The [manifest](manifest.json) binds inputs, request packets, the unapplied patch, runtime sources and runner. [verification.json](verification.json) records rehearsal coverage and request hashes. At retained catalog prices, the sum of all 24 conservative ceilings is **$0.042354**. Live pricing must still fit before any paid call. This allowed reducing the initially proposed $0.15 maximum to a **$0.05 operation cap**.

[funding.json](funding.json) uses the existing grant:

- Prior conservative cumulative spend: **$6.82885455**.
- Maximum after this operation: **$6.87885455 of $7**.
- Authorization left even if this cap is consumed: **$0.12114545**.
- Reader reserve: **$5**, checked before execution and each paid call; key allowance is also checked.

The account balance has not been queried for this preparation. Live execution records pricing, funding, request ceilings, raw exchanges, usage and every answer. Refusal, malformed output, provider/account failure, unpriced or over-cap requests, blocked accounting or an unsettled reservation stops the operation. A partial run remains incomplete; no automatic restart or replacement sample is allowed. After all calls settle, the completion/spend record is saved before the closing account query. If that query fails, the saved record has no closing balance fields and account reconciliation remains pending; completion alone is not proof of a preserved closing reserve.

## Reproduce without spending

Use this preparation commit with dependencies installed and imported works available:

```sh
npm run works:import
node --import tsx llm/releases/2026-11-01-replan-draft-text/replay.mts
node --import tsx llm/releases/2026-11-01-replan-draft-text/run.mts
```

To reconstruct the candidate, use a disposable checkout, apply only `src/lib/engine/preparation.ts` from the [candidate patch](../2026-10-31-replan-draft-candidate/candidate.patch), then run `replay.mts` without `--write`. This verifies `with-draft-requests.json`; the regular runner expects the unapplied production source hashes. `--write` exists only to prepare packets and must not be used to revise frozen evidence after execution.

The paid command adds `--execute` and requires the already authorized evaluation environment file through `VISIBIBLE_EVAL_ENV_FILE`. Independent pre-execution review is required before running it. Preserve and inspect every reply, reconcile spend, and obtain final evidence review afterward. No production activation or correction is included.

Preparation checks: **52 focused tests passed; the fixed-tree full coverage run passed 1,053 tests with one skipped and met thresholds.** Typecheck passed; repository lint had zero errors and three existing warnings. [checks.json](checks.json) binds the session logs, including the discarded test run that overlapped temporary candidate application. CodeRabbit reviewed ten files and raised one minor finding about losing the completion record on a closing account-query failure. The fix and its before/after, network-free reproduction are recorded there. Independent review remains pending.
