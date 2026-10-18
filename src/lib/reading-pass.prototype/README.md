# Reading-pass prototype (throwaway; never merged)

Answers [#157](https://github.com/AustinKelsay/visibible/issues/157): does an LLM reading pass find story sections, casts, moments and a work brief good enough to build on? It implements the decisions in #153 (parts then merge, Claude Haiku 5.5), #154 (one imported file per work; moments) and #155 (work brief shape; the single-character/chapter check).

Everything here is Python with no dependencies beyond `segeval` (for the B metric). It adapts the scripts on the research branch `research/whole-work-reading` (`llm/research/2026-10-18-whole-work-reading/scripts/`). Output for the owner is in [`../reading-pass.prototype-output/`](../reading-pass.prototype-output/): `review.html` (open it in a browser; no server), `results.json`, `scores.jsonl`, `spend.json` and every call's JSON under `calls/`. No source text and no key are written anywhere.

## Files

| File | What it does |
| --- | --- |
| `work_format.py` | The shared work format (#154): metadata plus a tree of divisions over numbered units. |
| `import_web.py` | WEB importer from eBible.org `eng-web_vpl.txt`; folds Romans 14:24–26 into 16:25–27 so ids match the app's 31,102 verses (`genesis-1-1`). |
| `import_gutenberg_holmes.py` | Holmes importer from Gutenberg #1661: story → paragraph (`a-scandal-in-bohemia-12`). |
| `prompt.py` | Prompts and strict JSON schemas: reading pass, one-call merge, grouped merge rulings, work brief, moments. No instruction names anything from a particular work. |
| `llm.py`, `orclient.py` | One schema-bound call to `anthropic/claude-haiku-5.5` (Anthropic endpoint, reasoning off) with a ledger and a hard spend cap (`RP_SPEND_CAP`, default $1.50). The key is read from `.env.local` into the environment only. |
| `read_divisions.py` | One call per large division in parallel; normalises ids, checks coverage, and computes `named` for every on-stage character in code. Granularity: `research` or `target:<units per section>`. |
| `merge.py` | Merge step: `one-call` (Holmes) or `groups` (code groups entries sharing a proper-name form or a `same_person_as` link; the model rules per group). Then drafts the work brief and assigns every section to an era. |
| `moments.py` | Prose works only: splits each section into moments of roughly 100–400 words with a one-line "what you'd see"; checks that moments tile the sections. |
| `score_bible.py` | Scores a book against Clear.Bible BSB pericopes (Pk, WindowDiff, B, boundary F1 ±2, section ratio) and STEPBible TIPNR (cast precision all-listed and named-only, recall, major cast, same-name groups). |
| `check_brief.py` | Flags brief lines that name a single character, location, chapter/section or title. |
| `spend.py` | Sums the ledger and verifies every call against OpenRouter's generation record. |
| `build_review.py` | Writes `results.json` and the self-contained `review.html`. |

## Re-running

Downloaded files live outside the repo (default `RP_DATA=/Users/plebdev/rp-data-20261018`: `web/`, `gutenberg/`, `clear/`, `tipnr/`), and scripts run with `python -I`.

```
python -I import_web.py $RP_DATA/web/eng-web_vpl.txt ../../data/bible-structure.ts $RP_DATA/inputs/bible-web.json
python -I import_gutenberg_holmes.py $RP_DATA/gutenberg/pg1661.txt $RP_DATA/inputs/holmes.json
python -I read_divisions.py $RP_DATA/inputs/holmes.json v1 target:18 all
python -I read_divisions.py $RP_DATA/inputs/bible-web.json v1 target:18 EXO 1SA LUK JHN
python -I read_divisions.py $RP_DATA/inputs/bible-web.json t24 target:24 EXO 1SA
python -I merge.py $RP_DATA/inputs/holmes.json v1 one-call all
python -I moments.py $RP_DATA/inputs/holmes.json v1 all
# copy the chosen per-book analysis files to the tag "main", then:
python -I merge.py $RP_DATA/inputs/bible-web.json main groups EXO 1SA LUK JHN
python -I score_bible.py $RP_DATA/inputs/bible-web.json $RP_DATA/clear/pericopes_eng_BSB.tsv $RP_DATA/tipnr/tipnr.txt $RP_DATA/analysis/bible-web__*__{v1,t24,research,control}.json > $RP_DATA/scores.jsonl
python -I spend.py --verify $RP_DATA/spend.json
python -I build_review.py $RP_DATA/inputs ../reading-pass.prototype-output
```
