/**
 * The live image provider for the evaluation runner (#98): the same OpenRouter chat-completion image
 * request the generic engine makes, with usage included so spend is actual where reported. The runner
 * never calls it in a dry run.
 */
import { extractOpenRouterUsageUsd, findResponseImageUrl } from "../image-response";
import { supportsResolution } from "../image-models";
import { EvalProviderError, type EvalImageProvider } from "./runner";

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
