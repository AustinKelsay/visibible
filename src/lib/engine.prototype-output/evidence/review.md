# Archive verification, 2026-10-19

CodeRabbit CLI 0.9.0 completed `coderabbit review --agent -t uncommitted -c AGENTS.md` on the 14 engine prototype source/documentation files before commit.

It raised one minor issue, “Keep paid results when one worker fails,” at `src/lib/engine.prototype/llm.py:112`. Inspection confirmed that `call_all` raises before canon, looks and plans callers reach their aggregate writes. Successful raw responses survive in `runs/`, but the pipeline does not automatically restore them on a rerun.

Disposition: documented, not fixed in the archived experiment. This branch preserves the scripts that produced the accepted output and is never merged into production. Checkpoint/resume behavior belongs in implementation; the historical scripts should not be reused as a reliable production worker.

Local verification parsed all 182 JSON files and 25 Python files, checked the ledger JSON lines and evidence checksums, resolved every saved moment image/reference and HTML image link, and loaded the archived inputs to reproduce the inventory of 32 moments. The credential-pattern scan found no matches. No paid model calls or application changes were made for this resolution. Application lint, typecheck and tests were not run because this commit only archives the standalone experiment.
