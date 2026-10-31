# Diagnostic review notes

## Scope and decisions

This change adds local evaluation evidence and three small diagnostic scripts. Application source, Convex schema, model defaults, existing analyses, reference sheets and public images remain unchanged. No candidate is activated. The fresh Alice preparation and images are local only. No additional paid generation is justified by a failed sample.

## Automated code review

- CR1, continuation input integrity: accepted. The continuation now verifies original input hashes as well as application-source hashes. The actual continuation inputs were independently checked against the original hashes before the continuation completed; none changed.
- CR2, PNG media type: accepted. Individual images keep their original bytes and use their detected MIME type; pair composites are JPEG. All 54 saved attempts were checked against file magic (44 JPEG, 10 PNG). The original failed scoring run, six saved answers and uncertain request reservations remain recorded.
- CR3, interrupted scoring: accepted for the observed failure. A bounded continuation retains the six completed judgments and uses only scorer A's unused allowance. In-flight calls now settle before an error exits the process. A general retry engine is outside this diagnostic's scope.

## Operator inspection (unblinded model review, not human acceptance)

Inspected all five chosen-image contact sheets, all three successful new reference images, and full-resolution examples of Alice's watch/gloves scenes and Peter's water/sea scenes. Independent scoring covers all 54 saved scene attempts and 108 scheduled identity pairs; disagreements are retained rather than overwritten. Failed reference pixels were not retained by the existing reference-preparation module and cannot be retrospectively inspected.

The Rabbit's canon includes gloves/fan and conditional herald trumpet/scroll. Its reference sheet depicts these together. In candidate gloves sample 1 a second fan and a small brass horn-like object appear beside the Rabbit's hand. This is a concrete concern about episode-specific props entering appearance memory, not proof that all those props leak into every scene.

Alice is visibly child-sized against ordinary hall doors in the gloves examples. The chapter establishes her nine-foot height before this moment. The frozen planner context supplies the focal paragraph and the immediately preceding tears paragraph, while the earlier height statement is absent. The saved candidate plan explicitly calls her small. This supports a bounded next experiment with richer actual section context; it does not establish that a new fact store or another model pass is necessary.

The candidate Mary Ann plan chooses the later instant inside the house, which is within the focal text. Rabbit absence is valid staging and makes Rabbit identity pairs unclear. It must not be counted as identity success or a source-fidelity failure.

Independent model judges can miss facts or misorder chapter events. For example, scorer A's baseline gloves-1 note confuses the later shrinking with the current instant, and another note treats an actually-made daisy chain as supported although the source only considers making one. Raw scores therefore remain diagnostic judgments. Do not treat agreement, or a high aggregate rate, as human acceptance or permission to activate.

Final code review of `identity-report.mts`: CodeRabbit completed with no findings. Independent scoring finished with 15 field disagreements, all retained. No agreed or disputed judgment was silently overwritten.

## Final independent review

GPT-6.1 Sol on xhigh approved in one sol-loop round, with no blocker or should findings and no requested additions. The whole-tree snapshot before and after review was identical: `2f60844c1653926810d461818d5706af61f7856a`. Sol independently reconciled all scheduled cases, saved-image hashes and MIME types, 314 actual API judgments, both interrupted-run reservations, report reproduction, and the negative promotion conclusion. No files changed or provider calls were made during review. No Sol review follow-ups remain.

PR review CR4 (minor): accepted with a one-line predecessor-finished check before phase admission or started-marker creation. An offline injected missing canon-completion marker previously allowed a references start; after the fix it exits before writing that marker. The normal 45-output offline rehearsal, typecheck and focused lint pass. No live call or recorded-result change occurred. The additional CodeRabbit CLI attempt required paid credits and was not rerun; the PR review remains the automated gate. This small nit fix needs no additional sol-loop round.

PR review CR5–CR7: two one-line runner fixes and one declined validation suggestion.

- **CR5, error-row completion:** accepted. With offline providers and the offline-only all-images-success assertion omitted from both test revisions to exercise live completion semantics, an injected scene-blob write failure previously recorded nine error rows and still wrote `images-finished.json`. The new guard rejects error rows before saving plans or a finished marker. Intentional `failed` and `refused` outcomes remain allowed. All recorded live results contain zero error rows, so the frozen diagnostic is unaffected.
- **CR6, missing imported work:** accepted. A missing Alice `work.json` now names `npm run works:import` before creating any run artifacts. The README includes the prerequisite. The injected missing-file test changed from a raw missing-file exception to the preparation instruction.
- **CR7, historical source hash:** declined as inapplicable. `sourceReadingSha256` is the byte hash of the historical full reading-state snapshot, independently rechecked as `a5d9375a0c2ebbc91a743fff85e015d4a9e212a1c43c635b24e6db6b877b0d49`. It is not a canonical hash of the merge diagnostic's `input.json`, which this runner never reads. The actual `reading.json` is frozen at `6a6d8ef6eec2e3c466071af34f406186ed5cc87874e7d163b428163179f8ec13` and verified before admission and at completion. Injecting a changed byte rejects it before any artifacts are created; making the upstream merge input unreadable does not affect the 45-output offline rehearsal. The README now distinguishes historical lineage from executable input validation. No additional upstream validation is planned.

These are bounded diagnostic-runner hygiene fixes; neither changes runtime behavior, paid-run inputs, scoring or the negative conclusion. Typecheck, focused lint and all 13 suite-run tests pass. CodeRabbit CLI completed the runner/README review with zero findings. The two one-line nit fixes and documentation clarification require no additional sol-loop round.
