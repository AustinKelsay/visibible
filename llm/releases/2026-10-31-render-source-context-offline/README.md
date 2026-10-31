# Source context at rendering — offline candidate

**Status: mechanically verified, visually untested. Production is unchanged.** This is a concrete candidate following the [negative planner-context diagnostic](../2026-10-30-source-context/README.md). It makes no provider calls and spends nothing.

The earlier run exposed a lossy handoff: the planner's first answer included Alice's height, its feedback revision omitted it, and the image model then received that plan with clipped source. More context upstream did not reliably survive to the final image. The current renderer also assigns changing place, time, clothing and action to the scene plan, while its focal text is capped at 1,200 characters and neighbor cues at 220 each.

## Candidate contract

Keep the existing model-authored plan, canon, style and ordered reference attachments. Replace the clipped focal excerpt and neighbor cues with one complete, bounded source section, marked before / focal / after. Replace the ownership wording so the source can resolve changing state that the plan omitted or contradicted. The plan still chooses one instant and composition; canon and sheets preserve recurring identity; art style controls rendering. Existing engine rules, work brief and literal owner constraints retain their authority.

```text
Current renderer                  Offline candidate
clipped focal text + short cues    complete source section
           +                                 +
plan owns changing details        source resolves changing details
           +                                 +
same canon / style / sheets       same canon / style / sheets
```

No source-fact extraction, state database, new planning/review call or automatic memory update is introduced. This changes **both source availability and its precedence**, so a future visual comparison would measure that combined candidate rather than isolate either factor.

The script transforms known frozen prompts for evaluation only. It is not a production text-replacement strategy, flag, alternate runtime path or general source importer. If visual evidence later supports the contract, the existing work adapter and prompt builder would own the source span and prompt assembly directly. A separate scene-state module is not justified by this result.

## Scope and deliberate limits

All 36 retained plans are replayed without re-planning, including both previous planning arms and every repeat. Each gets its own unchanged baseline and candidate; the previous baseline and section arms are not compared against each other in this offline step. All 12 previously rendered packets and ordered references reproduce exactly.

- **24 eligible Alice/Holmes packets:** complete source retained, unchanged plans and ordered reference bytes, and unchanged brief, canon, style and presentation blocks. Candidate prompts are 9,594–11,442 characters, within the existing 12,000-character cap. The added length is 1,645–3,174 characters.
- **12 excluded Bible packets:** their sections include non-literal depiction. Raw source is intentionally suppressed in current rendering for selected effects-mode subjects; restoring it wholesale risks reintroducing bodily metaphors. This candidate conservatively excludes any section containing a non-form cast or mentioned entry, even when a particular plan did not select it. This is a bounded trial limitation, not a new production policy or a claim that Bible passages cannot use source context.
- **Overflow:** rejected without clipping source or changing the existing cap. Synthetic overflow checks pass for all eligible packets.
- **Ownership:** these retained cases have no literal owner-derived seed. Existing owner constraints remain binding by contract, but their interaction with contradictory source is not visually tested here.
- **Identity:** keeping attachments fixed removes the previous comparison's attachment differences within each new pair. It does not prove that prose can override a sheet's ordinary-size depiction or that omitted characters get suitable canon.
- **Context:** same-section source can still omit earlier facts or tempt the renderer to include later events. Source-faithful prose is not automatically a faithful image. The source and chosen plan may also disagree about the instant; that is part of the untested contract.

## Reproduce without spending

From the repo root:

```sh
npm run works:import
node --import tsx scripts/evals/render-source-context.mts
```

The script requires the retained identity diagnostic's local reference-image files listed in its `references.json`; they are not committed. Missing or changed reference bytes fail the replay. No credentials are read. Network access is rejected, and any attempted re-planning throws locally. The source/runtime files must match the declared base commit; the frozen input hashes are checked. The report records the candidate script hash.

Outputs are local, gitignored `evals/images/runs/2026-10-31-render-source-context-offline/packets.json` and `report.json`. The committed [report](report.json) holds input and prompt hashes, lengths and each exclusion, rather than another copy of every full prompt. Re-running deterministically regenerates the same report. This offline output is overwriteable; it is not a paid-run ledger or permission to execute an experiment.

Checks: 36 frozen plans preserved; 12 prior image packets reproduced; 24 whole-source candidates; 12 explicit exclusions; ordered references and bytes fixed within each pair; overflow rejected; **zero model/provider calls, $0 spend**. `npm test`: 1,052 passed, one skipped. Typecheck passed; lint passed with three existing historical warnings. No runtime source, schema, prompt version, style or active work data changed.

## Next measurement, not performed

Use a separately frozen, capped image comparison with the same plans and identical ordered attachments for each baseline/candidate pair. Include the known height-omission failure and a before-growth control; repeat both and inspect every output and retry. Score source state separately from character identity, unwanted subjects, lettering and overall quality. Preserve the failed planner-context result as history rather than relabeling it.

A successful small comparison would justify broader evaluation, not automatic activation. Non-literal depiction, long sections, other styles/models and owner constraints remain unresolved. This PR neither starts another paid run nor changes what readers see.

## Review

GPT-6.1 Sol on xhigh approved in one round with no findings. It independently reproduced the report, reconstructed all six source sections from work inputs, checked all 24 candidate transformations and ordered references, reproduced all 12 prior image packets, and ran typecheck and whitespace checks. The before/after working-tree snapshot matched `e477f389a2cc8b8bbb11c087d52454d2bd358161`; the reviewer made no edits or provider calls.

CodeRabbit CLI reviewed the script and raised one minor reporting concern: counting all prior image rows without proving unique IDs and complete matching coverage. Two assertions now enforce that coverage; offline replay and typecheck passed afterward, and Sol reviewed the fix. No findings were deferred. Neither review establishes visual fidelity.

The PR review later identified a second minor coverage gap: a duplicate non-image plan row could replace another without failing the total-row count. The plan file is now pinned to the baseline commit's bytes, and plan IDs must be unique. An in-memory file-read substitution reproduced acceptance before this two-line fix and rejection afterward; the retained files were never edited. Normal replay still produces identical prompts and report values, apart from the script hash. This small follow-up was verified with replay, typecheck and focused lint without another Sol round.
