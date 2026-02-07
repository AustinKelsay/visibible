/**
 * Mock OpenRouter and AI SDK for integration tests.
 * Provides configurable responses for chat and image generation.
 */

import { vi } from "vitest";

export interface MockStreamConfig {
  chunks: string[];
  delayMs?: number;
  shouldError?: boolean;
  errorAfterChunks?: number;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface MockImageConfig {
  imageUrl?: string;
  shouldError?: boolean;
  errorStatus?: number;
  usageCost?: number | null;
  noImageInResponse?: boolean;
}

/**
 * Creates a mock ReadableStream that emits chunks with optional delays.
 */
function createMockStream(config: MockStreamConfig): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  return new ReadableStream({
    async pull(controller) {
      if (config.shouldError && chunkIndex === (config.errorAfterChunks ?? 0)) {
        controller.error(new Error("Stream error"));
        return;
      }

      if (chunkIndex >= config.chunks.length) {
        controller.close();
        return;
      }

      if (config.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, config.delayMs));
      }

      const chunk = config.chunks[chunkIndex];
      controller.enqueue(encoder.encode(chunk));
      chunkIndex++;
    },
  });
}

/**
 * Creates a mock streamText result for the AI SDK.
 */
export function createMockStreamTextResult(config: MockStreamConfig = { chunks: ["Hello"] }) {
  const stream = createMockStream(config);

  return {
    toUIMessageStreamResponse: vi.fn(
      (options?: {
        messageMetadata?: (params: { part: { type: string; totalUsage?: { inputTokens: number; outputTokens: number }; finishReason?: string } }) => unknown;
      }) => {
        // Create a response that streams the chunks
        const transformedStream = new TransformStream({
          async transform(chunk, controller) {
            controller.enqueue(chunk);
          },
          async flush() {
            // Call messageMetadata callback with finish part
            if (options?.messageMetadata) {
              options.messageMetadata({
                part: {
                  type: "finish",
                  totalUsage: {
                    inputTokens: config.inputTokens ?? 100,
                    outputTokens: config.outputTokens ?? 50,
                  },
                  finishReason: config.finishReason ?? "stop",
                },
              });
            }
          },
        });

        const body = stream.pipeThrough(transformedStream);

        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
    ),
    textStream: stream,
    usage: Promise.resolve({
      promptTokens: config.inputTokens ?? 100,
      completionTokens: config.outputTokens ?? 50,
    }),
    finishReason: Promise.resolve(config.finishReason ?? "stop"),
  };
}

/**
 * Creates mock for @ai-sdk/openai configured for OpenRouter.
 */
export function createMockOpenRouterProvider() {
  return {
    createOpenAI: vi.fn(() => ({
      chat: vi.fn((modelId: string) => ({
        modelId,
        provider: "openrouter",
      })),
    })),
  };
}

/**
 * Creates a mock fetch response for OpenRouter image generation.
 */
export function createMockImageResponse(config: MockImageConfig = {}) {
  if (config.shouldError) {
    return {
      ok: false,
      status: config.errorStatus ?? 500,
      json: async () => ({ error: { message: "API error" } }),
    };
  }

  if (config.noImageInResponse) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "gen-123",
        choices: [
          {
            message: {
              content: [{ type: "text", text: "No image generated" }],
            },
          },
        ],
        usage: config.usageCost != null ? { cost: config.usageCost } : undefined,
      }),
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "gen-123",
      choices: [
        {
          message: {
            images: [
              {
                image_url: {
                  url: config.imageUrl ?? "data:image/png;base64,iVBORw0KGgo...",
                },
              },
            ],
            content: [
              {
                type: "image_url",
                image_url: {
                  url: config.imageUrl ?? "data:image/png;base64,iVBORw0KGgo...",
                },
              },
            ],
          },
        },
      ],
      usage: config.usageCost != null ? { cost: config.usageCost } : undefined,
    }),
  };
}

/**
 * Creates a mock fetch response for scene planner.
 */
export function createMockScenePlannerResponse(config: {
  shouldTimeout?: boolean;
  shouldError?: boolean;
  scenePlan?: Record<string, string>;
} = {}) {
  if (config.shouldTimeout) {
    return new Promise(() => {}); // Never resolves
  }

  if (config.shouldError) {
    return Promise.resolve({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Scene planner error" } }),
    });
  }

  const defaultScenePlan = {
    primarySubject: "A figure standing in an expansive void",
    action: "witnessing the moment of creation",
    setting: "primordial darkness before light existed",
    secondaryElements: "swirling cosmic matter",
    mood: "awe and reverence",
    timeOfDay: "before time began",
    composition: "wide angle, centered subject",
  };

  const scenePlan = config.scenePlan ?? defaultScenePlan;

  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(scenePlan),
          },
        },
      ],
    }),
  });
}

// Note: Do not use setup functions with vi.mock - vi.mock is hoisted
// Instead, define mocks directly in your test file at the top level
// and use the helper functions like createMockStreamTextResult()

/**
 * Create a mock 429 rate limit error for OpenRouter.
 */
export function createRateLimitError() {
  const error = new Error("Rate limited") as Error & {
    statusCode: number;
    responseBody: string;
  };
  error.statusCode = 429;
  error.responseBody = JSON.stringify({
    error: { message: "rate-limited" },
  });
  return error;
}

/**
 * Create a mock generic API error.
 */
export function createApiError(statusCode: number = 500, message: string = "API error") {
  const error = new Error(message) as Error & {
    statusCode: number;
    responseBody: string;
  };
  error.statusCode = statusCode;
  error.responseBody = JSON.stringify({
    error: { message },
  });
  return error;
}
