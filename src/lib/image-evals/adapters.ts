/**
 * The live image provider for the evaluation runner (#98): the same OpenRouter chat-completion image
 * request the generic engine makes, with usage included so spend is actual where reported. The runner
 * never calls it in a dry run.
 */
import { extractOpenRouterUsageUsd, findResponseImageUrl } from "../image-response";
import { supportsResolution } from "../image-models";
import { geminiUsageUsd, type ModelPricing } from "./suite-run";

export interface EvalImageProvider {
  readonly id: string;
  generate(request: { label: string; prompt: string; model: string; aspectRatio: string; resolution: string; /** Reference images attached after the prompt, in order. */ references?: Array<{ bytes: Uint8Array; mimeType: string }> }): Promise<{ bytes: Uint8Array; mimeType: string; costUsd: number | null; elapsedMs: number; providerRequestId?: string | null }>;
}
/** Keep the HTTP status so funding failures never depend on matching provider error text. */
export class EvalProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "EvalProviderError";
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function postJson(fetchImpl: FetchLike, apiKey: string, body: unknown, timeoutMs: number): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "visibible-evals" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

export function createOpenRouterEvalImageProvider(options: { apiKey: string; fetch?: FetchLike; timeoutMs?: number }): EvalImageProvider {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    id: "openrouter-image",
    async generate(request) {
      const started = Date.now();
      const { response, payload } = await postJson(fetchImpl, options.apiKey, {
        model: request.model,
        messages: [{ role: "user", content: request.references?.length
          ? [{ type: "text", text: request.prompt }, ...request.references.map((r) => ({ type: "image_url", image_url: { url: `data:${r.mimeType};base64,${Buffer.from(r.bytes).toString("base64")}` } }))]
          : request.prompt }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: request.aspectRatio, ...(supportsResolution(request.model) ? { image_size: request.resolution } : {}) }, usage: { include: true },
      }, options.timeoutMs ?? 120_000);
      if (!response.ok) throw new EvalProviderError(response.status, `OpenRouter ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const url = findResponseImageUrl(choices[0] && typeof choices[0] === "object" ? (choices[0] as { message?: unknown }).message : undefined) ?? "";
      const match = url.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("OpenRouter returned no image");
      return { bytes: Uint8Array.from(Buffer.from(match[2], "base64")), mimeType: match[1], costUsd: extractOpenRouterUsageUsd(payload), elapsedMs: Date.now() - started, providerRequestId: typeof payload.id === "string" ? payload.id : null };
    },
  };
}

/** Strip OpenRouter's `google/` namespace to get the native Gemini API model identifier. */
export const geminiModelId = (model: string) => model.replace(/^google\//, "");

/** Native Gemini API endpoint for an image generation model. */
export const geminiGenerateUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModelId(model))}:generateContent`;

/**
 * Direct Gemini Developer API image provider for evaluations (same underlying model and reference attachments as
 * OpenRouter, funded by Google AI Studio / Ultra credits).
 */
export function createGeminiEvalImageProvider(options: { apiKey: string; pricing?: ModelPricing; fetch?: FetchLike; timeoutMs?: number }): EvalImageProvider {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    id: "gemini-image",
    async generate(request) {
      const started = Date.now();
      const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
      for (const r of request.references ?? []) {
        parts.push({ inlineData: { mimeType: r.mimeType, data: Buffer.from(r.bytes).toString("base64") } });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
      let response: Response;
      let payload: Record<string, unknown>;
      try {
        response = await fetchImpl(geminiGenerateUrl(request.model), {
          method: "POST",
          headers: { "x-goog-api-key": options.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              imageConfig: { aspectRatio: request.aspectRatio, ...(supportsResolution(request.model) ? { imageSize: request.resolution } : {}) },
            },
          }),
          signal: controller.signal,
        });
        payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new EvalProviderError(response.status, `Gemini ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const candidates = Array.isArray(payload.candidates) ? payload.candidates as Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> : [];
      const imagePart = candidates.flatMap((c) => c.content?.parts ?? []).find((p) => p?.inlineData?.data);
      if (!imagePart?.inlineData?.data) throw new Error("Gemini returned no image");
      const mimeType = typeof imagePart.inlineData.mimeType === "string" ? imagePart.inlineData.mimeType : "image/jpeg";
      const costUsd = options.pricing ? geminiUsageUsd(payload, options.pricing) : null;
      return {
        bytes: Uint8Array.from(Buffer.from(imagePart.inlineData.data, "base64")),
        mimeType,
        costUsd,
        elapsedMs: Date.now() - started,
        providerRequestId: typeof payload.responseId === "string" ? payload.responseId : null,
      };
    },
  };
}
