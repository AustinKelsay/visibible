/** Spend control for paid evaluation runs: the ledger and the price ceiling it reserves before each call. */
import { describe, expect, it } from "vitest";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog } from "../image-evals/suite-run";

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
