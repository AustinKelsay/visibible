# Recover a preserved wallet after a credential reset

The recovery flow changes access to an existing session record. It never moves
credits, changes the wallet SID or tier, or rewrites invoice or ledger records.
Old cookies and old guest JWTs are not accepted as proof of ownership.

Before enabling the clean deployment, replace SESSION_SECRET, IP_HASH_SECRET,
CONVEX_SERVER_SECRET, admin credentials and guest JWT signing/trust keys in the
appropriate services. Deploy Convex with only the new public guest key in
GUEST_AUTH_JWKS; do not retain a key overlap after a compromise. Existing frontend
deployments must be replaced or remain inaccessible. Keep Nostr publishing
disabled in Convex with NOSTR_PUBLISHING_ENABLED=false.

## Issue a private recovery grant

1. Verify ownership privately and record a non-secret case reference. The owner
   confirmed that the retained incident balances belong to their test use and
   that there are no other users. Select the exact wallet from the preserved
   private mapping; do not merge balances or guess a SID.
2. Recheck the wallet's document ID, paid tier, revocation status and current
   credit balance. Generate 32 cryptographically random bytes as 64 lowercase
   hexadecimal characters on the operator's trusted machine. Keep that code in
   a private file or password manager; never put it in a URL, command argument,
   public issue, chat, source file or log.
3. Compute SHA-256 over the UTF-8 code string (no trailing newline). Only this
   hash goes to the backend. Call the **internal** `sessionRecovery:issue`
   mutation from the authenticated Convex control plane with `walletId`,
   `expectedCredits`, `tokenHash`, `expiresAt` (epoch milliseconds, at most 24
   hours ahead) and `verificationReference`. Prefer a one-hour expiry.
4. Supply the raw code privately to the verified owner. Issuing a replacement
   revokes previous pending grants for that wallet. A wallet that has already
   been recovered is rejected and needs a separate access-review procedure.
   `sessionRecovery:revoke` can revoke a pending grant by its document ID.

## Redeem and verify

Open `/recover` in a fresh browser session and enter the private code. Preserve
the old browser's data separately. The page obtains a new session and CSRF
cookie, then sends the code only in a POST body. The API validates the current
cookie, origin and CSRF token, rate-limits attempts, and sends only the code hash
and authenticated requester SID to Convex. The route never accepts a target SID
from the client.

Convex atomically consumes the grant and binds it to the requester session. The
API signs a fresh cookie for the original wallet SID and the page reloads to
reset guest-auth subscriptions. A lost response can be retried by the same
requester (or the already-restored wallet), until expiry. Another session cannot
replay the code. A session with another balance, invoice or ledger history is
rejected to avoid stranding that wallet; use a fresh private window.

Recheck the original balance, invoices and ledger after redemption. Retain the
grant's audit record, including the review reference and redemption time.
Destroy the private delivery copy after successful recovery. Do not delete
financial history or credit it again.

## Deployment verification still required

The local regression tests use dummy wallets, keys and payment records. Before
restoration, verify the actual clean deployment rejects the retired cookie,
guest JWT, server and admin credentials; accepts the replacement credentials;
preserves all existing balances; and keeps Nostr disabled. Build from the clean
source with reviewed dependencies and no infected build cache. Do not use the
incident validation dependency tree as a production artifact.
