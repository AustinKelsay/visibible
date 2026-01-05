# Rate Limiting Implementation Guide

This document describes the central rate-limiting system used by API routes and session logic to prevent abuse and ensure fair resource usage.

---

## Purpose

The `convex/rateLimit.ts` module provides a centralized rate-limiting configuration and implementation for all API endpoints. It uses a sliding window approach to track requests per identifier (IP hash or session ID) and endpoint combination, preventing abuse while allowing legitimate usage patterns.

**Key Features:**
- Per-endpoint rate limit configuration
- Sliding window rate limiting (resets when window expires)
- Admin login brute force protection with exponential backoff
- Automatic cleanup of stale rate limit records via cron jobs

---

## Exported Symbols

### Constants

#### `RATE_LIMITS`
Type: `Record<RateLimitEndpoint, { windowMs: number; maxRequests: number }>`

Central configuration object defining rate limits for each endpoint. Each entry specifies:
- `windowMs`: Duration of the rate limit window in milliseconds
- `maxRequests`: Maximum number of requests allowed within the window

**Default Configuration:**
```typescript
{
  chat: { windowMs: 60_000, maxRequests: 20 },           // 20 requests per minute
  "generate-image": { windowMs: 60_000, maxRequests: 5 }, // 5 images per minute
  "admin-login": { windowMs: 900_000, maxRequests: 5 },  // 5 attempts per 15 minutes
  session: { windowMs: 60_000, maxRequests: 10 },       // 10 session creates per minute
  invoice: { windowMs: 60_000, maxRequests: 10 },       // 10 invoice creates per minute
}
```

### Internal Constants (Not Exported)

These constants configure admin login brute force protection but are not exported from the module:

- `ADMIN_LOGIN_BASE_LOCKOUT_DURATION`: 1 hour (base lockout duration)
- `ADMIN_LOGIN_MAX_LOCKOUT_DURATION`: 24 hours (maximum lockout duration)
- `ADMIN_LOGIN_MAX_ATTEMPTS`: 5 attempts before lockout
- `ADMIN_LOGIN_WINDOW`: 15 minutes (time window for counting attempts)

### Types

#### `RateLimitEndpoint`
Type: `keyof typeof RATE_LIMITS`

Union type of all valid endpoint names: `"chat" | "generate-image" | "admin-login" | "session" | "invoice"`

### Functions

#### `checkRateLimit`
Type: `mutation<{ identifier: string; endpoint: string }, { allowed: boolean; retryAfter?: number; remaining?: number }>`

**Purpose:** Check and increment rate limit for an identifier/endpoint pair. Uses a sliding window approach: if the window has expired, start fresh. Otherwise, check if under limit and increment.

**Parameters:**
- `identifier`: Unique identifier (typically IP hash or `${ipHash}:${sessionId}`)
- `endpoint`: Endpoint name (must be a key from `RATE_LIMITS`)

**Returns:**
- `allowed`: `boolean` - Whether the request is allowed
- `retryAfter`: `number` (optional) - Seconds until the rate limit window resets (only present when `allowed: false`)
- `remaining`: `number` (optional) - Number of requests remaining in the current window

**Behavior:**
- Unknown endpoints are allowed but not tracked
- First request creates a new rate limit record
- Expired windows reset automatically
- Returns `429`-compatible retry information when limit exceeded

#### `getRateLimitStatus`
Type: `query<{ identifier: string; endpoint: string }, { remaining: number; resetAt: number }>`

**Purpose:** Get current rate limit status without incrementing the counter. Useful for checking status before expensive operations or displaying rate limit information to users.

**Parameters:**
- `identifier`: Unique identifier (typically IP hash or `${ipHash}:${sessionId}`)
- `endpoint`: Endpoint name (must be a key from `RATE_LIMITS`)

**Returns:**
- `remaining`: Number of requests remaining in the current window
- `resetAt`: Timestamp (milliseconds) when the rate limit window resets

**Behavior:**
- Unknown endpoints return `{ remaining: 999, resetAt: Date.now() }`
- Returns current status without modifying the rate limit counter

#### `checkAdminLoginAllowed`
Type: `query<{ ipHash: string }, { allowed: boolean; lockedUntil?: number; attemptsRemaining?: number; lockoutCount?: number }>`

**Purpose:** Check if an IP address is allowed to attempt admin login. Implements exponential backoff lockout mechanism.

**Parameters:**
- `ipHash`: Hashed IP address identifier

**Returns:**
- `allowed`: Whether login attempts are currently allowed
- `lockedUntil`: Timestamp when lockout expires (only present when `allowed: false`)
- `attemptsRemaining`: Number of attempts remaining before lockout
- `lockoutCount`: Number of times this IP has been locked out (for exponential backoff)

**Behavior:**
- Tracks failed attempts within a 15-minute window
- Locks out after 5 failed attempts
- Lockout duration doubles with each subsequent lockout (1h → 2h → 4h → 8h → 24h max)
- Lockout count persists across windows for exponential backoff

#### `recordFailedAdminLogin`
Type: `mutation<{ ipHash: string }, { locked: boolean; lockedUntil?: number; attemptsRemaining: number; lockoutCount?: number }>`

**Purpose:** Record a failed admin login attempt and apply lockout if threshold is reached. Implements exponential backoff.

**Parameters:**
- `ipHash`: Hashed IP address identifier

**Returns:**
- `locked`: Whether the IP was locked out as a result of this attempt
- `lockedUntil`: Timestamp when lockout expires (only present when `locked: true`)
- `attemptsRemaining`: Number of attempts remaining before lockout
- `lockoutCount`: Current lockout count (incremented when locked)

**Behavior:**
- Increments attempt counter within 15-minute window
- Locks out after 5 failed attempts
- Lockout duration: `BASE_LOCKOUT * 2^lockoutCount` (capped at 24 hours)
- Resets attempt counter when window expires or lockout elapses (preserves lockout count)

#### `clearAdminLoginAttempts`
Type: `mutation<{ ipHash: string }, void>`

**Purpose:** Clear failed login attempts after successful admin login. Removes the entire record for the IP hash.

**Parameters:**
- `ipHash`: Hashed IP address identifier

**Returns:** `void`

**Behavior:**
- Deletes the admin login attempt record if it exists
- Called after successful authentication to reset the counter

---

## Configuration Options

### Adding a New Endpoint

To add rate limiting for a new endpoint:

1. **Add configuration to `RATE_LIMITS`:**
```typescript
export const RATE_LIMITS = {
  // ... existing endpoints
  "new-endpoint": { windowMs: 60_000, maxRequests: 10 }, // 10 requests per minute
} as const;
```

2. **Use in API route:**
```typescript
const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
  identifier: `${ipHash}:${sessionId}`, // or just ipHash
  endpoint: "new-endpoint",
});

if (!rateLimitResult.allowed) {
  return NextResponse.json(
    { error: "Rate limit exceeded" },
    { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter || 60) } }
  );
}
```

### Adjusting Rate Limits

Edit the `RATE_LIMITS` object in `convex/rateLimit.ts`:

```typescript
export const RATE_LIMITS = {
  chat: { windowMs: 60_000, maxRequests: 30 }, // Increased from 20 to 30
  // ... other endpoints
} as const;
```

Changes take effect immediately after Convex syncs the updated function.

---

## Usage Examples

### API Route Rate Limiting

#### Example: Chat API Route

```typescript
// src/app/api/chat/route.ts
import { api } from "@/lib/convex-client";
import { getClientIp } from "@/lib/origin";
import { hashIp } from "@/lib/session";

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);
  const sid = getSessionIdFromCookies(request);
  const rateLimitIdentifier = `${ipHash}:${sid}`;

  // Check rate limit before processing
  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: rateLimitIdentifier,
    endpoint: "chat",
  });

  if (!rateLimitResult.allowed) {
    return Response.json(
      {
        error: "Rate limit exceeded",
        message: "Too many requests. Please wait before sending more messages.",
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
        },
      }
    );
  }

  // Proceed with request processing
  // ...
}
```

#### Example: Session Creation (IP-based)

```typescript
// src/app/api/session/route.ts
const clientIp = getClientIp(request);
const ipHash = await hashIp(clientIp);

const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
  identifier: ipHash, // IP-only identifier for session creation
  endpoint: "session",
});

if (!rateLimitResult.allowed) {
  return NextResponse.json(
    {
      sid: null,
      tier: "paid" as const,
      credits: 0,
      error: "Too many session creation requests",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(rateLimitResult.retryAfter || 60),
      },
    }
  );
}
```

#### Example: Image Generation

```typescript
// src/app/api/generate-image/route.ts
const rateLimitIdentifier = `${ipHash}:${sid}`;

const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
  identifier: rateLimitIdentifier,
  endpoint: "generate-image",
});

if (!rateLimitResult.allowed) {
  return NextResponse.json(
    {
      error: "Rate limit exceeded",
      retryAfter: rateLimitResult.retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(rateLimitResult.retryAfter || 60),
      },
    }
  );
}
```

### Checking Rate Limit Status (Without Incrementing)

#### Actual Implementation: Rate Limit Status API

The actual `src/app/api/rate-limit-status/route.ts` returns status for the main rate-limited endpoints plus daily spending information:

```typescript
// src/app/api/rate-limit-status/route.ts
import { RATE_LIMITS } from "../../../../convex/rateLimit";
import { DEFAULT_DAILY_SPEND_LIMIT_USD } from "../../../../convex/sessions";

export async function GET(): Promise<NextResponse<RateLimitStatusResponse>> {
  const convex = getConvexClient();
  const sid = await getSessionFromCookies();

  if (!convex || !sid) {
    // Return default limits when no session
    return NextResponse.json({ endpoints: { ... }, dailySpend: null });
  }

  // Query status for chat and image generation endpoints
  const [chatStatus, imageStatus, session] = await Promise.all([
    convex.query(api.rateLimit.getRateLimitStatus, {
      identifier: sid,
      endpoint: "chat",
    }),
    convex.query(api.rateLimit.getRateLimitStatus, {
      identifier: sid,
      endpoint: "generate-image",
    }),
    convex.query(api.sessions.getSession, { sid }),
  ]);

  // Include daily spending limits for non-admin users
  let dailySpend = null;
  if (session && session.tier !== "admin") {
    dailySpend = {
      spent: session.dailySpendUsd,
      limit: session.dailySpendLimitUsd,
      remaining: Math.max(0, limit - spent),
      resetsAt: tomorrowMidnightUTC,
    };
  }

  return NextResponse.json({
    endpoints: { chat: { ... }, "generate-image": { ... } },
    dailySpend,
  });
}
```

**Note:** The rate-limit-status endpoint uses `sid` alone as the identifier. This means the status may not reflect the exact remaining count if the user accesses from multiple IPs, since actual rate limiting in chat/generate-image routes uses `${ipHash}:${sid}` format.

### Admin Login Brute Force Protection

#### Example: Admin Login Route

```typescript
// src/app/api/admin-login/route.ts
const ipHash = await hashIp(getClientIp(request));

// Check if login attempts are allowed
const loginAllowedResult = await convex.query(api.rateLimit.checkAdminLoginAllowed, {
  ipHash,
});

if (!loginAllowedResult.allowed) {
  return NextResponse.json(
    {
      error: "Too many failed login attempts",
      lockedUntil: loginAllowedResult.lockedUntil,
    },
    { status: 429 }
  );
}

// Attempt authentication
try {
  const isValid = await validateAdminPassword(password);
  
  if (isValid) {
    // Clear failed attempts on success
    await convex.mutation(api.rateLimit.clearAdminLoginAttempts, { ipHash });
    // ... create admin session
  } else {
    // Record failed attempt
    await convex.mutation(api.rateLimit.recordFailedAdminLogin, { ipHash });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
} catch (error) {
  // Record failed attempt on error
  await convex.mutation(api.rateLimit.recordFailedAdminLogin, { ipHash });
  throw error;
}
```

---

## Integration with Cleanup and Cron Jobs

The rate limiting system integrates with Convex's cleanup and cron infrastructure to prevent unbounded table growth.

### Cleanup Functions

**File:** `convex/cleanup.ts`

The following cleanup function maintains the `rateLimits` table:

#### `cleanupStaleRateLimits`
- **Purpose:** Delete rate limit records with expired windows (older than 1 hour)
- **Retention:** 1 hour after window expiration
- **Batch Limit:** 100 records per run
- **Called By:** Cron job (see below)

**Implementation:**
```typescript
export const cleanupStaleRateLimits = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour ago
    const stale = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lt(q.field("windowStart"), cutoff))
      .take(100);
    
    for (const record of stale) {
      await ctx.db.delete(record._id);
    }
    
    return { deleted: stale.length };
  },
});
```

**Note:** Also cleans up `adminLoginAttempts` records older than 24 hours via `cleanupAdminLoginAttempts`.

### Cron Schedule

**File:** `convex/crons.ts`

Rate limit cleanup runs automatically via scheduled cron jobs:

| Job | Schedule | Function | Purpose |
|-----|----------|----------|---------|
| cleanup stale rate limits | 3:15 AM UTC daily | `cleanupStaleRateLimits` | Remove expired rate limit records |
| cleanup admin login attempts | 3:30 AM UTC daily | `cleanupAdminLoginAttempts` | Remove old admin login attempt records |

**Cron Configuration:**
```typescript
// Clean up stale rate limit records daily at 3:15 AM UTC
crons.daily(
  "cleanup stale rate limits",
  { hourUTC: 3, minuteUTC: 15 },
  internal.cleanup.cleanupStaleRateLimits
);

// Clean up admin login attempts daily at 3:30 AM UTC
crons.daily(
  "cleanup admin login attempts",
  { hourUTC: 3, minuteUTC: 30 },
  internal.cleanup.cleanupAdminLoginAttempts
);
```

### Workflow Integration

The rate limiting system fits into the broader Convex workflow:

1. **API Routes** → Call `checkRateLimit` before processing requests
2. **Rate Limit Records** → Stored in `rateLimits` table with sliding window tracking
3. **Cron Jobs** → Clean up stale records daily to prevent table growth
4. **Cleanup Functions** → Internal mutations that delete expired records

**Data Flow:**
```
API Request → checkRateLimit → rateLimits table
                                      ↓
                            (sliding window tracking)
                                      ↓
                            cleanupStaleRateLimits (cron)
                                      ↓
                            Delete expired records
```

---

## Database Schema

**Table:** `rateLimits`

Defined in `convex/schema.ts`:

```typescript
rateLimits: defineTable({
  identifier: v.string(),    // Session ID or IP hash
  endpoint: v.string(),      // API endpoint name (e.g., "chat", "generate-image")
  count: v.number(),         // Number of requests in current window
  windowStart: v.number(),   // Start of current time window (ms timestamp)
}).index("by_identifier_endpoint", ["identifier", "endpoint"]),
```

**Table:** `adminLoginAttempts`

```typescript
adminLoginAttempts: defineTable({
  ipHash: v.string(),
  attemptCount: v.number(),
  lastAttempt: v.number(),
  lockedUntil: v.optional(v.number()),  // Lockout expiration timestamp
  lockoutCount: v.optional(v.number()),  // Number of lockouts (for exponential backoff)
}).index("by_ipHash", ["ipHash"]),
```

---

## References

### Where Rate Limiting is Used

| Route | Endpoint | Identifier Format | Description |
|-------|----------|-------------------|-------------|
| `src/app/api/chat/route.ts` | `chat` | `${ipHash}:${sid}` | 20/min per IP+session |
| `src/app/api/session/route.ts` | `session` | `ipHash` | 10/min per IP (prevents session spam) |
| `src/app/api/generate-image/route.ts` | `generate-image` | `${ipHash}:${sid}` | 5/min per IP+session |
| `src/app/api/invoice/route.ts` | `invoice` | `${ipHash}:${sid}` | 10/min per IP+session |
| `src/app/api/admin-login/route.ts` | N/A | `ipHash` | Brute force protection (separate system) |
| `src/app/api/rate-limit-status/route.ts` | N/A | `sid` | Status query only (uses `getRateLimitStatus`) |

### Related Files

- **`convex/rateLimit.ts`** - Main rate limiting module (this documentation)
- **`convex/cleanup.ts`** - Cleanup functions including `cleanupStaleRateLimits` and `cleanupAdminLoginAttempts`
- **`convex/crons.ts`** - Cron job configuration for scheduled cleanup
- **`convex/schema.ts`** - Database schema definitions for `rateLimits` and `adminLoginAttempts` tables

---

## Best Practices

1. **Identifier Selection:**
   - Use IP hash alone for session creation (prevents session spam)
   - Use `${ipHash}:${sessionId}` for authenticated endpoints (prevents per-session abuse)

2. **Error Responses:**
   - Always return `429` status code when rate limit exceeded
   - Include `Retry-After` header with seconds until reset
   - Provide user-friendly error messages

3. **Status Checking:**
   - Use `getRateLimitStatus` for read-only checks (doesn't increment counter)
   - Use `checkRateLimit` before processing requests (increments counter)

4. **Admin Login Protection:**
   - Always check `checkAdminLoginAllowed` before attempting authentication
   - Record failed attempts with `recordFailedAdminLogin`
   - Clear attempts with `clearAdminLoginAttempts` on success

5. **Configuration:**
   - Adjust limits based on endpoint cost and abuse potential
   - Monitor rate limit hits in production logs
   - Consider user experience when setting limits

