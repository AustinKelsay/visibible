# Suite scoring instructions: text tier (faults 2026-10-30-faults-v1)

Your items file lists scene plans. Each item gives the moment's text and its same-section neighbours, the work's depiction rules, the section's cast (with whether each member may be drawn), and the plan: the cast it selected and its scene fields. Judge the plan against the moment's text only. Answer only the faults the item's `ask` lists. Do not read `key.json` or any other file in the run folder, and do not look at another scorer's answers.

For each item, answer every fault below with `yes` (the fault is present), `no` or `na` (it cannot apply), then give one `overall` verdict: `acceptable`, `flawed` (any fault present that the item does not list under `accepted`) or `uncertain`, and `notes`: one or two sentences naming what drives your answers, with where you saw it.

- `wrong_moment` (wrong moment): Does the plan draw a different event, instant or place than the moment's text gives, or several instants at once?
- `speaker_in_scene` (speaker inside their words): Is a speaker, writer, narrator or listener put inside a scene their words only describe, or drawn as a figure of their own words?
- `missing_subject` (missing subject): Does the plan leave out a person, group, place or object the moment's text clearly shows in this scene?
- `unsupported_figure` (unsupported figure): Does the plan select or describe a named or recurring figure the moment's text does not put in this scene?
- `rule_conflict` (depiction rule broken): Does the plan contradict one of the work's depiction rules?
- `visible_writing` (writing asked for): Does the plan ask for visible writing: an open scroll, letter or book, an inscription, or a sign or label with words?
- `embodied_effects` (unseen subject given a body): Is a cast member that may not be drawn (mayBeDrawn false) given a body, face, hands, clothing, a seat or throne, or a figure of light? Answer `na` when the item lists no subject without form.

Write JSON to the path you are given, in this shape:

```json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "p001", "faults": { "wrong_moment": "no", "…": "…" }, "overall": "acceptable", "notes": "..." }
] }
```

Score every item you are given exactly once, answering every fault.
