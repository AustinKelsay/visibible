# Full Alice identity merge

The offline baseline replay reproduced four White Rabbit identities from the original division readings. High reasoning then passed all twelve fixed trials in the [small diagnostic](../2026-10-30-identity-high-reasoning/README.md), including controls for distinct people and places. This run exercises the complete merge, including overlapping groups and section references, with the same original readings.

**Result: passed.** The full candidate merge returned one identity containing exactly the six White Rabbit occurrences. All 148 source cast members were retained exactly once and all 52 sections retained valid cast references. There were 59 provider calls, costing $0.0213675; uncertain spend and production mutations were both zero. This is one complete-work sample, not proof that every identity or generated image is correct. No stored analysis, canon, reference sheet or image was changed.

The [shorter instruction](../2026-10-30-identity-instructions/README.md) and [low-reasoning setting](../2026-10-30-identity-reasoning/README.md) failed controls and were rejected. The production instruction and schema remain unchanged. The accepted change enables high reasoning only for initial identity rulings and reconciliation, includes reasoning in resumable response keys, and reserves the full output allowance before those calls. Completed preparations remain unchanged; a new run is needed to regenerate them.

Reproduce the original split and verify the candidate offline from the repository root:

```sh
npx tsx llm/releases/2026-10-30-identity-alice-merge/run.mts
```

Expected output:

```text
Baseline replay reproduced four Rabbit identities.
Candidate replay passed: one Rabbit, complete membership and valid section references.
```

`input.json` retains the original division readings. `baseline-responses.json` retains the captured baseline answers, and `responses.json` retains this run's new answers. Replay exercises the current merge implementation and refuses any missing captured answer; it never contacts a provider. `run-started.json` records the frozen source hashes and commit. The one-shot paid path requires `--execute` and refuses to overwrite this run.

Validation: the two cache/budget regression tests failed before the runtime change and passed afterward. Application checks passed: 1,051 tests with coverage (one skipped), typecheck, lint (three pre-existing warnings), production build, and production dependency audit (zero vulnerabilities). The image suite uses frozen cast analyses and would not exercise this preparation change, so no image-quality claim or paid image run is included.

Total spend across the three small diagnostics and this complete merge: **$0.041533**, all measured, with zero production mutations. Semantic results remain stochastic model judgments; the fixed partitions and captured answers make this evidence auditable, not a guarantee of future outputs.
