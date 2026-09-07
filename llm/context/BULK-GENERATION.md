# Bulk image generation

[BulkGeneratePanel](../../src/components/bulk-generate-panel.tsx) builds a queue and estimate using [bulk-generation.ts](../../src/lib/bulk-generation.ts). Scopes are next verses, chapter ranges, or an entire book. Next verses exclude the current verse. Chapter scope starts with the current chapter only at verse 1; otherwise it starts with the next chapter. Book scope includes the whole book.

[BulkGenerationProvider](../../src/context/bulk-generation-context.tsx) runs sequential browser requests to `/api/generate-image`. [convex/bulkGenerations.ts](../../convex/bulkGenerations.ts) persists job settings, queue rows and progress so a session can recover its active/paused job. Closing the browser does not leave a server worker running the remaining queue.

- Every generated verse uses the normal image route's validation and charging; the total estimate is not an upfront bulk charge.
- Insufficient credits pause the job and return the current item to the queue. HTTP 429 pauses it with a blocked UI state for manual resume. Other failed requests are recorded as failed items.
- Pause/cancel controls stop subsequent work; they do not abort an already-sent image request.
- Job and verse updates check ownership by the supplied session ID against database records. These browser-callable functions do not take the server secret or independently validate the HTTP session cookie. See [Security](SECURITY.md) for the distinction from paid generation authorization.

Use [bulk-generation tests](../../src/lib/__tests__/bulk-generation.test.ts), [navigation bulk tests](../../src/lib/__tests__/navigation-bulk.test.ts), and [panel tests](../../src/components/__tests__/bulk-generate-panel.test.tsx) when changing scope/selection behavior. Persisted state is defined in [schema.ts](../../convex/schema.ts).
