import { NextResponse } from "next/server";
import {
  createRequestObservabilityContext,
  getMetricsSnapshot,
  incrementMetricCounter,
} from "@/lib/observability";
import { authorizeOpsRequest } from "@/lib/ops-auth";

/**
 * GET /api/metrics
 * Exposes machine-parseable in-process observability counters.
 * Access is restricted to a bearer token, with optional trusted-IP allowlist hardening.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const opsAuth = authorizeOpsRequest(request, {
    tokenEnvVar: "METRICS_TOKEN",
    ipAllowlistEnvVar: "METRICS_IP_ALLOWLIST",
  });

  if (!opsAuth.authorized) {
    return NextResponse.json(
      {
        error: opsAuth.authPolicyConfigured
          ? "Forbidden"
          : "Metrics endpoint disabled",
      },
      {
        status: opsAuth.authPolicyConfigured ? 403 : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const context = createRequestObservabilityContext(request, "/api/metrics");

  incrementMetricCounter("api_requests_total", {
    route: context.route,
    method: context.method,
    status: 200,
  });

  return NextResponse.json(getMetricsSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
