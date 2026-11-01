# Ownership wording: completed visual observations

**Do not activate or broaden this candidate on this evidence.** Changing only the two ownership lines did not satisfy the [declared criterion](plan.json). This does not prove that the baseline is generally better or that ownership wording cannot help elsewhere.

## Observed result

All 24 original-resolution images (1376 × 768) were inspected, including every retry. [inspection.json](inspection.json) contains one observation per attempt and its byte hash. [report.json](report.json) reproduces the counts below. These are unblinded model observations, not independent blind scoring, human acceptance or a release gate.

| Narrow criterion, chosen images | Baseline | Candidate |
|---|---:|---:|
| Alice remains small before drinking | 3 pass / 0 fail | 3 pass / 0 fail |
| Grown Alice is giant with one coherent body | 2 pass / 1 fail | 1 pass / 2 fail |
| Selected late cellar instant is readable | 0 pass / 3 fail | 0 pass / 3 fail |

First and chosen counts are identical: the checker retained attempt 1 for all 18 cases. The six cellar cases each retried once for lettering; all twelve cellar attempts still had checker-reported lettering and failed the selected-instant criterion. No attempt was omitted or manually rerolled.

### Alice before drinking

Both arms preserve ordinary child scale while the Rabbit points and Alice reacts or starts to move. Foreground perspective against a distant cottage is not treated as giant size. Added mushrooms, streams, houses and, in one candidate, extra rabbits remain outside this narrow growth control. Cottage architecture and clothing vary. Passing this control does not establish identity consistency, adaptation originality or every source detail.

### Alice grown in the house

All six images make Alice visibly giant. Baseline repeat 1 has three arms. Candidate repeat 2 has three visible hand shapes around the window-side arm and face; candidate repeat 3 has three boots/legs. These fail the single-body requirement. The two baseline body passes and one candidate body pass still do not establish the exact requested arm-out-window/foot-up-chimney pose.

For that separate pose, all three baselines fail; candidate repeat 1 is spatially unclear and the other two fail. The unclear image has two readable arms and legs, but the hand is in front of the sill and the raised boot meets an elevated opening: the image does not establish which side of the window the arm occupies or how the foot enters the chimney. Existing checks reported no faults on any grown-house image. The narrow source-state inspection is therefore separate from those checker judgments.

### Holmes in the cellar

The selected late instant requires a concealed wait, a first floor-light cue and a shuttered lantern. Chosen images in both arms instead retain exposed/seated figures and visibly open glowing lanterns. Some can read as earlier preparations within the supplied source span. That is a failure of this selected-instant criterion, not an automatic claim that they contradict every instant in the whole passage.

Ordinary arches are not counted as criminal wall tunnels. A rough oval wall opening in baseline repeat 3's retry, and a circular opening with rubble/tools in candidate repeat 3, provide more specific contrary cues. A small bright floor patch in the latter could be a glint, but it does not resolve the lantern and staging conflicts. Some attempts contain extra figures; they are not confidently labelled thieves. Crate lettering persists in all twelve cellar attempts, with signatures visible in several. Facial likeness and cross-scene identity were not independently scored.

## Interpretation and boundaries

This experiment isolates the two wording replacements **over the original saved inputs**. It deliberately retains episode-specific canon, a grown-house plan mixing successive poses, and conflicting cellar descriptions. It does not test the previously prepared data corrections together with the new wording. The actual prompts, original preparation, source contexts, settings, checker descriptions and ordered reference bytes are retained; candidate wording is a late diagnostic substitution, not candidate cache admission.

There are three selected scenes, one plan per scene, three renders per arm, one model and one style, without matched image seeds. Inspection knew the arms. Those limits prevent a general improvement/regression estimate, a universal statement about prompt ownership, or a Bible/other-model release claim. No production input, runtime prompt, canon, sheet, plan or default was changed.

The declared criterion required three chosen candidate passes in every scene before further consideration. The grown-house and cellar failures reject broadening this candidate on this evidence. Preserve the result and the current production behavior; do not turn the remaining allowance into an unplanned tuning loop.

## Accounting and verification

All 18 cases succeeded, with 24 image calls, 48 checker calls, no planning calls and no unsettled or uncertain calls. [funding-close.json](funding-close.json) records $0.83997430 measured spend, $6.31691115 conservative cumulative spend against the approved $7 cap, and an ending balance of $9.165930938 above the $5 reader reserve. [verification.json](verification.json) reconciles frozen inputs, original preparation, raw requests/responses, image bytes, checker answers, selection and request ceilings. This close does not authorize another run or activation.
