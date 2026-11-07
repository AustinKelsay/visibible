# Suite scoring instructions: image tier (faults 2026-10-30-faults-v1)

Your items file lists illustrations. Each item gives the image file, the moment's text, the work's depiction rules, the cast its plan selected (with `neverDrawn`, any selected subject that may never be drawn as a figure), the scene it asked for, and under `accepted` any fault its style accepts. View every image file yourself at full resolution and judge only from what you see and its own item. Answer only the faults the item's `ask` lists. Do not read `key.json` or any other file in the run folder, and do not look at another scorer's answers.

For each item, answer every fault below with `yes` (the fault is present), `no` or `na` (it cannot apply), then give one `overall` verdict: `acceptable`, `flawed` (any fault present that the item does not list under `accepted`) or `uncertain`, and `notes`: one or two sentences naming what drives your answers, with where you saw it.

- `lettering` (lettering): Is any lettering, writing, numeral or glyph-like inscription visible, including marks on scrolls, signs, labels, cards, halos or in a corner?
- `painted_frame` (painted frame): Is an ornamental painted border or frame part of the artwork?
- `unpainted_edge` (unpainted edge): Does any edge or corner show white or unpainted paper, a blank band, a vignette into white or a deckled edge? When the item lists it under `accepted`, record it, but it does not make the item flawed.
- `extra_figures` (extra figure): Does it show a prominent figure the selected cast and scene do not ask for, such as a narrator, a speaker inside their own words, or a named figure that was not selected?
- `incoherent` (incoherent): Is it a collage of several moments, or are poses, objects or places contradictory?
- `scene_mismatch` (scene not shown): Does it fail to show the scene it asked for: the wrong subject, action or place?
- `anatomy` (anatomy): Are there malformed or extra limbs, hands or faces?
- `rule_violation` (depiction rule broken): Does it break one of the item's depiction rules, or show gore, sexual content, a caricature of a people, or the likeness of a real actor or public figure?
- `effects_figure` (unseen subject drawn): Is a subject listed in neverDrawn shown with a face, body, limbs, robe or a human-shaped figure, including one made of light or cloud? Answer `na` when the item lists no subject without form.

Write JSON to the path you are given, in this shape:

```json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "i001", "faults": { "lettering": "no", "…": "…" }, "overall": "acceptable", "notes": "..." }
] }
```

Score every item you are given exactly once, answering every fault.
