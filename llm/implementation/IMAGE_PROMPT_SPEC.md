# Image prompt construction

Since 9 November 2026 an image is one call built from the moment's own text ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)). [lean.ts](../../src/lib/engine/lean.ts) builds the prompt; [lean-assemble.ts](../../src/lib/engine/lean-assemble.ts) reads its inputs for the request path and for `npm run evals:lean`. `LEAN_PROMPT_VERSION` versions the structure and wording; the brief, style, canon and depiction profile carry their own versions in the packet. Historical images keep the `prompt`, `promptVersion` and packet they were saved with, including the full engine's (`generic-v15` and earlier) and the legacy builder's.

## Inputs

- **The moment** and its in-section neighbours, from the imported reference text, never the reader's translation. The moment is clipped at 1,600 characters, each neighbour at 400.
- **The section's whole cast**, each member with the canon stage the section assigns. No model selects the cast. A member is *named* when its name, an alias, its canon label or a capitalised leading word of four letters or more appears in the moment or a neighbour, as a whole word. Members are ranked: named in the moment first (most mentions first), then in the previous verse, then the next, then section order. A member whose canon cannot be read stops the image before any charge.
- **The brief's block** for the section's era, with the depiction rules that apply to the style ([briefBlock](../../src/lib/engine/prompt.ts)).
- **The art style**: rendering, palette, lighting, materials, composition and negatives.
- **References**: the style reference, then up to four sheets: the best-ranked character, the best-ranked place, then the rest in rank order. Only drawable (`form`) members get sheets, and only for the stage the section assigns. A reference is used when current for its inputs (or pinned) and when its bytes load; one that fails to load is dropped and its slot passes on.

## Blocks, in order

1. "Paint one illustration of a single moment from …".
2. **RULES**, numbered ([engineRules](../../src/lib/engine/prompt.ts)): no writing (naming the work's writing surfaces), one scene to every edge, nothing outside the era, natural anatomy, the content floor, no real likeness, the work's rule for subjects without form when it has one, and that a character drawn from CANON keeps that look while anyone else is an unnamed figure.
3. **MOMENT** with its reference, then **CONTEXT** with the verse before and after.
4. **HOW TO READ IT**: one instant; a speaker shown with listeners, never the content of the speech as figures; figures of speech are not objects; time, light and weather from the text.
5. The **WORK BRIEF** block.
6. For a section with a subject without form: the work's **UNSEEN PRESENCE** line, and, when the moment or a neighbour names it, **IMAGERY, NOT FORM**: the text's words giving it a seat, clothing or a body are imagery, and any throne stays empty.
7. For a symbol entry: the work's symbol line and the entries' names.
8. **SETTING**: the section's places, kept unless the moment is plainly elsewhere.
9. **CANON, NAMED HERE**, then **CANON, ELSEWHERE IN THIS PASSAGE** (drawn only when the moment involves them, for example as "he" or "they").
10. **ART STYLE**.
11. **REFERENCE IMAGES**: each captioned by role and short name; identity and rendering only, never composition.
12. **FRAME**: one continuous scene to every edge, and the aspect ratio.

## Work wording

The work's [depiction profile](../context/WORK-PREPARATION.md#depiction-profile) supplies where its writing appears, any serious subjects beyond battles, blood and death, and its wording for subjects without form (`effects`: an alias, a rule and the presence line) and for symbols. Every name of a subject without form is replaced by the alias in every text the prompt carries: the moment, the neighbours, the brief, other entries' canon and the reference captions. Its own canon is never sent and it gets no sheet. A work with no wording for a mode refuses an entry in that mode (`ok: false`) rather than borrow another work's. A symbol entry (only Satan) keeps its canon and gets no sheet.

## Budget

12,000 characters. Nothing is trimmed: a prompt over the cap returns `ok: false` and no paid call is made. The packet saved on the request (`renderingPacket`) and copied into the image's provenance records the versions, the canon sent and the references attached; `lookVersion` and `planVersion` read `none`. [A golden test](../../src/lib/__tests__/lean-engine-golden.test.ts) pins the exact prompt and references for five suite moments across the three works.

## Quotes

[engine/quote.ts](../../src/lib/engine/quote.ts) prices the actual prompt length, the model's output image tokens, a response-text allowance (600 tokens for Nano Banana 2.1, which bills reasoning with each image; 100 otherwise) and every reference image. An explicit catalog input-image price takes precedence; otherwise the verified Gemini models use 1,120 input tokens per reference at the catalog's input rate. Models without a known input-image price cannot quote references, and malformed prices fail closed. The same quote is the missing-usage fallback for settlement. See [recorded pricing evidence](../releases/2026-10-20-disabled-engine/reference-pricing.md).
