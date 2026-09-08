import { simulateReadableStream } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

export function providerStream(
  text = "Hello world!",
  reason: "stop" | "length" | "error" = "stop",
  embeddedError = false
) {
  const chunks: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (text) chunks.push(
    { type: "text-start", id: "answer" },
    { type: "text-delta", id: "answer", delta: text },
    { type: "text-end", id: "answer" }
  );
  if (embeddedError) chunks.push({ type: "error", error: new Error("Synthetic provider failure") });
  chunks.push({ type: "finish", finishReason: { unified: reason, raw: reason }, usage: {
    inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1000, text: 1000, reasoning: 0 },
  } });
  return { stream: simulateReadableStream({ chunks }) };
}
