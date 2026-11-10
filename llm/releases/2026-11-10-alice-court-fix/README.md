# Alice's card rule corrected to the book (10 November 2026)

After the [quality phase](../2026-11-10-holmes-alice-quality/README.md) the owner said "ok continue" to its proposed next steps, the first of which was correcting Alice's card rule. Alice is still not served to readers.

## What changed

- **Brief** (`works/alice-in-wonderland/brief.json`, now `a36ed3d1…`): "The Queen's soldiers, gardeners, courtiers and royal children are flat, oblong cards with hands and feet at the corners; the King, Queen, Knave and guests are people in court-card dress." This follows Carroll's procession and Tenniel's drawings. The old rule made all the Queen's court cards. The first rule lost "furniture" to stay within the brief's 1,200-character prompt limit.
- **Analysis restaged without a reread.** The quality phase's restage failed because redrafted canon renamed stage ids under the carried owner edits. This time [`restage-alice.mjs`](restage-alice.mjs) copied generation 2's 286 records (88 entries, 51 sections, 147 moments) unchanged into generation 4 against the new brief, through the same store mutations `works:canon` uses. It used the generated version of each owner-edited record, and every record kept its content version. Activation carried all 10 owner versions, with none unmatched. No model was called, and existing sheets stayed current. The quality phase's local canon state held the abandoned generation 3's redrafts, so it could not be reused.
- **Canon edits** ([`canon-edits.tsv`](canon-edits.tsv)):
  - The King, Queen and Knave became people dressed as the playing-card figures.
  - The guests and croquet players became the royal guests in court-card dress, holding live flamingos with hedgehogs as balls. The old croquet players' text had "each carrying a croquet mallet".
  - The court crowd became birds and beasts with the pack of cards, instead of "ordinary people … no animal or bird figures". Its first new sheet drew a human girl ([rejected](sheet-court-crowd-rejected.jpg)), so the entry was rewritten as a group around a typical member, a squirrel in a waistcoat ([sheet](sheet-court-crowd.jpg)), as the corrections runbook asks for groups.
- **Sheets:** six remade on the first attempt ($0.2382), then the court crowd again ($0.0341). See the [King](sheet-king.jpg) and the [croquet players](sheet-croquet-players.jpg).

## Check

The same nine cases as the [court re-check](../2026-11-10-alice-court-check/) were run in Watercolor only, from snapshot [`2026-11-10-alice-court-snapshot`](../2026-11-10-alice-court-snapshot/): 9 images, $0.448209. Two blind scorers ([pack](scoring/)) judged them against the corrected rule.

| | Strict | Launch bar | Soldiers drawn as cards |
| --- | --- | --- | --- |
| Court re-check, old rule (Watercolor items) | 0 of 9 | 0 of 9 | 0 of 8 scenes with soldiers |
| Now | 0 of 9 | 0–1 of 9 | 1–4 of 8 |

Under the book's rule the King, Queen and guests are correct as people, and the courtroom soldiers are mostly cards. The images still fail for faults the card rule does not reach:

- Croquet arches are drawn as men in card tabards on all fours, or as metal hoops.
- Wooden mallets appear beside, or fused with, the flamingos.
- Ordinary human spectators stand in the courtroom.
- Figures are duplicated: a second Alice, a second White Rabbit.
- The Caterpillar has a human face.
- Corner indices on the cards are readable.

The scorers accepted several Kings and Queens at croquet as Carroll's royal guests.

## Spend

$0.7211 in all: $0.2723 for sheets and $0.448209 for images. With the quality phase's $9.17 this comes to about $9.89 of the $10 the owner approved.

## Next

Alice's remaining faults are the image model's habits in crowded court and croquet scenes, not missing canon. Readable Alice needs either a decision to accept them as a limitation or a further measured change. Neither book is served until a reader for prose works exists.
