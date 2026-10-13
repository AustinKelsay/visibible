# Anonymous Convex authentication

Next.js exchanges a valid signed HttpOnly session cookie for a five-minute RS256 bearer token at `POST /api/convex-token`. The token subject is the existing SID. It contains no tier or balance. `guestAuth.current` resolves the current session record, including tier, available credits and pending holds, and denies deleted or revoked sessions. Tokens live only in the Convex client's memory.

The token expires at the earlier of five minutes and the cookie's existing expiry. Background issuance does not rotate the session cookie or extend its idle deadline. The CSRF cookie is renewed separately. Ordinary session activity retains the existing idle/absolute policy.

## Configuration

- `GUEST_AUTH_ISSUER`: exact deployment-specific issuer URL.
- `GUEST_AUTH_AUDIENCE`: exact deployment-specific audience.
- `GUEST_AUTH_JWKS`: JSON object with `keys`, containing public RSA JWKs with unique `kid` values. Set on both Next.js and Convex.
- `GUEST_AUTH_PRIVATE_JWK`: active private RSA JWK, including matching `kid`. **Set only on Next.js.** Never put it in a `NEXT_PUBLIC_` variable, Convex environment, repository, command argument, or log.

The Convex auth config projects only public RSA fields into a data URI, as supported by [Convex custom JWT authentication](https://docs.convex.dev/auth/advanced/custom-jwt). This avoids making local Next.js reachable from the deployment. Issuer and audience must match exactly. Convex requires referenced auth environment variables to be configured before deployment. An explicitly empty public configuration disables guest authentication for a deployment while leaving public queries available.

Development (`coordinated-shepherd-515`) is configured and verified. Production and hosted preview signing configuration have not been installed. Use separate keys/audiences per environment. Existing application/session secrets have not been rotated.

## Key rotation

1. Generate a new RS256 key pair and distinct `kid` in a protected environment.
2. Add its public key alongside the old key to the public JWKS in Next.js and Convex. Deploy the Convex auth configuration before switching signers.
3. Switch Next.js's private JWK to the new key. Retain both public keys during rollout and for at least five minutes after every old signer has stopped.
4. Remove the old public key from both configurations and redeploy Convex. Tests cover overlapping and retired keys. Emergency removal revokes tokens using the removed key; allow clients to request a new token.

Only the public values go to Convex. For CLI environment changes, feed values through stdin and specify the development deployment explicitly.

## Revocation and rollout scope

Setting `sessions.revokedAt` denies the new authenticated lookup and future token issuance. Do not delete funded sessions to revoke access. Private session, invoice, credit history, bulk control and generation-status callers now enforce ownership under T08; see [the function inventory](convex-access.md). Server credentials remain separate for backend work. The balance UI consumes that authenticated query under T10.

T07 verification uses real cookie verification, CSRF and origin validation, real Convex handlers, `jose` signature checks, and live dev signature/claim rejection. The temporary dev fixture and test module were removed. No LND or paid provider calls are required for authentication verification.

## Client recovery

Convex schedules bearer refresh before expiry. Each issued JWT has a distinct `jti`, including issuances in the same second, so the installed SDK can recognize fresh credentials. Concurrent requests for the same subject are coalesced; a subject change discards the old response. Token fetches time out after ten seconds. Reconnect retries token acquisition; window focus performs ordinary HTTP session activity, which also renews CSRF protection after a long absence.

## Reactive wallet rollout

`GuestSessionProvider` bootstraps cookie identity outside `ConvexProviderWithAuth`. `SessionProvider` runs inside it and reads `guestAuth.current`; HTTP session responses do not update displayed balances. Missing private access shows reconnect controls while Scripture remains readable. Loading and a verified zero balance are separate states.

Reservation ledger rows have an indexed `pendingReservation` projection. Reserve, charge, release and stale reconciliation maintain it in the same mutation as the available balance. Holds are already deducted from available credits and must not be subtracted again. The authenticated query reads only this guest's active holds, not its complete history.

Deploy the new schema and settlement writers, then run internal `walletMigration:backfillPendingHolds` through every returned cursor before enabling the pending-hold UI. Inspect any nonzero `unlinkedReservations` count; it means historical records cannot be classified automatically. This migration changes only previously unclassified markers, never amounts or balances. Development completed one page with 26 updates and zero unlinked reservations. Production has not been migrated.

Keep these writers while the pending-hold UI is enabled. Rolling back to old settlement writers can leave markers stale; disable that UI before such a rollback, then reconcile markers against ledger settlement before re-enabling it. Monetary truth remains the session balance and ledger entries.
