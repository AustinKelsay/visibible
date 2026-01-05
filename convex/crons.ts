import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up expired sessions daily at 3:00 AM UTC
crons.daily(
  "cleanup expired sessions",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.cleanupExpiredSessions
);

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

export default crons;
