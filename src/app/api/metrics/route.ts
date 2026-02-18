import { NextResponse } from "next/server";
import {
  createRequestObservabilityContext,
  getMetricsSnapshot,
  incrementMetricCounter,
} from "@/lib/observability";

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function getForwardedClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

function getMetricsIpAllowlist(): string[] {
  const raw = process.env.METRICS_IP_ALLOWLIST ?? "";
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * GET /api/metrics
 * Exposes machine-parseable in-process observability counters.
 * Access is restricted to a bearer token and/or explicitly allowlisted IPs.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const metricsToken = (process.env.METRICS_TOKEN ?? "").trim();
  const providedToken = getBearerToken(request);
  const tokenAuthorized =
    metricsToken.length > 0 &&
    typeof providedToken === "string" &&
    providedToken === metricsToken;

  const requestIp = getForwardedClientIp(request);
  const ipAllowlist = getMetricsIpAllowlist();
  const ipAuthorized =
    typeof requestIp === "string" &&
    ipAllowlist.length > 0 &&
    ipAllowlist.includes(requestIp);

  if (!tokenAuthorized && !ipAuthorized) {
    const authPolicyConfigured = metricsToken.length > 0 || ipAllowlist.length > 0;
    return NextResponse.json(
      {
        error: authPolicyConfigured ? "Forbidden" : "Metrics endpoint disabled",
      },
      {
        status: authPolicyConfigured ? 403 : 503,
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
