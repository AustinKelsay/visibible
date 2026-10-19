# Imported reference works

[Work input](../../src/lib/work-input.ts) provides the generic engine's offline reference-text boundary. It is not yet connected to image routing. The Bible reader and current generation route still use the [Bible API](BIBLE-API.md); changing an imported file does not change their behavior.

## Reproduce the files

```sh
npm ci
npm run works:check
npm run works:import
```

Both commands run locally with no network or model calls. They verify the decompressed source bytes against [the manifest](../../works/sources/manifest.json), verify the four footnote snapshots/readings, parse and validate both works, and print unit counts and output hashes. `works:check` writes nothing. `works:import` produces:

- `works/bible-web/work.json`
- `works/holmes-adventures/work.json`

These generated files are ignored; the compressed source snapshots, checksums and importers are committed. Regenerate them before a future preparation command consumes the files. They are not put in `public/` or loaded into the reader's client bundle. See [source provenance and refresh instructions](../../works/sources/README.md).

## File contract

A version-1 file contains `id`, `title`, `author`, `language`, `referenceText` (name, source URL, credit and primary source-text SHA-256), ordered `levels`, `referenceFormats`, `momentMode` and a division tree. Each division has a positional `key`, display `label`, `level`, and either child `divisions` or numbered `units`. Units contain `number` and the complete `text`. An optional `sourceNote` identifies a footnote reading with its original reference, source URL, snapshot hash and publisher's note. The hash printed by the command covers the complete imported work, including these supplemental readings.

Arrays define one reading order. Division levels follow the declared hierarchy but can skip optional levels. Sibling keys and all derived identities must be unique. Unit numbers start at one in each leaf division and are consecutive. Empty text, invalid hierarchy, ambiguous references and malformed input fail validation.

A unit ID joins its division keys and number with hyphens. Bible keys give `genesis-1-1`, matching the existing verse IDs. Holmes's first story contains three parts, so its first unit is `a-scandal-in-bohemia-1-1`; stories without parts use IDs such as `the-red-headed-league-1`. The prototype treated part headings as paragraphs; those experimental paragraph IDs are not the production input contract.

Reference templates are keyed by the leaf division's level. Named placeholders use ancestor labels and the unit number:

- Bible `Chapter`: `{Book} {Chapter}:{Verse}`
- Holmes `Story`: `{Story} ¶{Paragraph}`
- Holmes `Part`: `{Story}, Part {Part} ¶{Paragraph}`

`createWorkReader(unknown)` validates and indexes a file. `getUnit(id)` and `getUnitByReference(reference)` return the original text and exact formatted reference; unknown identities fail. Reference lookup is exact, not the reader's free-form alias resolver. Text is never truncated to an image-prompt budget.

## Fixed moments and neighboring context

The source importer does not invent story sections. A later reading pass supplies a complete ordered section partition using `firstUnitId` and `lastUnitId`. Sections and moments use their first unit's ID as their stable identity.

`createMomentReader(work, sections)` validates the partition:

- In `unit` mode (Bible), each unit becomes one moment; supplied grouped moments are rejected.
- In `reading-pass` mode (Holmes), every section supplies its fixed `moments`, each an inclusive range of consecutive units. Selecting and sizing these moments belongs to the reading pass.
- Unknown units, inverted ranges, gaps, overlaps, incomplete coverage and moments crossing their declared section fail validation.

`getMoment(id)` accepts only a registered moment ID. It joins the complete unit text with paragraph breaks and carries any per-unit `sourceNotes`; it accepts no arbitrary request span or replacement client text. `getContext(id)` returns that moment and its preceding/following moments only when they belong to the same section. A section boundary returns `null`, even when another unit is next in the work. [Nested prose fixtures](../../tests/fixtures/nested-work.json) exercise optional parts and multi-unit moments.

## Bible normalization

The eBible classic WEB snapshot contains the app's 66 books plus additional books. The importer explicitly selects the app's canon and maps source book abbreviations to the existing [Bible structure](../../src/data/bible-structure.ts).

The selected source has 31,103 verse records. Romans 14:24–26 contains the closing doxology, while Romans 16:25 is an empty marker. The importer moves those three texts intact to Romans 16:25–27 and replaces the empty marker, producing exactly **31,102** units. It preserves Romans 14:23 and 16:24.

WEB also leaves Luke 17:36, Acts 8:37, Acts 15:34 and Acts 24:7 blank in its main text. For these four IDs only, the importer uses the readings printed in WEB's own footnotes, explicitly retaining their variant attribution in each unit and moment. [The reading data](../../works/sources/web-footnotes.json) links each exact excerpt to its checked source snapshot. These are footnote variants, not claims about the edition's main text, and no text is borrowed from another translation. The importer requires the four blank markers to exist and rejects a changed arrangement. Any other missing/empty verse, duplicate or extra canonical verse fails instead of silently dropping or inventing text.

Tests compare every output ID and reference against existing navigation helpers, verify the three relocated texts, and verify every reference resolves back to its unit. Existing URLs, saved images and scene-plan keys are untouched by this slice.
