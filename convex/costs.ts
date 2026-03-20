import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal, components } from "./_generated/api";
import { CostComponent, calculateToolCost } from "neutral-cost";
import { validateServerSecret } from "./_helpers/auth";

const DEFAULT_MARKUP_MULTIPLIER = 1.25;
const CREDIT_USD = 0.01;
const OPENROUTER_PROVIDER_ID = "openrouter";
const IMAGE_GENERATION_TOOL_ID = "image-generation";
const USD_UNIT_TYPE = "usd";
const IMAGE_COST_EVENT_TYPE = "image_generation_cost";
const MAX_OUTBOX_RETRIES = 8;
const BASE_OUTBOX_RETRY_DELAY_MS = 30_000;
const MAX_OUTBOX_RETRY_DELAY_MS = 30 * 60 * 1000;

const costs = new CostComponent(components.neutralCost);

const imageCostEventArgs = {
  sid: v.string(),
  requestId: v.string(),
  generationId: v.string(),
  modelId: v.string(),
  verseId: v.string(),
  translationId: v.string(),
  styleProfileId: v.string(),
  reference: v.string(),
  aspectRatio: v.string(),
  resolution: v.string(),
  scenePlannerUsed: v.boolean(),
  scenePlanFromCache: v.boolean(),
  usedFallbackEstimate: v.boolean(),
  estimatedCreditsCost: v.number(),
  estimatedCostUsd: v.number(),
  reservationCreditsCost: v.number(),
  reservationCostUsd: v.number(),
  imageCreditsCost: v.number(),
  imageCostUsd: v.number(),
  scenePlannerCredits: v.number(),
  scenePlannerCostUsd: v.number(),
  actualCreditsCost: v.number(),
  actualCostUsd: v.number(),
  openRouterUsageUsd: v.optional(v.number()),
  durationMs: v.optional(v.number()),
} as const;

const imageCostEventPayloadValidator = v.object(imageCostEventArgs);

type ImageCostEventPayload = {
  sid: string;
  requestId: string;
  generationId: string;
  modelId: string;
  verseId: string;
  translationId: string;
  styleProfileId: string;
  reference: string;
  aspectRatio: string;
  resolution: string;
  scenePlannerUsed: boolean;
  scenePlanFromCache: boolean;
  usedFallbackEstimate: boolean;
  estimatedCreditsCost: number;
  estimatedCostUsd: number;
  reservationCreditsCost: number;
  reservationCostUsd: number;
  imageCreditsCost: number;
  imageCostUsd: number;
  scenePlannerCredits: number;
  scenePlannerCostUsd: number;
  actualCreditsCost: number;
  actualCostUsd: number;
  openRouterUsageUsd?: number;
  durationMs?: number;
};

function toFinitePositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Amount must be a finite positive number");
  }
  return value;
}

function computeOutboxRetryDelayMs(attemptCount: number): number {
  const multiplier = Math.pow(2, Math.max(0, attemptCount - 1));
  return Math.min(MAX_OUTBOX_RETRY_DELAY_MS, BASE_OUTBOX_RETRY_DELAY_MS * multiplier);
}

async function persistImageCostEvent(
  ctx: ActionCtx,
  args: ImageCostEventPayload
) {
  const existingThreadCosts = await ctx.runQuery(components.neutralCost.toolCosts.getToolCostsByThread, {
    threadId: args.sid,
  });
  const existingCost = existingThreadCosts.find(
    (entry) =>
      entry.messageId === args.generationId &&
      entry.providerId === OPENROUTER_PROVIDER_ID &&
      entry.toolId === IMAGE_GENERATION_TOOL_ID
  );
  if (existingCost) {
    return {
      trackedProviderUsd:
        typeof args.openRouterUsageUsd === "number" && args.openRouterUsageUsd > 0
          ? args.openRouterUsageUsd
          : args.actualCostUsd,
      trackedBillableUsd: existingCost.costForUser.amount,
      trackedCredits: Math.max(
        1,
        Math.ceil(existingCost.costForUser.amount / CREDIT_USD)
      ),
      costRecordId: existingCost._id,
      alreadyTracked: true,
    };
  }

  const existingPricing = await ctx.runQuery(components.neutralCost.pricing.getToolPricing, {
    providerId: OPENROUTER_PROVIDER_ID,
    toolId: IMAGE_GENERATION_TOOL_ID,
  });

  if (!existingPricing) {
    await ctx.runMutation(components.neutralCost.pricing.upsertToolPricing, {
      providerId: OPENROUTER_PROVIDER_ID,
      providerName: "OpenRouter",
      modelId: IMAGE_GENERATION_TOOL_ID,
      modelName: "Image Generation",
      pricing: {
        type: "units",
        unitType: USD_UNIT_TYPE,
        costPerUnit: 1,
        currency: "USD",
      },
    });
  }

  const hasProviderUsage =
    typeof args.openRouterUsageUsd === "number" && args.openRouterUsageUsd > 0;
  const trackedProviderUsd: number = hasProviderUsage
    ? (args.openRouterUsageUsd as number)
    : args.actualCostUsd;
  const markupMultiplier = hasProviderUsage ? DEFAULT_MARKUP_MULTIPLIER : 1;

  const tracked = await costs.addToolCost(ctx, {
    messageId: args.generationId,
    userId: args.sid,
    threadId: args.sid,
    providerId: OPENROUTER_PROVIDER_ID,
    toolId: IMAGE_GENERATION_TOOL_ID,
    usage: {
      type: "units",
      unitType: USD_UNIT_TYPE,
      units: trackedProviderUsd,
      metadata: {
        requestId: args.requestId,
        modelId: args.modelId,
        verseId: args.verseId,
        translationId: args.translationId,
        styleProfileId: args.styleProfileId,
        reference: args.reference,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        scenePlannerUsed: args.scenePlannerUsed,
        scenePlanFromCache: args.scenePlanFromCache,
        usedFallbackEstimate: args.usedFallbackEstimate,
        estimatedCreditsCost: args.estimatedCreditsCost,
        estimatedCostUsd: args.estimatedCostUsd,
        reservationCreditsCost: args.reservationCreditsCost,
        reservationCostUsd: args.reservationCostUsd,
        imageCreditsCost: args.imageCreditsCost,
        imageCostUsd: args.imageCostUsd,
        scenePlannerCredits: args.scenePlannerCredits,
        scenePlannerCostUsd: args.scenePlannerCostUsd,
        actualCreditsCost: args.actualCreditsCost,
        actualCostUsd: args.actualCostUsd,
        openRouterUsageUsd: args.openRouterUsageUsd,
        durationMs: args.durationMs,
      },
    },
    markupMultiplier,
  });

  return {
    trackedProviderUsd,
    trackedBillableUsd: tracked.costForUser.amount,
    trackedCredits: Math.max(1, Math.ceil(tracked.costForUser.amount / CREDIT_USD)),
    costRecordId: tracked.costPerToolId,
    alreadyTracked: false,
  };
}

export const quoteUsdCost = action({
  args: {
    usd: v.number(),
    markupMultiplier: v.optional(v.number()),
    minCredits: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (_ctx, args) => {
    validateServerSecret(args.serverSecret);

    const providerUsd = toFinitePositive(args.usd);
    const markupMultiplier = args.markupMultiplier ?? DEFAULT_MARKUP_MULTIPLIER;
    const minimumCredits = args.minCredits ?? 1;

    const quoted = calculateToolCost(
      {
        type: "units",
        units: providerUsd,
        unitType: USD_UNIT_TYPE,
      },
      {
        type: "units",
        unitType: USD_UNIT_TYPE,
        costPerUnit: 1,
        currency: "USD",
      },
      markupMultiplier
    );

    const billedUsd = quoted.costForUser.amount;
    const credits = Math.max(minimumCredits, Math.ceil(billedUsd / CREDIT_USD));

    return {
      providerUsd,
      billedUsd,
      credits,
    };
  },
});

export const recordImageCostEvent = action({
  args: {
    ...imageCostEventArgs,
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    return persistImageCostEvent(ctx, args);
  },
});

export const enqueueImageCostEventOutbox = action({
  args: {
    ...imageCostEventArgs,
    enqueueReason: v.optional(v.string()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    await ctx.runMutation(internal.costs.enqueueImageCostEventOutboxInternal, {
      payload: {
        sid: args.sid,
        requestId: args.requestId,
        generationId: args.generationId,
        modelId: args.modelId,
        verseId: args.verseId,
        translationId: args.translationId,
        styleProfileId: args.styleProfileId,
        reference: args.reference,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        scenePlannerUsed: args.scenePlannerUsed,
        scenePlanFromCache: args.scenePlanFromCache,
        usedFallbackEstimate: args.usedFallbackEstimate,
        estimatedCreditsCost: args.estimatedCreditsCost,
        estimatedCostUsd: args.estimatedCostUsd,
        reservationCreditsCost: args.reservationCreditsCost,
        reservationCostUsd: args.reservationCostUsd,
        imageCreditsCost: args.imageCreditsCost,
        imageCostUsd: args.imageCostUsd,
        scenePlannerCredits: args.scenePlannerCredits,
        scenePlannerCostUsd: args.scenePlannerCostUsd,
        actualCreditsCost: args.actualCreditsCost,
        actualCostUsd: args.actualCostUsd,
        ...(args.openRouterUsageUsd !== undefined
          ? { openRouterUsageUsd: args.openRouterUsageUsd }
          : {}),
        ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
      },
      lastError: args.enqueueReason,
    });

    return { enqueued: true };
  },
});

export const enqueueImageCostEventOutboxInternal = internalMutation({
  args: {
    payload: imageCostEventPayloadValidator,
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("costEventOutbox", {
      eventType: IMAGE_COST_EVENT_TYPE,
      payload: args.payload,
      status: "pending",
      attemptCount: 0,
      nextRetryAt: now,
      lastError: args.lastError,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getPendingImageCostEventsInternal = internalQuery({
  args: {
    now: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("costEventOutbox")
      .withIndex("by_status_nextRetryAt", (q) =>
        q.eq("status", "pending").lte("nextRetryAt", args.now)
      )
      .take(args.limit);
  },
});

export const markImageCostEventSuccessInternal = internalMutation({
  args: {
    outboxId: v.id("costEventOutbox"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.outboxId, {
      status: "processed",
      processedAt: now,
      updatedAt: now,
      lastError: undefined,
    });
  },
});

export const markImageCostEventFailureInternal = internalMutation({
  args: {
    outboxId: v.id("costEventOutbox"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.outboxId);
    if (!event) return;

    const attemptCount = event.attemptCount + 1;
    const exhausted = attemptCount >= MAX_OUTBOX_RETRIES;
    const now = Date.now();

    await ctx.db.patch(args.outboxId, {
      status: exhausted ? "failed" : "pending",
      attemptCount,
      lastError: args.error.slice(0, 500),
      nextRetryAt: exhausted ? event.nextRetryAt : now + computeOutboxRetryDelayMs(attemptCount),
      updatedAt: now,
    });
  },
});

export const processCostEventOutboxBatch = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ scanned: number; processed: number; failed: number; skipped: number }> => {
    const limit = Math.min(50, Math.max(1, args.limit ?? 20));
    const pendingEvents = await ctx.runQuery(internal.costs.getPendingImageCostEventsInternal, {
      now: Date.now(),
      limit,
    });

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pendingEvents) {
      try {
        const result = await persistImageCostEvent(
          ctx,
          event.payload as ImageCostEventPayload
        );
        await ctx.runMutation(internal.costs.markImageCostEventSuccessInternal, {
          outboxId: event._id,
        });
        if (result.alreadyTracked) {
          skipped += 1;
        } else {
          processed += 1;
        }
      } catch (error) {
        await ctx.runMutation(internal.costs.markImageCostEventFailureInternal, {
          outboxId: event._id,
          error: error instanceof Error ? error.message : String(error),
        });
        failed += 1;
      }
    }

    return {
      scanned: pendingEvents.length,
      processed,
      failed,
      skipped,
    };
  },
});
