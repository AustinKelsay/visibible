import {
  DEFAULT_CHAT_MODEL,
  SCENE_PLANNER_ESTIMATED_TOKENS,
  computeChatCreditsCost,
  getChatModelPricing,
  isModelFree,
} from "@/lib/chat-models";

export const DEFAULT_SCENE_PLANNER_MODEL = DEFAULT_CHAT_MODEL;

export function isScenePlannerEnabled(): boolean {
  return process.env.ENABLE_SCENE_PLANNER !== "false";
}

export function getScenePlannerModelId(): string {
  return process.env.OPENROUTER_SCENE_PLANNER_MODEL || DEFAULT_SCENE_PLANNER_MODEL;
}

/** Planner credits per call: 0 when disabled or known free, null when pricing is unknown. */
export async function getScenePlannerEstimatedCreditsCost(
  openRouterApiKey: string | undefined
): Promise<number | null> {
  if (!openRouterApiKey || !isScenePlannerEnabled()) {
    return 0;
  }

  try {
    const scenePlannerModel = getScenePlannerModelId();
    const scenePlannerPricing = await getChatModelPricing(
      scenePlannerModel,
      openRouterApiKey
    );

    if (!scenePlannerPricing) return null;
    if (isModelFree({ id: scenePlannerModel, pricing: scenePlannerPricing })) {
      return 0;
    }

    return computeChatCreditsCost(
      scenePlannerPricing,
      SCENE_PLANNER_ESTIMATED_TOKENS
    );
  } catch (error) {
    console.warn("[Scene Planner] Failed to estimate planner credits:", error);
    return null;
  }
}
