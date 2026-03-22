import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { validateServerSecret } from "./_helpers/auth";

const MAX_SAMPLES = 30;

export type CostEstimateScope = "model" | "provider" | "global";

function computeEstimateCredits(samples: number[]): number {
  if (samples.length === 0) return 1;
  const sorted = [...samples].sort((a, b) => a - b);
  const percentileIndex = Math.ceil(sorted.length * 0.75) - 1;
  const clampedIndex = Math.max(0, Math.min(sorted.length - 1, percentileIndex));
  return Math.max(1, Math.round(sorted[clampedIndex]));
}

function pushSample(samples: number[], actualCredits: number): number[] {
  const next = [...samples, actualCredits];
  if (next.length <= MAX_SAMPLES) return next;
  return next.slice(next.length - MAX_SAMPLES);
}

async function upsertScopeSample(
  ctx: MutationCtx,
  {
    scopeType,
    scopeValue,
    resolution,
    actualCredits,
  }: {
    scopeType: CostEstimateScope;
    scopeValue: string;
    resolution: string;
    actualCredits: number;
  }
) {
  const existing = await ctx.db
    .query("modelCostStats")
    .withIndex("by_scope_resolution", (q) =>
      q
        .eq("scopeType", scopeType)
        .eq("scopeValue", scopeValue)
        .eq("resolution", resolution)
    )
    .first();

  const now = Date.now();

  if (existing) {
    const sampleCredits = pushSample(existing.sampleCredits ?? [], actualCredits);
    await ctx.db.patch(existing._id, {
      sampleCredits,
      sampleCount: (existing.sampleCount ?? 0) + 1,
      estimateCredits: computeEstimateCredits(sampleCredits),
      lastActualCredits: actualCredits,
      updatedAt: now,
    });
    return;
  }

  const sampleCredits = [actualCredits];
  await ctx.db.insert("modelCostStats", {
    scopeType,
    scopeValue,
    resolution,
    sampleCredits,
    sampleCount: 1,
    estimateCredits: computeEstimateCredits(sampleCredits),
    lastActualCredits: actualCredits,
    updatedAt: now,
  });
}

export const recordActualCost = mutation({
  args: {
    modelId: v.string(),
    resolution: v.string(),
    actualCredits: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    const actualCredits = Math.max(1, Math.round(args.actualCredits));
    const provider = args.modelId.split("/")[0]?.toLowerCase() || "unknown";

    await upsertScopeSample(ctx, {
      scopeType: "model",
      scopeValue: args.modelId,
      resolution: args.resolution,
      actualCredits,
    });

    await upsertScopeSample(ctx, {
      scopeType: "provider",
      scopeValue: provider,
      resolution: args.resolution,
      actualCredits,
    });

    await upsertScopeSample(ctx, {
      scopeType: "global",
      scopeValue: "global",
      resolution: args.resolution,
      actualCredits,
    });
  },
});

export const getEstimate = query({
  args: {
    modelId: v.string(),
    resolution: v.string(),
    fallbackCredits: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    const provider = args.modelId.split("/")[0]?.toLowerCase() || "unknown";

    const [modelEstimate, providerEstimate, globalEstimate] = await Promise.all([
      ctx.db
        .query("modelCostStats")
        .withIndex("by_scope_resolution", (q) =>
          q
            .eq("scopeType", "model")
            .eq("scopeValue", args.modelId)
            .eq("resolution", args.resolution)
        )
        .first(),
      ctx.db
        .query("modelCostStats")
        .withIndex("by_scope_resolution", (q) =>
          q
            .eq("scopeType", "provider")
            .eq("scopeValue", provider)
            .eq("resolution", args.resolution)
        )
        .first(),
      ctx.db
        .query("modelCostStats")
        .withIndex("by_scope_resolution", (q) =>
          q
            .eq("scopeType", "global")
            .eq("scopeValue", "global")
            .eq("resolution", args.resolution)
        )
        .first(),
    ]);

    const selected = modelEstimate ?? providerEstimate ?? globalEstimate ?? null;

    return {
      credits: selected?.estimateCredits ?? Math.max(1, Math.round(args.fallbackCredits)),
      source: selected?.scopeType ?? "fallback",
      sampleCount: selected?.sampleCount ?? 0,
    };
  },
});

export const getAllEstimates = query({
  args: {
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);

    return ctx.db.query("modelCostStats").collect();
  },
});
