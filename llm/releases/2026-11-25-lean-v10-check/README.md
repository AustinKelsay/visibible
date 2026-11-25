# Lean engine v10 check and paired holdout gate (25 November 2026)

## What changed (`2026-11-25-lean-v10`)

Three targeted prompt improvements in [`src/lib/engine/lean.ts`](../../../src/lib/engine/lean.ts) on top of `lean-v9`:

1. **Tighter `HOW TO READ IT` (~960 → ~550 chars):** cut repetition and nested clauses (~42% shorter) while keeping every told-events and teller-stays-out rule intact, addressing the `incoherent` spike seen in `lean-v8`.
2. **Situational `carried props` in `CANON, NAMED HERE`:** changed *"the moment decides pose, expression, clothing changes and action"* to *"the moment decides pose, expression, clothing changes, carried props and action"* so character-sheet props like Peter & John's fishing nets aren't carried into unrelated settings.
3. **Broader `IMAGERY, NOT FORM (binding)` trigger (`effectsActive`):** emits the empty-throne / unseen-subject rule whenever `formless.length > 0 || workWideNamedInText`, so throne verses like `revelation-4-6` always receive it while human-only sections stay clean.

## Run summary

- **Snapshot:** `2026-11-10-lean-snapshot` (same frozen snapshot as `2026-11-24-lean-v8` and `2026-11-25-lean-v6-holdout`)
- **Cases:** 22 cases / 55 images — all 20 holdout cases (49 images) plus 2 targeted dev checks (`acts-3-7` × 3 styles, `revelation-4-6-living-creatures` × 3 styles)
- **Model & provider:** `google/gemini-nano-banana-2.1` via `--provider gemini-batch` (`batches/vp08r7v0p9apgo935hev4xudv4iwpj2e44cw`)
- **Outcome:** 55/55 images succeeded (0 failures) in 4m 29s (`269s` batch poll)
- **Spend:** `$1.45` (`$1.4495`) under `$2.25` cap

## Targeted dev checks

- **`revelation-4-6-living-creatures` (empty-throne fix):** **3/3 clean** — Classical, Fresco, and Watercolor all show an empty glowing throne with zero figure seated on it (fixing the `lean-v8` Fresco `effects_figure` failure).
- **`acts-3-7` (`carried props` fix):** **2/3 net-free** — Classical and Watercolor show Peter and John at the Temple gate with zero fishing nets (down from 3/3 nets in `lean-v8`); Fresco still echoed the nets drawn on their character sheets.

## Paired holdout gate (`lean-v10` vs `lean-v6`)

The 49 holdout images from `2026-11-25-lean-v10-check` were paired blind against the 49 `lean-v6` holdout baseline images (`2026-11-25-lean-v6-holdout`) in [`2026-11-25-lean-v10-holdout-paired`](../2026-11-25-lean-v10-holdout-paired/) (98 images total, two independent blind scorers plus blind operator adjudication of all 33 disagreements with zoom crops on borderline marks).

**Result: Gate PASSES (11/11 checks pass).**

| Measure (49 holdout images) | `lean-v6` (this pairing) | `lean-v8` (prior pairing) | `lean-v10` (this pairing) |
| --- | ---: | ---: | ---: |
| **Launch bar (small marks accepted)** | **73%** (36/49) | 67% (33/49) | **80%** (39/49) |
| **Strict acceptable** | **61%** (30/49) | 49% (24/49) | **69%** (34/49) |
| Bible launch bar | 89% (24/27) | 81% (22/27) | **85%** (23/27) |
| Holmes launch bar | 75% (6/8) | 75% (6/8) | **75%** (6/8) |
| Alice launch bar | 43% (6/14) | 36% (5/14) | **71%** (10/14) |
| `readable_text` | 0/49 | 0/49 | **0/49** |
| `effects_figure` | 0/9 | 0/9 | **0/9** |
| `incoherent` | 16% (8/49) | 18% (9/49) | **10%** (5/49) |
| `anatomy` | 8% (4/49) | 8% (4/49) | **2%** (1/49) |
| `lettering` (small marks) | 18% (9/49) | 20% (10/49) | **14%** (7/49) |
| `scene_mismatch` | 2% (1/49) | 4% (2/49) | **2%** (1/49) |
| `extra_figures` | 4% (2/49) | 2% (1/49) | **6%** (3/49) |
| `rule_violation` | 6% (3/49) | 12% (6/49) | **8%** (4/49) |
| `painted_frame` / `unpainted_edge` | 0% / 0% | 0% / 0% | **0% / 0%** |

## Note on Alice canon and future snapshots

Four of `lean-v10`'s 10 launch-bar misses are on Alice (`alice-caterpillar` × 2, `alices-evidence-38`, `alice-croquet-game`) using `2026-11-10-lean-snapshot`, which predates [`2026-11-10-alice-court-fix`](../2026-11-10-alice-court-fix/README.md) and still reads Alice from the old `alice-in-wonderland-v3.json` fixture. Production Convex already holds the updated Alice court canon and sheets; future full-suite runs should take a fresh snapshot from production Convex.
