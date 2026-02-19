import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  incrementMetricCounter,
  resetObservabilityStateForTests,
} from "@/lib/observability";

const readinessState = {
  convexAvailable: true,
  convexProbeError: null as Error | null,
  convexSecretError: null as Error | null,
  lndConfigured: true,
};

vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => {
    if (!readinessState.convexAvailable) return null;
    return {
      query: vi.fn(async () => {
        if (readinessState.convexProbeError) {
          throw readinessState.convexProbeError;
        }
        return { remaining: 20, resetAt: Date.now() + 60_000 };
      }),
    };
  }),
  getConvexServerSecret: vi.fn(() => {
    if (readinessState.convexSecretError) {
      throw readinessState.convexSecretError;
    }
    return "test-convex-secret";
  }),
}));

vi.mock("@/lib/lnd", () => ({
  isLndConfigured: vi.fn(() => readinessState.lndConfigured),
}));

import { GET as healthGET } from "../../health/route";
import { GET as readinessGET } from "../../readiness/route";

const originalEnv = { ...process.env };

function setRequiredEnv() {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://test.convex.cloud";
  process.env.CONVEX_SERVER_SECRET = "test-convex-secret";
  process.env.SESSION_SECRET = "a".repeat(32);
  process.env.IP_HASH_SECRET = "b".repeat(32);
  process.env.METRICS_TOKEN = "test-metrics-token";
  process.env.TRUSTED_PROXY_IPS = "203.0.113.10";
}

async function importMetricsGET() {
  const routeModule = await import("../../metrics/route");
  return routeModule.GET;
}

function createRequestWithPeerIp(
  url: string,
  init: RequestInit,
  peerIp: string
): Request {
  const request = new Request(url, init);
  Object.defineProperty(request, "ip", {
    value: peerIp,
    configurable: true,
  });
  return request;
}

describe("ops endpoints", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    setRequiredEnv();
    readinessState.convexAvailable = true;
    readinessState.convexProbeError = null;
    readinessState.convexSecretError = null;
    readinessState.lndConfigured = true;
    resetObservabilityStateForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("health endpoint returns liveness snapshot", async () => {
    const response = await healthGET(
      new Request("http://localhost:3000/api/health", { method: "GET" })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeMs).toBe("number");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("metrics endpoint exposes machine-parseable counters", async () => {
    const metricsGET = await importMetricsGET();
    incrementMetricCounter("api_failures_total", {
      route: "/api/chat",
      stage: "stream",
      status: 500,
    });

    const response = await metricsGET(
      new Request("http://localhost:3000/api/metrics", {
        method: "GET",
        headers: { authorization: "Bearer test-metrics-token" },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.counters)).toBe(true);
    expect(
      body.counters.some(
        (counter: { name: string; labels: Record<string, string> }) =>
          counter.name === "api_failures_total" &&
          counter.labels.route === "/api/chat"
      )
    ).toBe(true);
  });

  it("metrics endpoint rejects unauthenticated requests", async () => {
    const metricsGET = await importMetricsGET();
    const response = await metricsGET(
      new Request("http://localhost:3000/api/metrics", { method: "GET" })
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("metrics endpoint allows requests from allowlisted IP", async () => {
    const metricsGET = await importMetricsGET();
    delete process.env.METRICS_TOKEN;
    process.env.METRICS_IP_ALLOWLIST = "10.0.0.5";

    const response = await metricsGET(
      createRequestWithPeerIp(
        "http://localhost:3000/api/metrics",
        {
          method: "GET",
          headers: { "x-forwarded-for": "10.0.0.5, 198.51.100.7" },
        },
        "203.0.113.10"
      )
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.counters)).toBe(true);
  });

  it("metrics endpoint rejects spoofed forwarded IP from untrusted peer", async () => {
    const metricsGET = await importMetricsGET();
    delete process.env.METRICS_TOKEN;
    process.env.METRICS_IP_ALLOWLIST = "10.0.0.5";

    const response = await metricsGET(
      createRequestWithPeerIp(
        "http://localhost:3000/api/metrics",
        {
          method: "GET",
          headers: { "x-forwarded-for": "10.0.0.5, 198.51.100.7" },
        },
        "198.51.100.7"
      )
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("readiness endpoint returns ready when critical checks pass", async () => {
    const response = await readinessGET(
      new Request("http://localhost:3000/api/readiness", { method: "GET" })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.checks.env.ok).toBe(true);
    expect(body.checks.convex.ok).toBe(true);
  });

  it("readiness endpoint returns not_ready when required env is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await readinessGET(
      new Request("http://localhost:3000/api/readiness", { method: "GET" })
    );
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe("not_ready");
    expect(body.checks.env.ok).toBe(false);
    expect(body.checks.env.missing).toContain("OPENROUTER_API_KEY");
  });

  it("readiness endpoint returns not_ready when convex probe fails", async () => {
    readinessState.convexProbeError = new Error("convex unavailable");

    const response = await readinessGET(
      new Request("http://localhost:3000/api/readiness", { method: "GET" })
    );
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe("not_ready");
    expect(body.checks.convex.ok).toBe(false);
    expect(body.checks.convex.error).toContain("convex unavailable");
  });

  it("readiness endpoint reports lnd as non-critical", async () => {
    readinessState.lndConfigured = false;

    const response = await readinessGET(
      new Request("http://localhost:3000/api/readiness", { method: "GET" })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.checks.lnd.ok).toBe(false);
    expect(body.checks.lnd.critical).toBe(false);
  });
});
