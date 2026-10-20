/**
 * Live providers for the evaluation runner (#98): the same OpenRouter chat-completion image
 * request the route makes, with usage included so spend is actual where reported, and the scene
 * planner request with reasoning disabled. The runner never calls them in a dry run.
 */
import { extractOpenRouterUsageUsd, findResponseImageUrl } from "../image-response";
import { supportsResolution } from "../image-models";
import type { EvalImageProvider, EvalPlannerProvider } from "./runner";

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
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const url = findResponseImageUrl(choices[0] && typeof choices[0] === "object" ? (choices[0] as { message?: unknown }).message : undefined) ?? "";
      const match = url.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new Error("OpenRouter returned no image");
      return { bytes: Uint8Array.from(Buffer.from(match[2], "base64")), mimeType: match[1], costUsd: extractOpenRouterUsageUsd(payload), elapsedMs: Date.now() - started, providerRequestId: typeof payload.id === "string" ? payload.id : null };
    },
  };
}

export function createOpenRouterEvalPlannerProvider(options: { apiKey: string; model: string; fetch?: FetchLike; timeoutMs?: number }): EvalPlannerProvider {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    id: options.model,
    async plan(request) {
      const started = Date.now();
      const { response, payload } = await postJson(fetchImpl, options.apiKey, {
        model: options.model, messages: [{ role: "user", content: request.prompt }], temperature: 0.2, max_tokens: 220, reasoning: { enabled: false }, usage: { include: true },
      }, options.timeoutMs ?? 20_000);
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as { message?: { content?: unknown } }).message : undefined;
      const content = typeof message?.content === "string" ? message.content : Array.isArray(message?.content) ? message.content.map((p: { text?: string }) => p.text ?? "").join("") : null;
      return { content: content || null, costUsd: extractOpenRouterUsageUsd(payload), elapsedMs: Date.now() - started };
    },
  };
}
