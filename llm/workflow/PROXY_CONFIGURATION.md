# Proxy Trust Configuration (Workflow)

Use this document when deploying the app so client IPs, rate limiting, and audit logs work correctly behind a proxy/CDN.

## When you need this

If the app is behind a reverse proxy, load balancer, or CDN (Vercel, Cloudflare, AWS ALB, nginx, etc.), the incoming connection is the proxy, not the end user. You must explicitly trust that proxy before the app will read proxy headers.

Without proxy trust:
- Rate limiting groups all users under the proxy IP
- IP-bound sessions can invalidate unexpectedly
- Audit logs and geo logic are incorrect

## Current Project Convention

For this repository's Vercel setup:

- Vercel Preview: `TRUST_PROXY_PLATFORM=vercel`
- Vercel Production: `TRUST_PROXY_PLATFORM=vercel`

Do not set `TRUSTED_PROXY_IPS` when using the Vercel platform trust mode.

## Configuration options

Set exactly one of the following in your deployment environment:

### Option A: Platform trust (Vercel)

```env
TRUST_PROXY_PLATFORM=vercel
```

This only activates when `VERCEL=1` is present (set by Vercel at runtime).

### Option B: Explicit trusted proxy IPs/CIDRs

```env
TRUSTED_PROXY_IPS="203.0.113.10,203.0.113.0/24,2001:db8::/32"
```

- Comma- or whitespace-separated list
- IPv4 and IPv6 supported

## Examples by deployment

### Vercel (recommended)

```env
TRUST_PROXY_PLATFORM=vercel
```

### Cloudflare

```env
# See https://cloudflare.com/ips for the current list
TRUSTED_PROXY_IPS=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22
```

### AWS Application Load Balancer

```env
# Example: ALB in 10.0.0.0/24 subnet
TRUSTED_PROXY_IPS=10.0.0.0/24
```

### nginx / custom reverse proxy

```env
TRUSTED_PROXY_IPS=192.168.1.100,192.168.1.101
```

## Local development

By default, proxy headers are ignored in local dev (to prevent spoofing), and the runtime may not expose a peer IP. If you need to test rate limits locally, set one of the options above.

## How client IP is resolved

1. If the peer IP is *not* trusted, the app uses the peer IP (or `unknown`).
2. If trusted, headers are checked in order:
   - `x-forwarded-for` (first valid IP)
   - `x-real-ip`
   - `cf-connecting-ip`
   - falls back to peer IP

## Safety warnings

At startup, the app emits warnings for risky settings, including:
- Overly broad CIDRs (e.g., `0.0.0.0/0`, `::/0`)
- `TRUST_PROXY_PLATFORM=vercel` set without `VERCEL=1`
- No proxy trust configured in production

Avoid trusting wide CIDRs. They allow clients to spoof IPs via headers.

## Troubleshooting

- "All users share the same rate limit": proxy trust is not configured.
- "Sessions keep invalidating": multiple proxy layers not included in `TRUSTED_PROXY_IPS`.
- "Logs show wrong IP": ensure your proxy forwards `X-Forwarded-For` and its IP is trusted.

## Code reference

Implementation details live in `llm/implementation/PROXY_CONFIGURATION.md`.
