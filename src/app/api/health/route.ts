import { NextResponse } from "next/server";
import {
  createRequestObservabilityContext,
  getHealthSnapshot,
  incrementMetricCounter,
  logInfo,
} from "@/lib/observability";

/**
 * GET /api/health
 * Liveness endpoint for load balancers and uptime probes.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const context = createRequestObservabilityContext(request, "/api/health");

  incrementMetricCounter("api_requests_total", {
    route: context.route,
    method: context.method,
    status: 200,
  });
  logInfo("health.check", {
    route: context.route,
    method: context.method,
    requestId: context.requestId,
  });

  return NextResponse.json(getHealthSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
