# Consistency scoring instructions (given verbatim to each independent scorer)

You are judging whether illustrations that should agree with each other do. `pairs.json` lists pairs; each pair is one picture file (`file`) with two illustrations side by side, separated by a grey band. For each pair it gives:

- `kind`: `character` (the same named person should appear in both) or `setting` (both should show the same place).
- `subject`: who or what to compare.
- `question`: what to answer.
- `left` and `right`: what each illustration was asked to show. Use them only to find the subject, for example which figure is Peter.

Both illustrations always use the same art style. View every picture file yourself at full resolution and judge only from what you see. Do not read any other file in the run folder, including `key.json`, and do not look at other scorers' answers.

For each pair, record one `verdict`:

- **Character pairs**
  - `same`: the subject is recognisably the same individual in both images. Judge identity from face shape, hair and beard (colour, length and style), apparent age, skin tone and build. Pose, expression, lighting, distance and the art style's handling may differ.
  - `different`: a clear identity cue conflicts, such as bearded and clean-shaven, grey and dark hair, clearly different ages, or a different face or skin tone. Clothing alone is not enough, because a scene may change it.
  - `unclear`: you cannot judge, because the subject is missing, too small, turned away or hidden in one image, or the description does not single out one figure.
- **Setting pairs**
  - `same`: both images plausibly show the same place, seen at the same occasion: the same kind of land, water, buildings and vegetation, arranged compatibly, allowing for a different viewpoint. When the two descriptions themselves ask for a change between the moments, such as a storm and then the calm after it, or night and then dawn, judge the place itself and not that change.
  - `different`: the places conflict, such as a different landscape, different architecture, a different body of water, or night in one and day in the other when neither description asks for that change.
  - `unclear`: one image shows too little of the place to judge.

When torn between `same` and `different`, choose the one with a concrete visible cue and name that cue. Give `notes`: one or two sentences naming what you compared and where.

Write JSON to the path you are given, in this shape:

```json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "pair001", "verdict": "same", "notes": "..." }
] }
```

Score every pair you are given exactly once.
