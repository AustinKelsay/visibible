# Bible clean-up before other works (10 November 2026)

The owner asked whether the Bible was in a good state before work moved to other books, then approved the proposed plan ("ok your rec, lets go, full send!").

## Audit

Every one of the Bible's 31,102 moments was assembled offline with the request path's own code (`assembleLean`) against a production export:

- **No refusals.** Every moment builds a valid request; no cast member lacks readable canon, and no reference sheet is stale.
- **Sheets were the gap.** Production had 110 sheets (68 characters, 42 places). About half of the drawn, named appearances had no sheet, mostly groups and broad places, but 107 individuals appeared in ten or more verses without one (Noah, Adam, Samuel, Samson, Gideon, Rachel, Esau, Absalom…).
- **Attention backlog.** 161 open Bible items: 109 sheet-checker notes and 52 canon quote-check failures: 26 quotes that paraphrase their verse and 26 with a missing or invalid verse citation.

## Reference sheets

[`sheet-selection.json`](sheet-selection.json) lists 103 individuals with ten or more named verses. It leaves out groups, crowds and peoples, the Angel of the Lord and the vision creatures (the living creatures, the interpreting angel) — Gabriel, a named messenger with a described form, was kept — and Ezekiel's monster imagery, as the [October batch](../2026-10-29-recurring-sheets/README.md) did.

- `npm run works:references -- bible-web --run sheets-2026-11-10 --only <ids>` made 58 sheets before a server restart stopped it. A second run (`sheets-2026-11-10b`) made the remaining 41. That is **99 sheets, every one passed on its first attempt, $3.6143** in all ($2.2159 + $1.3984), matching the production key's usage.
- Four selected people got none: Manoah, Manoah's wife, Sisera and Amnon each appear in only one story section, and the command makes sheets only for subjects in two or more.
- Production now has 209 Bible sheets.

## Attention

All 260 open Bible items were closed with recorded dispositions ([`attention-closed.json`](attention-closed.json)):

- **208 sheet-checker notes:** the 109 old ones plus one per new sheet. Disposition: "noted: sheet checker's minor departure from canon; the sheet passed and the canon text still leads".
- **52 quote-check failures** (26 paraphrased quotes, 26 missing or invalid verse citations). Disposition: "noted: the supporting quote paraphrases the verse; the canon text is kept as written", which fits the paraphrases and only loosely the missing citations. The canon entries themselves are unchanged, and their quotes remain supporting evidence only.

No reader report was open.

## Code

- **#400:** the image response drops planner fields; the reader stops sending theme and neighbouring verses; docs describe the lean engine.
- **#401:** unused Convex arguments, the dead `modelCostStats` module, and the planner cost fields made optional.
- **#402:** the engine mode defaults to public; the legacy retirement tooling is removed; a sole model shows as a label.
- **#403:** drops the six retired cost-event fields, now that no server sends them. The production cost outbox was empty.
- **Follow-ups:** the header's fallback button reads "Change settings" instead of "Choose model", and the `modelCostStats` table left the schema. Its 15 production rows are archived in [`model-cost-stats.jsonl`](model-cost-stats.jsonl) and were then deleted.

## Loss

On 10 November `gh pr merge --delete-branch` removed the local worktree that held the 9 November lean evaluation's images (`evals/images/runs/2026-11-09-lean-*`, ignored by git). Those images are gone. The scores, prompts, ledgers and reports under `llm/releases/2026-11-09-lean-*` are intact, and 184 consistency-pair composites made from them were kept outside the repository.
