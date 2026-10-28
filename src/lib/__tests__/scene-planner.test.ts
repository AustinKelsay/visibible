import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getScenePlannerModelId, isScenePlannerEnabled } from "../scene-planner";

const originalEnv = { ...process.env };

describe("scene planner helpers", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_SCENE_PLANNER_MODEL;
    delete process.env.ENABLE_SCENE_PLANNER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses the default planner model when no override is configured", () => {
    expect(getScenePlannerModelId()).toBe("nvidia/nemotron-3-super-120b-a12b:free");
  });

  it("detects when the scene planner is disabled", () => {
    process.env.ENABLE_SCENE_PLANNER = "false";
    expect(isScenePlannerEnabled()).toBe(false);
  });
});
