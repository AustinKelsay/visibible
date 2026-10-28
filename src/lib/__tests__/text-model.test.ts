/** The OpenRouter text adapter's request body; a stub fetch, no provider call. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenRouterTextModel, type TextModelRequest } from "../reading-pass/model";

const request: TextModelRequest = { label: "t", system: "s", user: "u", schemaName: "x", schema: z.object({ ok: z.boolean() }).strict(), maxTokens: 900, expectedCompletionTokens: 10 };
async function body(adapterEffort: "none" | "low" | undefined, req: TextModelRequest) {
  let sent: Record<string, unknown> = {};
  const model = createOpenRouterTextModel({ apiKey: "k", reasoningEffort: adapterEffort, fetch: async (_url, init) => {
    sent = JSON.parse(String(init.body));
    return Response.json({ id: "g", model: "m", choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } });
  } });
  await model.complete(req);
  return sent;
}

describe("OpenRouter text adapter", () => {
  it("keeps reasoning off by default and lets a request opt in, overriding the adapter", async () => {
    expect((await body(undefined, request)).reasoning).toEqual({ effort: "none" });
    expect((await body("low", request)).reasoning).toEqual({ effort: "low" });
    expect((await body(undefined, { ...request, reasoningEffort: "low", maxTokens: 4000 }))).toMatchObject({ reasoning: { effort: "low" }, max_tokens: 4000 });
    expect((await body("low", { ...request, reasoningEffort: "none" })).reasoning).toEqual({ effort: "none" });
    expect(await body(undefined, request)).toMatchObject({ provider: { require_parameters: true, order: ["anthropic"], allow_fallbacks: false }, max_tokens: 900 });
  });
});
