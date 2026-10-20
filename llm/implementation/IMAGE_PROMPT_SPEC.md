# Image prompt construction

Authoritative prompt implementation: [image-prompts.ts](../../src/lib/image-prompts.ts), called by [generate-image/route.ts](../../src/app/api/generate-image/route.ts). It owns `PROMPT_VERSION`, legacy style profiles, scene-plan normalization and prompt assembly. Update the version when changing that prompt contract. [Planner tests](../../src/app/api/__tests__/generate-image/scene-planner.test.ts) exercise this path.

## Generic brief and style contracts

[Work preparation](../context/WORK-PREPARATION.md) documents the additive data contracts in [work-preparation.ts](../../src/lib/work-preparation.ts) and the shared `classical`, `watercolor` and `icon` files under [styles/](../../styles/). Briefs own tone, depiction and era content; styles own six rendering parts. The brief prompt form is validated for every era against 1,200 characters without truncation, and style descriptions are excluded from prompts. The new Classical file removes Bible-world/tone assumptions; the production `STYLE_PROFILES.classical` remains unchanged until the later generic-engine integration. These data contracts do not change the current prompt version, image route or compaction behavior described below. Example briefs are test fixtures, not approved production inputs.

## Inputs and cache

Generation uses a JSON POST body, including `translation`, reference/text, optional adjacent context/theme, style, model and image settings. The route resolves supplied references and sanitizes/normalizes inputs before building the prompt.

Scene plans are cached by verse, translation and style profile in Convex. Cache hits skip the planner call/reservation; misses can invoke the planner if enabled. [Image generation](../context/IMAGE-GENERATION.md) and [Sessions and credits](../context/SESSIONS_AND_CREDITS.md) cover lifecycle and charges.

## Assembly and compaction

The prompt combines priority rules, the current verse scene, optional scene plan, adjacent continuity hints and variation note, immersive scene-presentation rules, optional chapter theme, style profile/negatives, global negatives and aspect-ratio instructions.

Narrative continuity may coexist with a scene plan. When over budget, compaction removes the generation variation note, reduces style detail, removes narrative continuity, then hard-truncates if still necessary. The route defines the 2,800-character budget and individual field limits; changing those constants changes the contract.

The visual intent is a single immersive biblical scene filling the image, without text, frames, modern artifacts or blank presentation backdrops. These are prompt instructions, not guarantees about provider output.

## Stored metadata

`promptPacket` captures normalized inputs, planner/cache flags, selected section flags and final character count. It is diagnostic metadata, not an exact reconstruction of the final prompt: it retains some inputs that compaction can omit, and hard truncation can cut sections after flags were set. Saved-image metadata also carries the prompt and its version.

## Canon text in prompts

The generic engine sends each selected entry's canon stage text (about 500 characters, fixed identity only) in the CANON block; the quotes stored with a stage are audit evidence and are never part of the prompt. Entries with `hasForm: false` contribute their constrained text but never a reference sheet. See [Work preparation](../context/WORK-PREPARATION.md#canon).
