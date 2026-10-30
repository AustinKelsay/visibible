# Generated-look removal candidate

This run tests removing model-generated section looks while retaining the moment planner and its semantic review. Source text, brief, canon, reference sheets, styles, and the finished-image check stay unchanged. Owner-authored and unknown-provenance looks remain binding. No production data is written.

The text run uses the frozen suite and a read-only snapshot of the current analysis. Its $1 hard cap is an operator limit under the owner’s full-send authorization for this implementation and its proof. The next candidate will reuse this snapshot when testing review removal. A production change depends on the text, image and consistency gates; local tests and scripted rehearsal alone cannot establish quality.

Historical `.mts` runners under `llm/releases` are retained as evidence and must run at their recorded commit. They are excluded from current type checking instead of forcing the current engine to preserve retired APIs. The maintained runner is `scripts/evals/suite.mts`; source and active tests remain checked, including any historical controls they import.

The live run prepared all 113 cases with 301 text calls for $0.146505, no uncertain usage, no refusals, and no production mutations. The baseline used 404 calls for $0.1782921. The snapshot’s source records, reference metadata, and image hashes match the baseline exactly. Independent quality scoring is pending.

## Settled text result

Two independent scorers covered all 113 plans and 755 fault answers each. The operator settled 30 disputed items; all independent scores and individual rulings are preserved in `scoring/`. The [report](report.json) fails the existing per-fault holdout gate: depiction-rule conflicts rise from 0 to 3 of 20, over the allowed two-item increase. Overall acceptability is 56/113 (baseline 69/113), and holdout acceptability is 11/20 (baseline 9/20). This arm is not a release candidate. The separate no-review arm passes its text gate and proceeds to image/consistency measurement; no prompts were tuned to these scores.
