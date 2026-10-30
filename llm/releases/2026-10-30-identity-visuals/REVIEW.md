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

GPT-6.1 Sol on xhigh approved in one sol-loop round, with no blocker or should findings and no requested additions. The whole-tree snapshot before and after review was identical: `2f60844c1653926810d461818d5706af61f7856a`. Sol independently reconciled all scheduled cases, saved-image hashes and MIME types, 314 actual API judgments, both interrupted-run reservations, report reproduction, and the negative promotion conclusion. No files changed or provider calls were made during review. No review follow-ups remain.
