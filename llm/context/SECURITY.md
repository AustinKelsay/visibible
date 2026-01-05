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
All API routes validate the `Origin` header against an allowlist. Requests from unauthorized origins are rejected with 403.

### 2. Session Security
- JWT-signed session tokens with IP binding
- Sessions tied to client IP (hashed) to prevent theft
- 90-day session TTL with activity-based renewal

### 3. Rate Limiting
- Per-endpoint request throttling (e.g., 20 chat/min, 5 images/min)
- Rate limits use `${ipHash}:${sessionId}` format
- Admin login has exponential backoff lockout (1h → 24h)

### 4. Cost Protection
- **Message limit:** Maximum 50 messages per chat request
- **Context limit:** Maximum 2000 characters for string context
- **Body size limit:** Maximum 100KB per request (enforced via streaming, handles chunked encoding)
- **Per-request cap:** Maximum $1.00 per single request
- **Daily limit:** $5/day per session (resets UTC midnight)
- **Model validation:** Only models with valid pricing allowed

### 5. Admin Security
- Password verification with timing-safe comparison
- HMAC-based password hashing with dedicated secret
- **All admin usage logged** to `adminAuditLog` table
- `getAdminDailySpend` query for monitoring (requires server secret)

### 6. Environment Validation
- All secrets must be ≥32 characters
- Dangerous proxy configurations are **fatal in production**
- Broad CIDR ranges (0.0.0.0/0) cause startup failure

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
- `src/app/api/session/route.ts` - Session management

### Security Libraries
- `src/lib/origin.ts` - Origin validation
- `src/lib/session.ts` - JWT session management
- `src/lib/validate-env.ts` - Environment validation
- `src/lib/request-body.ts` - Secure body reading with size limits

### Convex Functions
- `convex/rateLimit.ts` - Rate limiting and brute force protection
- `convex/sessions.ts` - Credit management, daily limits, admin audit

## Known Issues

### Fixed (January 2025)
- **CRITICAL (FIXED):** IP binding validation now enforced on `/api/chat` and `/api/generate-image` - stolen tokens are rejected if used from different IP
- **HIGH (FIXED):** Rate-limit-status now uses correct identifier format (`${ipHash}:${sid}`)
- **HIGH (FIXED):** Feedback endpoint now has Zod validation with max 5000 char message and 10KB body limit
- **MEDIUM (FIXED):** Admin audit logging now properly awaited in chat and image endpoints

### Remaining (Low/Optional)
- **LOW:** Verbose error logging in generate-image (consider reducing)
- **LOW:** Session TTL is 90 days (consider reducing to 30 days)
- **LOW:** LND error logging may expose node details

## Related Documentation

- `llm/implementation/SECURITY_IMPLEMENTATION.md` - Detailed implementation guide
- `llm/implementation/RATE_LIMIT_IMPLEMENTATION.md` - Rate limiting details
- `llm/context/SESSIONS_AND_CREDITS.md` - Credit system context
