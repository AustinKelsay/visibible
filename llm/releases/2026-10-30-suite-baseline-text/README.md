# Regression suite baseline: stopped text run

**This run stopped after 20 of 113 plans, and was replaced by [the complete text run](../2026-10-30-suite-baseline-text-2/README.md).** Its results are not scored.

A Bible case (Judges 19:29) drew a 403 moderation refusal from the provider. The ledger treated every provider error as a reason to stop, so the whole run halted ([run-finished.json](run-finished.json)). The refusal was not charged.
- **Fix.** The ledger now lets a moderation refusal fail only its own call, at no cost. Any other provider error still stops the run (`5c26feb`, with a test).
- **Rerun.** The second run spent the rest of the $0.25 text cap.

The run made **67 text calls for $0.0264611**, plus **$0.0026066** of uncertain usage. That is the refused call's reservation: it reported no usage, so the ledger could not price it. Links: [funding](funding.json), [plan](plan.json), [snapshot](snapshot.json), [ledger](ledger.json). No production write.
