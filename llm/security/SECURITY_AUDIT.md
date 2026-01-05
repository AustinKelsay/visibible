# Visibible Security Audit

**Date:** January 4, 2026
**Version:** Pre-Alpha Release
**Focus:** Comprehensive security review with emphasis on OpenRouter API key cost protection

---

## Executive Summary

This security audit identifies 18 potential vulnerabilities in the Visibible application, prioritized by risk level. The most critical concerns involve protecting the OpenRouter API key from abuse, which could result in significant financial costs.

**Overall Security Posture:** Solid foundation with critical API cost protection now implemented.

### Fixed Issues (3)
- ~~#1 No Cost-Based Rate Limiting~~ → **$5/day spending cap implemented**
- ~~#2 Arbitrary Model IDs~~ → **Models without pricing now rejected**
- ~~#14 No Per-Model Credit Pricing~~ → **Dynamic pricing based on model cost**

---

## CRITICAL SEVERITY

Issues that could result in immediate financial loss or complete security compromise.

### 1. ~~No Cost-Based Rate Limiting for AI Endpoints~~ FIXED

**Status:** FIXED (January 4, 2026)

**Fix implemented:**
- Added **$5/day spending cap** per session (resets at UTC midnight)
- Daily spend tracked in `sessions.dailySpendUsd` field
- Checked in `reserveCreditsInternal` before allowing credit reservation
- Admin users bypass this limit

**Files changed:**
- `convex/schema.ts` - Added `dailySpendUsd`, `dailySpendLimitUsd`, `lastDayReset` fields
- `convex/sessions.ts` - Added `checkDailySpendLimit()` helper and integrated into reserve flow

---

### 2. ~~Model Selection Allows Arbitrary Model IDs~~ FIXED

**Status:** FIXED (January 4, 2026)

**Fix implemented:**
- Models without valid OpenRouter pricing are now **rejected**
- Chat: `getChatModelPricing()` returns null for unpriced models → 400 error
- Image: `computeCreditsCost()` returns null → 400 error (removed `DEFAULT_CREDITS_COST` fallback)
- Dynamic credit pricing based on actual model cost with 25% markup

**Files changed:**
- `src/lib/chat-models.ts` - Added `computeChatCreditsCost()`, `getChatModelPricing()`
- `src/app/api/chat/route.ts` - Dynamic pricing, reject unpriced models
- `src/app/api/generate-image/route.ts` - Reject unpriced models

---

### 3. Admin Password Stored in Plaintext Environment Variable

**Risk:** Password compromise if environment variables are exposed
**Location:** `src/app/api/admin-login/route.ts:98-105`

**Issue:** The admin password is stored in plaintext in `ADMIN_PASSWORD` environment variable. On each login attempt, both the provided password and stored password are HMAC'd fresh - this is not proper password hashing.

**Problems:**
- If `.env` file or environment is exposed, plaintext password is revealed
- HMAC is being misused (should hash once at setup, store hash, compare hashes)
- No salt per-password, making rainbow table attacks possible

**Expected Pattern:**
```
Setup: hash(password + salt) -> store hash + salt
Login: hash(input + stored_salt) == stored_hash
```

**Current Pattern:**
```
Login: hmac(input) == hmac(env_password)  # Both computed fresh, plaintext in env
```

---

### 4. IP Hashing Uses SESSION_SECRET (Single Point of Failure)

**Risk:** If SESSION_SECRET leaks, all IP hashes become predictable
**Location:** `src/lib/session.ts:92-102`

**Issue:** IP addresses are hashed using SESSION_SECRET as the HMAC key. This creates a single point of failure - compromising SESSION_SECRET compromises both:
- Session token forgery capability
- Ability to predict all IP hashes (only ~4 billion IPv4 addresses to hash)

---

## HIGH SEVERITY

Issues that could enable unauthorized access or significant security degradation.

### 5. Session Tokens Not Bound to IP/Device

**Risk:** Session forgery if SESSION_SECRET is compromised
**Location:** `src/lib/session.ts:12-34`

**Issue:** JWT session tokens contain only the session ID (`sid`). There's no binding to:
- Client IP address
- User agent / device fingerprint
- Any other identifying characteristics

**Impact:** An attacker who obtains SESSION_SECRET can forge valid tokens for ANY session ID without knowing anything about the original user.

---

### 6. Missing CORS/Origin Validation on API Routes

**Risk:** Cross-origin API abuse
**Location:** All API routes in `src/app/api/`

**Issue:** No explicit CORS or origin validation on sensitive endpoints. While `SameSite=lax` cookies provide some protection, explicit origin validation would:
- Prevent requests from malicious websites
- Block API calls from unauthorized domains
- Provide defense-in-depth

---

### 7. No Startup Validation for Critical Secrets

**Risk:** Application running with weak or missing secrets
**Location:** `src/lib/validate-env.ts`

**Issue:** While `SESSION_SECRET` is validated at startup (minimum 32 characters), other critical secrets are not:
- `CONVEX_SERVER_SECRET` - No length/entropy check
- `ADMIN_PASSWORD_SECRET` - No validation unless ADMIN_PASSWORD exists

Application could start with weak secrets that are easier to brute-force.

---

### 8. Admin Brute Force Protection Insufficient

**Risk:** Password compromise through sustained attack
**Location:** `convex/rateLimit.ts:138-140`

**Issue:** Current protection allows:
- 5 attempts per 15-minute window
- 1-hour lockout after hitting limit
- Window resets after 15 minutes

**Result:** 96 password attempts possible per day (5 attempts × 4 windows/hour × 24 hours ÷ some lockouts). No exponential backoff to discourage sustained attacks.

---

### 9. Payment Confirmation Relies on Polling Only

**Risk:** Payment bypass if LND polling can be spoofed
**Location:** `src/app/api/invoice/[id]/route.ts:46-75`

**Issue:** Payment confirmation is client-initiated via POST request. The server polls LND to verify payment status. There's no webhook signature verification from LND.

**Attack Scenario (if LND connection compromised):**
1. Create invoice (POST /api/invoice)
2. Don't pay the Lightning invoice
3. Somehow manipulate lookupLndInvoice response to return SETTLED
4. Receive credits without payment

---

## MEDIUM SEVERITY

Issues that could enable limited attacks or degrade security.

### 10. Prompt Injection Sanitization Gaps

**Risk:** AI manipulation through crafted verse inputs
**Location:** `src/app/api/generate-image/route.ts:30-41`

**Issue:** Current sanitization uses simple keyword filtering:
```javascript
.replace(/\b(ignore|disregard|forget|override|system|prompt|instruction)/gi, "")
```

**Bypass Methods:**
- Word variations: "ignoring" vs "ignore"
- Case mixing not fully handled
- Unicode normalization attacks (homoglyphs)
- Partial word matches: "systemic" contains "system"

---

### 11. No Session Expiration in Database

**Risk:** Resource exhaustion, stale session abuse
**Location:** `convex/sessions.ts`, `src/lib/session.ts`

**Issue:** Sessions have:
- 1-year cookie expiration
- No server-side expiration mechanism
- No cleanup of abandoned sessions

Old sessions persist indefinitely, accumulating in the database.

---

### 12. Rate Limit Records Never Cleaned Up

**Risk:** Database bloat, performance degradation
**Location:** `convex/rateLimit.ts`

**Issue:** Rate limit records have no TTL or cleanup mechanism. Over time:
- Database accumulates stale records
- Query performance degrades
- Storage costs increase

---

### 13. JSON Parsing Errors Silently Ignored

**Risk:** Unexpected behavior from malformed input
**Location:** `src/app/api/generate-image/route.ts:241-242`

**Issue:** Malformed verse JSON in query parameters is caught and silently ignored:
```javascript
if (prevVerseParam) prevVerse = JSON.parse(prevVerseParam);
// Errors caught and ignored, prevVerse stays undefined
```

Could lead to unexpected behavior when malformed data is submitted.

---

### 14. ~~No Per-Model Credit Pricing~~ FIXED

**Status:** FIXED (January 4, 2026)

**Fix implemented:**
- Chat now uses **dynamic pricing** based on model's actual OpenRouter cost
- Credits calculated: `(estimated_tokens × price_per_token × 1.25 markup) / $0.01`
- Estimated tokens: 2000 (1000 prompt + 1000 completion)
- Actual token usage logged for monitoring after stream completes
- Free models (`:free` suffix or $0 pricing) cost minimum 1 credit

**Files changed:**
- `src/lib/chat-models.ts` - Added `computeChatCreditsCost()`, `computeActualChatCreditsCost()`
- `src/app/api/chat/route.ts` - Integrated dynamic pricing with token estimation

---

## LOW SEVERITY

Issues with limited impact or requiring specific conditions to exploit.

### 15. No CSRF Token on Admin Login

**Risk:** Lockout attacks via CSRF
**Location:** `src/app/api/admin-login/route.ts`

**Issue:** Admin login accepts POST requests without CSRF token validation. A malicious site could trigger login attempts from victim's browser, potentially causing account lockout.

---

### 16. No Rate Limit Status Endpoint

**Risk:** Poor UX, wasted credits
**Issue:** Clients cannot check remaining rate limits before making expensive requests. Users may waste credits on requests that hit rate limits.

---

### 17. Missing Security Headers

**Risk:** Various browser-based attacks
**Issue:** Response headers don't explicitly set:
- `X-Frame-Options` (clickjacking)
- `X-Content-Type-Options` (MIME sniffing)
- `Content-Security-Policy` (XSS, injection)

---

### 18. Trusted Proxy Configuration Risk

**Risk:** IP spoofing if misconfigured
**Location:** `src/lib/session.ts:108-128`

**Issue:** If `TRUSTED_PROXY_IPS` is empty or misconfigured, the application may trust arbitrary `X-Forwarded-For` headers, allowing IP spoofing.

---

## Positive Security Findings

These security measures are well-implemented:

1. **OPENROUTER_API_KEY properly server-side only** - Never exposed to client JavaScript
2. **HTTPS-only, httpOnly session cookies** - Prevents XSS-based token theft
3. **Timing-safe admin password comparison** - Uses `crypto.timingSafeEqual()` to prevent timing attacks
4. **Credit reservation system** - Atomic operations prevent race conditions in charging
5. **Input validation with Zod** - Structured request validation on API routes
6. **Server secret required for mutations** - Prevents direct client manipulation of Convex data
7. **Proper .gitignore for secrets** - No credentials committed to git history
8. **Invoice-only LND macaroon** - Limited scope, not full admin access

---

## Files Requiring Attention

| File | Issues |
|------|--------|
| `src/lib/validate-env.ts` | #7 - Missing secret validation |
| `src/lib/session.ts` | #4, #5 - IP hash secret, session binding |
| `src/app/api/chat/route.ts` | #1, #2 - Rate limiting, model allowlist |
| `src/app/api/generate-image/route.ts` | #1, #2, #10, #13 - Multiple issues |
| `convex/rateLimit.ts` | #1, #8, #12 - Rate limiting improvements |
| `src/app/api/admin-login/route.ts` | #3, #15 - Password hashing, CSRF |
| `next.config.ts` | #17 - Security headers |

---

## Recommended Priority for Alpha Release

**COMPLETED:**
- ~~Model ID validation (#2)~~ - FIXED: Models without pricing rejected
- ~~Cost-aware rate limiting (#1)~~ - FIXED: $5/day spending cap
- ~~Per-model credit pricing (#14)~~ - FIXED: Dynamic pricing based on model cost

**Should Fix Before Launch:**
1. Proper admin password hashing (#3)
2. Startup validation for all secrets (#7)
3. Separate IP hashing secret (#4)

**Fix Soon After Launch:**
4. Session IP binding (#5)
5. CORS/origin validation (#6)
6. Improved brute force protection (#8)

**Monitor and Address:**
7. All remaining medium and low severity issues
