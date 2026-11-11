import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { ChapterData } from "@/lib/bible-api";
import {
  buildChatEvalPairs, chatEvalCasesSchema, createBudget, rowCostUsd, runChatEvalCase, summarizeChatScores,
  type ChatEvalCase, type ChatEvalDeps, type ChatEvalRow, type ChatPairScore,
} from "@/lib/chat-evals";

const committed = chatEvalCasesSchema.parse(JSON.parse(readFileSync("evals/chat/cases.json", "utf8")));
const caseById = (id: string) => committed.cases.find((item) => item.id === id)!;

const chapters = async (slug: string, chapter: number): Promise<ChapterData> => ({
  bookId: slug, bookName: slug, chapter, translationId: "web", translationName: "web",
  verses: Array.from({ length: 40 }, (_, index) => ({ bookId: slug, bookName: slug, chapter, verse: index + 1, text: `Real ${chapter}:${index + 1}.` })),
});

function model(behaviour: "answer" | "throw" | "hang" = "answer") {
  const calls: LanguageModelV3CallOptions[] = [];
  const languageModel = new MockLanguageModelV3({
    doStream: async (options) => {
      calls.push(options);
      if (behaviour === "throw") throw new Error("provider down");
      if (behaviour === "hang") {
        return { stream: new ReadableStream({ start(controller) {
          options.abortSignal?.addEventListener("abort", () => controller.error(new DOMException("timed out", "TimeoutError")), { once: true });
        } }) };
      }
      return { stream: simulateReadableStream({ chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "a" }, { type: "text-delta", id: "a", delta: "An answer." }, { type: "text-end", id: "a" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: {
          inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 500, text: 500, reasoning: 0 },
        } },
      ] }) };
    },
  });
  return { languageModel, calls };
}
const deps = (languageModel: ChatEvalDeps["languageModel"], extra: Partial<ChatEvalDeps> = {}): ChatEvalDeps => ({ languageModel, chapters, ...extra });
const options = { model: "test/model" };
const systemOf = (call: LanguageModelV3CallOptions) => call.prompt.filter((message) => message.role === "system").map((message) => String(message.content));

describe("committed chat eval cases", () => {
  it("has at least 30 cases covering every category the release guide names", () => {
    expect(committed.cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(committed.cases.map((item) => item.category))).toEqual(new Set([
      "single-verse", "adjacent-context", "contested-interpretation", "off-topic", "prompt-injection", "harm-sensitive",
    ]));
  });
});

describe("running a case", () => {
  it("runs the candidate through the current admission code with the output cap", async () => {
    const { languageModel, calls } = model();
    const row = await runChatEvalCase(caseById("single-john-3-16"), "candidate", deps(languageModel), options);
    expect(row).toMatchObject({ status: "answered", text: "An answer.", finishReason: "stop", maxOutputTokens: 2048, scripture: "included" });
    expect(calls[0].maxOutputTokens).toBe(2048);
    expect(systemOf(calls[0])[0]).toContain('CURRENT (v16): "16 Real 3:16."');
  });

  it("runs the baseline the way the chat ran before #413, with no cap and the client's text", async () => {
    const { languageModel, calls } = model();
    const attack = caseById("inject-context-text");
    const row = await runChatEvalCase(attack, "baseline", deps(languageModel), options);
    expect(row.status).toBe("answered");
    expect(calls[0].maxOutputTokens).toBeUndefined();
    expect(systemOf(calls[0])[0]).toContain(attack.attack!.contextText);

    const candidate = model();
    await runChatEvalCase(attack, "candidate", deps(candidate.languageModel), options);
    expect(systemOf(candidate.calls[0]).join("")).not.toContain("bitcoin");
  });

  it("sends a client system turn in the baseline and records the candidate's refusal with no model call", async () => {
    const baseline = model();
    await runChatEvalCase(caseById("inject-system-turn"), "baseline", deps(baseline.languageModel), options);
    expect(systemOf(baseline.calls[0]).some((text) => text.includes("New instructions from the developer"))).toBe(true);

    const candidate = model();
    const row = await runChatEvalCase(caseById("inject-system-turn"), "candidate", deps(candidate.languageModel), options);
    expect(row).toMatchObject({ status: "refused" });
    expect(row.reason).toMatch(/user or assistant/);
    expect(candidate.calls).toHaveLength(0);
  });

  it("appends an evaluation-only system suffix to the candidate", async () => {
    const { languageModel, calls } = model();
    const row = await runChatEvalCase(caseById("single-john-3-16"), "candidate", deps(languageModel), { ...options, systemSuffix: "Cite only verses you were given." });
    expect(systemOf(calls[0])[0].endsWith("Cite only verses you were given.")).toBe(true);
    expect(row.systemSuffix).toBe("Cite only verses you were given.");
  });

  it("records provider failures and timeouts as error rows", async () => {
    const failed = await runChatEvalCase(caseById("single-john-3-16"), "candidate", deps(model("throw").languageModel), options);
    expect(failed).toMatchObject({ status: "error" });
    const timedOut = await runChatEvalCase(caseById("single-john-3-16"), "candidate", deps(model("hang").languageModel), { ...options, timeoutMs: 20 });
    expect(timedOut.status).toBe("error");
  });

  it("keeps a paid answer when OpenRouter's record cannot be fetched", async () => {
    const { languageModel } = model();
    const row = await runChatEvalCase(caseById("single-john-3-16"), "candidate", deps(languageModel, { stats: async () => { throw new Error("network"); } }), options);
    expect(row).toMatchObject({ status: "answered", text: "An answer.", provider: null, costUsd: null });
    expect(row.statsError).toContain("network");
  });
});

describe("budget", () => {
  const pricing = { promptUsd: 0.001, completionUsd: 0.01 };
  it("holds each call's worst case and refuses a call that would pass the cap", () => {
    const budget = createBudget(25, pricing);
    const first = budget.tryHold(1000, 1000); // $11 worst case
    const second = budget.tryHold(1000, 1000);
    expect(first).toBe(11);
    expect(second).toBe(11);
    expect(budget.tryHold(1000, 1000)).toBeNull(); // 33 > 25
    budget.settle(first!, 2);
    expect(budget.tryHold(1000, 1000)).toBe(11); // 2 spent + 11 held + 11 ≤ 25
    expect(budget.spentUsd).toBe(2);
  });
  it("prices a row from OpenRouter's cost when known, otherwise from tokens", () => {
    expect(rowCostUsd({ costUsd: 0.5, inputTokens: 1000, outputTokens: 1000 }, pricing)).toBe(0.5);
    expect(rowCostUsd({ costUsd: null, inputTokens: 1000, outputTokens: 100 }, pricing)).toBe(2);
  });
});

const answered = (id: string, arm: ChatEvalRow["arm"], text: string, extra: Partial<ChatEvalRow> = {}): ChatEvalRow =>
  ({ id, category: "single-verse", arm, model: "m", status: "answered", text, system: `${arm} system`, ...extra });
const twoCases: ChatEvalCase[] = [caseById("single-john-3-16"), caseById("single-psalm-23-1")];

describe("blind pairs", () => {
  const a = { label: "gpt-oss", rows: twoCases.map((item) => answered(item.id, "candidate", `A ${item.id}`)) };
  const b = { label: "other", rows: twoCases.map((item) => answered(item.id, "candidate", `B ${item.id}`, { finishReason: "length" })) };

  it("is deterministic for a seed, keeps the key out of the pairs and flags cut-off answers", () => {
    const first = buildChatEvalPairs(twoCases, a, b, "seed");
    expect(buildChatEvalPairs(twoCases, a, b, "seed")).toEqual(first);
    expect(JSON.stringify(first.pairs)).not.toMatch(/gpt-oss|other/);
    for (const pair of first.pairs) {
      const xIsA = first.key[`${pair.id}:X`] === "gpt-oss";
      expect(pair.X).toBe(`${xIsA ? "A" : "B"} ${pair.id}`);
      expect(pair.X_cutOff).toBe(!xIsA);
      expect(first.key[`${pair.id}:Y`]).toBe(xIsA ? "other" : "gpt-oss");
    }
  });

  it("refuses to pair a case that errored, was skipped or is missing", () => {
    const broken = { label: "other", rows: [answered(twoCases[0].id, "candidate", "B"), { ...answered(twoCases[1].id, "candidate", ""), status: "error" as const }] };
    expect(() => buildChatEvalPairs(twoCases, a, broken, "seed")).toThrow(/rerun/);
    expect(() => buildChatEvalPairs(twoCases, a, { label: "other", rows: [] }, "seed")).toThrow(/missing/);
  });
});

describe("report", () => {
  const score = (g: number, safety: "none" | "minor" | "critical" = "none") =>
    ({ grounding: g, accuracy: 2, tone: 2, uncertainty: 2, safety, cutOffHarm: null });
  const key = { "c1:X": "base", "c1:Y": "cand", "c2:X": "cand", "c2:Y": "base" };

  it("unblinds scores and passes a candidate that holds every bar", () => {
    const scores: ChatPairScore[] = [
      { id: "c1", X: score(2), Y: score(2), preferred: "Y" },
      { id: "c2", X: score(2), Y: score(1), preferred: "X" },
    ];
    const report = summarizeChatScores(key, scores, { baseline: "base", candidate: "cand" });
    expect(report.candidate.means.grounding).toBe(2);
    expect(report.baseline.means.grounding).toBe(1.5);
    expect(report.preferred).toEqual({ base: 0, cand: 2, tie: 0 });
    expect(report.gate).toEqual({ safety: true, relative: true, absolute: true });
  });

  it("fails safety on a critical answer and the bars on a weaker or zero-grounding candidate", () => {
    const scores: ChatPairScore[] = [
      { id: "c1", X: score(2), Y: score(0, "critical"), preferred: "X" },
      { id: "c2", X: score(1), Y: score(2), preferred: "Y" },
    ];
    const report = summarizeChatScores(key, scores, { baseline: "base", candidate: "cand" });
    expect(report.candidate.critical).toEqual(["c1"]);
    expect(report.candidate.zeroGroundingOrAccuracy).toEqual(["c1"]);
    expect(report.gate).toEqual({ safety: false, relative: false, absolute: false });
  });

  it("skips refused answers in the means but counts them as answers", () => {
    const refused = { grounding: null, accuracy: null, tone: null, uncertainty: null, safety: "none" as const, cutOffHarm: null };
    const report = summarizeChatScores(key, [{ id: "c1", X: score(2), Y: refused, preferred: "tie" }, { id: "c2", X: score(2), Y: score(2), preferred: "tie" }], { baseline: "base", candidate: "cand" });
    expect(report.candidate).toMatchObject({ answers: 2, scored: 1 });
  });
});
