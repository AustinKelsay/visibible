# Reference-text snapshots

The compressed files are checked source assets, not generated analysis. They allow both work files to be reproduced without contacting a website. [manifest.json](manifest.json) records retrieval URLs/date, decompressed byte lengths and SHA-256 hashes; the WEB entry also records the downloaded archive hash.

- **WEB:** [eBible.org classic WEB VPL archive](https://ebible.org/Scriptures/eng-web_vpl.zip), member `eng-web_vpl.txt`. The archive describes this as the 2020 stable text edition. The unmodified source includes additional books; the importer selects the app's 66-book canon and normalizes only the Romans doxology numbering. The full publisher notice is retained as [eng-web_about.htm](eng-web_about.htm). The text is public domain; the publisher's name/trademark notice is retained.
- **WEB footnote readings:** [web-footnotes.json](web-footnotes.json) contains the exact readings and publisher notes for [Luke 17:36](https://ebible.org/eng-web/LUK17.htm#FN1), [Acts 8:37](https://ebible.org/eng-web/ACT08.htm#FN2), [Acts 15:34](https://ebible.org/eng-web/ACT15.htm#FN5) and [Acts 24:7](https://ebible.org/eng-web/ACT24.htm#FN2). These four IDs have blank main-text records in the VPL source. The chapter HTML snapshots in `footnotes/` are compressed verbatim; their hashes and retrieval dates are recorded alongside each reading. Import checks bind each excerpt to its footnote anchor and retain that provenance on the unit/moment. They are explicitly marked variants, not silently substituted main text.
- **Holmes:** [Project Gutenberg eBook #1661](https://www.gutenberg.org/ebooks/1661), [UTF-8 text](https://www.gutenberg.org/cache/epub/1661/pg1661.txt), updated October 10, 2023. Author: Arthur Conan Doyle. Production credits: an anonymous Project Gutenberg volunteer and Jose Menendez. Public domain in the USA. The complete downloaded source, including its Project Gutenberg license and credits, is inside `pg1661.txt.gz`; only the story body becomes work units.

The sources are compressed with gzip, with timestamp zero. Decompression preserves the exact original UTF-8 bytes, including any BOM/line endings. The importer normalizes line wrapping/paragraph whitespace for Holmes and strips source-only headings/wrappers; it retains actual story parts and all paragraph text.

## Refresh deliberately

Source refreshes can change positional identities and future analysis, so review them as input changes:

1. Download the two URLs above to a temporary directory, keeping the WEB ZIP intact for its checksum.
2. Extract `eng-web_vpl.txt` and `eng-web_about.htm` from the ZIP. Keep the complete Gutenberg file, including its license.
3. Gzip the two text files with timestamp zero (`gzip.compress(bytes, mtime=0)` in Python), and update the manifest with the original-byte hashes/lengths, archive hash and retrieval date.
4. If the four footnote-only verses change, explicitly review the treatment and refresh the corresponding HTML snapshots and reading data together. Keep each exact publisher note and the excerpt's punctuation; do not replace missing source records with a guessed reading.
5. Run `npm run works:check`, `npm run works:import`, and the work-input/importer tests. Inspect changed verse/paragraph identities and source notices before committing the refreshed assets.

The import command deliberately has no download mode. Source acquisition is separate from preparation and image requests.
