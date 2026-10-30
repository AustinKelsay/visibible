# Reference sheets for the most frequent recurring cast

**Production now has reference sheets for 110 recurring characters and places, up from 6.** This run made 104 sheets: 62 characters and 42 places. All passed the sheet check. They took 113 attempts (8 retried, at most 3) and cost **$3.84662575** of preparation spend. Sheets now serve 53% of recurring appearances (4,401 of 8,280 section appearances), up from 11%.

## Why

- **Almost nothing had a sheet.** The active Bible analysis has 777 sheet subjects, one per entry and stage present in two or more story sections. Production had sheets for 6 of them: Jesus as an infant, child and adult, Moses, Simon Peter and young David.
- **Sheets are what keep a character recognisable.** In the [first full consistency measurement](../2026-10-29-consistency-verses/README.md), characters with a sheet showed the same person in 76 of 83 judged pairs (92%). Daniel, without one, matched in 3 of 12. [ADR 0009](../../../docs/adr/0009-reference-priority-over-a-shared-place.md)'s A/B found the same: sheet-backed characters agreed in 7 of 7 pairs, and sheetless Daniel in 0 of 4.
- **Authorisation.** The owner approved the recommendation ("ok continue with your recs", 29 October): make sheets for about the 100 most frequent subjects, skipping crowds and groups.

## Selection

[selection.json](selection.json) ranks every subject by the number of story sections that cast it. It takes the missing ones among the top 160, then skips 52 of them:
- **Crowds and groups (32):** for example the Twelve as a collective, the Israelite people, the crowds in each Gospel, the Pharisees and the Egyptians. A single figure on a sheet cannot stand for a crowd.
- **Abstract places or whole regions (17):** for example "under the sun", the earth, heaven, Egypt, Canaan and Galilee. One picture would over-constrain them.
- **Never drawn (3):** the author of 1 John, and two angelic figures listed as objects.

The 104 kept include Paul, King David, Aaron, Solomon, Isaiah, Daniel, Jerusalem, the temple, Mount Sinai, the Sea of Galilee and Babylon.

## Run

- **Command:** `npm run works:references -- bible-web --run sheets-2026-10-29 --budget 6.00 --only <the chosen ids>`. It used the production environment, made each sheet in Classical, checked it, and stored it.
- **When production changed:** 30 October from 00:47:57 to 01:03:48 UTC ([window.json](window.json)). An image made after that window can receive these sheets.
- **Records:** the run state is in [references-state.json](references-state.json) and its output in [run.log](run.log).
- **Canon notes:** the checker filed 436 canon notes as open attention items, about four per sheet. They record where a sheet departs from its canon text, and never fail a sheet.
- **Spot check:** the operator viewed the sheets for Daniel, Paul, King David, Aaron and Jerusalem. Each shows clean views on a plain ground, with no text.

## Limits

- **Sheets and canon text can disagree.** Daniel's sheet shows grey cropped hair. His canon text says "dark hair cropped close" for a man who grows from a youth into a "graying elder", and in Daniel 6:22 the image followed the text ([Daniel re-check](../2026-10-29-daniel-recheck/README.md)).
- **One stage spans a lifetime or a history.** Daniel has one stage from youth to old age, and Jerusalem one sheet across a thousand years, so its temple may appear in eras before it was built.
- **667 subjects still have no sheet.** Making them all at one attempt each would cost about $30.
- **Sheets are always Classical.** As ADR 0009 keeps them, they serve every style.
