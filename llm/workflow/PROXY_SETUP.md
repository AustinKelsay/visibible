# Proxy Trust Setup (Vercel)

This project only trusts `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip` when the request originates from a trusted proxy. Otherwise it uses the immediate peer IP (or returns `unknown` if the runtime does not expose it).

## Why this exists

Proxy headers can be spoofed by clients. To avoid forging client IPs (which impacts rate limits and abuse protection), we only parse proxy headers if the request is known to come from a trusted proxy.

## Configuration

Set one of the following in your deployment environment:

### 1) Platform trust (recommended for Vercel)

```bash
TRUST_PROXY_PLATFORM=vercel
```

This tells the server to trust proxy headers when running on Vercel. It only activates when `VERCEL=1` is present (set by Vercel at runtime).

### 2) Explicit trusted proxy IPs/CIDRs

```bash
TRUSTED_PROXY_IPS="203.0.113.10,203.0.113.0/24,2001:db8::/32"
```

- Comma- or whitespace-separated list of IPs and/or CIDRs.
- IPv4 and IPv6 are supported.

## Local development

In local dev, the runtime usually does **not** expose a peer IP. If no trusted proxy config is set, `getClientIp()` returns `unknown` and proxy headers are ignored (by design).

If you need client IPs locally (e.g., to test rate limiting), you can opt into trusting headers during local testing by setting one of the options above.

## Code reference

- `src/lib/session.ts` implements `getClientIp()` and `isTrustedProxy()`.
