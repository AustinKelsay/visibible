import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRequestObservabilityContext,
  getMetricsSnapshot,
  incrementMetricCounter,
  logApiFailure,
  resetObservabilityStateForTests,
} from "@/lib/observability";

describe("observability utilities", () => {
  beforeEach(() => {
    resetObservabilityStateForTests();
    vi.restoreAllMocks();
  });

  it("creates a request context with route/method/requestId", () => {
    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "x-request-id": "req_1234567890" },
    });

    const context = createRequestObservabilityContext(request, "/api/chat");

    expect(context.route).toBe("/api/chat");
    expect(context.method).toBe("POST");
    expect(context.requestId).toBe("req_1234567890");
  });

  it("increments and exposes metric counters", () => {
    incrementMetricCounter("api_requests_total", {
      route: "/api/chat",
      status: 200,
    });
    incrementMetricCounter("api_requests_total", {
      route: "/api/chat",
      status: 200,
    });

    const snapshot = getMetricsSnapshot();
    const entry = snapshot.counters.find(
      (counter) =>
        counter.name === "api_requests_total" &&
        counter.labels.route === "/api/chat" &&
        counter.labels.status === "200"
    );

    expect(entry?.value).toBe(2);
  });

  it("logs API failures as structured JSON and records a metric", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request("http://localhost:3000/api/chat", {
      method: "POST",
    });
    const context = createRequestObservabilityContext(request, "/api/chat", {
      requestId: "req_failure_123",
    });

    logApiFailure({
      context,
      stage: "openrouter_request",
      error: new Error("upstream failure"),
      statusCode: 503,
    });

    const snapshot = getMetricsSnapshot();
    const failureEntry = snapshot.counters.find(
      (counter) =>
        counter.name === "api_failures_total" &&
        counter.labels.route === "/api/chat" &&
        counter.labels.stage === "openrouter_request"
    );

    expect(failureEntry?.value).toBe(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string) as {
      event: string;
      route: string;
      requestId: string;
    };
    expect(payload.event).toBe("api.failure");
    expect(payload.route).toBe("/api/chat");
    expect(payload.requestId).toBe("req_failure_123");
  });
});
