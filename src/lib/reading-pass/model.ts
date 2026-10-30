/**
 * The text model behind the reading pass: Claude Haiku 5.5 through OpenRouter, reasoning off by default,
 * schema-constrained JSON (#165 §2). Tests substitute a scripted model through the same interface.
 */
import type { z } from "zod";
import { responseSchema } from "./prompts";

export const READING_PASS_MODEL = "anthropic/claude-haiku-5.5";
/**
 * Haiku 5.5 list prices, USD per token, used only to reserve budget before a call. Requests over
 * 100,000 prompt tokens are priced five times higher in full, so the reservation steps up too.
 */
export const READING_PASS_PRICES = Object.freeze({ promptPerToken: 0.1e-6, completionPerToken: 0.5e-6, longPromptTokens: 100_000, longPromptMultiplier: 5 });
const CHARS_PER_TOKEN = 2.7;

/** Reasoning stays off unless a caller opts in; Anthropic then needs max_tokens above a 1,024-token thinking budget. */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type TextModelRequest = {
  label: string;
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType;
  maxTokens: number;
  /** Expected completion tokens, for the spend reservation. */
  expectedCompletionTokens: number;
  /** Per-request reasoning, overriding the adapter's setting (off by default). */
  reasoningEffort?: ReasoningEffort;
};

export type TextModelResult = {
  content: string;
  model: string;
  providerRequestId: string | null;
  finishReason: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null };
  elapsedMs: number;
};

export interface TextModel {
  readonly id: string;
  complete(request: TextModelRequest): Promise<TextModelResult>;
}

/** Thrown before a call that would pass the owner's provider-spend budget; never a model failure. */
export class BudgetExceededError extends Error {
  constructor(public readonly spentUsd: number, public readonly nextUsd: number, public readonly budgetUsd: number) {
    super(`Provider spend budget of $${budgetUsd.toFixed(2)} would be exceeded: spent $${spentUsd.toFixed(4)}, next call about $${nextUsd.toFixed(4)}`);
  }
}

export function estimateRequestCostUsd(request: Pick<TextModelRequest, "system" | "user" | "expectedCompletionTokens">): number {
  const promptTokens = (request.system.length + request.user.length) / CHARS_PER_TOKEN;
  const step = promptTokens > READING_PASS_PRICES.longPromptTokens ? READING_PASS_PRICES.longPromptMultiplier : 1;
  return step * (promptTokens * READING_PASS_PRICES.promptPerToken + request.expectedCompletionTokens * READING_PASS_PRICES.completionPerToken);
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createOpenRouterTextModel(options: { apiKey: string; model?: string; fetch?: FetchLike; timeoutMs?: number; reasoningEffort?: ReasoningEffort }): TextModel {
  const model = options.model ?? READING_PASS_MODEL;
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return {
    id: model,
    async complete(request) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20 * 60 * 1000);
      let response: Response;
      try {
        response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "visibible-reading-pass",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }],
            response_format: { type: "json_schema", json_schema: { name: request.schemaName, strict: true, schema: responseSchema(request.schema) } },
            provider: { require_parameters: true, order: ["anthropic"], allow_fallbacks: false },
            reasoning: { effort: request.reasoningEffort ?? options.reasoningEffort ?? "none" },
            max_tokens: request.maxTokens,
            usage: { include: true },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string; model?: string; error?: unknown;
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 300)}`);
      const choice = payload.choices?.[0];
      return {
        content: choice?.message?.content ?? "",
        model: payload.model ?? model,
        providerRequestId: payload.id ?? null,
        finishReason: choice?.finish_reason ?? null,
        usage: {
          promptTokens: payload.usage?.prompt_tokens ?? null,
          completionTokens: payload.usage?.completion_tokens ?? null,
          costUsd: typeof payload.usage?.cost === "number" ? payload.usage.cost : null,
        },
        elapsedMs: Date.now() - started,
      };
    },
  };
}

/** Parse a model's JSON content against its schema; a code fence around the JSON is tolerated. */
export function parseModelJson<T>(schema: z.ZodType<T>, content: string): { value: T } | { error: string } {
  let text = content.trim();
  if (text.startsWith("```")) text = text.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const result = schema.safeParse(raw);
  return result.success ? { value: result.data } : { error: `schema: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
}
