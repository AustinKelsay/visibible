/**
 * The suite runner (ADR 0011) through the engine's real assembly, check and retry, with Holmes's real work, brief and
 * profile and scripted provider replies: the ledger never lets spend pass its cap, a text run prepares each case once,
 * and an image run draws the text run's plans without a single text call.
 */
import { describe, expect, it } from "vitest";
import { createLedger, modelPricing, requestCeilingUsd, runSuite, scrubForLog, type SuiteWork } from "../image-evals/suite-run";
import { createOfflineOpenRouter } from "../image-evals/suite-offline";
import type { SuiteCase } from "../image-evals/suite";
import { createOpenRouterEvalImageProvider } from "../image-evals/adapters";
import type { MemoryRecordInput } from "../engine/memory-store";
import type { AnalysisRecord } from "../engine/preparation";
import { createOpenRouterVisionChecker } from "../engine/reference-adapters";
import { readWorkInputs } from "../engine/work-inputs";
import { createOpenRouterTextModel } from "../reading-pass/model";

const URL = "https://openrouter.ai/api/v1/chat/completions";
const reply = (cost: number | null, status = 200) => async () => new Response(JSON.stringify({ choices: [], ...(cost === null ? {} : { usage: { cost } }) }), { status });
const ledgerWith = (fetch: (url: string, init: RequestInit) => Promise<Response>, capUsd = 0.1, limits = { text: 10, image: 0, check: 10 }) => {
  const logged: Array<Record<string, unknown>> = [];
  const ledger = createLedger({ capUsd, reserves: { text: 0.01, image: 0.05, check: 0.002 }, limits, fetch,
    save: () => {}, log: (entry) => logged.push(entry), scrub: (value) => scrubForLog(value, "sk-secret", () => "h") });
  return { ledger, logged };
};
const call = (fetch: (url: string, init: RequestInit) => Promise<Response>, body: unknown = { model: "m" }) => fetch(URL, { method: "POST", body: JSON.stringify(body) });

describe("the run ledger", () => {
  it("settles each call from reported usage and logs it without the key or inline images", async () => {
    const { ledger, logged } = ledgerWith(reply(0.0004));
    await call(ledger.fetchFor("text", () => "case/text"), { auth: "sk-secret", image: "data:image/png;base64,AAAA" });
    expect(ledger.state).toMatchObject({ measuredUsd: 0.0004, uncertainUsd: 0, counts: { text: 1 }, blocked: null });
    expect(JSON.stringify(logged)).not.toContain("sk-secret");
    expect(JSON.stringify(logged)).not.toContain("base64,AAAA");
    expect(logged[0]).toMatchObject({ phase: "case/text", kind: "text", status: 200, measuredUsageUsd: 0.0004 });
  });

  it("blocks every later call after missing usage, a provider error or a kind's limit", async () => {
    for (const [fetch, why] of [[reply(null), "Missing provider usage"], [reply(0.001, 503), "Provider error 503"]] as const) {
      const { ledger } = ledgerWith(fetch);
      await call(ledger.fetchFor("text", () => "x"));
      expect(ledger.state.blocked).toBe(why);
      await expect(call(ledger.fetchFor("check", () => "x"))).rejects.toThrow(/Evaluation stopped/);
    }
    const { ledger } = ledgerWith(reply(0.001));
    await expect(call(ledger.fetchFor("image", () => "x"))).rejects.toThrow(/cap or call limit/);
    await expect(ledger.fetchFor("text", () => "x")("https://example.com", {})).rejects.toThrow(/Unexpected provider URL/);
  });

  it("lets a moderation refusal fail its own call without stopping the run, and charges nothing for it", async () => {
    const moderated = async () => new Response(JSON.stringify({ error: { code: 403, message: "anthropic/claude-haiku-5.5 requires moderation on Anthropic. Your input was flagged for \"violence/graphic\". No credits were charged." } }), { status: 403 });
    const { ledger } = ledgerWith(moderated);
    const response = await call(ledger.fetchFor("text", () => "judges/text"));
    expect(response.status).toBe(403);
    expect(ledger.state).toMatchObject({ blocked: null, measuredUsd: 0, uncertainUsd: 0 });
    // Any other 403 still stops the run.
    const { ledger: other } = ledgerWith(async () => new Response(JSON.stringify({ error: { code: 403, message: "Key limit exceeded" } }), { status: 403 }));
    await call(other.fetchFor("text", () => "x"));
    expect(other.state.blocked).toBe("Provider error 403");
  });

  it("refuses a call whose reservation would pass the cap, counting calls still in flight", async () => {
    let release: () => void = () => {};
    const slow = () => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify({ usage: { cost: 0.001 } }))); });
    const { ledger } = ledgerWith(slow, 0.015);
    const first = call(ledger.fetchFor("text", () => "a"));
    await expect(call(ledger.fetchFor("text", () => "b"))).rejects.toThrow(/cap or call limit/);
    release(); await first;
    expect(ledger.state.counts.text).toBe(1);
  });
});

describe("call ceilings", () => {
  const haiku = modelPricing({ pricing: { prompt: "0.0000001", completion: "0.0000005", overrides: [{ min_prompt_tokens: 100000, prompt: "0.0000005", completion: "0.0000025" }] }, top_provider: { max_completion_tokens: 128000 } });
  const lite = modelPricing({ pricing: { prompt: "0.00000025", completion: "0.0000015", image_output: "0.00003" }, top_provider: { max_completion_tokens: 58982 } });

  it("bounds a text call by its characters and max_tokens, and an image call by the model's largest output", () => {
    const messages = [{ role: "user", content: "x".repeat(9_990) }];
    const text = requestCeilingUsd("text", { model: "anthropic/claude-haiku-5.5", messages, max_tokens: 2400 }, haiku)!;
    expect(text).toBeCloseTo((JSON.stringify(messages).length) * 1e-7 + 2400 * 5e-7, 12);
    const image = requestCeilingUsd("image", { model: "google/gemini-3.1-flash-lite-image", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${"A".repeat(400_000)}` } }] }] }, lite)!;
    // The attached image counts as 5,000 tokens, not its base64 length; 1K output is 1,120 image tokens.
    expect(image).toBeGreaterThan(58982 * 1.5e-6 + 1120 * 3e-5 + 5000 * 2.5e-7);
    expect(image).toBeLessThan(0.13);
    expect(requestCeilingUsd("text", { model: "x", messages: [] }, undefined)).toBeNull();
    expect(requestCeilingUsd("image", { model: "google/unknown-image", messages: [] }, lite)).toBeNull();
  });

  it("gives no ceiling for missing or malformed prices, so such calls are refused", () => {
    expect(modelPricing({ pricing: {} })).toBeUndefined();
    expect(modelPricing({ pricing: { prompt: "abc", completion: "0.0000005" } })).toBeUndefined();
    expect(modelPricing({ pricing: { prompt: "-1", completion: "0.0000005" } })).toBeUndefined();
    expect(modelPricing({ pricing: { prompt: "0.0000001", completion: "0.0000005", overrides: [{ min_prompt_tokens: "x", prompt: "1", completion: "1" }] } })).toBeUndefined();
    // Values Number() would read as 0 are malformed, not free.
    const valid = { prompt: "0.0000001", completion: "0.0000005", image_output: "0.00003", overrides: [{ min_prompt_tokens: 100000, prompt: "0.0000005", completion: "0.0000025" }] };
    for (const bad of [" ", false, [], {}, null, "0x10", "1,5"]) {
      for (const field of ["prompt", "completion"]) expect(modelPricing({ pricing: { ...valid, [field]: bad } }), `${field} ${JSON.stringify(bad)}`).toBeUndefined();
      for (const field of ["min_prompt_tokens", "prompt", "completion"]) expect(modelPricing({ pricing: { ...valid, overrides: [{ ...valid.overrides[0], [field]: bad }] } }), `override ${field}`).toBeUndefined();
      expect(modelPricing({ pricing: { ...valid, image_output: bad } })!.imageOutput, `image_output ${JSON.stringify(bad)}`).toBeNull();
    }
    expect(modelPricing({ pricing: valid })).toMatchObject({ prompt: 1e-7, completion: 5e-7, imageOutput: 3e-5 });
    // An image call needs the model's image price; text calls to it do not.
    const noImagePrice = modelPricing({ pricing: { prompt: "0.00000025", completion: "0.0000015" }, top_provider: { max_completion_tokens: 58982 } });
    expect(requestCeilingUsd("image", { model: "google/gemini-3.1-flash-lite-image", messages: [] }, noImagePrice)).toBeNull();
    expect(requestCeilingUsd("text", { model: "google/gemini-3.1-flash-lite-image", messages: [], max_tokens: 10 }, noImagePrice)).toBeGreaterThan(0);
  });

  it("refuses a call before it is sent when its ceiling would pass the cap, and stops if a call costs more than its ceiling", async () => {
    let sent = 0;
    const counting = async () => { sent++; return new Response(JSON.stringify({ usage: { cost: 0.5 } })); };
    const ledger = createLedger({ capUsd: 0.4, reserves: { text: 0.01, image: 0.05, check: 0.002 }, limits: { text: 10, image: 10, check: 10 }, fetch: counting,
      ceiling: (_kind, request) => (request.max_tokens as number) / 1000, save: () => {}, log: () => {}, scrub: (v) => v });
    await expect(call(ledger.fetchFor("text", () => "x"), { model: "m", max_tokens: 500 })).rejects.toThrow(/cap or call limit/);
    expect(sent).toBe(0);
    const second = createLedger({ capUsd: 1, reserves: { text: 0.01, image: 0.05, check: 0.002 }, limits: { text: 10, image: 10, check: 10 }, fetch: counting,
      ceiling: () => 0.2, save: () => {}, log: () => {}, scrub: (v) => v });
    await call(second.fetchFor("text", () => "x"));
    expect(second.state.blocked).toMatch(/cost \$0.5 against its \$0.2 ceiling/);
    const unknown = createLedger({ capUsd: 1, reserves: { text: 0.01, image: 0.05, check: 0.002 }, limits: { text: 10, image: 10, check: 10 }, fetch: counting,
      ceiling: () => null, save: () => {}, log: () => {}, scrub: (v) => v });
    await expect(call(unknown.fetchFor("text", () => "x"))).rejects.toThrow(/No price ceiling/);
    const notANumber = createLedger({ capUsd: 0.01, reserves: { text: 0.01, image: 0.05, check: 0.002 }, limits: { text: 10, image: 10, check: 10 }, fetch: counting,
      ceiling: () => Number.NaN, save: () => {}, log: () => {}, scrub: (v) => v });
    await expect(call(notANumber.fetchFor("image", () => "x"))).rejects.toThrow(/No price ceiling/);
    // Blank catalog prices give no ceiling, so the call is never sent.
    const blank = modelPricing({ pricing: { prompt: " ", completion: " " } });
    const blankLedger = createLedger({ capUsd: 0.001, reserves: { text: 0.01, image: 0.05, check: 0.002 }, limits: { text: 10, image: 10, check: 10 }, fetch: counting,
      ceiling: (kind, request) => requestCeilingUsd(kind, request, blank), save: () => {}, log: () => {}, scrub: (v) => v });
    await expect(call(blankLedger.fetchFor("text", () => "x"), { model: "m", max_tokens: 10, messages: [] })).rejects.toThrow(/No price ceiling/);
    expect(sent).toBe(1);
  });
});

describe("a suite run through the real assembly", () => {
  const STORY = "a-scandal-in-bohemia";
  const entry = (name: string, entryKind: string, text: string) => ({ kind: "entry" as const, name, entryKind, hasForm: true, stages: [{ id: "main", text }] });
  const records: MemoryRecordInput[] = [
    { kind: "entry", recordId: "sherlock_holmes", payload: entry("Sherlock Holmes", "character", "Sherlock Holmes: tall and lean, hawk-nosed, in a grey dressing-gown.") },
    { kind: "entry", recordId: "dr_watson", payload: entry("Dr. Watson", "character", "Dr. Watson: sturdy, moustached, in a brown tweed suit.") },
    { kind: "section", recordId: `${STORY}-1-1`, payload: { kind: "section", title: "Watson calls at Baker Street", firstUnit: `${STORY}-1-1`, lastUnit: `${STORY}-1-5`,
      era: "late-victorian-england-1880s-to-1890s", cast: [{ entryId: "sherlock_holmes", stageId: "main" }, { entryId: "dr_watson", stageId: "main" }] } },
    { kind: "moment", recordId: `${STORY}-1-1`, payload: { kind: "moment", sectionId: `${STORY}-1-1`, firstUnit: `${STORY}-1-1`, lastUnit: `${STORY}-1-2` } },
    { kind: "moment", recordId: `${STORY}-1-3`, payload: { kind: "moment", sectionId: `${STORY}-1-1`, firstUnit: `${STORY}-1-3`, lastUnit: `${STORY}-1-5` } },
  ];
  const cases: SuiteCase[] = [
    { caseId: "holmes-a", work: "holmes-adventures", unitId: `${STORY}-1-1`, reference: "A Scandal in Bohemia, Part I ¶1", split: "dev", tiers: ["text", "image"], styles: ["classical", "watercolor"] },
    { caseId: "holmes-b", work: "holmes-adventures", unitId: `${STORY}-1-4`, reference: "A Scandal in Bohemia, Part I ¶4", split: "holdout", tiers: ["text", "image"], styles: ["classical", "watercolor"] },
  ];

  type Row = {
    key: string; caseId: string; outcome: string; style: string | null; textCalls: number; reason?: string; stage?: string; standsFor?: string[];
    records: { look: AnalysisRecord; plan: AnalysisRecord }; context: { moment: { text: string } }; checkContext: { softEdges: boolean };
    prepared: { plan: Record<string, unknown> }; attempts: unknown[];
  };

  type RunShape = { limits?: { text: number; image: number; check: number }; cases?: SuiteCase[]; otherWorks?: [string, SuiteWork][]; concurrency?: number };
  async function run(tier: "text" | "image", seeded?: AnalysisRecord[], options: Parameters<typeof createOfflineOpenRouter>[0] = {}, extra: MemoryRecordInput[] = [], shape: RunShape = {}) {
    const inputs = await readWorkInputs("holmes-adventures");
    const offline = createOfflineOpenRouter(options);
    const { ledger } = ledgerWith(offline.fetch, 1, shape.limits ?? { text: 100, image: 100, check: 100 });
    const rows: Row[] = [];
    const work: SuiteWork = { inputs, records: [...records, ...extra], seeded, getReference: async () => null, loadReference: async () => { throw new Error("no references"); } };
    let saved = 0;
    await runSuite({
      tier, cases: shape.cases ?? cases, works: new Map([["holmes-adventures", work], ...(shape.otherWorks ?? [])]), aspectRatio: "16:9", concurrency: shape.concurrency ?? 2,
      image: tier === "image" ? { model: "google/gemini-3.1-flash-lite-image", resolution: "1K" } : undefined,
      providers: (phase) => ({
        text: createOpenRouterTextModel({ apiKey: "k", fetch: ledger.fetchFor("text", phase), timeoutMs: 5_000 }),
        image: createOpenRouterEvalImageProvider({ apiKey: "k", fetch: ledger.fetchFor("image", phase) }),
        checker: createOpenRouterVisionChecker({ apiKey: "k", fetch: ledger.fetchFor("check", phase), reasoningEffort: "low", maxTokens: 1500 }),
      }),
      blocked: () => ledger.state.blocked, record: (row) => rows.push(row as Row),
      saveImage: (key, n) => ({ file: `images/${key.replace("/", "__")}__a${n}.png`, sha256: `sha-${++saved}` }),
    });
    return { rows, ledger, offline };
  }

  it("prepares each case once in the text tier and records the look and plan it stored", async () => {
    const { rows, offline } = await run("text");
    expect(rows.map((r) => [r.key, r.outcome]).sort()).toEqual([["holmes-a/text", "planned"], ["holmes-b/text", "planned"]]);
    // One shared look for the section, then a plan and its review per moment.
    expect(offline.counts.text).toBe(5);
    expect(offline.counts.image + offline.counts.check).toBe(0);
    for (const r of rows) {
      expect(r.records.plan.kind).toBe("plan");
      expect(r.records.look.inputs.length).toBeGreaterThan(0);
      expect(r.context.moment.text.length).toBeGreaterThan(0);
    }
  });

  it("reuses a frozen guide while making fresh plans in a paired text run", async () => {
    const first = await run("text");
    const look = first.rows[0].records.look;
    const paired = await run("text", [look]);
    expect(paired.rows.map(r => r.outcome)).toEqual(["planned", "planned"]);
    expect(paired.offline.counts.text).toBe(4); // Two plans and two reviews; no new guide.
    expect(paired.rows.every(r => r.records.look.version === look.version)).toBe(true);
  });

  it("draws the text run's plans in the image tier, with no text call, then checks and retries", async () => {
    const text = await run("text");
    const seeds = [...new Map(text.rows.flatMap((r) => [r.records.look, r.records.plan]).map((r) => [`${r.kind}:${r.recordId}`, r])).values()];
    const { rows, offline } = await run("image", seeds, { letteringEvery: 2 });
    expect(offline.counts.text).toBe(0);
    expect(rows.map((r) => r.key).sort()).toEqual(["holmes-a/classical", "holmes-a/watercolor", "holmes-b/classical", "holmes-b/watercolor"]);
    expect(rows.every((r) => r.outcome === "image" && r.textCalls === 0)).toBe(true);
    // Every second checked image reports lettering, so some are retried and the better attempt is chosen.
    const retried = rows.filter((r) => r.attempts.length === 2);
    expect(retried.length).toBeGreaterThan(0);
    expect(offline.counts.image).toBe(rows.length + retried.length);
    expect(offline.counts.check).toBe(2 * offline.counts.image);
    expect(rows.find((r) => r.style === "watercolor")!.checkContext.softEdges).toBe(true);
    // A row carries what consistency pairing reads: the plan's present cast and scene.
    expect(rows[0].prepared.plan).toMatchObject({ present: expect.any(Array), primarySubject: expect.any(String) });
  });

  it("keeps an owner look as the owner's when seeding, so the image run still makes no text call", async () => {
    const ownerLook: MemoryRecordInput = { kind: "look", recordId: `${STORY}-1-1`, source: "owner", payload: { kind: "look", sectionId: `${STORY}-1-1`,
      place: "The Baker Street sitting-room", timeOfDay: "Night", weather: "Wet March evening", light: "Lamplight", clothing: "Holmes in a dressing-gown" } };
    const text = await run("text", undefined, {}, [ownerLook]);
    expect(text.rows.every((r) => r.records.look.source === "owner")).toBe(true);
    const seeds = [...new Map(text.rows.flatMap((r) => [r.records.look, r.records.plan]).map((r) => [`${r.kind}:${r.recordId}`, r])).values()];
    const image = await run("image", seeds, {}, [ownerLook]);
    expect(image.offline.counts.text).toBe(0);
    expect(image.rows.every((r) => r.outcome === "image")).toBe(true);
  });

  it("refuses only a case whose seed is stale, without spending the image run's zero text calls", async () => {
    const text = await run("text");
    // The shared look and case A's plan are seeded; case B's plan is missing, so B would have to be planned again.
    const seeds = [text.rows[0].records.look, text.rows.find((r) => r.caseId === "holmes-a")!.records.plan];
    const { rows, ledger, offline } = await run("image", seeds, {}, [], { limits: { text: 0, image: 100, check: 100 } });
    expect(ledger.state.blocked).toBeNull();
    expect(offline.counts.text).toBe(0);
    expect(rows.filter((r) => r.caseId === "holmes-a").map((r) => r.outcome)).toEqual(["image", "image"]);
    expect(rows.filter((r) => r.caseId === "holmes-b")).toMatchObject([{ outcome: "refused", stage: "seed", standsFor: ["classical", "watercolor"] }]);
    // A stale look shared by two cases running together refuses both as stale seeds, including the one that only waited on it.
    const together = cases.map((c) => ({ ...c, split: "holdout" as const }));
    const noLook = await run("image", seeds.slice(1), {}, [], { limits: { text: 0, image: 100, check: 100 }, cases: together, concurrency: 2 });
    expect(noLook.ledger.state.blocked).toBeNull();
    expect(noLook.rows.map((r) => [r.caseId, r.outcome, r.stage]).sort()).toEqual([["holmes-a", "refused", "seed"], ["holmes-b", "refused", "seed"]]);
  });

  it("runs every work's holdout cases before any dev case", async () => {
    // A second work with no analysis refuses its case at once, so the record order is the run order.
    const alice: SuiteWork = { inputs: await readWorkInputs("alice-in-wonderland"), records: [], getReference: async () => null, loadReference: async () => { throw new Error("no references"); } };
    const aliceCase: SuiteCase = { caseId: "alice-a", work: "alice-in-wonderland", unitId: "alice-1-1", reference: "Chapter I ¶1", split: "holdout", tiers: ["text", "image"], styles: ["classical"] };
    const { rows } = await run("text", undefined, {}, [], { cases: [...cases, aliceCase], otherWorks: [["alice-in-wonderland", alice]], concurrency: 1 });
    expect(rows.map((r) => r.caseId)).toEqual(["holmes-b", "alice-a", "holmes-a"]);
  });

  it("records a refused case once for all its styles, and stops at a provider error", async () => {
    const refused = await run("image", undefined, { malformedPlanFor: "A Scandal in Bohemia, Part I ¶1" });
    const rowsA = refused.rows.filter((r) => r.caseId === "holmes-a");
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({ outcome: "refused", reason: "preparation", standsFor: ["classical", "watercolor"] });
    const failing = await run("image", undefined, { failImage: 1 });
    expect(failing.ledger.state.blocked).toBe("Provider error 503");
    expect(failing.rows.some((r) => r.outcome === "failed")).toBe(true);
    // Nothing new starts after the error; the other case's first image may already be in flight.
    expect(failing.offline.counts.image).toBeLessThanOrEqual(2);
  });
});
