// Free, and lets the planner request disable reasoning so the JSON fits in max_tokens.
export const DEFAULT_SCENE_PLANNER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export function isScenePlannerEnabled(): boolean {
  return process.env.ENABLE_SCENE_PLANNER !== "false";
}

export function getScenePlannerModelId(): string {
  return process.env.OPENROUTER_SCENE_PLANNER_MODEL || DEFAULT_SCENE_PLANNER_MODEL;
}
