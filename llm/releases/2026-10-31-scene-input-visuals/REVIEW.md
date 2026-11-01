# Corrected-input visual evidence review

The experiment completed all 18 scheduled cases and retained all 26 returned image attempts. No failed/refused row or unsettled call was excluded. The run used commit `0cd2d4af6fe98615cee479d971b09eff9e137c04`, with the plan, funding, driver and input manifest committed before the first paid call. The driver remains byte-for-byte identical to its pre-execution reviewed snapshot.

## Mechanical evidence

- The [29 input hashes](inputs.json) still match, including the prepared correction payloads and all frozen dependencies. The prior offline reconstruction reproduced its retained report exactly before execution.
- All 18 cases bind the original admitted preparation, their actual arm prompt, corrected/original payload versions and ordered reference hashes. All three repeats use the same section-arm plan 1 for each scene. The candidates alter only the intended 1/2/3 prompt lines.
- The 26 actual image requests use the fixed model, 16:9 aspect ratio and the expected ordered reference bytes. The provider adapter omits `image_size` for this fixed-resolution model; all 26 JPEG files are 1376 × 768. Image byte hashes, MIME signatures, sizes, response data-URL hashes and provider request IDs match.
- All 52 checker requests use the saved image bytes and correct arm-specific description. Their raw answers reproduce the recorded faults and attempt selection. Two entry replacements clear lettering; all six cellar cases retain lettering in both attempts and keep attempt 1. The grown-house cases have no checker-reported craft fault despite anatomy/spatial errors.
- All 78 successful exchanges reconcile with the ledger, and each reported charge fits its recorded ceiling. Measured image/check spend is $0.91140155; uncertainty is zero. The new conservative cumulative total is $5.47693685, with the $5 account reserve preserved. See [funding close](funding-close.json).
- Every attempt appears exactly once in [inspection.json](inspection.json), with original dimensions and its matching file hash. [report.json](report.json) groups the narrow verdicts by scene, arm and first/chosen attempt; it does not pool unlike criteria into a global quality score.

Image files remain at the recorded local `evals/images/runs/2026-10-31-scene-input-visuals/` paths. They are ignored binary artifacts, not committed GitHub links. Raw response image payloads and opaque provider reasoning are replaced by hashes in [provider.ndjson](provider.ndjson); credentials are absent. The hashes preserve provenance, not portable access to the pixels.

## Interpretation and limits

The declared candidate criterion failed. The entry control passes, but the corrected grown-house samples do not all show one coherent body, and the corrected cellar first/chosen samples all retain visibly open lanterns. No candidate or production input is activated.

`criterion` is intentionally narrower than an overall image-quality verdict. For the grown house it means giant size plus a readable single body; `selectedInstant` separately records the arm/window/foot/chimney arrangement, which none of the six images clearly fulfills. For the cellar it refers to the specifically chosen later concealed waiting/floor-light instant. An earlier preparation that is valid elsewhere in the focal source is not automatically globally unfaithful merely because the late floor cue is absent. The baseline is a comparison, not a gold image set.

Subtle lighting and the toe-like shape under candidate grown-house repeat 1 remain uncertain. Ordinary arched passages are not automatically labeled the thieves' dug wall tunnel. A hidden fourth cellar character is not automatically counted absent. Rejected cellar retries that look closer to the desired light state remain rejected; they are not substituted into the reported chosen results. The first entry candidate replacement also has a small black square artifact despite clearing the checker.

All inspection is unblinded model judgment, not human acceptance or independent blind scoring. Three image repeats of one fixed plan per scene cannot establish a statistical improvement/regression, universal model behavior, or quality across books/styles/models. The candidate bundles canon and plan changes in two scenes; it does not identify which input or model limitation causes the visual faults. Remaining canon, clipped source, reference pixels, ownership wording and style instructions can still influence the result.

## Reviews and checks

Pre-execution: GPT-6.1 Sol on xhigh approved the seven-file preparation in one round with no findings. It independently reconciled the frozen bindings, fake requests and spend guards. CodeRabbit CLI raised zero issues. Typecheck passed; focused suite-runner tests passed 14/14; full tests passed 1,052 with one skipped; repository lint had zero errors and three existing warnings.

Final evidence: GPT-6.1 Sol on xhigh approved in round two with no findings after independently viewing all 26 original images and reconciling the requests, hashes, costs, checker answers and report. CodeRabbit CLI also raised zero issues on the completed evidence. Approval covers preservation of this bounded negative result, not candidate activation or broader prompt changes. Runtime source, schemas, work/style inputs and dependencies match base `ca702da6d1634cbebcf377d795e0c5c10ce5f37d`; this package adds only the local diagnostic driver, evidence and a conditional context pointer.
