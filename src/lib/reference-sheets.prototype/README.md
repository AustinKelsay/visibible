# Reference-sheets prototype (throwaway; never merged)

Answers [#159](https://github.com/AustinKelsay/visibible/issues/159): can the engine draft reference sheets and style references itself, can a vision model check them in place of the owner, and when should sheets be made? Builds on the reading-pass prototype's outputs (branch `prototype/reading-pass`; data under `RP_DATA=/Users/plebdev/rp-data-20261018`) and implements the decisions in #156 (style references from a fixed template with a look-check) and #158 (canon drafting rules).

Output for the owner is in [`../reference-sheets.prototype-output/`](../reference-sheets.prototype-output/): `review.html` (open in a browser; a button reveals the engine's verdicts), `results.json`, `canon.json`, `sheets-flash.json`, `sheets-lite.json`, `style-refs.json`, and every image under `sheets/` and `style-refs/` (rejected tries kept as `.tryN.jpg`). No source text and no key are written anywhere.

## Files

| File | What it does |
| --- | --- |
| `common.py` | Loads the works and reading-pass analyses, the eleven chosen entries, work-neutral style briefs (#156), and the owner-review hints struck from the briefs. |
| `canon.py` | One Haiku call per entry drafts a canon entry per #158 (kind, stages, ≤500-char prompt text, quotes with unit ids, source), then checks every quote against the work text. |
| `images.py` | Billed image calls (Gemini 3.1 Flash, Nano Banana 2 Lite) and schema-bound vision checks (Claude Haiku 5.5), each appended to the ledger under the spend cap. |
| `sheets.py` | Fixed sheet template per kind (character: three views; location and object: two), vision check against the sheet rules and the canon entry, up to three tries with the failure reasons fed back. |
| `stylerefs.py` | Style references from the fixed template (v1: era objects line; v2: one outdoor scene, no written matter) with the people/frame/text look-check. |
| `report.py` | `results.json`, `review.html`, per-section recurrence counts and the whole-Bible cost and time projection. |
| `llm.py`, `orclient.py`, `work_format.py` | Copied from the reading-pass prototype (ledger at `RS_DATA=/Users/plebdev/rs-data-20261019`, cap `RS_SPEND_CAP`). |

## Re-running

```
python -I canon.py
python -I sheets.py flash            # all stages
python -I sheets.py lite             # the six-sheet comparison set
python -I stylerefs.py               # v1 template, Holmes and Bible × Ink & Watercolor, Byzantine Icon
python -I stylerefs.py holmes--watercolour--v2 holmes--icon--v2 bible--watercolour--v2
python -I report.py
```
