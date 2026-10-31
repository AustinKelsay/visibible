# Ownership wording — offline candidate

Replace the competing block hierarchy with a division of responsibilities. This is a two-line candidate for the existing prompt builder, replayed offline. **It is not activated, and image quality is untested.** It creates no new runtime module, schema, state or model call.

```text
CURRENT                          CANDIDATE
Rules > brief > canon            Rules, brief and owner constraints apply
              > style > plan     Source → explicit facts and changes
But plan owns temporary state    Plan   → one instant and its state
                                 Canon  → recurring appearance
                                 Style  → visual treatment
```

The [input-conflict audit](../2026-10-31-scene-input-conflicts/README.md) explains the contradiction. The subsequent [corrected-input comparison](../2026-10-31-scene-input-visuals/README.md) did not establish a visual improvement. That negative result remains; this pass isolates wording rather than changing source or saved descriptions again.

## Exact replacement

Replace [`PRECEDENCE_LINE`](../../../src/lib/engine/prompt.ts#L98), including its appended `CONTENT_OWNERSHIP`, with:

> Follow the rendering rules and work brief; owner look constraints remain binding. Within those constraints, explicit source facts and changes govern the depicted moment. The plan selects one instant and its changing state. Canon supplies recurring appearance. Art style supplies visual treatment.

Replace the [plan heading](../../../src/lib/engine/prompt.ts#L216) with:

```text
SCENE PLAN (one instant and its changing state):
```

Every other line stays exact, including the seven plan fields, selected characters, canon, reference captions, style, owner constraints and depiction rules. Source remains the same clipped or suppressed input the current builder supplies. The proposal does not grant style authority to change story facts; intentional reinterpretation remains work-brief data. Model and output settings remain outside this ownership contract.

## Offline evidence

The [replay](../../../scripts/evals/scene-input-ownership.mts) reuses the existing [frozen-packet reconstruction](../2026-10-31-render-source-context-offline/README.md), discards its older full-source candidate and transforms only the original prompts. It also recaptures the existing Bible, Holmes and Alice golden requests with their scripted adapters, verifying them against the committed fixtures before transforming their rendering prompts.

- 36 retained scene packets plus 12 golden packets: 48 unique comparisons.
- Exactly two changed lines per prompt; all remaining lines match byte for byte. Each candidate is 59 characters shorter, ranging from 4,430 to 11,911 characters.
- Coverage includes one binding owner-constraint packet, ten packets with suppressed source, several art styles, an empty character selection and a near-budget packet. The prior replay verifies the retained scenes' ordered reference metadata and local image-byte hashes; golden references are synthetic metadata.
- Unknown packet structure and prompt overflow reject locally. Nothing is truncated to fit this candidate.
- Zero live provider calls and $0 spend. The script blocks global network fetch and uses only the existing fake adapters. Runtime source, work data, golden fixtures, schema, defaults and production prompt version remain unchanged.

The [report](report.json) records the exact replacements, input hashes, original/candidate prompt hashes and lengths. Full comparison packets are generated into ignored `evals/images/runs/2026-10-31-scene-input-ownership/`. Original packet versions and preparation/reference metadata remain baseline evidence; they are not fresh admission or provenance for the substituted prompt.

Run `npm run works:import` to generate the ignored work files, then reproduce with `node --import tsx scripts/evals/scene-input-ownership.mts`. This uses the same locally retained reference files as the earlier replay and regenerates that replay's ignored outputs first. No credentials are needed. The script recaptures and verifies every golden request, including non-rendering requests.

Verification: 1,052 tests passed, one skipped; typecheck and focused lint passed; repository lint reported zero errors and three existing warnings. All 32 local documentation links and diff whitespace checks passed. CodeRabbit CLI raised zero issues. GPT-6.1 Sol on xhigh approved in one round with no findings, independently reproducing both reports byte for byte without writing files. Approval covers offline evidence only.

## What this establishes

This removes a textual contradiction with a small, generic edit. It does not prove that a model follows the new ownership, that a clipped source contains enough context, or that an incorrect plan or canon repairs itself. In effects-mode scenes, the source remains suppressed and the model still depends on the plan. Owner and depiction constraints still bound source interpretation. Reference sheets can still conflict with temporary state. No image has been made with this isolated candidate.

The next useful decision is whether to test this two-line substitution on the existing difficult scenes with all other inputs fixed. Until separately justified, keep the candidate offline; the previous source-context and correction trials do not establish its quality. This pass requires no additional storage, review layer, source parser or paid evaluation framework.
