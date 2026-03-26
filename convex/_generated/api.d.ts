/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers_auth from "../_helpers/auth.js";
import type * as bulkGenerations from "../bulkGenerations.js";
import type * as cleanup from "../cleanup.js";
import type * as costs from "../costs.js";
import type * as crons from "../crons.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as invoices from "../invoices.js";
import type * as lib_nostrScheduling from "../lib/nostrScheduling.js";
import type * as modelCostStats from "../modelCostStats.js";
import type * as modelStats from "../modelStats.js";
import type * as nostr from "../nostr.js";
import type * as nostrScheduler from "../nostrScheduler.js";
import type * as rateLimit from "../rateLimit.js";
import type * as sessions from "../sessions.js";
import type * as verseImages from "../verseImages.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_helpers/auth": typeof _helpers_auth;
  bulkGenerations: typeof bulkGenerations;
  cleanup: typeof cleanup;
  costs: typeof costs;
  crons: typeof crons;
  feedback: typeof feedback;
  http: typeof http;
  invoices: typeof invoices;
  "lib/nostrScheduling": typeof lib_nostrScheduling;
  modelCostStats: typeof modelCostStats;
  modelStats: typeof modelStats;
  nostr: typeof nostr;
  nostrScheduler: typeof nostrScheduler;
  rateLimit: typeof rateLimit;
  sessions: typeof sessions;
  verseImages: typeof verseImages;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  neutralCost: {
    aiCosts: {
      addAICost: FunctionReference<
        "action",
        "internal",
        {
          markupMultiplier?: number;
          messageId: string;
          modelId: string;
          providerId: string;
          threadId: string;
          usage: {
            cachedInputTokens?: number;
            completionTokens: number;
            promptTokens: number;
            reasoningTokens?: number;
            totalTokens: number;
          };
          userId?: string;
        },
        any
      >;
      getAICostByMessageId: FunctionReference<
        "query",
        "internal",
        { messageId: string },
        any
      >;
      getAICostsByThread: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        Array<{
          _creationTime: number;
          _id: string;
          cost: {
            cachedInputTokensCost?: number;
            completionTokensCost: number;
            promptTokensCost: number;
            reasoningTokensCost?: number;
            totalCost: number;
          };
          costForUser: {
            cachedInputTokensCost?: number;
            completionTokensCost: number;
            promptTokensCost: number;
            reasoningTokensCost?: number;
            totalCost: number;
          };
          messageId: string;
          threadId: string;
          usage: {
            cachedInputTokens?: number;
            completionTokens: number;
            promptTokens: number;
            reasoningTokens?: number;
            totalTokens: number;
          };
          userId?: string;
        }>
      >;
      getAICostsByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          cost: {
            cachedInputTokensCost?: number;
            completionTokensCost: number;
            promptTokensCost: number;
            reasoningTokensCost?: number;
            totalCost: number;
          };
          costForUser: {
            cachedInputTokensCost?: number;
            completionTokensCost: number;
            promptTokensCost: number;
            reasoningTokensCost?: number;
            totalCost: number;
          };
          messageId: string;
          threadId: string;
          usage: {
            cachedInputTokens?: number;
            completionTokens: number;
            promptTokens: number;
            reasoningTokens?: number;
            totalTokens: number;
          };
          userId?: string;
        }>
      >;
      getTotalAICostsByThread: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        any
      >;
      getTotalAICostsByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
    };
    markup: {
      deleteMarkup: FunctionReference<
        "mutation",
        "internal",
        {
          modelId?: string;
          providerId: string;
          scope: "provider" | "model" | "tool";
          toolId?: string;
        },
        boolean
      >;
      getMarkupMultiplier: FunctionReference<
        "query",
        "internal",
        { modelId?: string; providerId: string; toolId?: string },
        number
      >;
      getMarkupMultiplierById: FunctionReference<
        "query",
        "internal",
        { markupMultiplierId: string },
        any
      >;
      getMarkupMultipliers: FunctionReference<
        "query",
        "internal",
        {},
        {
          modelMarkupMultipliers: Array<{
            markupMultiplier: number;
            modelId: string;
            providerId: string;
          }>;
          providerMultipliers: Array<{
            markupMultiplier: number;
            providerId: string;
          }>;
          toolMarkupMultipliers: Array<{
            markupMultiplier: number;
            providerId: string;
            toolId: string;
          }>;
        }
      >;
      upsertModelMarkup: FunctionReference<
        "mutation",
        "internal",
        {
          markupMultiplier: number;
          modelId: string;
          providerId: string;
          scope: "model";
        },
        string
      >;
      upsertProviderMarkup: FunctionReference<
        "mutation",
        "internal",
        { markupMultiplier: number; providerId: string; scope: "provider" },
        string
      >;
      upsertToolMarkup: FunctionReference<
        "mutation",
        "internal",
        {
          markupMultiplier: number;
          providerId: string;
          scope: "tool";
          toolId: string;
        },
        string
      >;
    };
    pricing: {
      deleteToolPricing: FunctionReference<
        "mutation",
        "internal",
        { modelId?: string; providerId: string },
        any
      >;
      getAllPricing: FunctionReference<"query", "internal", {}, any>;
      getAllToolPricing: FunctionReference<"query", "internal", {}, any>;
      getPricing: FunctionReference<
        "query",
        "internal",
        { modelId: string; providerId: string },
        any
      >;
      getPricingByProvider: FunctionReference<
        "query",
        "internal",
        { providerId: string },
        any
      >;
      getToolPricing: FunctionReference<
        "query",
        "internal",
        { providerId: string; toolId: string },
        any
      >;
      getToolPricingByProvider: FunctionReference<
        "query",
        "internal",
        { providerId: string },
        any
      >;
      searchPricingByModelName: FunctionReference<
        "query",
        "internal",
        { searchTerm: string },
        any
      >;
      updatePricingData: FunctionReference<
        "action",
        "internal",
        { envKeys?: Record<string, string> },
        any
      >;
      updatePricingTable: FunctionReference<
        "mutation",
        "internal",
        {
          pricingData: Array<{
            lastUpdated: number;
            limits: { context: number; output: number };
            modelId: string;
            modelName: string;
            pricing: {
              cache_read?: number;
              cache_write?: number;
              input: number;
              output: number;
              reasoning?: number;
            };
            providerId: string;
            providerName: string;
          }>;
        },
        any
      >;
      upsertToolPricing: FunctionReference<
        "mutation",
        "internal",
        {
          limits?: {
            maxBytesPerRequest?: number;
            maxConcurrentRequests?: number;
            maxRequestsPerDay?: number;
            maxRequestsPerHour?: number;
            maxRequestsPerMinute?: number;
            maxRequestsPerMonth?: number;
            maxRequestsPerSecond?: number;
            maxTokensPerRequest?: number;
          };
          modelId?: string;
          modelName?: string;
          pricing:
            | {
                costPerCredit: number;
                creditTypes?: Record<string, number>;
                currency: string;
                type: "credits";
              }
            | {
                cache_read?: number;
                cache_write?: number;
                currency: string;
                input: number;
                output: number;
                reasoning?: number;
                type: "tokens";
              }
            | {
                costPerRequest: number;
                currency: string;
                requestTypes?: Record<string, number>;
                type: "requests";
              }
            | {
                computeTypes?: Record<string, number>;
                costPerMs: number;
                currency: string;
                tiers?: Record<string, number>;
                type: "compute";
              }
            | {
                costPerByteSecond: number;
                currency: string;
                storageClasses?: Record<string, number>;
                type: "storage";
              }
            | {
                costPerByteIn?: number;
                costPerByteOut?: number;
                currency: string;
                regions?: Record<string, number>;
                type: "bandwidth";
              }
            | {
                costPerUnit: number;
                currency: string;
                type: "units";
                unitType: string;
              }
            | {
                currency: string;
                tiers: Array<{ from: number; rate: number; to?: number }>;
                type: "tiered";
                unitType: string;
              }
            | {
                components: Array<{
                  costPerUnit: number;
                  name: string;
                  unitType: string;
                }>;
                currency: string;
                type: "composite";
              }
            | {
                currency: string;
                data: any;
                description?: string;
                type: "custom";
              };
          providerId: string;
          providerName: string;
        },
        any
      >;
    };
    toolCosts: {
      addToolCost: FunctionReference<
        "action",
        "internal",
        {
          markupMultiplier?: number;
          messageId: string;
          providerId: string;
          threadId: string;
          toolId: string;
          usage:
            | { creditType?: string; credits: number; type: "credits" }
            | {
                cacheReadTokens?: number;
                cacheWriteTokens?: number;
                inputTokens: number;
                outputTokens: number;
                reasoningTokens?: number;
                type: "tokens";
              }
            | { requestType?: string; requests: number; type: "requests" }
            | {
                computeType?: string;
                durationMs: number;
                tier?: string;
                type: "compute";
              }
            | {
                bytes: number;
                durationSeconds?: number;
                storageClass?: string;
                type: "storage";
              }
            | {
                bytesIn?: number;
                bytesOut?: number;
                region?: string;
                type: "bandwidth";
              }
            | {
                metadata?: Record<string, any>;
                type: "units";
                unitType: string;
                units: number;
              }
            | {
                quantity: number;
                tierName?: string;
                type: "tiered";
                unitType: string;
              }
            | {
                components: Array<{
                  cost?: number;
                  name: string;
                  quantity: number;
                  unitType: string;
                }>;
                type: "composite";
              }
            | { data: any; description?: string; type: "custom" };
          userId?: string;
        },
        any
      >;
      getToolCostsByProviderAndTool: FunctionReference<
        "query",
        "internal",
        { providerId: string; toolId?: string },
        any
      >;
      getToolCostsByThread: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        Array<{
          _creationTime: number;
          _id: string;
          cost: {
            amount: number;
            breakdown?:
              | { costPerCredit: number; credits: number; type: "credits" }
              | {
                  cacheReadTokensCost?: number;
                  cacheWriteTokensCost?: number;
                  inputTokensCost?: number;
                  outputTokensCost?: number;
                  reasoningTokensCost?: number;
                  type: "tokens";
                }
              | { costPerRequest: number; requests: number; type: "requests" }
              | {
                  computeType?: string;
                  costPerMs: number;
                  durationMs: number;
                  type: "compute";
                }
              | {
                  bytes: number;
                  costPerByteSecond: number;
                  durationSeconds: number;
                  type: "storage";
                }
              | {
                  bytesInCost?: number;
                  bytesOutCost?: number;
                  type: "bandwidth";
                }
              | {
                  costPerUnit: number;
                  type: "units";
                  unitType: string;
                  units: number;
                }
              | {
                  effectiveRate: number;
                  quantity: number;
                  tierApplied: string;
                  type: "tiered";
                }
              | {
                  components: Array<{
                    name: string;
                    quantity: number;
                    totalCost: number;
                    unitCost: number;
                  }>;
                  type: "composite";
                }
              | { data: any; type: "custom" };
            currency: string;
          };
          costForUser: {
            amount: number;
            breakdown?:
              | { costPerCredit: number; credits: number; type: "credits" }
              | {
                  cacheReadTokensCost?: number;
                  cacheWriteTokensCost?: number;
                  inputTokensCost?: number;
                  outputTokensCost?: number;
                  reasoningTokensCost?: number;
                  type: "tokens";
                }
              | { costPerRequest: number; requests: number; type: "requests" }
              | {
                  computeType?: string;
                  costPerMs: number;
                  durationMs: number;
                  type: "compute";
                }
              | {
                  bytes: number;
                  costPerByteSecond: number;
                  durationSeconds: number;
                  type: "storage";
                }
              | {
                  bytesInCost?: number;
                  bytesOutCost?: number;
                  type: "bandwidth";
                }
              | {
                  costPerUnit: number;
                  type: "units";
                  unitType: string;
                  units: number;
                }
              | {
                  effectiveRate: number;
                  quantity: number;
                  tierApplied: string;
                  type: "tiered";
                }
              | {
                  components: Array<{
                    name: string;
                    quantity: number;
                    totalCost: number;
                    unitCost: number;
                  }>;
                  type: "composite";
                }
              | { data: any; type: "custom" };
            currency: string;
            markupMultiplier?: number;
          };
          messageId: string;
          providerId: string;
          threadId: string;
          timestamp: number;
          toolId: string;
          usage:
            | { creditType?: string; credits: number; type: "credits" }
            | {
                cacheReadTokens?: number;
                cacheWriteTokens?: number;
                inputTokens: number;
                outputTokens: number;
                reasoningTokens?: number;
                type: "tokens";
              }
            | { requestType?: string; requests: number; type: "requests" }
            | {
                computeType?: string;
                durationMs: number;
                tier?: string;
                type: "compute";
              }
            | {
                bytes: number;
                durationSeconds?: number;
                storageClass?: string;
                type: "storage";
              }
            | {
                bytesIn?: number;
                bytesOut?: number;
                region?: string;
                type: "bandwidth";
              }
            | {
                metadata?: Record<string, any>;
                type: "units";
                unitType: string;
                units: number;
              }
            | {
                quantity: number;
                tierName?: string;
                type: "tiered";
                unitType: string;
              }
            | {
                components: Array<{
                  cost?: number;
                  name: string;
                  quantity: number;
                  unitType: string;
                }>;
                type: "composite";
              }
            | { data: any; description?: string; type: "custom" };
          userId?: string;
        }>
      >;
      getToolCostsByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          cost: {
            amount: number;
            breakdown?:
              | { costPerCredit: number; credits: number; type: "credits" }
              | {
                  cacheReadTokensCost?: number;
                  cacheWriteTokensCost?: number;
                  inputTokensCost?: number;
                  outputTokensCost?: number;
                  reasoningTokensCost?: number;
                  type: "tokens";
                }
              | { costPerRequest: number; requests: number; type: "requests" }
              | {
                  computeType?: string;
                  costPerMs: number;
                  durationMs: number;
                  type: "compute";
                }
              | {
                  bytes: number;
                  costPerByteSecond: number;
                  durationSeconds: number;
                  type: "storage";
                }
              | {
                  bytesInCost?: number;
                  bytesOutCost?: number;
                  type: "bandwidth";
                }
              | {
                  costPerUnit: number;
                  type: "units";
                  unitType: string;
                  units: number;
                }
              | {
                  effectiveRate: number;
                  quantity: number;
                  tierApplied: string;
                  type: "tiered";
                }
              | {
                  components: Array<{
                    name: string;
                    quantity: number;
                    totalCost: number;
                    unitCost: number;
                  }>;
                  type: "composite";
                }
              | { data: any; type: "custom" };
            currency: string;
          };
          costForUser: {
            amount: number;
            breakdown?:
              | { costPerCredit: number; credits: number; type: "credits" }
              | {
                  cacheReadTokensCost?: number;
                  cacheWriteTokensCost?: number;
                  inputTokensCost?: number;
                  outputTokensCost?: number;
                  reasoningTokensCost?: number;
                  type: "tokens";
                }
              | { costPerRequest: number; requests: number; type: "requests" }
              | {
                  computeType?: string;
                  costPerMs: number;
                  durationMs: number;
                  type: "compute";
                }
              | {
                  bytes: number;
                  costPerByteSecond: number;
                  durationSeconds: number;
                  type: "storage";
                }
              | {
                  bytesInCost?: number;
                  bytesOutCost?: number;
                  type: "bandwidth";
                }
              | {
                  costPerUnit: number;
                  type: "units";
                  unitType: string;
                  units: number;
                }
              | {
                  effectiveRate: number;
                  quantity: number;
                  tierApplied: string;
                  type: "tiered";
                }
              | {
                  components: Array<{
                    name: string;
                    quantity: number;
                    totalCost: number;
                    unitCost: number;
                  }>;
                  type: "composite";
                }
              | { data: any; type: "custom" };
            currency: string;
            markupMultiplier?: number;
          };
          messageId: string;
          providerId: string;
          threadId: string;
          timestamp: number;
          toolId: string;
          usage:
            | { creditType?: string; credits: number; type: "credits" }
            | {
                cacheReadTokens?: number;
                cacheWriteTokens?: number;
                inputTokens: number;
                outputTokens: number;
                reasoningTokens?: number;
                type: "tokens";
              }
            | { requestType?: string; requests: number; type: "requests" }
            | {
                computeType?: string;
                durationMs: number;
                tier?: string;
                type: "compute";
              }
            | {
                bytes: number;
                durationSeconds?: number;
                storageClass?: string;
                type: "storage";
              }
            | {
                bytesIn?: number;
                bytesOut?: number;
                region?: string;
                type: "bandwidth";
              }
            | {
                metadata?: Record<string, any>;
                type: "units";
                unitType: string;
                units: number;
              }
            | {
                quantity: number;
                tierName?: string;
                type: "tiered";
                unitType: string;
              }
            | {
                components: Array<{
                  cost?: number;
                  name: string;
                  quantity: number;
                  unitType: string;
                }>;
                type: "composite";
              }
            | { data: any; description?: string; type: "custom" };
          userId?: string;
        }>
      >;
      getTotalToolCostsByThread: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        any
      >;
      getTotalToolCostsByUser: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
    };
  };
};
