# No-review experimental arm

This arm removes semantic plan review, cast repair and feedback re-planning from the no-generated-look candidate. It keeps the planner, its source and work instructions, and the retry for malformed replies. Its source snapshot and reference bytes are copied unchanged from the preceding arm.

This is an experiment, not an approved release. The existing review-specific tests describe behavior deliberately absent here; do not ship the experimental commit. If the quality gates support this arm, retire those tests and verify the reduced contract before review and release. Otherwise restore the preceding implementation. The $1 hard cap is an operator limit under the owner’s full-send authorization for this implementation and its proof.

The live run prepared all 113 cases with exactly 113 text calls for $0.0548583, no uncertain usage, no refusals and no production mutations. Two independent blind scorers covered all 113 plans; the operator settled 34 disputed items against the supplied source and same-scene context. The [text report](report.json) passes the existing per-fault holdout gate against the baseline, with all items scored and no outstanding disputes. Overall acceptability is 64/113 (baseline 69/113), while holdout acceptability is 12/20 (baseline 9/20). Wrong-moment faults rise across the full suite, from 14 to 36, so this is evidence to proceed to image testing, not a claim that quality improved. The image and consistency gates are still required. The independent scores and individual rulings are preserved under [scoring](scoring/operator.json).

The subsequent [image run](../2026-10-30-no-plan-review-image/README.md) fails both image quality and Bible setting consistency. Passing this text gate did not authorize release.
