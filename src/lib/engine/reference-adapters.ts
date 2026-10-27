/**
 * Production adapters for reference preparation (#172): Nano Banana 2 Lite through OpenRouter's
 * chat completions with image output, Claude Haiku 5.5 as the vision checker, and the Convex
 * action that stores blobs. Tests substitute fakes through the same interfaces.
 */
import { z } from "zod";
import { CHECK_MODEL_ID, type ImageMaker, type VisionChecker } from "./references";
import { responseSchema } from "../reading-pass/prompts";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** One OpenRouter call whose timeout covers the whole exchange, body read included. */
async function postJson<T>(fetchImpl: FetchLike, apiKey: string, body: unknown, timeoutMs: number): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "visibible-references" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T;
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

export function createOpenRouterImageMaker(options: { apiKey: string; model?: string; fetch?: FetchLike; timeoutMs?: number }): ImageMaker {
  const model = options.model ?? "google/gemini-3.1-flash-lite-image";
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    id: model,
    async generate(request) {
      const started = Date.now();
      const { response, payload } = await postJson<{ error?: unknown; usage?: { cost?: number }; choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }> }>(fetchImpl, options.apiKey,
        { model, messages: [{ role: "user", content: request.prompt }], modalities: ["image", "text"], image_config: { aspect_ratio: request.aspectRatio }, usage: { include: true } }, options.timeoutMs ?? 120_000);
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
      const match = url.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("OpenRouter returned no image");
      return { bytes: Uint8Array.from(Buffer.from(match[2], "base64")), mimeType: match[1], costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : null, elapsedMs: Date.now() - started };
    },
  };
}

export function createOpenRouterVisionChecker(options: { apiKey: string; model?: string; fetch?: FetchLike; timeoutMs?: number; reasoningEffort?: "none" | "low"; maxTokens?: number }): VisionChecker {
  const model = options.model ?? CHECK_MODEL_ID;
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    id: model,
    async check<T>(request: { label: string; question: string; schema: z.ZodType<T>; image: { bytes: Uint8Array; mimeType: string } }) {
      const started = Date.now();
      const { response, payload } = await postJson<{ error?: unknown; usage?: { cost?: number }; choices?: Array<{ message?: { content?: string } }> }>(fetchImpl, options.apiKey, {
        model,
        messages: [{ role: "user", content: [{ type: "text", text: request.question }, { type: "image_url", image_url: { url: `data:${request.image.mimeType};base64,${Buffer.from(request.image.bytes).toString("base64")}` } }] }],
        response_format: { type: "json_schema", json_schema: { name: "reference_check", strict: true, schema: responseSchema(request.schema) } },
        provider: { require_parameters: true, order: ["anthropic"], allow_fallbacks: false },
        reasoning: { effort: options.reasoningEffort ?? "none" }, max_tokens: options.maxTokens ?? 800, usage: { include: true },
      }, options.timeoutMs ?? 60_000);
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const parsed = request.schema.safeParse(JSON.parse(payload.choices?.[0]?.message?.content ?? "null"));
      if (!parsed.success) throw new Error(`Checker returned invalid JSON: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      return { value: parsed.data, costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : null, elapsedMs: Date.now() - started };
    },
  };
}
