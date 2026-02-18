import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up expired sessions frequently to prevent stale-session buildup.
crons.interval(
  "cleanup expired sessions",
  { minutes: 15 },
  internal.cleanup.cleanupExpiredSessions
);

// Clean up stale rate-limit records frequently for high-churn protection.
crons.interval(
  "cleanup stale rate limits",
  { minutes: 10 },
  internal.cleanup.cleanupStaleRateLimits
);

// Clean up old admin login attempts hourly.
crons.interval(
  "cleanup admin login attempts",
  { hours: 1 },
  internal.cleanup.cleanupAdminLoginAttempts
);

// Retry image cost events that could not be persisted during request handling.
crons.interval(
  "process image cost event outbox",
  { minutes: 5 },
  internal.costs.processCostEventOutboxBatch,
  { limit: 20 }
);

// Release stale reservation-only generations from crashed/aborted requests.
crons.interval(
  "reconcile stale credit reservations",
  { minutes: 5 },
  internal.sessions.reconcileStaleReservations,
  {
    maxAgeMs: 30 * 60 * 1000, // 30 minutes
    limit: 50,
  }
);

export default crons;
