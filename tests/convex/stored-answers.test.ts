import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { STORED_ANSWER_MAX_AGE_MS } from "../../convex/storedAnswers";
import { modules } from "./modules";

const SECRET = "stored-answers-secret";
const start = Date.parse("2026-11-17T12:00:00Z");

beforeEach(() => {
  process.env.CONVEX_SERVER_SECRET = SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(start);
});
afterEach(() => vi.useRealTimers());

const answer = (key: string, text: string, reference = "John 1:5") => ({
  key, reference, translation: "web", question: "What does John 1:5 mean?", model: "openai/gpt-6-luna", answer: text, serverSecret: SECRET,
});

describe("stored answers (#505)", () => {
  it("stores an answer, serves it by key and replaces it with a fresh one", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.storedAnswers.get, { key: "k1", serverSecret: SECRET })).toBeNull();
    expect(await t.mutation(api.storedAnswers.save, answer("k1", "First answer."))).toEqual({ replaced: false });
    expect(await t.query(api.storedAnswers.get, { key: "k1", serverSecret: SECRET })).toEqual({ answer: "First answer.", createdAt: start });
    vi.setSystemTime(start + 1000);
    expect(await t.mutation(api.storedAnswers.save, answer("k1", "Fresh answer."))).toEqual({ replaced: true });
    expect(await t.query(api.storedAnswers.get, { key: "k1", serverSecret: SECRET })).toEqual({ answer: "Fresh answer.", createdAt: start + 1000 });
    expect(await t.run((ctx) => ctx.db.query("storedAnswers").collect())).toHaveLength(1);
  });

  it("stops serving an answer after 30 days, and says which keys have a current answer", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.storedAnswers.save, answer("old", "Old."));
    vi.setSystemTime(start + 10 * 24 * 60 * 60 * 1000);
    await t.mutation(api.storedAnswers.save, answer("new", "New."));
    expect(await t.query(api.storedAnswers.present, { keys: ["old", "new", "none"], serverSecret: SECRET })).toEqual(["old", "new"]);
    vi.setSystemTime(start + STORED_ANSWER_MAX_AGE_MS);
    expect(await t.query(api.storedAnswers.get, { key: "old", serverSecret: SECRET })).toBeNull();
    expect(await t.query(api.storedAnswers.present, { keys: ["old", "new"], serverSecret: SECRET })).toEqual(["new"]);
    expect(await t.mutation(internal.storedAnswers.cleanup, {})).toEqual({ deleted: 1 });
  });

  it("lets the owner remove a verse's stored answers, and refuses callers without the secret or text", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.storedAnswers.save, answer("a", "A."));
    await t.mutation(api.storedAnswers.save, answer("b", "B."));
    await t.mutation(api.storedAnswers.save, answer("c", "C.", "John 1:6"));
    expect(await t.mutation(api.storedAnswers.removeForReference, { reference: "John 1:5", serverSecret: SECRET })).toEqual({ removed: 2 });
    expect(await t.query(api.storedAnswers.present, { keys: ["a", "b", "c"], serverSecret: SECRET })).toEqual(["c"]);
    await expect(t.query(api.storedAnswers.get, { key: "c", serverSecret: "wrong" })).rejects.toThrow();
    await expect(t.mutation(api.storedAnswers.save, answer("d", "   "))).rejects.toThrow();
  });
});
