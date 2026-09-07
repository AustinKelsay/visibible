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
