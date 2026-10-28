# Check each finished image and retry once

On 27 October 2026 the owner approved building and testing an automatic image check ("continue"). Prompt rounds had reduced God figures and style faults but kept trading one failure for another: in the [v12 check](../../llm/releases/2026-10-27-v12-image-check/RESULTS.md), 12 of 24 images still had a fault. Each image is now checked after it is made:

- Claude Haiku 5.5 looks at the finished image with the selected characters' names and the plan's subject and secondary elements. It looks for four faults: a figure in light, cloud, fire or on a throne (God drawn as a person), an unpainted edge, a painted frame, and lettering.
- Two questions run in parallel, each used for the faults it measured best on the [benchmark](../../llm/releases/2026-10-27-scene-check-benchmark/RESULTS.md): a direct question for edges and frames, and a describe-first question for figures and lettering. Code, not the model, decides which faults count.
- A faulty first image gets one retry, with the same request. The better of the two is shown: the one whose worst fault is least severe (figure, then lettering, then frame, then edge), then the one with fewer faults, then the first.
- The reader pays for the image shown. The owner pays for the checks and the image not shown, recorded in the preparation ledger as `kind: "check"`.
- A check that fails or takes over 30 seconds never blocks an image: the first image is shown unchecked. A failed retry keeps the first image.

On the benchmark the check retried 2 of 67 good images. It caught 20 of 23 edge or frame faults and 7 of 11 lettering faults. It caught 20 of 26 God figures overall, but only 4 of 9 in the hardest held-out scenes. So the check reduces shown faults without removing them. A checked request takes about 5–8 seconds longer, and a retried one about 20–25 seconds longer. Checks cost about $0.0007 per image, and a retry another image price, paid by the owner. `GENERIC_SCENE_CHECK=off` turns the check off.

The rejected alternatives were more prompt wording, which did not converge, and refusing God-appearance scenes, which leaves Watercolor and Icon readers with no image. The figure question should be improved against new labelled images. The [launch bar in ADR 0006](0006-unseen-presence-speakers-and-launch-bar.md) applies to the images shown after the check.

**Update (28 October, check v4).** After the owner accepted soft white edges in Watercolor ([ADR 0006, amendment 2](0006-unseen-presence-speakers-and-launch-bar.md)), an unpainted edge is no longer a fault for that style. In the launch matrix, a retry never cured a Watercolor edge, and each attempt cost the owner an extra image. Painted frames, lettering and figures are still checked in every style.
