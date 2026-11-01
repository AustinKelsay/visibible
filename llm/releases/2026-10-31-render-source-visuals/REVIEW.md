# Paired rendering context: visual findings

**Decision: do not activate or broaden this candidate on this evidence.** The frozen criterion in `plan.json` required all three candidate gloves images to clearly preserve giant size. Only one does. Even treating the two failures as uncertain would not meet that requirement. No prompt tuning, manual rerolls or new references were introduced after inspecting results.

GPT-6 Astra inspected all 32 returned attempts at original resolution, unblinded. This is model judgment, not independent blind scoring or human acceptance. `inspection.json` records each image path, byte hash, judgment and notes. `report.json` separately counts first and chosen attempts. Their source-state totals happen to match: the two chosen replacements remove reported lettering without changing these state judgments. The other six retries retain attempt one under the existing checker policy.

## All twelve pairs

`P` means the bounded state check passes, `F` fails and `U` is unclear. These are not overall quality grades. House-grown checks giant size and a single readable cramped body; passing images still miss exact limb placements. A lit cellar lantern alone is unclear because early preparations are allowed; showing the later floor glint with an open lantern conflicts with the dark wait.

| Scene / retained plan | Baseline chosen | Candidate chosen | Main observation |
|---|---|---|---|
| Gloves 1 | U | F | Candidate reads as an ordinary seated child; baseline scale is ambiguous. |
| Gloves 2 | P | P | Both show Alice towering over the Rabbit beneath the ceiling. |
| Gloves 3 | U | F | Candidate reads as ordinary child scale; baseline perspective is ambiguous. |
| House entry 1 | P | P | No premature giant body. |
| House entry 2 | P | P | No premature growth; candidate retry removes the reported lettering. |
| House entry 3 | P | P | Child fits doorway and stairs; Rabbit absence is valid. |
| House grown 1 | F | P | Baseline has three arms; candidate has a readable giant body but incorrect limb placement. |
| House grown 2 | F | U | Baseline has extra legs; candidate's upper boot/limb connection is unclear. |
| House grown 3 | P | P | Both read as cramped giants; exact chimney/door placement remains wrong. |
| Cellar 1 | U | F | Baseline could be early preparations; candidate combines an open lantern with the floor glint. |
| Cellar 2 | P | F | Baseline has a coherent dark wait; candidate retains an open bright lantern with the glint. |
| Cellar 3 | P | F | Candidate introduces broken-floor entry cues while the lantern remains lit. |

The house-grown baseline is defective, so the candidate's fewer obvious duplicated limbs cannot establish general improvement. The gloves result alone rejects the declared criterion; the cellar result supplies a further reason for caution.

## Separate quality observations

- **Identity:** Alice generally retains the supplied youthful face, long hair, blue dress and white pinafore. Hair colour and shoes vary; one retry has a bare raised foot and a boot on the other. Holmes images vary Watson's moustache/beard and sometimes make background faces too similar. This was not a blind identity gate or an adaptation-likeness test.
- **Extra subjects and props:** no clear additional person or later arrest appears in the cellar samples. Rabbit absence in the indoor entry pair is valid. Loose gloves, bottles and fans multiply in some Alice scenes. A cellar retry adds a second revolver. These defects remain in the attempt notes.
- **Lettering:** the automatic checker reports faults on three baseline first attempts and five candidate first attempts; three chosen images in each arm still have lettering faults. All eight retries were caused by lettering. Visible crate labels confirm many of these findings; tiny plates remain less certain. Original checker answers remain unchanged.
- **Coherence:** extra limbs in two baseline grown-house images and the candidate's uncertain boot/limb connection illustrate faults outside this checker configuration. A clean checker result is not a state, anatomy or fidelity pass. The candidate cellar images often show a lit lantern together with the later floor glint, and the last retry opens a hole beyond the focal endpoint.

## What the comparison does and does not isolate

Each pair retains the same plan, canon, prompt blocks other than the frozen source/precedence edit, ordered references and settings. The three repeats use three different retained plans. All Alice requests carry their frozen references; Holmes requests have no attachments, matching the earlier diagnostic. Results across works therefore do not isolate attachment effects. Repeated appearances share plans and designs, so this is not 24 independent scene samples.

The candidate changes both source content and precedence. It contains past and later events, while canon and plans can contain conflicting appearance or state cues. This run cannot attribute the cellar error to any one of those inputs. Non-literal Bible depiction, owner-constraint interactions, other styles and other image models remain untested here. No broad model ranking, production quality claim or universal rejection of source context follows.

## Evidence and funding

`requests.ndjson` records packet hashes before each case. `provider.ndjson` preserves scrubbed exchanges; `results.ndjson` preserves the actual selected prompt and all attempts. Reference data URLs and returned image data URLs reconcile to the retained local bytes. All 27 frozen inputs match before and after; all 96 provider exchanges match the ledger, including 64 checker answers. `verification.json` records the offline checks.

Cost: **$1.12653505**, no unsettled or uncertain charges in this operation. Conservative cumulative spend is **$4.56553530** against the existing $6 authorization. Account balance after execution is **$10.917306788**; the reader reserve remains $5. Original pixels remain in the ignored run directory named by the results, rather than being duplicated in this evidence folder. No production inputs, runtime source, defaults or active analyses changed.
