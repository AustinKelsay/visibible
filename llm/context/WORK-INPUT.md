# Imported reference works

[Work input](../../src/lib/work-input.ts) provides the generic engine's offline reference-text boundary. Image requests take the moment's text and its neighbours from these files and save their reference-text provenance. The Bible reader retains selected-translation fetching through the [Bible API](BIBLE-API.md), with the imported WEB standing in for a default-translation chapter the service cannot supply ([stand-in](BIBLE-API.md#default-translation-imported-text-as-stand-in)), and the image route still resolves and validates the requested reference there before admission ([Image generation](IMAGE-GENERATION.md#request-lifecycle)).

## Reproduce the files

```sh
npm ci
npm run works:check
npm run works:import
```

Both commands run locally with no network or model calls. They verify the decompressed source bytes against [the manifest](../../works/sources/manifest.json), verify the four footnote snapshots/readings, parse and validate all three works, and print unit counts and output hashes. `works:check` writes nothing. `works:import` produces:

- `works/bible-web/work.json`
- `works/holmes-adventures/work.json`
- `works/alice-in-wonderland/work.json`

These generated files are ignored; the compressed source snapshots, checksums and importers are committed. `npm run build` regenerates them offline before Next.js traces the server files, so a clean deployment includes the same versioned reference text as preparation. Run `works:import` before local preparation commands too. The files are not put in `public/` or loaded into the reader's client bundle. See [source provenance and refresh instructions](../../works/sources/README.md).

## File contract

A version-1 file contains `id`, `title`, `author`, `language`, `referenceText` (name, source URL, credit and primary source-text SHA-256), ordered `levels`, `referenceFormats`, `momentMode` and a division tree. Each division has a positional `key`, display `label`, `level`, and either child `divisions` or numbered `units`. Units contain `number` and the complete `text`. An optional `sourceNote` identifies a footnote reading with its original reference, source URL, snapshot hash and publisher's note. The hash printed by the command covers the complete imported work, including these supplemental readings.

Arrays define one reading order. Division levels follow the declared hierarchy but can skip optional levels. Sibling keys and all derived identities must be unique. Unit numbers start at one in each leaf division and are consecutive. Empty text, invalid hierarchy, ambiguous references and malformed input fail validation.

A unit ID joins its division keys and number with hyphens. Bible keys give `genesis-1-1`, matching the existing verse IDs. Holmes's first story contains three parts, so its first unit is `a-scandal-in-bohemia-1-1`; stories without parts use IDs such as `the-red-headed-league-1`. The prototype treated part headings as paragraphs; those experimental paragraph IDs are not the production input contract.

Reference templates are keyed by the leaf division's level. Named placeholders use ancestor labels and the unit number:

- Bible `Chapter`: `{Book} {Chapter}:{Verse}`
- Holmes `Story`: `{Story} ¶{Paragraph}`
- Holmes `Part`: `{Story}, Part {Part} ¶{Paragraph}`
- Alice `Chapter`: `{Chapter} ¶{Paragraph}`, such as `A Mad Tea-Party ¶1` (unit `a-mad-tea-party-1`)

Alice (*Alice's Adventures in Wonderland*) is the regression suite's third work ([ADR 0011](../../docs/adr/0011-frozen-multi-work-regression-suite.md)): imported like Holmes and, like Holmes, an owner-only preview at `/read` ([Navigation](NAVIGATION.md#prose-works)). Its twelve chapters become numbered paragraphs; only star separators and the closing "THE END" are dropped.

`createWorkReader(unknown)` validates and indexes a file. `getUnit(id)` and `getUnitByReference(reference)` return the original text and exact formatted reference; unknown identities fail. Reference lookup is exact, not the reader's free-form alias resolver. Text is never truncated to an image-prompt budget. [Nested prose fixtures](../../tests/fixtures/nested-work.json) exercise optional parts.

## Moments and neighbouring context

The importer does not invent sections or moments. The [reading pass](WORK-PREPARATION.md#reading-pass) defines both and stages them in the work's Convex analysis ([Analysis storage](ANALYSIS-STORAGE.md)), where each is identified by its first unit and activation rejects a moment without a section. In `unit` mode (the Bible) every unit is its own moment; in `reading-pass` mode (Holmes, Alice) the model proposes runs of units inside each section and code checks that they tile it ([moments.ts](../../src/lib/reading-pass/moments.ts)). At request time `momentContext` ([work-inputs.ts](../../src/lib/engine/work-inputs.ts)) joins the moment's unit text and adds the unit before and after it only when they lie in the same section.

## Bible normalization

The eBible classic WEB snapshot contains the app's 66 books plus additional books. The importer explicitly selects the app's canon and maps source book abbreviations to the existing [Bible structure](../../src/data/bible-structure.ts).

The selected source has 31,103 verse records. Romans 14:24–26 contains the closing doxology, while Romans 16:25 is an empty marker. The importer moves those three texts intact to Romans 16:25–27 and replaces the empty marker, producing exactly **31,102** units. It preserves Romans 14:23 and 16:24.

WEB also leaves Luke 17:36, Acts 8:37, Acts 15:34 and Acts 24:7 blank in its main text. For these four IDs only, the importer uses the readings printed in WEB's own footnotes, explicitly retaining their variant attribution in each unit and moment. [The reading data](../../works/sources/web-footnotes.json) links each exact excerpt to its checked source snapshot. These are footnote variants, not claims about the edition's main text, and no text is borrowed from another translation. The importer requires the four blank markers to exist and rejects a changed arrangement. Any other missing/empty verse, duplicate or extra canonical verse fails instead of silently dropping or inventing text.

Tests compare every output ID and reference against existing navigation helpers, verify the three relocated texts, and verify every reference resolves back to its unit. Existing URLs and saved images are untouched by the import.
