# Scoring instructions (given verbatim to each independent scorer)

You are scoring stored scene plans for a Bible illustration engine. Each packet in `blind-packet.json` describes one illustration that would be drawn for one verse. Score each packet independently, using only its own contents. Do not read `blind-key.json`, `results.ndjson` or any other file in the directory.

Each packet contains:

- `source`: the verse (`moment`) and its neighbors (`previous`, `next`).
- `section`: the passage title and bounds.
- `cast`: every recurring character, group, location, object or no-form presence available in the section, with its fixed canon. `hasForm: false` means it has no body and may appear only as permitted effects such as light or cloud.
- `selected`: the cast entries the plan says appear.
- `fields`: seven scene fields describing the single image.
- `conditions`: the place, time of day, weather, light and situational clothing passed to the renderer.

Label each packet:

- **acceptable**: the image described would be a faithful, coherent illustration of this verse.
- **flawed**: at least one concrete defect, each quoted exactly from `fields` or `conditions`.
- **uncertain**: a reasonable reader could go either way. Explain why.

Defects include:

- An instant or cast identity the source does not support, such as a named person substituted for a generic role.
- Depicting an available cast entry that `selected` does not include. Generic unnamed people, crowds, props and scenery are fine when the source supports them.
- Framing figures: the speaker, author, narrator or prophet who merely reports, writes or sees, shown as a participant in what is reported.
- Cast from a separate event, earlier or later than the chosen instant.
- A body, face, hair, clothing, silhouette or human-shaped figure for a `hasForm: false` subject.
- Contradictory poses or object states, more than one moment (collage), or text or lettering in the scene.
- Restating fixed canon appearance or naming an art style.
- `conditions` that contradict the source, the scene fields or each other. Examples: soldiers in clothing for a figureless scene, night conditions for a midday scene, or several places spanning the whole section. Set `lookContradiction: true` for these.

Poetic, prophetic and legal verses may be illustrated symbolically or with a representative scene; judge whether the choice is faithful and coherent, not whether it is the one you would pick.

Write JSON to the file path you are given, in exactly this shape:

```json
{ "scorer": "<your name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "p001", "verdict": "acceptable|flawed|uncertain", "reason": "<one or two sentences>", "lookContradiction": false,
    "defects": [ { "quote": "<exact substring of a fields or conditions value>", "reason": "<why>" } ] }
] }
```

Every packet ID must appear once. `acceptable` requires an empty `defects` list and `lookContradiction: false`; `flawed` requires at least one defect. Each `quote` must be an exact substring of one `fields` or `conditions` value.
