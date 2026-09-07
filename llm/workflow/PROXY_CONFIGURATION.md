# Proxy trust

Use this guide when configuring IP tracking, rate limits or ops IP allowlists behind a proxy. [client-ip.ts](../../src/lib/client-ip.ts) is the shared IP resolver. Session-backed routes import it through [session.ts](../../src/lib/session.ts); ops routes import it directly. [validate-env.ts](../../src/lib/validate-env.ts) enforces configuration checks.

## Choose trust for the runtime

On Vercel, set `TRUST_PROXY_PLATFORM=vercel`. It only activates with `VERCEL=1`; do not set platform trust locally to simulate a real client IP.

For a custom proxy, set `TRUSTED_PROXY_IPS` to its specific IPs or narrow CIDRs, separated by commas or whitespace. The runtime must expose a peer IP that can be matched against those entries. Obtain proxy ranges from your actual deployment configuration instead of copying a static provider list from documentation.

The proxy must sanitize client-supplied forwarding headers. The app takes the first valid IP in `x-forwarded-for` once trust is established; it does not independently verify each hop in a forwarding chain.

## Resolution and failure modes

Without trust, resolution returns the peer IP or `unknown`. With trust, priority is `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, then peer IP. Shared/unknown IPs can combine users' rate limits and reduce the usefulness of IP telemetry. Local development commonly has an unknown peer; setting trusted CIDRs cannot manufacture a missing peer address.

Production validation rejects unsupported platform values, Vercel trust without the Vercel runtime marker, specifically detected overly broad ranges, and missing trust configuration. `ALLOW_UNTRUSTED_PROXY_IN_PRODUCTION=true` is a temporary override for the missing-trust check, not the other failures. Development emits warnings for these proxy configuration problems.

`DEBUG_PROXY=true` enables trust audit logging outside development. Check the resolved source and header handling when quotas appear shared or IP-change cookie rotations are unexpected. Ops allowlists use exact IPs and have separate semantics; see [Observability](../context/OBSERVABILITY.md).
