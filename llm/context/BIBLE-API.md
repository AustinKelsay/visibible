# Bible text and translations

[The API client](../../src/lib/bible-api.ts) fetches chapter text from `https://bible-api.com/data/{translation}/{bookId}/{chapter}`. `getVerse()` selects a verse from that chapter. `getVerseByReference()` uses the reference endpoint and supports direct lookups used by image generation.

- `TRANSLATIONS` defines selectable translations; `DEFAULT_TRANSLATION` is WEB. A selectable translation does not guarantee upstream coverage for every verse.
- [Static structure](../../src/data/bible-structure.ts) supplies book slugs and chapter/verse counts for navigation. URL validation uses this structure, not an upstream text lookup.
- Chapter results are cached in a process-local map keyed by book, chapter and translation. Fetches also request Next.js revalidation after 30 days. The map has no time-based expiry; `clearBibleApiCache()` clears it.
- Chapter fetch errors return `null`. Reference lookup returns `null` for non-retryable HTTP errors; network errors and HTTP 408/429/5xx raise a retryable `BibleApiLookupError`. Callers must distinguish missing text from upstream failure.
- [The translation helper](../../src/lib/get-translation.ts) reads the translation cookie and accepts only own keys of `TRANSLATIONS`, falling back to the default.

[The verse page](../../src/app/[book]/[chapter]/[verse]/page.tsx) assembles text and adjacent context. Preference persistence is documented in [Preferences](PREFERENCES.md).
