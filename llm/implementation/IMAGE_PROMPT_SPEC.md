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

The generic engine sends each selected entry's canon stage text (about 500 characters, fixed identity only) in the CANON block; the quotes stored with a stage are audit evidence and are never part of the prompt. Entries with `hasForm: false` contribute their constrained text but never a reference sheet. Prompt version `2026-10-22-generic-v4` retains the protected FORMLESS SUBJECTS block: their presence must follow the canon and brief without a head, body, limbs, human silhouette or garment-shaped figure, even faceless or made of light. Source metaphors remain in the quoted text; the constraint applies only to the named subjects, while other characters keep their canon forms. These are rendering instructions, not guarantees about provider output. See [Work preparation](../context/WORK-PREPARATION.md#canon).

Canon drafter version `2026-10-21-canon-depiction-v1` explicitly gives unconditional depiction rules priority over bodily source imagery in prompt-ready stage text. Style-conditional rules stay in the brief for final rendering and are excluded from shared canon drafting. The drafter asks for permitted qualities rather than bodily/material similes and keeps supporting source wording in audit quotes. The [controlled style-reference comparison](../releases/2026-10-21-reference-comparison/README.md) retained no-form failures both with and without a style reference; it did not establish which textual input caused them. The drafter change addresses an instruction conflict and still needs generated-output evaluation. It does not change this rendering prompt's version, rewrite existing canon or plans, or alter the moment's quoted source text.

## Generic rendering packet

[engine/prompt.ts](../../src/lib/engine/prompt.ts) builds the generic engine's prompt from the moment's prepared inputs; it shares nothing with the legacy builder, whose Bible and Genesis wording stays confined to it. `GENERIC_PROMPT_VERSION` versions the structure and wording; the brief, style, canon, look and plan carry their own content versions in the packet.

Moment planning contract `2026-10-23-moment-cast-v4` adds source-grounding audit data, including a stated instant, to newly prepared analysis plans. Assembly continues to project only the existing seven scene fields into rendering; evidence quotes, participation classifications, the stated instant and the single-instant assessment are not image instructions. The rendering wording and `GENERIC_PROMPT_VERSION` are unchanged; the plan content version includes its audit. [Scene preparation](../context/SCENE-PREPARATION.md) documents validation, cache refresh and the remaining semantic limits.

Blocks, in order: engine rules with the precedence line (rules, then brief, then style rendering, then look, then plan); the moment's reference and text; the brief's prompt form for the moment's era with only the depiction rules that apply to the style (unconditional ones and those naming it); the selected-character roster; the conditional formless-subject constraints; the selected canon with a line reserving that look for the named entries that have form; the section look; the scene plan; the art style's rendering and negatives plus its detail lines; the captions of the reference images; neighbour hints; the variation note; scene presentation and aspect ratio.

`SELECTED CHARACTERS` names only the selected canon entries whose kind is `character`, including groups and no-form subjects. Empty or location/object-only selections explicitly permit no characters. A protected engine rule says the shared look, source narrators and neighboring text do not add cast, and shared clothing applies only to selected characters. Canon and sheet captions likewise refer only to other selected figures. Shared looks and source text remain verbatim; this resolves instruction priority without editing owner prose or claiming a semantic filter. The planner's separate [selected-cast contract](../context/SCENE-PREPARATION.md) refreshes stale plans without remaking current looks. These input changes still need targeted text/image evaluation; the retained Daniel presence hold remains open.

References: at most three, in the order style reference (non-Classical only), main character sheet, location sheet, second character sheet; only entries the plan marked present, never a no-form entry, and only a sheet for the stage the section assigns. Each is captioned by role and identity, and the prompt says references supply identity and rendering, never layout, poses or background.

The evaluation harness can explicitly omit only the selected style reference after normal selection and trimming. It preserves the selected sheets and trim flags, renumbers remaining captions and records `flags.omitStyleReference: true`; it does not backfill the freed slot. This diagnostic control is not exposed by the generation route and does not change the default prompt or `GENERIC_PROMPT_VERSION`. See [image evaluations](../workflow/IMAGE_EVAL_AND_RELEASE.md#generic-engine-arms).

Budget: 8,000 characters. Nothing required is trimmed: rules, brief form, selected-character roster, formless-subject constraints, selected canon, plan, captions and the style's main rendering line always stay. When over budget the variation note goes first, then neighbour hints, then the style's detail lines, then the look's weather, light and clothing lines. If the prompt still does not fit, `buildRenderingPacket` returns `ok: false` and no paid call is made. The returned packet records every input version, the chosen references and the trim flags, so the image can be reproduced and explained.

In the request path ([engine/generation.ts](../../src/lib/engine/generation.ts)) the packet is built from what actually loaded: a reference whose record is missing, whose entry, stage or style version moved (unless pinned) or whose bytes could not be read is left out before the packet is assembled, so captions and attached images always agree. References are attached as JPEG data URLs after the prompt text in packet order. The packet is persisted on the request record as `renderingPacket` before the provider call and its versions are copied into the saved image's provenance.

Quotes: [engine/quote.ts](../../src/lib/engine/quote.ts) prices the actual assembled prompt length, a small response-text allowance, the model's output image tokens and every reference image. An explicit catalog input-image price (`imageInputUsd`) takes precedence. When that field is absent, the verified Gemini 3.1 Flash, Flash preview and Lite models use 1,120 input tokens per image at the catalog's unified text/image input rate (`imageInputTokens`). This is Google's default media resolution; changing request media resolution requires updating the versioned billing policy. Other models without a known input-image price cannot quote references. Malformed explicit prices fail closed. The same quote is the missing-usage fallback for settlement. Shared preparation is never part of a guest's quote. See [recorded pricing evidence](../releases/2026-10-20-disabled-engine/reference-pricing.md).

