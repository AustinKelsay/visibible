# Image prompt construction

Authoritative implementation: [generate-image/route.ts](../../src/app/api/generate-image/route.ts), including `PROMPT_VERSION`, style profiles, scene-plan normalization and prompt assembly. Update the version when changing the prompt contract. [Planner tests](../../src/app/api/__tests__/generate-image/scene-planner.test.ts) exercise this path.

## Inputs and cache

Generation uses a JSON POST body, including `translation`, reference/text, optional adjacent context/theme, style, model and image settings. The route resolves supplied references and sanitizes/normalizes inputs before building the prompt.

Scene plans are cached by verse, translation and style profile in Convex. Cache hits skip the planner call/reservation; misses can invoke the planner if enabled. [Image generation](../context/IMAGE-GENERATION.md) and [Sessions and credits](../context/SESSIONS_AND_CREDITS.md) cover lifecycle and charges.

## Assembly and compaction

The prompt combines priority rules, the current verse scene, optional scene plan, adjacent continuity hints and variation note, immersive scene-presentation rules, optional chapter theme, style profile/negatives, global negatives and aspect-ratio instructions.

Narrative continuity may coexist with a scene plan. When over budget, compaction removes the generation variation note, reduces style detail, removes narrative continuity, then hard-truncates if still necessary. The route defines the 2,800-character budget and individual field limits; changing those constants changes the contract.

The visual intent is a single immersive biblical scene filling the image, without text, frames, modern artifacts or blank presentation backdrops. These are prompt instructions, not guarantees about provider output.

## Stored metadata

`promptPacket` captures normalized inputs, planner/cache flags, selected section flags and final character count. It is diagnostic metadata, not an exact reconstruction of the final prompt: it retains some inputs that compaction can omit, and hard truncation can cut sections after flags were set. Saved-image metadata also carries the prompt and its version.
