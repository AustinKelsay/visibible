# Generic engine release status

Updated 22 October 2026. Canonical release ticket: [#183](https://github.com/AustinKelsay/visibible/issues/183); accepted architecture: [#165](https://github.com/AustinKelsay/visibible/issues/165).

**Hold public activation.** The implementation is delivered and the complete production Bible analysis is ready. Actual request latency/accounting now meet their targets in the measured sample. Visual quality and source/cast grounding still fail. Austin Kelsay is the human release owner; no human acceptance or public-switch authorization is recorded.

| Gate | Current evidence |
| --- | --- |
| Imported Bible, analysis and canon | Generation 1 ready; 31,102 existing Bible IDs, approved work/brief versions. [Production preparation](2026-10-20-engine-production/README.md) |
| Compatibility rehearsal | 146 tests passed at reviewed application commit `ecd58e0`. [Retained rehearsal](2026-10-22-moment-cast-evaluation/rehearsal-summary.json) |
| Actual app billing/provenance/replay | 18 new images, five credits each, saved WEB text, KJV request context for 17 recorded calls, unchanged ledger on zero-balance replay. [Owner check](2026-10-22-owner-request-check/README.md) |
| Full request latency | Cold p90 17.75 s (n=8); prepared p90 7.22 s (n=9), across all styles. Targets met in this small descriptive cohort. One untimed automatic image excluded. [Measurements](2026-10-22-owner-request-check/measurements.json) |
| Moment source/cast grounding | Failed fresh Daniel 7:9 text check. Luke 10:33 smoke plan selects Jesus/lawyer inside the parable while omitting the illustrated parable actors from selected canon. [Daniel](2026-10-22-moment-cast-evaluation/README.md), [visual/source observations](2026-10-22-owner-request-check/visual-review.json) |
| No-form depiction and Watercolor edges | Both fresh Exodus images show a formed sky figure; all six Watercolor smoke images have white margins. Release blocked. [Contact sheets and review](2026-10-22-owner-request-check/README.md#visual-failures-remain-release-blockers) |
| Fixed visual matrix | Historical v2 has 236/324 complete; 88 missing. Later prompt versions do not fill those slots. Fresh full-current-prompt dry run estimates $11.988; only $0.15699310 evaluation allowance remains. No new evaluation was funded or executed. |
| Human acceptance/public switch | Outstanding: visual/likeness, compatibility/accounting/latency acceptance, explicit activation, actual named 24-hour follow-up window and outcome. |

Production `visibible.com` serves reviewed application commit `ecd58e0` on disabled deployment `dpl_4FE7JeXKq853nCxsrN2NYZYFdYjj`. Persistent mode is disabled with no production owner digest. Classical new admission remains legacy; Watercolor/Icon generation is unavailable, while saved images in all styles and completed generic replay stay served. [Final proof](2026-10-22-owner-request-check/disabled-final.json).

Remaining after measured usage and retained uncertainty: preparation **$39.32424240 / $43**, evaluation **$0.15699310 / $16.50**, production smoke **$0.31420500 / $1**. These are separate allowances; the controlled session has zero credits. No new grant or account purchase was made.

Next work, in order:

1. Correct source/cast handling for embedded stories and visions, including missing on-scene actors and framing narrators. Keep the actual failed plans/images as regression evidence; validate structural coverage and inspect first fresh ordinary replies before image calls. No new whole-work reading is implied.
2. Validate no-form depiction and the Watercolor full-bleed requirement with a bounded, reproducible visual comparison after text/source repairs. Keep fixed cases/repeats and first outcomes; retain failures. Prepare a concrete dry run and obtain any needed evaluation budget increase before paid calls. Preparation or smoke headroom cannot fund evaluation.
3. Complete the appropriate current-candidate visual matrix and human acceptance using the measured compatibility/accounting/latency evidence with its sample limitations. Earlier prompts remain historical evidence.
4. Only after explicit human activation authorization, switch public admission, verify it, and record the named first-24-hour follow-up window and outcome. [#184 legacy retirement](https://github.com/AustinKelsay/visibible/issues/184) remains later work.

The next source/cast repair adds a required missing-cast report, rejects unknown/duplicate selections, and refuses missing or changed assigned canon rather than silently dropping or substituting it. Reading/planning instructions distinguish embedded action from framing participants. This is a structural safeguard and instruction update, not a correction of the retained production analysis or proof of live model compliance. Production remains on the disabled `ecd58e0` build above; existing failed evidence is unchanged.
