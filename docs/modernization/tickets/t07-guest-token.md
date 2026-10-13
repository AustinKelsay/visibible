# T07: Authenticate anonymous Convex access from valid sessions

<!-- visibible-modernization:T07 -->

## Parent

[S02: Verified guest access and protected credit ownership](https://github.com/AustinKelsay/visibible/issues/46)

## What to build

An existing guest opens the app and receives verified Convex identity without registering or moving their balance.

## Acceptance criteria

- [ ] Issue short-lived RS256 tokens from valid signed HttpOnly sessions with verified issuer, audience, kid, iat and expiry.
- [ ] Map subject to existing SID; derive tier from current server records; keep tokens in browser memory.
- [ ] Connect client token refresh and key rotation; enforce underlying session expiry and revocation.
- [ ] Protect issuance by origin/CSRF/rate checks and expose only public verification keys.
- [ ] Free library browsing works without a valid private identity.

## Verification

Test wrong signature/issuer/audience, expiry, rotated keys, revoked session, stale admin tier and successful existing-session balance lookup.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No accounts, cross-device recovery or relaxed cookie expiry. This adds verified identity before migrating private callers.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 25. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
