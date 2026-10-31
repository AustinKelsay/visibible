# Scene input corrections — prepared offline

**Status: four corrected copies prepared; nothing activated or rendered.** This implements the bounded data-preparation step from the [input-conflict audit](../2026-10-31-scene-input-conflicts/README.md). [corrections.json](corrections.json) contains two complete canon payloads and two complete diagnostic plan payloads, their original and corrected content versions, and hashes identifying the frozen source files. The originals remain unchanged.

## Changes

| Copy | Correction | Preserved |
|---|---|---|
| Rabbit-house canon | Delete the clause describing the house straining around grown Alice | Modest room scale, architecture, source quotes and identity metadata |
| Bank-cellar canon | Delete the permanent wall-tunnel opening | Vault, floor, crates and other recurring features; no permanent floor hole added |
| Grown-house plan 1 | Remove the earlier elbow/arm-around-head pose from the action | The selected arm-out-window/foot-up-chimney instant and all six other scene fields |
| Cellar plan 1 | Choose the later floor-light instant with Holmes's lantern shuttered; replace Merryweather's earlier seated/affronted state with concealment | Cast, setting, composition and the other scene fields |

The two plan copies are manually prepared diagnostic inputs authored by the assistant. Their original `grounding` and `review` are preserved only in the source records: carrying those model judgments onto edited plans would misrepresent what was reviewed. Each copy instead names its selected source quote outside the payload. Alice's character canon, art style, source windows, rendering rules and prompt ownership wording are unchanged.

## Existing correction path

The [owner command](../../workflow/OWNER-CORRECTIONS.md) supports `edit-stage` for canon and `clear-plan` for plans. It deliberately offers no plan-editing command. These files add no command or production import format.

An offline rehearsal used the real `createCorrections` methods and Convex analysis handlers in `convex-test` memory. For each work it loaded the original entries, the affected section and moment, and one retained guide/plan pair, then applied the stage correction with its expected version. [verification.json](verification.json) records:

- A new owner canon version, with the old payload still readable by its original version.
- The retained guide and plan listed as stale because they name the old canon version.
- An identical retry making no change, and a conflicting edit with the old expected version being refused.
- `clear-plan` removing the current plan while preserving its historical payload. Neither manual diagnostic copy was staged.

This is a bounded rehearsal, not a complete dependent inventory. The retained reference manifest has no sheet for either target location; the earlier Holmes rendering diagnostic attached no references. Existing character/style references were not edited. Before any deployment correction, inspect that deployment's actual versions, dependent sheets and pins. An unpinned stale sheet needs replacement; a pinned sheet remains binding until explicitly unpinned. Changing the canon does not repair pixels already generated from it.

For future reader requests, the supported path corrects canon and regenerates affected preparation. A future controlled rendering experiment may use the manual plan copies as declared diagnostic inputs, but must explicitly bind its chosen inputs and references. Their payload hashes alone do not make them valid cached plans for the corrected canon. The original generated guides also contain the audited state cues and are stale after correction; this package does not silently relabel them as fresh.

## Verification and limits

The rehearsal blocked network access and used no deployment client, credentials or model adapter. It made **zero provider calls, zero production mutations and $0 spend**. The source-file hashes still match. Payload comparison confirms only the two stage texts and three plan scene fields changed; removing the old plan judgments is explicit. The selected quotes match the imported source, including the later cellar cue inside the original focal range (¶183–190).

Versions use the existing [content hash](../../../convex/_helpers/contentVersion.ts), not a new identity scheme. The verification packet names the correction file's SHA-256 so its results are tied to these exact copies. The existing correction and analysis suites passed all **25 tests** with `npm test -- --run src/lib/__tests__/corrections.test.ts tests/convex/analysis.test.ts`. No new runner, runtime code, schema, style or production input was added.

These corrections remove demonstrated textual conflicts. They do not establish better images, complete source fidelity or a production-ready analysis. The house's lettering cue, other invented design details and previously recorded model failures remain outside this subtraction. Assessing the separate ownership wording remains a later change, so its effect is not mixed into this package.

Review: GPT-6.1 Sol on xhigh approved all four changed files in one round with no findings, independently recomputing the versions and reproducing the verification packet in memory. CodeRabbit CLI reviewed the three new artifacts with zero findings. Neither review establishes image quality or approves deployment.
