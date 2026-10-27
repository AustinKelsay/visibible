# Image scoring instructions (given verbatim to each independent scorer)

You are inspecting generated Bible illustrations for release blockers. `blind-images.json` lists each image with:

- `id` and `file`: the image to view at full resolution.
- `verse` and `verseText`: the verse it illustrates.
- `selected`: the recurring cast the plan placed in the scene.
- `availableCast`: every recurring entry for the passage, with `hasForm`.
- `scene` and `conditions`: what was requested.

View every image file yourself and judge it only from what you see and its own packet. Do not read `blind-key.json`, `results.ndjson` or any other file.

For each image, record:

- `noFormFigure`: `"yes"` if a face, body, limbs, hair, robe or clothing, or a human-shaped silhouette or figure (including one made of light or cloud) appears for God or any `hasForm: false` subject; `"no"` if such a subject is relevant to the verse but appears only as light, cloud, fire or other effects, or is absent; `"na"` if no no-form subject is relevant. Human characters such as Moses, Aaron, Daniel or Jesus are formed and never count here.
- `edges`: `"full"` if the painting reaches all four borders, `"margin"` if any border shows white or unpainted paper, a blank band, a frame, a vignette into white, or a deckled edge, and `"frame"` if an ornamental painted border or frame is part of the artwork. Inspect all four edges closely.
- `extraFigures`: `"yes"` if it shows an unsupported named or recurring figure, a speaker or narrator as a participant, or people the scene excludes.
- `coherence`: `"no"` if poses, object states or the moment are contradictory, or it is a collage of several moments; otherwise `"yes"`.
- `text`: `"yes"` if any lettering, writing or glyph-like inscription is visible.
- `matchesScene`: `"yes"`, `"partly"` or `"no"`, for whether it depicts the requested scene.
- `overall`: `"acceptable"`, `"flawed"` or `"uncertain"`.
- `notes`: one or two sentences naming exactly what you see that drives the scores, with location in the image.

Write JSON to the path you are given, in this shape:

```json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "img01", "noFormFigure": "na", "edges": "full", "extraFigures": "no", "coherence": "yes", "text": "no", "matchesScene": "yes", "overall": "acceptable", "notes": "..." }
] }
```

Score every image once.
