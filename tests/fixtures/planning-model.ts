/** Adapt retained internal plan fixtures to the current provider reply shape. */
import type { TextModel, TextModelRequest } from "../../src/lib/reading-pass/model";
import { selectionReply } from "./scene-grounding";

export function withPlanningReply<T extends TextModel>(model: T): T {
  return { ...model, id: model.id, complete: async (request: TextModelRequest) => {
    const result = await model.complete(request);
    if (request.schemaName !== "scene_plan") return result;
    let value: unknown;
    try { value = JSON.parse(result.content); } catch { return result; }
    return { ...result, content: JSON.stringify(selectionReply(value)) };
  } } as T;
}
