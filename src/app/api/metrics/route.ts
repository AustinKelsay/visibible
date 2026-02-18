import { NextResponse } from "next/server";
import {
  createRequestObservabilityContext,
  getMetricsSnapshot,
  incrementMetricCounter,
} from "@/lib/observability";

/**
 * GET /api/metrics
 * Exposes machine-parseable in-process observability counters.
 */
export async function GET(request: Request): Promise<NextResponse> {
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
