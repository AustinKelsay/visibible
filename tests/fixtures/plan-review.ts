/**
 * Scripted plan-review answers. Tests of unrelated engine mechanics wrap their scripted model so
 * every review reports no problems; review behavior itself is tested with explicit replies.
 */
import type { TextModel, TextModelRequest, TextModelResult } from "../../src/lib/reading-pass/model";

export const REVIEW_USAGE = { promptTokens: 40, completionTokens: 5, costUsd: 0.0001 };
export const reviewReply = (problems: unknown[] = []): TextModelResult =>
  ({ content: JSON.stringify({ problems }), model: "scripted-review", providerRequestId: null, finishReason: "stop", usage: REVIEW_USAGE, elapsedMs: 1 });

/** Answers plan_review requests with a clean report and forwards every other request unchanged. */
export function withCleanReview<T extends TextModel>(model: T, reviews: TextModelRequest[] = []): T {
  return { ...model, id: model.id, complete: async (request: TextModelRequest) => {
    if (request.schemaName !== "plan_review") return model.complete(request);
    reviews.push(request); return reviewReply();
  } } as T;
}
