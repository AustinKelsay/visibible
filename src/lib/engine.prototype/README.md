# Engine prototype (throwaway; never merged)

Answers [#161](https://github.com/AustinKelsay/visibible/issues/161): run the whole generic engine through a script, from the reading pass to the images, on *The Adventures of Sherlock Holmes* and the Bible, and see whether characters, locations and story sections hold steady at 5 credits and about 10 s.

It chains the map's decisions: the reading pass (branch `prototype/reading-pass`, run here over Genesis, Matthew and Acts too, then merged over seven books), canon drafted per #158 with the #159 fixes, section looks, scene plans per moment, reference sheets on Nano Banana 2 Lite with the hard-fault check, style references from template v2, and one prompt per image built from engine rules, the work brief (struck lines removed), canon, section look, scene plan, style brief and up to three reference images.

Output for the owner is in [`../engine.prototype-output/`](../engine.prototype-output/): `review.html`, `results.json`, one `contact-<set>.jpg` per proof set, and every image under `images/`, `sheets/` and `style-refs/`. The evidence directory preserves the public-domain work inputs, consumed analyses, reading-pass scripts, model responses and cost ledgers. Credentials are excluded.

## Verdict and scope

The owner accepted the proof and Q80–Q85 on 2026-10-19. The authoritative decisions are in the resolution of [Does the whole engine hold up on Sherlock Holmes and the Bible?](https://github.com/AustinKelsay/visibible/issues/161). This branch is an archive of the experiment, never an implementation branch to merge.

See [the evidence summary](../engine.prototype-output/evidence/summary.json) for audited counts and spend. All 62 moment images succeeded, with image-call latency averaging 5.51 seconds and a maximum of 8.9 seconds. There were **14 Icon images**, of which two showed borders, and **32 usable sheets plus one withheld God sheet**. The withheld sheet was sent to no moment image. The earlier review's 24-Icon denominator and 33-usable-sheet count were incorrect.

Image latency excludes scene planning and section-look preparation. The 32 final plans averaged 2.96 seconds, with a maximum of 5.9 seconds. The two canon-only images took 5.1 seconds (Luke) and 3.6 seconds (Holmes); their planning was also precomputed. A cold end-to-end request was not benchmarked. Credits in the output are calculated from provider cost, not observed production charges.

The engine ledger totals $3.71870765. Ten additional reading calls cost $0.081178, bringing this ticket to $3.79988565, or **$3.80**. The earlier $4.03 ticket estimate counted the prior reading prototype again. The map total is approximately **$7.27 of $10**, using the previously reported $3.47 subtotal. Resolving the ticket incurred no additional model spend.

The approved followups are requirements for the implementation: `has_form: false` suppresses sheets for entries whose depiction rule forbids a body; sheet and scene prompts prohibit real actor/public-figure likenesses and canon tradition uses the work's illustrations rather than screen adaptations; moment images receive no inline vision check; Haiku plans once per moment and shares the plan across styles; empty reading results retry with a coarser division target. These changes have **not** been rerun or validated by this archive. In the experiment, the God sheet was withheld manually and Matthew's coarser retry was initiated manually. The proof covers Genesis 1:3 and Red Sea depictions, not a separate angel test.

## Inspect without paid calls

Open `../engine.prototype-output/review.html` directly. It uses relative paths to all the saved images and needs no server or API key. `results.json` retains the engine-only report; `evidence/summary.json` adds the reconciled reading costs and corrections. `evidence/sha256.json` records the archived input and ledger hashes.

The original scripts retain this machine's default paths. To inspect their inputs on another checkout, point `RP_DATA` at the archived `evidence/reading-pass` directory and `RP_SCRIPTS` at `evidence/reading-pass-scripts`. Paid reruns require Python 3, ImageMagick at `/opt/homebrew/bin/magick`, the reading-pass dependencies, a separate writable `ENG_DATA` directory and `OPENROUTER_API_KEY` or `OR_ENV_FILE`. Preserve the archived outputs before rerunning. The two reused style references came from `prototype/reference-sheets`; their final JPEGs and provenance are preserved in this output.

CodeRabbit reviewed the 14 engine source/documentation files before archival and raised one minor issue: `llm.call_all` exits if any worker fails, so callers may never save other successful paid results into their aggregate JSON files. Raw responses remain in `runs/`, but rerunning does not restore them automatically and can pay again. This is retained as a known limitation of the original experiment. A production implementation must checkpoint successful work and resume it without duplicate spend. See [the review note](../engine.prototype-output/evidence/review.md).

## Files

| File | What it does |
| --- | --- |
| `common.py` | Loads the works and the reading-pass analyses (merged casts with eras, sections, Holmes moments), the style library, each work's style set, the proof sets, engine rules and the struck-rule filter on the brief. |
| `canon.py` | Canon entries for every entry on stage in a proof section (one Haiku call each), with quote checks and the stage cap in code. |
| `looks.py` | Section looks for the proof's story sections. |
| `plans.py` | Scene plans per moment in the production plan shape, shared by every art style. |
| `sheets.py` | Reference sheets for recurring entries (2+ sections) on Nano Banana 2 Lite, hard-fault check, three tries; `--recheck` re-runs only the check. |
| `stylerefs.py` | Style references per style per work from template v2 (two copied from `prototype/reference-sheets`, two made here). |
| `generate.py` | Builds each image prompt and generates on Nano Banana 2 Lite with timing; `--dry` prints prompts. |
| `report.py` | `results.json`, contact sheets and `review.html`. |
| `images.py`, `llm.py`, `orclient.py`, `work_format.py` | Copied from the reference-sheets prototype (ledger at `ENG_DATA=/Users/plebdev/eng-data-20261019`, cap `ENG_SPEND_CAP`). |

## Re-running

```
# reading pass, from the reading-pass prototype directory (RP_DATA holds the works and analyses):
python -I read_divisions.py $RP_DATA/inputs/bible-web.json main target:18 GEN ACT
python -I read_divisions.py $RP_DATA/inputs/bible-web.json main target:24 MAT      # target:18 returned no sections twice
python -I merge.py $RP_DATA/inputs/bible-web.json main groups GEN EXO 1SA MAT LUK JHN ACT
# then here:
python -I canon.py && python -I looks.py && python -I plans.py
python -I stylerefs.py && python -I sheets.py
python -I generate.py && python -I report.py
```
