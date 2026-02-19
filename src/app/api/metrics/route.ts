import { NextResponse } from "next/server";
import {
  createRequestObservabilityContext,
  getMetricsSnapshot,
  incrementMetricCounter,
} from "@/lib/observability";
import { getClientIp } from "@/lib/client-ip";

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
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
 * Access is restricted to a bearer token, with optional trusted-IP allowlist hardening.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const metricsToken = (process.env.METRICS_TOKEN ?? "").trim();
  const providedToken = getBearerToken(request);
  const tokenPolicyEnabled = metricsToken.length > 0;
  const ipAllowlist = getMetricsIpAllowlist();
  const ipPolicyEnabled = ipAllowlist.length > 0;

  const tokenAuthorized =
    tokenPolicyEnabled &&
    typeof providedToken === "string" &&
    providedToken === metricsToken;

  const requestIp = getClientIp(request);
  const ipAuthorized =
    typeof requestIp === "string" &&
    requestIp !== "unknown" &&
    ipAllowlist.includes(requestIp);

  const authPolicyConfigured = tokenPolicyEnabled || ipPolicyEnabled;
  const authorized = tokenPolicyEnabled
    ? tokenAuthorized && (!ipPolicyEnabled || ipAuthorized)
    : ipAuthorized;

  if (!authorized) {
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
