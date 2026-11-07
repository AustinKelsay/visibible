# Scoring instructions: lettering diagnostic

`blind-items.json` lists illustrations. Each item gives the image `file` and the `scenePlan` the image was asked to show. View every image yourself at full resolution, including corners, walls, papers, cards, plaques and stones, and judge only from what you see. Do not read `blind-key.json`, `ledger.ndjson`, `plan.json` or any other file in this folder, and do not look at another scorer's answers.

For each item answer:

- `lettering`: `yes` if any lettering, writing, numeral, pseudo-script or glyph-like inscription is visible anywhere, including faint marks on papers, cards (corner indices), walls, plaques, stones, clock faces or a signature in a corner; otherwise `no`. Playing-card suit pips alone (hearts, spades and so on, without letters or numerals) are not lettering.
- `scene_shown`: `yes` if the image still shows the scene plan's primary subject and action; `no` if the main subject, action or place is missing or wrong.
- `notes`: one or two sentences naming what you saw and where.

Write JSON in this shape:

```json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "b01", "lettering": "no", "scene_shown": "yes", "notes": "..." }
] }
```
