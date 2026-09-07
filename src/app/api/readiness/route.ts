import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { isLndConfigured } from "@/lib/lnd";
import { authorizeOpsRequest } from "@/lib/ops-auth";
import {
  createRequestObservabilityContext,
  elapsedMs,
  incrementMetricCounter,
  logApiFailure,
  logInfo,
  logWarn,
} from "@/lib/observability";

type CheckResult = {
  ok: boolean;
  critical: boolean;
  latencyMs?: number;
  missing?: string[];
  error?: string;
};

type ReadinessSummaryResponse = {
  status: "ready" | "not_ready";
  timestamp: string;
  uptimeMs: number;
  durationMs: number;
  visibility: "summary" | "detailed";
};

type ReadinessDetailedResponse = ReadinessSummaryResponse & {
  checks: {
    env: CheckResult;
    convex: CheckResult;
    lnd: CheckResult & { configured: boolean };
  };
};

type ReadinessResponse = ReadinessSummaryResponse | ReadinessDetailedResponse;

// Keep the public readiness gate focused on core dependencies only.
const REQUIRED_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "NEXT_PUBLIC_CONVEX_URL",
  "CONVEX_SERVER_SECRET",
  "SESSION_SECRET",
  "IP_HASH_SECRET",
] as const;

function missingRequiredEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return !value || value.trim() === "";
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * GET /api/readiness
 * Dependency readiness endpoint with minimal SLO-oriented checks.
 */
export async function GET(
  request: Request
): Promise<NextResponse<ReadinessResponse>> {
  const context = createRequestObservabilityContext(request, "/api/readiness");
  const startedAt = Date.now();
  const opsAuth = authorizeOpsRequest(request, {
    tokenEnvVar: "READINESS_TOKEN",
    ipAllowlistEnvVar: "READINESS_IP_ALLOWLIST",
  });

  const missingEnv = missingRequiredEnvVars();
  const envCheck: CheckResult = {
    ok: missingEnv.length === 0,
    critical: true,
    ...(missingEnv.length > 0 ? { missing: missingEnv } : {}),
  };

  const convexCheck: CheckResult = {
    ok: false,
    critical: true,
  };

  const convex = getConvexClient();
  if (!convex) {
    convexCheck.error = "Convex client not configured";
  } else {
    try {
      getConvexServerSecret();
      const checkStartedAt = Date.now();
      await convex.query(api.rateLimit.getRateLimitStatus, {
        identifier: "_readiness_probe",
        endpoint: "chat",
      });
      convexCheck.ok = true;
      convexCheck.latencyMs = Date.now() - checkStartedAt;
    } catch (error) {
      convexCheck.error = toErrorMessage(error);
      logApiFailure({
        context,
        stage: "readiness_convex_probe",
        error,
        statusCode: 503,
      });
    }
  }

  const lndConfigured = isLndConfigured();
  const lndCheck: CheckResult & { configured: boolean } = {
    ok: lndConfigured,
    configured: lndConfigured,
    critical: false,
    ...(!lndConfigured ? { error: "LND not configured" } : {}),
  };

  const ready = envCheck.ok && convexCheck.ok;
  const summary: ReadinessSummaryResponse = {
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    uptimeMs: process.uptime() * 1000,
    durationMs: Date.now() - startedAt,
    visibility: opsAuth.authorized ? "detailed" : "summary",
  };
  const response: ReadinessResponse = opsAuth.authorized
    ? {
      ...summary,
      checks: {
        env: envCheck,
        convex: convexCheck,
        lnd: lndCheck,
      },
    }
    : summary;

  const detailedChecks = {
    env: envCheck,
    convex: convexCheck,
    lnd: lndCheck,
  };

  incrementMetricCounter("readiness_checks_total", {
    status: summary.status,
    visibility: summary.visibility,
  });
  incrementMetricCounter("api_requests_total", {
    route: context.route,
    method: context.method,
    status: ready ? 200 : 503,
  });

  if (ready) {
    logInfo("readiness.ready", {
      route: context.route,
      requestId: context.requestId,
      durationMs: elapsedMs(context),
      convexLatencyMs: convexCheck.latencyMs,
      visibility: summary.visibility,
    });
  } else {
    logWarn("readiness.not_ready", {
      route: context.route,
      requestId: context.requestId,
      durationMs: elapsedMs(context),
      visibility: summary.visibility,
      checks: opsAuth.authorized ? detailedChecks : undefined,
    });
  }

  return NextResponse.json(response, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
