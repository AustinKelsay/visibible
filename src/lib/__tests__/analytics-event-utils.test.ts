import { describe, expect, it } from "vitest";
import {
  resolveChatErrorType,
  resolveCreditsModalClosedStep,
  resolveCreditsModalOpenedStep,
  resolveHasCreditsAfterGeneration,
} from "@/lib/analytics-event-utils";

describe("resolveCreditsModalOpenedStep", () => {
  it("returns invoice when reopening into a valid active invoice", () => {
    const step = resolveCreditsModalOpenedStep({
      hasActiveInvoice: true,
      hasSeenWelcome: false,
      hasShownWelcomeInSession: false,
    });

    expect(step).toBe("invoice");
  });

  it("returns welcome for first-time users without a seen welcome", () => {
    const step = resolveCreditsModalOpenedStep({
      hasActiveInvoice: false,
      hasSeenWelcome: false,
      hasShownWelcomeInSession: false,
    });

    expect(step).toBe("welcome");
  });

  it("returns selection when welcome was already seen", () => {
    const step = resolveCreditsModalOpenedStep({
      hasActiveInvoice: false,
      hasSeenWelcome: true,
      hasShownWelcomeInSession: false,
    });

    expect(step).toBe("selection");
  });

  it("returns selection when welcome was shown in current session", () => {
    const step = resolveCreditsModalOpenedStep({
      hasActiveInvoice: false,
      hasSeenWelcome: false,
      hasShownWelcomeInSession: true,
    });

    expect(step).toBe("selection");
  });
});

describe("resolveHasCreditsAfterGeneration", () => {
  it("prefers returned credits when provided", () => {
    expect(
      resolveHasCreditsAfterGeneration({
        returnedCredits: 0,
        currentCredits: 5,
      })
    ).toBe(false);
  });

  it("uses current credits when returned credits are missing", () => {
    expect(
      resolveHasCreditsAfterGeneration({
        returnedCredits: undefined,
        currentCredits: 2,
      })
    ).toBe(true);
  });
});

describe("resolveCreditsModalClosedStep", () => {
  it("uses current state when state is a concrete step", () => {
    expect(
      resolveCreditsModalClosedStep({
        state: "invoice",
        hasActiveInvoice: false,
        hasShownWelcomeInSession: false,
      })
    ).toBe("invoice");
  });

  it("falls back to invoice when a non-step state still has active invoice", () => {
    expect(
      resolveCreditsModalClosedStep({
        state: "success",
        hasActiveInvoice: true,
        hasShownWelcomeInSession: true,
      })
    ).toBe("invoice");
  });

  it("falls back to selection when welcome was shown in-session", () => {
    expect(
      resolveCreditsModalClosedStep({
        state: "error",
        hasActiveInvoice: false,
        hasShownWelcomeInSession: true,
      })
    ).toBe("selection");
  });
});

describe("resolveChatErrorType", () => {
  it("returns rate_limit for 429/rate-limited errors", () => {
    expect(resolveChatErrorType(new Error("Rate limited (429)"))).toBe("rate_limit");
  });

  it("returns model_unavailable for endpoint unavailability errors", () => {
    expect(resolveChatErrorType(new Error("No endpoints available (503)"))).toBe("model_unavailable");
  });

  it("returns service_busy for busy/retry style errors", () => {
    expect(resolveChatErrorType(new Error("Service is busy, retry later"))).toBe("service_busy");
  });

  it("returns unknown for unmatched errors", () => {
    expect(resolveChatErrorType(new Error("Unexpected error"))).toBe("unknown");
  });

  it("returns null when no error is provided", () => {
    expect(resolveChatErrorType(null)).toBeNull();
  });
});
