import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetChatModelPricing,
  mockIsModelFree,
  mockComputeChatCreditsCost,
} = vi.hoisted(() => ({
  mockGetChatModelPricing: vi.fn(),
  mockIsModelFree: vi.fn(),
  mockComputeChatCreditsCost: vi.fn(),
}));

vi.mock("../chat-models", () => ({
  DEFAULT_CHAT_MODEL: "openai/gpt-oss-120b",
  SCENE_PLANNER_ESTIMATED_TOKENS: 450,
  computeChatCreditsCost: mockComputeChatCreditsCost,
  getChatModelPricing: mockGetChatModelPricing,
  isModelFree: mockIsModelFree,
}));

import {
  getScenePlannerEstimatedCreditsCost,
  getScenePlannerModelId,
  isScenePlannerEnabled,
} from "../scene-planner";

const originalEnv = { ...process.env };

describe("scene planner helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_SCENE_PLANNER_MODEL;
    delete process.env.ENABLE_SCENE_PLANNER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses the default planner model when no override is configured", () => {
    expect(getScenePlannerModelId()).toBe("openai/gpt-oss-120b");
  });

  it("detects when the scene planner is disabled", () => {
    process.env.ENABLE_SCENE_PLANNER = "false";
    expect(isScenePlannerEnabled()).toBe(false);
  });

  it("returns 0 when the scene planner is disabled", async () => {
    process.env.ENABLE_SCENE_PLANNER = "false";

    await expect(
      getScenePlannerEstimatedCreditsCost("test-api-key")
    ).resolves.toBe(0);
    expect(mockGetChatModelPricing).not.toHaveBeenCalled();
  });

  it("returns the estimated planner surcharge when pricing is available", async () => {
    mockGetChatModelPricing.mockResolvedValue({ prompt: "1", completion: "2" });
    mockIsModelFree.mockReturnValue(false);
    mockComputeChatCreditsCost.mockReturnValue(2);

    await expect(
      getScenePlannerEstimatedCreditsCost("test-api-key")
    ).resolves.toBe(2);
    expect(mockGetChatModelPricing).toHaveBeenCalledWith(
      "openai/gpt-oss-120b",
      "test-api-key"
    );
    expect(mockComputeChatCreditsCost).toHaveBeenCalledWith(
      { prompt: "1", completion: "2" },
      450
    );
  });

  it("returns 0 when the planner model is free", async () => {
    mockGetChatModelPricing.mockResolvedValue({ prompt: "0", completion: "0" });
    mockIsModelFree.mockReturnValue(true);

    await expect(
      getScenePlannerEstimatedCreditsCost("test-api-key")
    ).resolves.toBe(0);
    expect(mockComputeChatCreditsCost).not.toHaveBeenCalled();
  });

  it("returns 0 when planner pricing lookup fails", async () => {
    mockGetChatModelPricing.mockRejectedValue(new Error("boom"));

    await expect(
      getScenePlannerEstimatedCreditsCost("test-api-key")
    ).resolves.toBe(0);
  });
});
