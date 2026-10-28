/**
 * Scripted plan-review answers. Tests of unrelated engine mechanics wrap their scripted model so
 * every review reports no problems; review behavior itself is tested with explicit replies.
 */
import type { TextModel, TextModelRequest, TextModelResult } from "../../src/lib/reading-pass/model";
import { selectionReply } from "./scene-grounding";

export const REVIEW_USAGE = { promptTokens: 40, completionTokens: 5, costUsd: 0.0001 };
export const reviewReply = (problems: unknown[] = []): TextModelResult =>
  ({ content: JSON.stringify({ problems }), model: "scripted-review", providerRequestId: null, finishReason: "stop", usage: REVIEW_USAGE, elapsedMs: 1 });

/** Answers reviews cleanly and serializes internal plan fixtures with the current selection contract. */
export function withCleanReview<T extends TextModel>(model: T, reviews: TextModelRequest[] = []): T {
  return { ...model, id: model.id, complete: async (request: TextModelRequest) => {
    if (request.schemaName === "plan_review") { reviews.push(request); return reviewReply(); }
    const result = await model.complete(request);
    if (request.schemaName !== "scene_plan") return result;
    let value: unknown;
    try { value = JSON.parse(result.content); } catch { return result; }
    // Since moment-cast v12 the reply has no `situation`; scene fields carry setting and time.
    return { ...result, content: JSON.stringify(selectionReply(value)) };
  } } as T;
}
