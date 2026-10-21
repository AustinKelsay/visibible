# Retained reference-input audit — 21 October 2026

**No visual correction is established.** This offline follow-up to [the v3 Daniel pilot](../2026-10-21-daniel-schema-pilot/README.md) verifies which images were actually attached, separates observations from hypotheses, and adds one controlled evaluation input. It makes no paid call, generates no image and mutates no production record. Public generic admission remains disabled; [#183](https://github.com/AustinKelsay/visibible/issues/183) stays open.

## Exact inputs and observed limits

The [audit](audit.json) binds the full-resolution originals below to the pilot's preflight and actual provider requests by storage ID, version, byte count and SHA-256. These are already retained fixtures; no reference was cropped, retouched or replaced. Classical attached no reference. Watercolor and Icon each attached one style reference and no character sheet; no no-form sheet was sent.

| Attached reference | Full-resolution observation | What that establishes |
| --- | --- | --- |
| [Icon](../2026-10-20-watercolor-edge-check/fixtures/bible-icon-control.jpg) | One continuous landscape, filling the frame. It has no repeated scene panels. The buildings include domes with cross-shaped marks. | The [three-panel Daniel output](../2026-10-21-daniel-schema-pilot/outputs/daniel-7-9-ancient-of-days/generic-icon-1.jpg) does not directly copy a triptych from this reference. Influence from the style or image conditioning remains a hypothesis; the architecture also deserves era/symbol review. |
| [Watercolor](../2026-10-20-watercolor-edge-check/fixtures/bible-watercolor-3.jpg) | Irregular white paper margins surround the painted scene. | The input conflicts with the required full-frame presentation despite its original checker pass. This was already [calibrated and noted](../2026-10-20-watercolor-edge-check/README.md); neither the note nor the revised checker removed the original reference. |

The captions already instruct the image model to copy rendering, palette and texture, while ignoring subject, landscape and layout. The prompt already forbids split panels and paper margins. Adding those same prohibitions again would not resolve an absent instruction.

The earlier [nine-image Watercolor underwash trial](../2026-10-20-engine-funded-evaluation/README.md#watercolor-correction-rejected) omitted every style reference **and changed the rendering text**. Eight outputs had clear paper margins; one was ambiguous. It proves that omitting this reference together with that particular style change was insufficient. It does not isolate reference influence or prove that a corrected reference, unchanged-style omission or different rendering would succeed.

Classical's ambiguous cloth-like radiance occurred without any reference image. The unchanged WEB source mentions white clothing and wool-like hair, the assigned no-form canon describes a glow “like white wool”, and the plan describes radiance “pouring like wool”. Those are plausible competing cues beside the explicit unoccupied seat and binding no-body constraints. This audit does not assign causation, alter the quotation/canon/plan, or reclassify ambiguous shapes as definite bodies. Style-reference omission cannot test the reference-free Classical result.

## Controlled next experiment

`npm run evals:images -- --omit-style-reference` now offers a **generic evaluation control**, paired with a new run name. Normal assembly first selects the available references and applies the normal 8,000-character trim decisions. The control then removes only the selected style image and its caption, renumbers the remaining captions and updates the quote. It never fills the freed slot with another sheet or restores trimmed context. Registered style, brief, source text, canon, look, plan, remaining sheet bytes and versions stay fixed for fixed input availability. Ordinary generation has no public option for this control.

The setting is recorded in state, dry-run manifest, each generic sample, packet flags, report and visible contact/comparison headers. Historical runs without it mean normal selection. A configured run, including an empty saved dry run, or a run with any completed/failed sample cannot switch settings on resume; a new run is required. Dry runs save their configuration but make no provider calls. Classical or a packet already lacking a style reference has identical prompt text under either setting, so it supplies no reference contrast.

Before any future paid comparison, preflight both modes against the same records, verify an actual style reference exists in the normal arm, freeze the look/plan/canon/style and remaining references, and use distinct runs with matched cases, repeats and image settings. Keep the registered style unchanged and do not combine `--style-file` with this first diagnostic contrast. Inspect every output for both the intended presentation criterion and depiction rules; retain failures and ambiguous results. This is a diagnostic comparison, not a release candidate or a promise to improve images.

For the smallest Daniel presentation contrast, two styles × two modes × three repeats require **12 new images**, roughly **$0.43** at the harness's $0.035 image and two × $0.0005 preparation estimates. The actual CLI [normal](manifest.normal.json) and [omission](manifest.omitted.json) dry runs each plan six images for $0.216 and report `withinBudget: false` against the existing remainder. Their budget fields compare each plan to that same remainder; they are not two independent allowances. A separately recorded combined hard cap must allow usage variance and any preparation. The existing evaluation allowance has only **$0.06641160** after its uncertainty reserve, so this audit executes none of those calls and does not move money from the separate preparation/smoke buckets. A dry-run budget is a costing parameter, never new spending authorization. The full matrix remains **236/324** with missing and failed evidence; no image here fills it.

## Offline verification

```sh
npx tsx llm/releases/2026-10-21-reference-input-audit/verify.mts
npm test -- --run src/lib/__tests__/engine-prompt.test.ts src/lib/__tests__/image-evals-generic.test.ts src/lib/__tests__/image-evals.test.ts
```

The verifier compares fixture bytes to the exact sanitized provider attachments, reconstructs all three original prompts and packets byte-for-byte through the current default builder, and derives the three **unsent** omission packets. It also verifies that the earlier trial changed style versions and omitted style references. `audit.json` is derived with `verify.mts --write`, which remains offline. Run these comparisons at this implementation's revision; later deliberate builder/style changes may require their recorded revision. The original pilot evidence and its hashes are unchanged.

Tests additionally exercise actual evaluation assembly with controlled providers: remaining sheet bytes and versions, shared preparation, registered style, recomputed quote, truthful headers, no sheet backfill, preserved trim decisions, absent-reference/Classical cases and resume refusal before calls. They establish the control's behavior, not model obedience. Human visual/likeness acceptance, actual-app accounting and latency, the explicit public switch and first-24-hour follow-up remain release gates.
