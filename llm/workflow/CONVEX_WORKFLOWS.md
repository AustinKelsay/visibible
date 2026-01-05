# Convex Development Workflows

Common Convex workflows for local development. This project uses Convex for backend state (sessions, invoices, credits, images).

---

## Starting Development

Run both the Next.js dev server and Convex dev server:

```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: Convex (watches for changes, syncs functions)
npx convex dev
```

The Convex dev server:
- Watches `convex/*.ts` for changes
- Auto-deploys functions to your dev deployment
- Shows real-time logs in the terminal

---

## Environment Variables

Convex has its own environment separate from Next.js (`.env.local`). Some variables must exist in both.

### View current Convex env vars
```bash
npx convex env list
```

### Set a Convex env var
```bash
npx convex env set VARIABLE_NAME "value"
```

### Remove a Convex env var
```bash
npx convex env unset VARIABLE_NAME
```

### Required Convex env vars for this project

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD_SECRET` | HMAC secret for admin session upgrade verification |
| `CONVEX_SERVER_SECRET` | Server secret for authenticating internal mutations from Next.js API routes |

**Note:** These must be set in both Convex (`npx convex env set`) AND Next.js (`.env.local`). The values must match.

---

## Schema Changes

When modifying `convex/schema.ts`:

1. Edit the schema file
2. `npx convex dev` auto-syncs the changes
3. For breaking changes, you may need to:
   - Clear data in the dashboard, or
   - Write a migration

```bash
# Schema is in:
convex/schema.ts
```

---

## Testing Convex Functions

Tests live alongside Convex functions:

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Test files:
- `convex/sessions.test.ts` - Session and credit ledger tests

---

## Deployment

### Deploy to production
```bash
npx convex deploy
```

### Deploy with env vars (first time or after adding new vars)
```bash
npx convex deploy
npx convex env set ADMIN_PASSWORD_SECRET "your-production-value"
```

---

## Dashboard Access

The Convex dashboard provides:
- Real-time function logs
- Data browser (view/edit tables)
- Deployment settings
- Environment variable management

Access via:
```bash
npx convex dashboard
```

Or visit: https://dashboard.convex.dev

---

## Common Troubleshooting

### "Unauthorized" errors from Convex actions
Check that required env vars are set in Convex (not just `.env.local`):
```bash
npx convex env list
```

### Functions not updating
Ensure `npx convex dev` is running and watching for changes.

### Schema validation errors
Check the Convex dev terminal for specific error messages. May need to clear data or write a migration for breaking changes.

---

## Project-Specific Notes

### Convex Files
```
convex/
  _generated/     # Auto-generated types (don't edit)
  schema.ts       # Database schema
  sessions.ts     # Session & credit mutations/queries
  invoices.ts     # Invoice mutations/queries
  modelStats.ts   # Generation timing stats
  verseImages.ts  # Image storage
  rateLimit.ts    # Rate limiting functions
  feedback.ts     # Feedback submission mutation
  cleanup.ts      # Cleanup mutations (internal)
  crons.ts        # Scheduled jobs
  sessions.test.ts # Unit tests
```

### Next.js Integration
- Server-side client: `src/lib/convex-client.ts`
- API routes call Convex mutations/queries directly
- No client-side Convex provider (all server-side)

---

## Scheduled Jobs (Crons)

**File:** `convex/crons.ts`

Convex runs scheduled jobs to clean up expired data and prevent unbounded table growth.

### Cron Schedule

| Job | Schedule | Function |
|-----|----------|----------|
| cleanup expired sessions | 3:00 AM UTC daily | `cleanupExpiredSessions` |
| cleanup stale rate limits | 3:15 AM UTC daily | `cleanupStaleRateLimits` |
| cleanup admin login attempts | 3:30 AM UTC daily | `cleanupAdminLoginAttempts` |

### Cleanup Behavior

**File:** `convex/cleanup.ts`

All cleanup functions are internal mutations (not callable from outside Convex).

| Function | Deletes | Retention |
|----------|---------|-----------|
| `cleanupExpiredSessions` | Sessions past `expiresAt` | Expired only |
| `cleanupStaleRateLimits` | Rate limits with `windowStart` > 1 hour ago | 1 hour |
| `cleanupAdminLoginAttempts` | Login attempts with `lastAttempt` > 24 hours ago | 24 hours |

**Batch Limits:** Each cleanup processes up to 100 records per run to avoid timeouts. If more records need cleaning, subsequent runs will process the remainder.

### Viewing Cron Logs

Cron execution logs appear in:
1. Convex dev terminal (during `npx convex dev`)
2. Convex dashboard → Logs tab

### Manual Cleanup

In emergencies, you can clear tables via the Convex dashboard:
1. Open dashboard: `npx convex dashboard`
2. Navigate to the table
3. Select and delete records

**Caution:** Deleting active sessions will log users out.
