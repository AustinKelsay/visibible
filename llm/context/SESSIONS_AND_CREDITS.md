# Sessions and credits

[session.ts](../../src/lib/session.ts) signs the `visibible_session` JWT cookie and verifies session expiry. IP changes are logged and rotate the cookie; they do not invalidate the session by themselves. Session records and balances live in [convex/sessions.ts](../../convex/sessions.ts), not in browser storage. The browser cookie provides access to that anonymous session; clearing it or changing browsers does not transfer the balance.

New sessions are `paid` tier with zero credits. Admin tier is sticky and bypasses credit/spending checks; admin usage is audited. Admins still pass the routes' rate limits. Default expiry is seven days idle with a thirty-day absolute cap; activity refreshes are bounded by that cap. Timeout overrides and valid ranges are in [.env.example](../../.env.example).

## Reservation and settlement

Credits are reserved atomically before paid generation. Each generation ID has a one-way settlement: reserved → charged or released. Duplicate terminal operations must not create another charge/refund, and released IDs cannot be reserved again. Crons reconcile stale reservation-only generations after thirty minutes; [crons.ts](../../convex/crons.ts) is the schedule source.

- **Chat:** reserve the token-based estimate, then charge that estimate on successful stream completion. Actual token cost is metadata/monitoring. Errors and cancellation release the hold.
- **Images:** eligibility uses the estimated price; a conservative reservation can be larger. Low-balance reservations are capped at available credits. Successful image requests reconcile against reported usage, returning unused reserved credits or charging the additional amount when the remaining balance covers it. Otherwise settlement retains the reserved charge and reports a shortfall. Missing usage falls back to the learned estimate, then catalog pricing, rather than charging the conservative hold.
- **Planner:** reserve/charge only for a needed call. Cache hits skip it; an unusable plan releases the planner hold.

[image-models.ts](../../src/lib/image-models.ts) defines estimate/reservation math and the five-credit spend-down grace. The grace requires a positive balance and applies to explicit image generation; auto-generation requires full estimated affordability. Learned resolution estimates live in [modelCostStats.ts](../../convex/modelCostStats.ts). [chat-models.ts](../../src/lib/chat-models.ts) defines chat pricing.

Chat enforces a 100-credit estimated per-request cap. The image route does not have that same cap. Convex applies non-admin daily spending checks (default $5/day, reset at UTC midnight). These admission checks are not a guarantee that an upstream provider's eventual cost cannot exceed its estimate. Read the route checks and Convex settlement together when changing pricing.

[SessionProvider](../../src/context/session-context.tsx) supplies balance, tier and purchase-modal state. Without Convex, free browsing remains available but session-backed AI generation/billing is unavailable. See [Payments](PAYMENTS.md), [Security](SECURITY.md), and [Image generation](IMAGE-GENERATION.md).

Chat and planner catalog rates, including emergency fallback rates, are USD per token. [Token pricing](../../src/lib/token-pricing.ts) validates rates and token counts, sums decimal amounts exactly and rounds credits once after markup. Invalid or missing pricing returns no quote; known zero provider spend remains distinct. The existing one-credit minimum is retained. This changes new estimates and metadata only; historical ledger entries are not repriced.

Access expiry is separate from record retention. Cleanup preserves funded sessions and sessions linked to any ledger, invoice, bulk job or image generation record. Only expired, empty, unlinked sessions are deleted, in bounded cursor batches. Operators can run a dry run first. Retention does not restore expired-cookie access or add cross-device recovery.

Chat settlement follows SDK outcomes: nonempty `stop` or `length` completion charges the admitted amount; `length` is marked incomplete. Empty output, embedded provider errors and cancellation release the reservation. Request abort and response cancellation propagate to the provider. Final metadata reports the actual settlement result, including an unresolved release, instead of assuming a completed stream was charged. Durable provider-spend receipts and retryable settlement recovery remain separate work.

Lightning status GET and explicit POST verify LND before considering local expiry. A verified settled payment with matching hash and sufficient paid sats can finalize an expired invoice. Invoice-paid, wallet credits and an invoice-keyed purchase ledger entry commit in one mutation. Duplicate confirmation does not grant another purchase, including a second invoice record using an already-credited payment hash. LND lookup failures return an unavailable/error response without changing unpaid state. Live LND verification remains pending while the node is offline.
