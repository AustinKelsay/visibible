# Work briefs and shared art styles

[Work preparation contracts](../../src/lib/work-preparation.ts) validate the repo inputs for the generic image engine. This slice supplies data, validation and deterministic selection helpers. The current generation route still uses [legacy image prompts](../../src/lib/image-prompts.ts); it does not consume these files yet. Reading, storage, reference generation, reader controls and production activation are later slices of [the accepted engine specification](https://github.com/AustinKelsay/visibible/issues/165).

## Shared style library

The registered files are [Classical](../../styles/classical.json), [Ink & Watercolor](../../styles/watercolor.json) and [Byzantine Icon](../../styles/icon.json). Their canonical IDs are `classical`, `watercolor` and `icon`. `classical` preserves the existing default ID; the new label is `Classical`. The experimental `watercolour` ID is not an alias.

Each style has exactly `id`, `label`, a one-line `description`, and six required rendering parts: `rendering`, `palette`, `lighting`, `materials`, `composition`, `negatives`. `createStyleLibrary(unknown)` rejects missing/blank parts, invalid or duplicate IDs and extra fields. `SHARED_STYLES` is the registered library. A new style requires an explicit file/import/registration change; a generated brief cannot invent one.

`formatStylePrompt(style)` emits only the six parts. Labels and descriptions help the drafter and picker select styles; descriptions never enter image prompts. Style files contain rendering choices only. Biblical-era wording and reverent tone belong in the Bible's brief/eras, and whether a figure gets a halo belongs in depiction rules. The new Classical file retains the artwork, fresco and manuscript negatives; Watercolor includes the stronger prohibition on paper margins, unpainted corners and blank paper backdrops. Existing production prompt strings are unchanged until integration.

`inspectStyleScope(style, terms)` flags known work, person, place and era names in the six prompt parts, returning the offending field and term. Supply names and aliases from the imported work, era definitions and reading-pass identities for every supported work when reviewing a shared style. Matching ignores case and punctuation and respects phrase boundaries. A style's historical technique name, such as Byzantine Icon, is not itself a content-era instruction: review any matching flags in context.

This is a deterministic lexical check, not a semantic classifier. It cannot discover names omitted from the supplied vocabulary or detect every indirect work-specific assumption. Human review of the complete rendering text remains part of the style-file PR.

## Brief file contract

An eventual `works/<work-id>/brief.json` contains:

```text
schemaVersion: 1
workId
tone
depictionRules: [{ text, styleIds?: [registered IDs] }]
eras: [{ id, label, people, dress, buildingsAndObjects, technology }]
styleIds: [ordered registered IDs; first is default]
```

`validateWorkBrief(unknown, library?)` validates the whole file. IDs are lowercase slugs, era IDs are unique, and the nonempty offered-style list has no duplicates. A depiction rule can name registered style IDs in its optional `styleIds` condition, even if a particular work does not currently offer them. Conditions are preserved explicitly; they do not become unconditional instructions. An absent condition applies across styles. Empty or unknown conditions fail.

The brief is a short page, with a hard ceiling of **400 whitespace-delimited words** across tone, rule text, era labels and era descriptions. IDs are not counted as prose. There is no minimum word count: a simple work can use a shorter brief. Every era must specify people, dress, buildings/objects and technology.

`formatBriefPrompt(brief, eraId)` returns the tone, all depiction rules (including their style conditions) and that era's fields. Validation checks the exact formatted string for **every era**, including labels, punctuation and line breaks, against the **1,200-character** limit (`String.length`, UTF-16 code units). Unknown eras fail. Nothing is truncated or silently normalized. A long later era is rejected even if the first era fits. The full style-neutral form retains conditions for the later planner/rendering stages to interpret under the accepted precedence.

Section-to-era assignments are analysis output and are rejected as extra fields in the brief. `selectMainEra(brief, sectionEraIds)` counts those assignments and selects the era with the most sections. Ties use brief order; empty assignments and unknown era IDs fail. It does not guess a main era before sections exist.

## Draft scope review and canon hints

`reviewDraftBrief(draft, entries, sectionReferences?, library?)` accepts single-entry IDs, kinds and names/aliases from the reading pass. It validates the draft, then proposes a cleaned brief by routing depiction-rule text that names an entry into `canonHints`. Each hint retains the original rule, condition, entry ID/kind and source path. The input is never mutated.

Named details inside required tone/era fields produce canon hints and `scopeIssues` with destination `canon`; those fields need rewriting, so the returned `brief` is `null`. Supplied chapter/episode references likewise produce issues directed to `section-look`. The helper does not silently delete required prose or invent replacement wording. Style IDs in structured conditions are not mistaken for character names.

These are conservative review suggestions. A real work-wide depiction policy may deliberately name a figure; the owner can retain such a policy in the brief PR. Structural validation accepts that choice, including registered style conditions. The draft reviewer is not an approval mechanism and its hints are not automatically published canon. Missing aliases and indirect descriptions still need reading-pass and owner review.

## Preference, precedence and content floor

`resolveWorkStyle(brief, savedPreference, availableStyleIds?, library?)` returns a registered style and the original saved preference. An offered preference is selected; an absent/unoffered preference uses the first offered style without overwriting the saved value. This preserves a visitor's preference when moving between works. If the selected style is temporarily unavailable, the helper returns `available: false` and keeps that selection; it does not choose a different style. Callers must enforce availability before generation. Persistence and reader UI are not implemented here.

`PROMPT_PRECEDENCE` is strongest to weakest: engine rules, brief content/depiction, style rendering, section look, scene plan. Briefs control what may be shown and the world's people/technology; styles control rendering. Thus an Icon gold sky can override literal section lighting without changing the scene's era or granting permission for halos.

`COMMON_CONTENT_FLOOR` belongs to the engine for every work: sexually explicit content and lingering gore are prohibited; serious battles, blood, death, crucifixion and non-sexual nudity are permitted. Provider filters may still refuse an otherwise permitted image. Strict brief/style schemas accept no field that replaces this floor, and engine rules outrank all prose. These validators cannot prove that arbitrary prose is semantically consistent with the floor; owner review and the later prompt assembler must preserve that precedence.

## Approval and changes

The [Bible and Holmes fixtures](../../tests/fixtures/work-briefs/README.md) are examples, not approved production inputs. No production brief is committed by this slice, and there is no `approved` boolean that can self-authorize one.

The later reading pass proposes a brief and an ordered set of existing styles with reasons. It writes a draft into the working tree for a **separate one-file brief PR** at `works/<work-id>/brief.json`. The owner reviews tone, each depiction rule, eras and the style set; merging that PR is the approval. Later edits use the same path. Merging tests, fixtures or validator code does not approve a work brief. Storage/readiness integration must still verify complete, compatible analysis before generation; approval alone is insufficient.

Style files are owner-authored repo data reviewed through their own PR. Run the structural and scope checks against supported work vocabularies, review rendering/content separation, and judge a candidate through the planned owner-run contact-sheet tool using the actual engine prompt path. That visual tool and its explicit provider-spend budget arrive with engine evaluation; this slice makes no image/model calls and adds no automatic preparation. Later storage tickets attach content hashes and dependency invalidation to approved input changes; saved images retain their original versions.

## Verification

`npm test -- --run src/lib/__tests__/work-preparation.test.ts` covers the three style contracts, metadata exclusion, scope flags, Bible/Holmes fixtures, exact limits, invalid fields/IDs, every era's prompt, conditional rules, main-era selection, preference preservation, temporary unavailability and draft-to-canon routing. Run `npm run lint`, `npm run typecheck` and the full suite before publishing changes.
