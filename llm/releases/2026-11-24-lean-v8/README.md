# Lean engine v8: told-events structure & unseen-presence prompt, on Gemini Batch

**`lean-v8` improves image acceptability (71% vs 63% strict; 78% vs 75% launch bar; 73% vs 65% holdout launch bar), slashes extra figures by two-thirds (3% vs 9%; 0/49 on holdout), cuts lettering in half with zero readable text (0/206), halves unseen-subject violations (1/42 vs 2/42), and achieves 100% character consistency across all three works (132/132) while cutting full-suite run cost by 38% to $5.51 via Gemini Batch API.**

The formal holdout image gate **fails on one metric (`incoherent`: 7/49 vs 3/49 baseline, allowed +2.45)**, likely reflecting a mix of stricter single-arm blind scoring on subtle prop/physics defects and genuine recurring prop/staging issues (e.g., Temple fishing nets, Goliath spears, Alice card/croquet glitches). The Bible consistency gate **passes** (100% character, 93% setting).

## What changed

- **Prompt (`lean-v8`):** Reorganized the lean prompt in [`src/lib/engine/lean.ts`](../../../src/lib/engine/lean.ts) with the told-events structure and unseen-presence framing (preventing narrators/speakers from being drawn inside their own spoken words and tightening unseen-subject rules).
- **Cheaper evaluation (`--provider gemini-batch`):** Added Gemini Files API + `batchGenerateContent` support ([`gemini-batch.ts`](../../../src/lib/image-evals/gemini-batch.ts), [`lean.mts`](../../../scripts/evals/lean.mts)), uploading the 43 unique reference JPEGs once and running `models/gemini-nano-banana-2.1` at the 50% batch discount.
- **Single-arm scoring support:** Extended `lean.mts blind` and `lean.mts report` so a candidate run can be scored blind on its own and compared against a baseline's committed settled scores (`2026-11-09-lean-engine`, `lean` arm) when baseline images are no longer on disk.

## Image quality

All 206 candidate images (79 cases across 3 works in their configured styles, identical snapshot and suite `2026-11-01-suite-v3` to [`2026-11-09-lean-engine`](../2026-11-09-lean-engine/)) were shuffled into a single-arm blind pack (`j001`–`j206`) and scored by two independent blind scorers across 6 batches, with 29 disputes (86% raw unanimity) adjudicated blind at full resolution ([rulings](scoring/operator.json)).

| Work | Baseline (`2026-11-09` lean) | `lean-v8` | Baseline, small marks accepted | `lean-v8`, small marks accepted |
| --- | --- | --- | --- | --- |
| Bible (3 styles) | 113 of 144 (78%) | **119 of 144 (83%)** | 119 (83%) | **122 (85%)** |
| Holmes (2 styles) | 10 of 30 (33%) | **15 of 30 (50%)** | 21 (70%) | **25 (83%)** |
| Alice (2 styles) | 7 of 32 (22%) | **12 of 32 (38%)** | **15 (47%)** | 13 (41%) |
| **All (206)** | 130 of 206 (63%) | **146 of 206 (71%)** | 155 (75%) | **160 (78%)** |
| **Holdout (49)** | 24 of 49 (49%) | **29 of 49 (59%)** | 32 (65%) | **36 (73%)** |

Zero images had `readable_text: "yes"` (0 of 206), so all 14 lettering-only flawed images were small unreadable marks (pseudo-script squiggles on papers/newspapers, card pips, clock tick marks) and no `small-marks.json` classification was needed.

### Fault breakdown (all 206 images & 49 holdout)

| Fault | Baseline (all 206) | `lean-v8` (all 206) | Baseline (holdout 49) | `lean-v8` (holdout 49) | Holdout gate |
| --- | --- | --- | --- | --- | --- |
| Refused | 0 (0%) | **0 (0%)** | 0 (0%) | 0 (0%) | PASS |
| Lettering | 51 (25%) | **24 (12%)** | 17 (35%) | **10 (20%)** | PASS |
| Painted frame | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | PASS |
| Unpainted edge (unaccepted) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | PASS |
| Extra figure | 18 (9%) | **6 (3%)** | 5 (10%) | **0 (0%)** | PASS |
| Incoherent | **7 (3%)** | 29 (14%) | **3 (6%)** | 7 (14%) | **FAIL** (+4 > 2.45) |
| Scene not shown | 2 (1%) | 3 (1%) | 1 (2%) | 2 (4%) | PASS |
| Anatomy | 6 (3%) | 8 (4%) | 3 (6%) | 4 (8%) | PASS |
| Depiction rule broken | 21 (10%) | **12 (6%)** | 7 (14%) | **5 (10%)** | PASS |
| Unseen subject drawn (`effects_figure`) | 2 of 42 (5%) | **1 of 42 (2%)** | 0 of 9 (0%) | 0 of 9 (0%) | PASS |
| Not acceptable (strict) | 76 (37%) | **60 (29%)** | 25 (51%) | **20 (41%)** | PASS |

### Key quality findings

- **Told-events worked decisively on extra figures:** Extra figures dropped from 18 (9%) to **6 (3%)** overall and from 5 (10%) to **0 of 49** on holdout.
- **Unseen subjects (`effects_figure`): 1 of 42 (2%) vs 2 of 42 (5%).** Both prior failures (`daniel-7-9/watercolor` and `isaiah-6-2/fresco`) drew empty thrones cleanly; only `revelation-4-6-living-creatures/classical` (`j156`) drew a robed figure seated on the throne (0/9 on holdout).
- **Zero readable lettering (0/206):** Total lettering fell from 51 (25%) to 24 (12%), with zero readable words, captions, or signatures anywhere in the suite.
- **Why `incoherent` failed the holdout gate (7/49 vs 3/49; 29/206 vs 7/206):**
  1. **Single-arm scoring calibration caveat:** Because `2026-11-09` baseline images were no longer on disk, `lean-v8` was scored standalone rather than shuffled against baseline images in the same pack. The `lean-v8` blind scorers inspected 1376×768 images closely and flagged subtle prop/physics defects (e.g., stray shoe under a table, duplicate blank tag on Alice's wrist, tangled background hoist ropes, off-rail locomotive, double-pointed/floating spears).
  2. **Genuine recurring patterns worth fixing:** `acts-3-7` (classical & fresco) drew Peter and John carrying fishing nets inside the Jerusalem Temple; `1-samuel-17-49-sling` (all 3 styles) drew duplicate/floating/double-headed spears; `daniel-6-23` (classical & fresco) drew disconnected pit ropes; `holmes-eyford-smoke` (both styles) had train-on-no-tracks glitches; and Alice card soldiers still frequently draw human heads/hats on card tabards (10 rule violations across 32 Alice images).

## Consistency

182 pairs across all 3 works (108 Bible, 40 Holmes, 34 Alice) were pooled, shuffled, and judged blind by two independent scorers; 4 disputes (98% unanimity) were adjudicated blind at full resolution ([Bible](consistency/lean/bible-web/operator.json), [Holmes](consistency/lean/holmes-adventures/operator.json), [Alice](consistency/lean/alice-in-wonderland/operator.json)).

| Work | Character (`2026-11-09` lean) | Character (`lean-v8`) | Setting (`2026-11-09` lean) | Setting (`lean-v8`) | Gate |
| --- | --- | --- | --- | --- | --- |
| **Bible** (served) | 108/111 (97%) | **78/78 decided (100%, 3 unclear)** | 24/27 (89%) | **25/27 (93%)** | **PASS** |
| Holmes | 49/50 (98%) | **32/32 (100%)** | 3/6 (50%) | 2/6 decided (33%, 2 unclear) | FAIL (<20 setting pairs; Eyford fire) |
| Alice | 21/22 (95%) | **22/22 (100%)** | 7/12 (58%) | **8/12 (67%)** | FAIL (<30 char / <20 setting pairs) |
| **All works** | 178/183 (97%) | **132/132 decided (100%)** | 34/45 (76%) | **35/45 (78%)** | — |

## Cost and method

- **Total spend: $5.512** (`$5.457565` for 205 images via Gemini Batch job `batches/uislgml1t8asr19ewkjsr68plys834nfl6r8` at 50% batch pricing + `$0.054428` for 1 live Gemini Direct retry of `alice-refuses-to-leave/watercolor`, which hit a content filter in the batch run; `uncertainUsd: $0`).
- **38% cheaper than `2026-11-09` ($8.873 on OpenRouter)**, and **$0 out-of-pocket** (covered by monthly Google AI Ultra credits).
- **Records:** [plan.json](plan.json), [funding.json](funding.json), [ledger.json](ledger.json), [ledger-2.json](ledger-2.json), [results.ndjson](results.ndjson), [report.json](report.json), [scoring/](scoring/), [consistency/](consistency/).
