# Security boundaries

The main protected resources are provider spend, credit balances, session access and stored images. This is a map of implemented controls and their limits, not a claim that every public Convex function shares one authorization model.

## HTTP requests

- [origin.ts](../../src/lib/origin.ts) accepts a matching request origin or configured allowlisted origin; its general helper also accepts a missing Origin. Image generation adds a strict missing-Origin rejection.
- [csrf.ts](../../src/lib/csrf.ts) implements cookie/header double-submit checks, enforced by image generation, admin login and the Convex token exchange.
- [session.ts](../../src/lib/session.ts) verifies the signed session and hashes the current client IP for quotas/telemetry. An IP change triggers cookie rotation rather than session rejection. [Proxy configuration](../workflow/PROXY_CONFIGURATION.md) determines whether the client IP is meaningful. An unknown IP does not establish a distinct client identity.
- [request-body.ts](../../src/lib/request-body.ts) bounds streamed bodies. Route Zod schemas define field limits; chat and images use 100 KiB, feedback 10 KiB.
- [validate-env.ts](../../src/lib/validate-env.ts) validates session/IP secrets, conditional Convex/admin secrets, session timeout bounds and production proxy settings. It does not apply a universal length rule to every environment secret.

## Rate and spending controls

[convex/rateLimit.ts](../../convex/rateLimit.ts) owns quotas and admin-login lockouts. The counter resets when the current window expires; it is not a rolling request-by-request window.

Chat/image generation and invoice polling use the combined IP hash and session ID; Convex token issuance uses the session ID. Session creation, invoice creation and feedback use the IP hash. A combined IP/session quota is per pair, so it does not alone prevent creating multiple sessions. Shared-IP quotas also affect unrelated users behind the same network. Admin login adds escalating lockouts after repeated failures.

Model validation, reservation, daily-spend checks and admin audit are described in [Sessions and credits](SESSIONS_AND_CREDITS.md). Admin credit exemptions do not exempt requests from rate limits.

## Convex authorization

Credit/ledger writes, invoice writes, feedback submission, image persistence, rate-limit status and admin-lockout reads, and other server-facing operations validate `CONVEX_SERVER_SECRET` via [auth.ts](../../convex/_helpers/auth.ts). Internal functions are invoked within Convex.

[POST /api/convex-token](../../src/app/api/convex-token/route.ts) bridges the signed HttpOnly cookie to Convex identity. It validates origin, CSRF, the signed session with current-IP tracking, a rate limit and a current, unrevoked session record, then [guest-token.ts](../../src/lib/guest-token.ts) signs an RS256 bearer token whose subject is the SID. The token expires at the earlier of five minutes and the cookie's expiry, carries no tier or balance, and lives only in the Convex client's memory; issuing it does not refresh the session cookie. [auth.config.ts](../../convex/auth.config.ts) accepts only the configured public keys, issuer and audience; the private key stays in Next.js. Configuration, rotation and revocation are in [guest authentication](../../docs/agents/guest-auth.md).

Browser-callable private functions (`guestAuth.current`, session, credit history, invoice, generation status and bulk jobs) require that verified identity: the token subject must match any supplied SID and the session must be current and unrevoked. A supplied SID selects records but never proves ownership; unauthorized private queries return no data and private controls reject the call. [The function inventory](../../docs/agents/convex-access.md) lists each rule. Public image-library, history and impression functions expose no private session records. Paid work still goes through `/api/generate-image`.

Remote image persistence has hostname/allowlist, MIME and size checks, with DNS/redirect limitations documented in [Image persistence](IMAGE-PERSISTENCE.md). Keep these limitations visible when extending fetch allowlists.

Operational endpoint authorization is described in [Observability](OBSERVABILITY.md). Tests under `src/lib/__tests__` and `src/app/api/__tests__` cover the individual boundaries; passing them is not an exhaustive security audit.
