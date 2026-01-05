# Security Implementation Guide

This document describes the security mechanisms protecting API routes from abuse, unauthorized access, and cost exploitation.

---

## Overview

The security architecture provides multiple layers of protection:

1. **Origin Validation** - Prevents cross-origin API abuse
2. **CSRF Protection** - Double-submit cookie pattern (infrastructure ready)
3. **Session Security** - JWT tokens with IP binding
4. **Rate Limiting** - Per-endpoint request throttling
5. **Cost Protection** - Input validation, spending limits, and per-request caps
6. **Admin Audit Logging** - Tracks admin usage for security monitoring
7. **Environment Validation** - Startup checks for security configuration

---

## Entry Points

| File | Purpose |
|------|---------|
| `src/lib/origin.ts` | Origin header validation |
| `src/lib/csrf.ts` | CSRF token generation and validation |
| `src/lib/session.ts` | JWT session management with IP binding |
| `src/lib/validate-env.ts` | Security environment validation |
| `src/lib/request-body.ts` | Secure body reading with streaming size limits |
| `convex/rateLimit.ts` | Rate limiting and brute force protection |
| `convex/sessions.ts` | Credit management, daily limits, admin audit logging |

---

## Origin Validation

**File:** `src/lib/origin.ts`

Origin validation provides defense-in-depth beyond SameSite cookies by checking the HTTP `Origin` header on incoming requests.

### Functions

| Function | Description |
|----------|-------------|
| `validateOrigin(request)` | Returns `true` if origin is valid or same-origin |
| `invalidOriginResponse()` | Returns a 403 JSON response |

### Validation Logic

1. **Same-origin requests** (no Origin header) are always allowed
2. **Same-origin check** - If Origin matches request URL origin, allowed
3. **Allowlist check** - If Origin is in the configured allowlist, allowed
4. Otherwise, returns `false`

### Allowed Origins

```typescript
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Production app URL (from env)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(process.env.NEXT_PUBLIC_APP_URL);
  }

  // Development only
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000");
    origins.push("http://127.0.0.1:3000");
  }

  return origins;
}
```

### Routes Using Origin Validation

| Route | Method | Validation |
|-------|--------|------------|
| `/api/invoice` | POST | Required |
| `/api/invoice/[id]` | GET, POST | Required |
| `/api/session` | POST | Required |
| `/api/admin-login` | POST | Required |
| `/api/generate-image` | GET | Required |
| `/api/chat` | POST | Required |
| `/api/feedback` | POST | Required |

---

## CSRF Protection

**File:** `src/lib/csrf.ts`

CSRF protection uses the double-submit cookie pattern. This is a stateless approach that doesn't require server-side token storage.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CSRF_COOKIE_NAME` | `visibible_csrf` | Cookie storing the token |
| `CSRF_HEADER_NAME` | `x-csrf-token` | Header that must match cookie |

### Cookie Configuration

```typescript
{
  name: CSRF_COOKIE_NAME,
  value: token,
  httpOnly: false,     // Must be readable by JS to send in header
  secure: true,        // HTTPS only in production
  sameSite: "strict",  // Additional CSRF protection
  path: "/",
  maxAge: 3600,        // 1 hour
}
```

### Validation Details

1. Both cookie and header must be present
2. Token lengths must match (prevents timing oracle)
3. Uses `crypto.timingSafeEqual()` for comparison

---

## Cost Protection (Input Validation)

**File:** `src/app/api/chat/route.ts`

Multiple layers prevent API cost exploitation through carefully crafted requests.

### Message Array Limits

```typescript
const requestBodySchema = z.object({
  // SECURITY: Limit message count to prevent token inflation attacks
  messages: z
    .array(messageSchema)
    .min(1, "Request must include at least one message")
    .max(50, "Too many messages. Maximum 50 messages per request."),
  // ...
});
```

**Rationale:**
- Typical conversations rarely exceed 20-30 messages
- Prevents attackers from sending 500+ messages to inflate token costs
- Without this limit, a single request could cost $5-10 instead of ~$0.02

### Per-Request Cost Cap

```typescript
// SECURITY: Reject requests that would cost more than reasonable per-request limit
const MAX_CREDITS_PER_REQUEST = 100; // $1.00 maximum per single request
if (estimatedCredits > MAX_CREDITS_PER_REQUEST) {
  return Response.json(
    {
      error: "Request too expensive",
      message: `This model costs approximately ${estimatedCredits} credits per message...`,
    },
    { status: 400 }
  );
}
```

**Rationale:**
- Prevents expensive models from draining daily budget in one request
- Daily limit ($5) catches total spend, but per-request cap prevents single-request exploitation

### Context String Limits

```typescript
context: z
  .union([z.string().min(1).max(2000), pageContextSchema])
  .optional(),
```

**Rationale:**
- String context is embedded directly in system prompt
- Without limit, attackers could inject 100KB+ of text
- System prompt tokens are charged for every completion

### Context Object Field Limits

```typescript
// SECURITY: Verse context with length limits to prevent token inflation
const verseContextSchema = z.object({
  number: z.number(),
  text: z.string().max(1200),
  reference: z.string().max(100).optional(),
});

// SECURITY: Page context with length limits
const pageContextSchema = z.object({
  book: z.string().max(100).optional(),
  chapter: z.number().optional(),
  verseRange: z.string().max(50).optional(),
  heroCaption: z.string().max(500).optional(),
  imageTitle: z.string().max(200).optional(),
  verses: z
    .array(z.object({
      number: z.number().optional(),
      text: z.string().max(1200).optional(),
    }))
    .max(20)
    .optional(),
  prevVerse: verseContextSchema.optional(),
  nextVerse: verseContextSchema.optional(),
});
```

### Request Body Size Limit

**File:** `src/lib/request-body.ts`

The `readJsonBodyWithLimit()` utility enforces actual byte limits during streaming, not just trusting `Content-Length`. This handles both regular requests and chunked transfer encoding safely.

```typescript
import {
  readJsonBodyWithLimit,
  PayloadTooLargeError,
  InvalidJsonError,
  DEFAULT_MAX_BODY_SIZE, // 100KB
} from "@/lib/request-body";

export async function POST(req: Request) {
  let body: unknown;
  try {
    // SECURITY: Read body with enforced size limit
    // Handles both Content-Length and chunked transfer encoding
    body = await readJsonBodyWithLimit(req, DEFAULT_MAX_BODY_SIZE);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    if (error instanceof InvalidJsonError) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    throw error;
  }
  // ...
}
```

**Why not just check Content-Length?**
- `Content-Length` header can be absent or zero with chunked transfer encoding
- Malicious clients can lie about `Content-Length`
- The streaming reader aborts immediately when limit is exceeded, not after buffering

---

## Prompt Injection Prevention

**File:** `src/app/api/generate-image/route.ts`

Image generation prompts include user-provided text (verse text, references). These are sanitized to prevent prompt injection attacks.

### Functions

#### `sanitizeVerseText(text: string): string`

Sanitizes verse text before embedding in image generation prompts.

```typescript
function sanitizeVerseText(text: string): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control chars
    .replace(
      /\b(ignore|disregard|forget|override|system|prompt|instruction)/gi,
      ""
    )
    .slice(0, 1200); // Limit to reasonable verse length
}
```

**Protections:**
- **Control character removal** - Strips ASCII control chars (0x00-0x1F, 0x7F) that could affect prompt parsing
- **Keyword filtering** - Removes common prompt injection keywords (ignore, disregard, forget, override, system, prompt, instruction)
- **Length limit** - Caps at 1200 characters to prevent token inflation

#### `sanitizeReference(ref: string): string`

Sanitizes Bible references (e.g., "Genesis 1:1") before embedding in prompts.

```typescript
function sanitizeReference(ref: string): string {
  // Only allow alphanumeric, spaces, colons, hyphens, and basic punctuation
  const sanitized = ref.replace(/[^\w\s:,\-.'()]/g, "").slice(0, 50);
  return sanitized || "Scripture";
}
```

**Protections:**
- **Character allowlist** - Only permits alphanumeric, spaces, colons, hyphens, and common punctuation
- **Length limit** - Caps at 50 characters
- **Fallback** - Returns "Scripture" if sanitization produces empty string

### Usage

All user-provided text passed to OpenRouter for image generation is sanitized:

```typescript
const verseText = sanitizeVerseText(searchParams.get("text") || DEFAULT_TEXT);
const prevVerseParam = searchParams.get("prevVerse")
  ? sanitizeVerseText(searchParams.get("prevVerse")!)
  : null;
const reference = sanitizeReference(
  searchParams.get("reference") || "Scripture"
);
```

---

## Feedback Endpoint Security

**File:** `src/app/api/feedback/route.ts`

The feedback endpoint has multiple layers of protection to prevent abuse.

### Input Validation

```typescript
// Zod schema with strict length limits
const feedbackSchema = z.object({
  message: z.string().min(1).max(5000),
  verseContext: z.object({
    book: z.string().max(100).optional(),
    chapter: z.number().int().positive().optional(),
    verseRange: z.string().max(50).optional(),
  }).optional(),
});
```

### Body Size Limit

```typescript
const MAX_FEEDBACK_BODY_SIZE = 10 * 1024; // 10KB

// Streaming size enforcement
rawBody = await readJsonBodyWithLimit(request, MAX_FEEDBACK_BODY_SIZE);
```

### Rate Limiting

Feedback uses IP-only rate limiting (`ipHash` without session ID) which is intentionally MORE restrictive:
- All sessions from the same IP share a single 5/minute limit
- Prevents multi-session bypass attacks
- An attacker creating 10 sessions still only gets 5 requests/minute total

---

## Admin Audit Logging

**Files:** `convex/sessions.ts`, `convex/schema.ts`

Admin users bypass credit checks, but all usage is logged for security monitoring and forensics.

### Schema

```typescript
// convex/schema.ts
adminAuditLog: defineTable({
  sid: v.string(),           // Admin session ID
  endpoint: v.string(),      // "chat" | "generate-image"
  modelId: v.string(),       // Model used
  estimatedCredits: v.number(), // What it would have cost
  estimatedCostUsd: v.number(), // USD equivalent
  createdAt: v.number(),
})
  .index("by_sid", ["sid", "createdAt"])
  .index("by_createdAt", ["createdAt"]),
```

### Logging Functions

```typescript
// Log admin usage (called from API routes)
export const logAdminUsage = action({
  args: {
    sid: v.string(),
    endpoint: v.string(),
    modelId: v.string(),
    estimatedCredits: v.number(),
    estimatedCostUsd: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    await ctx.runMutation(internal.sessions.logAdminUsageInternal, { ... });
  },
});

// Query daily admin spend for monitoring
export const getAdminDailySpend = query({
  args: {
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const todayStart = getUtcDayStart();
    const entries = await ctx.db
      .query("adminAuditLog")
      .withIndex("by_createdAt")
      .filter((q) => q.gte(q.field("createdAt"), todayStart))
      .collect();

    return {
      todayStart,
      totalUsd: entries.reduce((sum, e) => sum + e.estimatedCostUsd, 0),
      totalCredits: entries.reduce((sum, e) => sum + e.estimatedCredits, 0),
      requestCount: entries.length,
    };
  },
});
```

### Usage in API Routes

```typescript
// src/app/api/chat/route.ts
if (session.tier !== "admin") {
  // ... normal credit reservation
} else {
  // SECURITY: Log admin usage for audit trail even though credits aren't charged
  // IMPORTANT: Await the call to ensure audit trail is reliably written
  try {
    await convex.action(api.sessions.logAdminUsage, {
      sid: sessionId,
      endpoint: "chat",
      modelId,
      estimatedCredits: creditAmount,
      estimatedCostUsd,
      serverSecret: getConvexServerSecret(),
    });
  } catch (err) {
    console.error("[Chat API] Failed to log admin usage:", err);
    // Continue with the request even if audit logging fails
    // The request should proceed but we've logged the audit failure
  }
}
```

---

## Environment Validation

**File:** `src/lib/validate-env.ts`

Validates security-critical environment variables at startup.

### Required Secrets (Minimum 32 Characters)

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | JWT signing for session tokens |
| `IP_HASH_SECRET` | Hashing client IPs for rate limiting |
| `ADMIN_PASSWORD_SECRET` | HMAC key for admin password verification |
| `CONVEX_SERVER_SECRET` | Authentication for Convex server actions |

### Proxy Configuration Validation

**CRITICAL:** In production, dangerous proxy configurations are **fatal errors**.

```typescript
// Dangerous patterns that allow IP spoofing
const dangerousPatterns = [
  { pattern: /^0\.0\.0\.0\/0$/, desc: "0.0.0.0/0 (all IPv4)" },
  { pattern: /^::\/0$/, desc: "::/0 (all IPv6)" },
  { pattern: /^0\.0\.0\.0\/[0-7]$/, desc: "very broad IPv4 CIDR (>/7)" },
  // ...
];

if (isProduction && trustedIps) {
  for (const entry of entries) {
    for (const { pattern, desc } of dangerousPatterns) {
      if (pattern.test(entry)) {
        // FATAL in production - prevents startup
        throw new Error(
          `CRITICAL SECURITY MISCONFIGURATION: TRUSTED_PROXY_IPS contains ${desc}...`
        );
      }
    }
  }
}
```

**Why This Matters:**
- Broad CIDR ranges allow attackers to spoof any IP via proxy headers
- IP spoofing bypasses rate limiting (new IP = new rate limit)
- IP spoofing bypasses session IP binding (steal session cookies)
- IP spoofing bypasses admin lockout (reset brute force counter)

---

## Session IP Binding (Enforced)

**Files:** `src/lib/session.ts`, `src/app/api/chat/route.ts`, `src/app/api/generate-image/route.ts`

Session tokens include an IP hash (`iph` field) that binds the session to the client's IP address. This is **enforced** on cost-incurring endpoints to prevent stolen tokens from being used.

### Validation Flow

```typescript
// Both /api/chat and /api/generate-image use this pattern:
const sessionValidation = await validateSessionWithIp(request);

// 1. No session at all
if (!sessionValidation.sid) {
  return Response.json({ error: "Session required" }, { status: 401 });
}

// 2. Session exists but IP mismatch (possible token theft)
if (!sessionValidation.valid) {
  console.warn(`Session IP mismatch - rejecting request`);
  return Response.json({ error: "Session invalid" }, { status: 401 });
}

// 3. Valid session with matching IP
const sid = sessionValidation.sid;
```

### What Gets Validated

| Field | Source | Check |
|-------|--------|-------|
| `sid` | JWT token | Session ID exists and is valid |
| `iph` | JWT token | IP hash from token creation |
| Current IP | Request headers | Current client IP, hashed |
| Match | Comparison | `token.iph === hash(currentIp)` |

### Legacy Token Handling

Tokens created before IP binding was implemented (missing `iph` field) return `valid: true` with `needsRefresh: true`. The session endpoint will issue a new IP-bound token on next request.

---

## Security Layers Summary

| Layer | Protection |
|-------|------------|
| **SameSite Cookies** | Session/CSRF cookies use `Strict`/`Lax` |
| **Origin Validation** | Rejects unauthorized cross-origin requests |
| **Session IP Binding** | JWT includes hashed IP, **enforced on /api/chat and /api/generate-image** |
| **Rate Limiting** | Per-endpoint request throttling (see RATE_LIMIT_IMPLEMENTATION.md) |
| **Input Validation** | Zod schemas with length limits on all fields |
| **Per-Request Cost Cap** | Maximum $1.00 per single request |
| **Daily Spending Limit** | $5/day per session (resets at UTC midnight) |
| **Admin Audit Logging** | All admin API usage logged with cost |
| **Timing-Safe Comparison** | Admin password and CSRF use constant-time comparison |
| **Proxy Config Validation** | Fatal error in production for dangerous configs |

---

## Attack Mitigations

### Token Inflation Attack
**Attack:** Send hundreds of messages or huge context to inflate token costs.
**Mitigation:**
- Messages limited to 50 per request
- Context string limited to 2000 characters
- Individual fields have appropriate max lengths

### Cost Amplification Attack
**Attack:** Select expensive model to drain credits quickly.
**Mitigation:**
- Per-request cost cap of 100 credits ($1.00)
- Daily spending limit of $5 per session
- Models without pricing are rejected

### Session Farming Attack
**Attack:** Create many sessions from different IPs to multiply rate limits.
**Mitigation:**
- Rate limiting uses `${ipHash}:${sid}` format
- Daily spending limit applies per session
- Each session still limited to $5/day regardless of IP

### Admin Credential Compromise
**Attack:** Stolen admin password allows unlimited API access.
**Mitigation:**
- All admin usage logged with estimated cost
- `getAdminDailySpend` query enables monitoring (server secret required)
- Forensic data available for investigation

### IP Spoofing Attack
**Attack:** Spoof IP via proxy headers to bypass rate limits.
**Mitigation:**
- Dangerous proxy configurations are fatal in production
- Only specific, narrow CIDR ranges allowed
- Session IP binding prevents session theft

### Session Token Theft Attack
**Attack:** Steal session cookie and use from attacker's machine.
**Mitigation:**
- Session tokens include IP hash binding (`iph` field)
- `/api/chat` and `/api/generate-image` validate IP on every request
- Requests from mismatched IPs are rejected with 401
- Attacker cannot use stolen token from different IP

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/origin.ts` | Origin validation functions |
| `src/lib/csrf.ts` | CSRF token generation and validation |
| `src/lib/session.ts` | JWT session management with IP binding |
| `src/lib/validate-env.ts` | Security environment validation |
| `src/lib/request-body.ts` | Secure body reading with size limits |
| `src/app/api/chat/route.ts` | Chat endpoint with all security checks |
| `src/app/api/generate-image/route.ts` | Image endpoint with security checks |
| `convex/rateLimit.ts` | Rate limiting and brute force protection |
| `convex/sessions.ts` | Credit management, daily limits, admin audit |
| `convex/schema.ts` | Database schema including `adminAuditLog` |
