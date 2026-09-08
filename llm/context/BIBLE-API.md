# Bible text and translations

[The API client](../../src/lib/bible-api.ts) fetches chapter text from `https://bible-api.com/data/{translation}/{bookId}/{chapter}`. `getVerse()` selects a verse from that chapter. `getVerseByReference()` uses the reference endpoint and supports direct lookups used by image generation.

- `TRANSLATIONS` defines selectable translations; `DEFAULT_TRANSLATION` is WEB. A selectable translation does not guarantee upstream coverage for every verse.
- [Static structure](../../src/data/bible-structure.ts) supplies book slugs and chapter/verse counts for navigation. URL validation uses this structure, not an upstream text lookup.
- Completed chapter responses use the existing Next.js fetch cache with 30-day revalidation and book/chapter/translation tags. There is no process-local completed-response cache. A table of at most 256 active lookups coalesces concurrent readers by book/chapter/translation; entries disappear on success, missing text, failure or the 10-second fetch deadline. Requests beyond that active capacity fail as retryable before another fetch starts. `clearBibleApiCache()` only clears active lookup bookkeeping (used by tests); it does not invalidate Next.js cache entries.
- The small active table remains because the installed Next.js `dedupe-fetch` bypasses React memoization for requests with an explicit abort signal, and image HTTP handlers are outside the React render tree. Successful response lifetime belongs to Next; the optional 256-completed-entry/24-hour process cache from the spec is unnecessary.
- Invalid static chapter/verse locations, HTTP 404 and absent verses return `null`. Chapter network, timeout, invalid-payload and other HTTP failures raise a retryable `BibleApiLookupError`; unsuccessful lookups are removed from the active table. Reference lookup still returns `null` for non-retryable HTTP errors and raises for network errors and HTTP 408/429/5xx. Both endpoints have a 10-second timeout.
- The chapter endpoint has nested `translation.identifier`/`translation.name` metadata and verse `book` fields; the reference endpoint uses `translation_id`/`translation_name` and `book_name`. The adapter validates chapter identity and maps canonical book names from the static structure. See the [provider endpoint](https://bible-api.com/data/web/JHN/3) and [implementation](https://github.com/seven1m/bible_api/blob/master/app.rb).
- Reader failures stay at the requested URL with retry and translation controls. Invalid URLs use the not-found screen. Adjacent prompt context uses only the loaded chapter, while navigation still crosses book boundaries.
- [The translation helper](../../src/lib/get-translation.ts) reads the translation cookie and accepts only own keys of `TRANSLATIONS`, falling back to the default.

[The verse page](../../src/app/[book]/[chapter]/[verse]/page.tsx) assembles text and adjacent context. Preference persistence is documented in [Preferences](PREFERENCES.md).

## Translation coverage evidence

The [coverage snapshot](../../tests/fixtures/scripture-coverage.json) records the provider book listings and Genesis 1 / Revelation 22 responses for all 16 selectable translations, sampled on 2026-09-08 UTC. All returned Revelation 22. Genesis 1 returned 404 for Cherokee, YLT, OEB-CW and OEB-US. Cherokee listed 27 books; the others listed 66, which demonstrates that a book listing alone cannot establish chapter coverage. The [provider documentation](https://bible-api.com/) also describes YLT as NT only.

These are representative samples, not a whole-corpus audit or a permanent availability guarantee. Static navigation retains the existing 66-book structure and verse counts; differing versification is not remapped. A statically valid but absent verse shows unavailable translation text. Do not infer other chapter coverage from these samples or bulk-download the provider to fill gaps.
