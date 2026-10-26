# Image check: no-form depiction and Watercolor edges

This is step 3 of the owner's 26 October 2026 instruction, "Ok do 1-3 end to end". The owner approved an image check of about $2 with a budget increase. It is the first image evidence from the current pipeline (planner v10, review v8, renderer v8). It measures only: no tuning, reruns or replacements follow from its results.

## What runs

There are five predeclared cases in [plan.json](plan.json): Numbers 3:39, Daniel 7:9, Exodus 16:15 (where both earlier images drew a robed figure in the cloud), Exodus 14:22 and Luke 10:34. Each case is prepared once, cold, in a memory store seeded from one read-only production snapshot ([snapshot.json](snapshot.json)). A refused preparation stops that case before any image. The next predeclared backup then runs: Exodus 40:34, Exodus 19:18 and Isaiah 6:1, in that order, until five cases are stored.

Each stored case renders classical, watercolor and icon twice, using the references production would send. Two more Watercolor images per case drop only the style reference, as a control. That makes 8 images per case and 40 at most, all at Nano Banana 2 Lite, 16:9, 1K. Production currently holds only two style references and two character sheets (Moses and adult Jesus), so most images use no character sheet, as production would. Later images must reuse the stored plan with zero text calls.

Full-size images and references stay in the ignored `evals/images/runs/2026-10-26-image-check/` directory; their SHA-256 hashes are committed.

## Scoring

Images are scored under opaque shuffled names by two independent model scorers, then adjudicated by the operator. Each image is checked for:

- A face, body, hair, clothing or silhouette for God or another no-form subject.
- Full-bleed edges versus white or unpainted margins.
- Framing or unsupported figures.
- One coherent instant.
- Lettering.

Blocker 1 clears only with zero no-form figures. Blocker 2 clears only if every normal Watercolor image is full-bleed. This is not human acceptance.

## Money

The cap is **$2.00, with a $2.00 evaluation increase to $19.50**. The adapter reserves $0.06 per image and $0.005 per text call before each request, settles from reported usage, and stops on provider errors, missing usage or cap exhaustion. Expected cost is about $1.45 for 40 images. Step 2 runs concurrently under its own cap, so this plan reserves step 2's full $0.20 in its starting total. No production writes, deployment or activation.

```sh
npx tsx llm/releases/2026-10-26-image-check/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-26-image-check/run.mts --execute
```
