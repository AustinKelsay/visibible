# Joint scoring instructions: image tier (faults 2026-10-30-faults-v1, judged against the text)

Your items file lists illustrations. Each item gives the image file, the moment's text (`text`) with the verse or line before and after it for context, the work's depiction rules, `neverDrawn` (subjects that may never be drawn as a figure) and under `accepted` any fault its style accepts. Judge each image against the moment's text: it should show that moment, with the people and places the text names. View every image file yourself at full resolution and judge only from what you see and its own item. Answer only the faults the item's `ask` lists. Do not read `key.json` or any other file in the run folder, and do not look at another scorer's answers. Never edit, crop or overwrite an image file; if you need a crop, write it to your own scratch folder.

`readable_text` is not a fault of its own: it says how serious any lettering is, so it never changes your `overall` verdict. When you answer `lettering` `yes`, say in `notes` what the marks are.

For each item, answer every fault below with `yes` (the fault is present), `no` or `na` (it cannot apply), then give one `overall` verdict: `acceptable`, `flawed` (any fault present that the item does not list under `accepted`) or `uncertain`, and `notes`: one or two sentences naming what drives your answers, with where you saw it.

- `lettering` (lettering): Is any lettering, writing, numeral or glyph-like inscription visible, including marks on scrolls, signs, labels, cards, halos or in a corner?
- `painted_frame` (painted frame): Is an ornamental painted border or frame part of the artwork?
- `unpainted_edge` (unpainted edge): Does any edge or corner show white or unpainted paper, a blank band, a vignette into white or a deckled edge? When the item lists it under `accepted`, record it, but it does not make the item flawed.
- `extra_figures` (extra figure): Does it show a prominent figure the moment's text does not call for, such as a narrator, a speaker inside their own words, or a named figure who is not in the moment?
- `incoherent` (incoherent): Is it a collage of several moments, or are poses, objects or places contradictory?
- `scene_mismatch` (scene not shown): Does it fail to show the moment the text describes: the wrong subject, action or place?
- `anatomy` (anatomy): Are there malformed or extra limbs, hands or faces?
- `rule_violation` (depiction rule broken): Does it break one of the item's depiction rules, or show gore, sexual content, a caricature of a people, or the likeness of a real actor or public figure?
- `effects_figure` (unseen subject drawn): Is a subject listed in neverDrawn shown with a face, body, limbs, robe or a human-shaped figure, including one made of light or cloud? Answer `na` when the item lists no subject under `neverDrawn`.
- `readable_text`: Is any of that lettering readable writing: real letters, words or numerals, a caption, or a signature in a corner? Answer `no` when the only marks are small or unreadable (pseudo-script, squiggles on a page, clock-face ticks, card pips), and `na` when `lettering` is `no`.

Write JSON to the path you are given, in this shape:

```json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "j001", "faults": { "lettering": "no", "…": "…" }, "overall": "acceptable", "notes": "..." }
] }
```

Score every item you are given exactly once, answering every fault.
