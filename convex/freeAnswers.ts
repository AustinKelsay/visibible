/**
 * Free answers (#493): Ask answers a guest is not charged for. Every guest session and every network has a daily
 * allowance, and the site has a free budget of provider spend per UTC day and calendar month. The Next.js server
 * reserves a turn's worst-case provider cost here before calling the model and settles it afterwards; no model call is
 * made for a free answer without that reservation. Convex runs each mutation as one serializable transaction, so
 * concurrent requests cannot pass a limit together.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { validateServerSecret } from "./_helpers/auth";

/** The free allowance and the free budget. Changing them is a release, like the rate limits. */
export const FREE_ANSWER_LIMITS = {
  perSession: 20,
  perNetwork: 100,
  dailyUsd: 1,
  monthlyUsd: 30,
} as const;

/** The share of the month's free budget at which the owner is warned. */
export const FREE_BUDGET_WARNING_SHARE = 0.8;

/** Why a free answer is not available. */
export type FreeAnswerRefusal = "session" | "network" | "day" | "month";

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const utcMonth = (now: number) => new Date(now).toISOString().slice(0, 7);

async function countRow(ctx: QueryCtx, scope: "session" | "network", key: string, day: string) {
  return ctx.db.query("freeAnswerCounts").withIndex("by_scope_key_day", (q) => q.eq("scope", scope).eq("key", key).eq("day", day)).unique();
}

async function budgetRow(ctx: QueryCtx, period: string) {
  return ctx.db.query("freeAnswerBudget").withIndex("by_period", (q) => q.eq("period", period)).unique();
}

/** What is left today for this session and network, and whether a turn costing at most `worstCaseUsd` fits the budget. */
async function standing(ctx: QueryCtx, args: { sid: string; network: string; worstCaseUsd: number }, now: number) {
  const day = utcDay(now);
  const month = utcMonth(now);
  const [session, network, dayBudget, monthBudget] = await Promise.all([
    countRow(ctx, "session", args.sid, day), countRow(ctx, "network", args.network, day), budgetRow(ctx, day), budgetRow(ctx, month),
  ]);
  const sessionLeft = FREE_ANSWER_LIMITS.perSession - (session?.count ?? 0);
  const networkLeft = FREE_ANSWER_LIMITS.perNetwork - (network?.count ?? 0);
  const refusal: FreeAnswerRefusal | null =
    (monthBudget?.spentUsd ?? 0) + args.worstCaseUsd > FREE_ANSWER_LIMITS.monthlyUsd ? "month"
      : (dayBudget?.spentUsd ?? 0) + args.worstCaseUsd > FREE_ANSWER_LIMITS.dailyUsd ? "day"
        : sessionLeft <= 0 ? "session"
          : networkLeft <= 0 ? "network"
            : null;
  return { day, month, session, network, dayBudget, monthBudget, remaining: Math.max(0, Math.min(sessionLeft, networkLeft)), refusal };
}

const turnArgs = { sid: v.string(), network: v.string(), worstCaseUsd: v.number() };

function checkWorstCase(worstCaseUsd: number) {
  if (!Number.isFinite(worstCaseUsd) || worstCaseUsd <= 0) throw new Error("A free answer needs a positive worst-case cost");
}

/** Whether this session's next Ask answer would be free, for the price shown before sending. Reserves nothing. */
export const status = query({
  args: { ...turnArgs, serverSecret: v.string() },
  handler: async (ctx, args): Promise<{ available: true; remaining: number } | { available: false; reason: FreeAnswerRefusal }> => {
    validateServerSecret(args.serverSecret);
    checkWorstCase(args.worstCaseUsd);
    const now = await standing(ctx, args, Date.now());
    return now.refusal ? { available: false, reason: now.refusal } : { available: true, remaining: now.remaining };
  },
});

/**
 * Count one free answer for the session and the network and hold its worst-case cost against today's and this month's
 * budget, or refuse. A second call for the same generation returns the first one's result without counting again.
 */
export const reserve = mutation({
  args: { ...turnArgs, generationId: v.string(), serverSecret: v.string() },
  handler: async (ctx, args): Promise<{ allowed: true; remaining: number } | { allowed: false; reason: FreeAnswerRefusal }> => {
    validateServerSecret(args.serverSecret);
    checkWorstCase(args.worstCaseUsd);
    const existing = await ctx.db.query("freeAnswers").withIndex("by_generationId", (q) => q.eq("generationId", args.generationId)).unique();
    const now = Date.now();
    const current = await standing(ctx, args, now);
    if (existing) return { allowed: true, remaining: current.remaining };
    if (current.refusal) return { allowed: false, reason: current.refusal };

    await bumpCount(ctx, current.session, "session", args.sid, current.day, 1);
    await bumpCount(ctx, current.network, "network", args.network, current.day, 1);
    await addSpend(ctx, current.dayBudget, current.day, args.worstCaseUsd, 1);
    await addSpend(ctx, current.monthBudget, current.month, args.worstCaseUsd, 1);
    await ctx.db.insert("freeAnswers", {
      generationId: args.generationId, sid: args.sid, network: args.network, day: current.day, month: current.month,
      reservedUsd: args.worstCaseUsd, status: "reserved", createdAt: now,
    });
    return { allowed: true, remaining: current.remaining - 1 };
  },
});

/**
 * Finish a reserved free answer. "returned" gives the turn and its hold back (the call failed before any text arrived).
 * "settled" replaces the hold with `costUsd`, or keeps the whole hold when the cost is unknown. The change applies to
 * the day and month the turn was reserved in. Settling twice changes nothing.
 */
export const settle = mutation({
  args: {
    generationId: v.string(),
    outcome: v.union(v.literal("returned"), v.literal("settled")),
    costUsd: v.optional(v.number()),
    serverSecret: v.string(),
  },
  handler: async (ctx, args): Promise<{ settled: boolean; monthSpentUsd: number; monthWarning: boolean }> => {
    validateServerSecret(args.serverSecret);
    const answer = await ctx.db.query("freeAnswers").withIndex("by_generationId", (q) => q.eq("generationId", args.generationId)).unique();
    if (!answer) return { settled: false, monthSpentUsd: 0, monthWarning: false };
    const monthBudget = await budgetRow(ctx, answer.month);
    if (answer.status !== "reserved") return { settled: false, monthSpentUsd: monthBudget?.spentUsd ?? 0, monthWarning: false };

    const known = typeof args.costUsd === "number" && Number.isFinite(args.costUsd) && args.costUsd >= 0;
    const delta = args.outcome === "returned" ? -answer.reservedUsd : known ? args.costUsd! - answer.reservedUsd : 0;
    const answers = args.outcome === "returned" ? -1 : 0;
    if (args.outcome === "returned") {
      await bumpCount(ctx, await countRow(ctx, "session", answer.sid, answer.day), "session", answer.sid, answer.day, -1);
      await bumpCount(ctx, await countRow(ctx, "network", answer.network, answer.day), "network", answer.network, answer.day, -1);
    }
    await addSpend(ctx, await budgetRow(ctx, answer.day), answer.day, delta, answers);
    const monthSpentUsd = await addSpend(ctx, monthBudget, answer.month, delta, answers);
    await ctx.db.patch(answer._id, {
      status: args.outcome,
      ...(args.outcome === "settled" ? { costUsd: known ? args.costUsd : answer.reservedUsd } : {}),
    });
    return { settled: true, monthSpentUsd, monthWarning: monthSpentUsd >= FREE_ANSWER_LIMITS.monthlyUsd * FREE_BUDGET_WARNING_SHARE };
  },
});

async function bumpCount(ctx: MutationCtx, row: Doc<"freeAnswerCounts"> | null, scope: "session" | "network", key: string, day: string, by: number) {
  if (row) await ctx.db.patch(row._id, { count: Math.max(0, row.count + by) });
  else if (by > 0) await ctx.db.insert("freeAnswerCounts", { scope, key, day, count: by });
}

async function addSpend(ctx: MutationCtx, row: Doc<"freeAnswerBudget"> | null, period: string, usd: number, answers: number) {
  if (!row) {
    const spentUsd = Math.max(0, usd);
    await ctx.db.insert("freeAnswerBudget", { period, spentUsd, answers: Math.max(0, answers) });
    return spentUsd;
  }
  const spentUsd = Math.max(0, row.spentUsd + usd);
  await ctx.db.patch(row._id, { spentUsd, answers: Math.max(0, row.answers + answers) });
  return spentUsd;
}

/**
 * The owner's view of one UTC day (today unless given): free answers given, free spend, how many sessions and networks
 * used their whole allowance, and the month's spend against its budget. Run with
 * `convex run --prod freeAnswers:report '{"serverSecret": "…"}'`.
 */
export const report = query({
  args: { day: v.optional(v.string()), serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const day = args.day ?? utcDay(Date.now());
    const month = day.slice(0, 7);
    const [dayBudget, monthBudget, counts] = await Promise.all([
      budgetRow(ctx, day), budgetRow(ctx, month), ctx.db.query("freeAnswerCounts").withIndex("by_day", (q) => q.eq("day", day)).collect(),
    ]);
    const monthSpentUsd = monthBudget?.spentUsd ?? 0;
    return {
      day,
      answers: dayBudget?.answers ?? 0,
      spentUsd: dayBudget?.spentUsd ?? 0,
      dailyBudgetUsd: FREE_ANSWER_LIMITS.dailyUsd,
      sessionsAtLimit: counts.filter((row) => row.scope === "session" && row.count >= FREE_ANSWER_LIMITS.perSession).length,
      networksAtLimit: counts.filter((row) => row.scope === "network" && row.count >= FREE_ANSWER_LIMITS.perNetwork).length,
      month,
      monthAnswers: monthBudget?.answers ?? 0,
      monthSpentUsd,
      monthlyBudgetUsd: FREE_ANSWER_LIMITS.monthlyUsd,
      monthWarning: monthSpentUsd >= FREE_ANSWER_LIMITS.monthlyUsd * FREE_BUDGET_WARNING_SHARE,
    };
  },
});

const CLEANUP_BATCH = 500;

/** Drop allowance counts from before yesterday and answer records older than 35 days; budget rows are kept. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const yesterday = utcDay(now - 24 * 60 * 60 * 1000);
    const counts = await ctx.db.query("freeAnswerCounts").withIndex("by_day", (q) => q.lt("day", yesterday)).take(CLEANUP_BATCH);
    for (const row of counts) await ctx.db.delete(row._id);
    const answers = await ctx.db.query("freeAnswers").withIndex("by_createdAt", (q) => q.lt("createdAt", now - 35 * 24 * 60 * 60 * 1000)).take(CLEANUP_BATCH);
    for (const row of answers) await ctx.db.delete(row._id);
    return { counts: counts.length, answers: answers.length };
  },
});
