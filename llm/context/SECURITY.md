# Security Context

High-level view of the security model protecting API endpoints and OpenRouter credentials. This is user-facing behavior and product intent, not implementation detail.

## Summary

The application uses multiple layers of defense to protect against:
- **Unauthorized access** - Origin validation, session management
- **API cost abuse** - Rate limiting, input validation, spending limits
- **Credential compromise** - Admin audit logging, brute force protection
- **Configuration errors** - Startup validation, fatal errors for dangerous configs

## Threat Model

The primary concern is protecting OpenRouter API credentials from abuse that could drain credits and incur unexpected costs. Attackers may:
- Send inflated payloads to maximize token costs
- Select expensive models to drain budgets quickly
- Create multiple sessions to multiply rate limits
- Compromise admin credentials for unlimited access
- Spoof IPs to bypass rate limiting

## Protection Layers

### 1. Origin Validation
State-changing/privileged endpoints validate the `Origin` header against an allowlist (for example: session creation, chat, image generation, invoice creation, feedback, admin login). Unauthorized origins are rejected with 403.
- `/api/generate-image` is strict: missing `Origin` is rejected.

### 2. Session Security
- JWT-signed session tokens with IP binding
- Sessions tied to client IP (hashed) to prevent theft
- Short idle timeout + bounded absolute timeout
  - Idle timeout: configurable 5-15 minutes (default: 10)
  - Absolute timeout: configurable 4-48 hours (default: 8)
  - Activity-based renewal refreshes session up to (but never beyond) the absolute cap

### 3. Rate Limiting
- Per-endpoint request throttling (e.g., 20 chat/min, 5 images/min)
- Cost-incurring endpoints (`chat`, `generate-image`) use `${ipHash}:${sessionId}`
- Invoice status/confirm polling (`GET/POST /api/invoice/:id`) uses `${ipHash}:${sessionId}`
- Abuse-focused endpoints (`session`, `invoice`, `feedback`) use `ipHash`
- Admin login has exponential backoff lockout (1h → 24h)

### 4. Cost Protection
- **Message limit:** Maximum 50 messages per chat request
- **Context limit:** Maximum 2000 characters for string context
- **Body size limit:** Maximum 100KB per request (enforced via streaming, handles chunked encoding)
- **Per-request cap:** Maximum $1.00 per single request
- **Daily limit:** $5/day per session (resets UTC midnight)
- **Model validation:** Only models with valid pricing allowed

### 5. CSRF Protection
- Double-submit cookie pattern (`visibible_csrf` cookie + `x-csrf-token` header)
- CSRF validation enforced on `POST /api/admin-login`
- CSRF validation enforced on `POST /api/generate-image`

### 6. Admin Security
- Password verification with timing-safe comparison
- HMAC-based password hashing with dedicated secret
- **All admin usage logged** to `adminAuditLog` table
- `getAdminDailySpend` query for monitoring (requires server secret)

### 7. Environment Validation
- All secrets must be ≥32 characters
- Dangerous proxy configurations are **fatal in production**
- Broad CIDR ranges (0.0.0.0/0) cause startup failure

### 8. Convex Trust Boundary (Server-Only Writes)
- Sensitive Convex mutations/actions require `CONVEX_SERVER_SECRET` and are intended for server callers only.
- Image persistence (`saveImage`) is server-side only; browser-direct persistence writes are blocked.
- Reservation settlement is one-way per `generationId` (`reserved -> released` or `reserved -> charged`) and duplicate release calls are idempotent.
- Additional sensitive write paths (session creation/lastSeen, invoice create/expire, feedback submit, modelStats writes, and rate-limit mutations) are server-authenticated.

### 9. Operational Observability
- Structured JSON logging is emitted for critical failures/timeouts/settlement transitions.
- Critical API rate-limit blocks emit counter metrics and warning logs.
- Health/readiness/metrics endpoints provide operational visibility:
  - `/api/health` (liveness)
  - `/api/readiness` (critical dependency checks)
  - `/api/metrics` (in-process counters snapshot)

## What This Means for Users

### Regular Users
- Can browse Scripture freely without credits
- Need credits for chat and image generation
- Limited to $5/day spending (protection against runaway costs)
- Rate limited to prevent abuse (20 chat/min, 5 images/min)

### Admin Users
- Bypass credit checks and spending limits
- All usage is logged for security monitoring
- Subject to same rate limits as regular users
- Protected by brute force lockout on login

## Entry Points

### API Routes
- `src/app/api/chat/route.ts` - Chat with all security checks
- `src/app/api/generate-image/route.ts` - Image generation with security
- `src/app/api/admin-login/route.ts` - Admin authentication
- `src/app/api/invoice/route.ts` - Invoice creation with origin + session + rate limiting
- `src/app/api/invoice/[id]/route.ts` - Invoice status/confirm with origin + IP-bound session + polling throttling
- `src/app/api/rate-limit-status/route.ts` - Session-derived rate-limit/daily-spend status
- `src/app/api/session/route.ts` - Session management
- `src/app/api/health/route.ts` - Liveness status
- `src/app/api/readiness/route.ts` - Critical dependency readiness
- `src/app/api/metrics/route.ts` - Machine-parseable counters

### Security Libraries
- `src/lib/origin.ts` - Origin validation
- `src/lib/session.ts` - JWT session management
- `src/lib/validate-env.ts` - Environment validation
- `src/lib/request-body.ts` - Secure body reading with size limits
- `src/lib/observability.ts` - Structured logs and counters

### Convex Functions
- `convex/rateLimit.ts` - Rate limiting and brute force protection
- `convex/sessions.ts` - Credit management, daily limits, admin audit

## Issue History

### Fixed (January 2025)
- **CRITICAL (FIXED):** Initial IP binding enforcement shipped on `/api/chat` and `/api/generate-image` - stolen tokens are rejected if used from different IP
- **HIGH (FIXED):** Rate-limit-status now uses correct identifier format (`${ipHash}:${sid}`)
- **HIGH (FIXED):** Feedback endpoint now has Zod validation with max 5000 char message and 10KB body limit
- **MEDIUM (FIXED):** Admin audit logging now properly awaited in chat and image endpoints

### Fixed (February 2026)
- **CRITICAL (FIXED):** Public image persistence boundary closed. `saveImage` now requires server secret; remote fetches are host/mime/size constrained and private hosts are blocked.
- **CRITICAL (FIXED):** Credit settlement hardened to one-way lifecycle. Duplicate reservation release calls are no-ops after settlement, preventing credit inflation.
- **HIGH (FIXED):** Session-derived identity lookups standardized on `validateSessionWithIp` for `/api/admin-login`, `/api/invoice`, `/api/invoice/:id`, `/api/rate-limit-status`, feedback session attribution, and existing-session reuse in `/api/session`.

### Remaining (Low/Optional)
- **LOW:** Verbose error logging in generate-image (consider reducing)
- **LOW:** LND error logging may expose node details

## Related Documentation

- `llm/implementation/SECURITY_IMPLEMENTATION.md` - Detailed implementation guide
- `llm/implementation/RATE_LIMIT_IMPLEMENTATION.md` - Rate limiting details
- `llm/implementation/OBSERVABILITY_IMPLEMENTATION.md` - Structured logs, metrics, and ops endpoints
- `llm/context/SESSIONS_AND_CREDITS.md` - Credit system context
