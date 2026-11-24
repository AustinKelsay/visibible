/**
 * Stored answers to Ask's suggested questions (#505). The first complete answer to a suggested question about a verse
 * is kept and served to every later reader who asks the same one, until it is replaced: by a reader's fresh answer,
 * by age (30 days), by a change of model, rules or Scripture (the key), or by the owner.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { validateServerSecret } from "./_helpers/auth";

/** A stored answer older than this is not served; the next question replaces it. */
export const STORED_ANSWER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const current = (createdAt: number, now: number) => now - createdAt < STORED_ANSWER_MAX_AGE_MS;

/** The stored answer for a key, when there is a current one. */
export const get = query({
  args: { key: v.string(), serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const row = await ctx.db.query("storedAnswers").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    return row && current(row.createdAt, Date.now()) ? { answer: row.answer, createdAt: row.createdAt } : null;
  },
});

/** The most keys one presence read looks up: more than the questions Ask suggests for a verse (#529). */
const PRESENT_MAX_KEYS = 16;

/** Which of these keys have a current stored answer, for the price shown before asking. */
export const present = query({
  args: { keys: v.array(v.string()), serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const now = Date.now();
    const found: string[] = [];
    for (const key of args.keys.slice(0, PRESENT_MAX_KEYS)) {
      const row = await ctx.db.query("storedAnswers").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (row && current(row.createdAt, now)) found.push(key);
    }
    return found;
  },
});

/** Store a complete answer, replacing any answer under the same key. */
export const save = mutation({
  args: {
    key: v.string(), reference: v.string(), translation: v.string(), question: v.string(), model: v.string(), answer: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    if (!args.answer.trim()) throw new Error("A stored answer needs text");
    const fields = { key: args.key, reference: args.reference, translation: args.translation, question: args.question, model: args.model, answer: args.answer };
    const existing = await ctx.db.query("storedAnswers").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    const createdAt = Date.now();
    if (existing) await ctx.db.patch(existing._id, { ...fields, createdAt });
    else await ctx.db.insert("storedAnswers", { ...fields, createdAt });
    return { replaced: Boolean(existing) };
  },
});

/**
 * The owner's removal of every stored answer for a verse ("John 1:5"), in every translation and model. Run with
 * `convex run --prod storedAnswers:removeForReference '{"reference": "John 1:5", "serverSecret": "…"}'`.
 */
export const removeForReference = mutation({
  args: { reference: v.string(), serverSecret: v.string() },
  handler: async (ctx, args) => {
    validateServerSecret(args.serverSecret);
    const rows = await ctx.db.query("storedAnswers").withIndex("by_reference", (q) => q.eq("reference", args.reference)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { removed: rows.length };
  },
});

/** Delete stored answers past their age. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("storedAnswers")
      .withIndex("by_createdAt", (q) => q.lte("createdAt", Date.now() - STORED_ANSWER_MAX_AGE_MS)).take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});
