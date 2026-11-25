/** Spend control for paid evaluation runs: the ledger and the price ceiling it reserves before each call. */
import { describe, expect, it } from "vitest";
import { createGeminiEvalImageProvider, geminiGenerateUrl } from "../image-evals/adapters";
import {
  buildGeminiBatchLine, downloadGeminiFile, GEMINI_FILES_UPLOAD_URL, geminiBatchJobBoundUsd, geminiBatchUrl,
  geminiFileDownloadUrl, geminiResourceUrl, parseGeminiBatchOutputLine, pollGeminiBatch, streamGeminiFileLines, submitGeminiBatch, uploadGeminiFile,
} from "../image-evals/gemini-batch";
import { createLedger, GEMINI_BATCH_DISCOUNT, geminiUsageUsd, modelPricing, requestCeilingUsd, scrubForLog } from "../image-evals/suite-run";

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

describe("Gemini direct eval provider", () => {
  const nb = modelPricing({ pricing: { prompt: "0.0000005", completion: "0.000003", image_output: "0.00003" }, top_provider: { max_completion_tokens: 32768 } })!;

  it("computes cost from usageMetadata, bounds inlineData requests, and scrubs base64 payloads", async () => {
    const usage = { promptTokenCount: 5142, candidatesTokenCount: 1955, thoughtsTokenCount: 934, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }] };
    const cost = geminiUsageUsd({ usageMetadata: usage }, nb)!;
    // 5142*5e-7 + (835+934)*3e-6 + 1120*3e-5 = 0.002571 + 0.005307 + 0.0336 = 0.041478
    expect(cost).toBeCloseTo(0.041478, 6);
    expect(geminiUsageUsd({}, nb)).toBeNull();

    const geminiReq = {
      model: "google/gemini-nano-banana-2.1",
      contents: [{ role: "user", parts: [{ text: "paint" }, { inlineData: { mimeType: "image/jpeg", data: "A".repeat(200_000) } }] }],
      generationConfig: { imageConfig: { aspectRatio: "16:9", imageSize: "1K" } },
    };
    const ceiling = requestCeilingUsd("image", geminiReq, nb)!;
    expect(ceiling).toBeGreaterThan(32768 * 3e-6 + 1120 * 3e-5 + 5000 * 5e-7);
    expect(ceiling).toBeLessThan(0.15);

    const scrubbed = JSON.stringify(scrubForLog({ ...geminiReq, thoughtSignature: "B".repeat(5000) }, "gm-secret", () => "h"));
    expect(scrubbed).not.toContain("AAAA");
    expect(scrubbed).not.toContain("BBBB");
    expect(scrubbed).toContain("[opaque sha256 h chars 200000]");
    expect(scrubbed).toContain("[opaque sha256 h chars 5000]");

    const logged: Array<Record<string, unknown>> = [];
    const targetUrl = geminiGenerateUrl("google/gemini-nano-banana-2.1");
    const ledger = createLedger({
      capUsd: 1, reserves: { text: 0, image: 0.08, check: 0 }, limits: { text: 0, image: 5, check: 0 }, url: targetUrl,
      extractCost: (payload) => geminiUsageUsd(payload, nb),
      fetch: async (url, init) => {
        expect(url).toBe(targetUrl);
        expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("gm-secret");
        return new Response(JSON.stringify({
          responseId: "resp-1",
          usageMetadata: usage,
          candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: Buffer.from("jpegbytes").toString("base64") } }] } }],
        }), { status: 200 });
      },
      save: () => {}, log: (entry) => logged.push(entry), scrub: (v) => scrubForLog(v, "gm-secret", () => "h"),
    });
    const provider = createGeminiEvalImageProvider({ apiKey: "gm-secret", pricing: nb, fetch: ledger.fetchFor("image", () => "case/classical") });
    const out = await provider.generate({
      label: "case/classical", model: "google/gemini-nano-banana-2.1", prompt: "Paint.", aspectRatio: "16:9", resolution: "1K",
      references: [{ mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }],
    });
    expect(Buffer.from(out.bytes).toString()).toBe("jpegbytes");
    expect(out.costUsd).toBeCloseTo(0.041478, 6);
    expect(out.providerRequestId).toBe("resp-1");
    expect(ledger.state).toMatchObject({ measuredUsd: cost, uncertainUsd: 0, counts: { image: 1 }, blocked: null });
    expect(JSON.stringify(logged)).not.toContain("gm-secret");
  });
});

describe("Gemini batch eval client", () => {
  const nb = modelPricing({ pricing: { prompt: "0.0000015", completion: "0.0000075", image_output: "0.00003" }, top_provider: { max_completion_tokens: 65536 } })!;

  it("uploads files, builds JSONL lines, submits, polls, downloads and settles at 50% batch discount", async () => {
    const calls: string[] = [];
    const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === GEMINI_FILES_UPLOAD_URL) {
        expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("gm-key");
        return new Response("", { status: 200, headers: { "x-goog-upload-url": "https://upload.test/session-1" } });
      }
      if (url === "https://upload.test/session-1") {
        return new Response(JSON.stringify({ file: { name: "files/f1", uri: "https://generativelanguage.googleapis.com/v1beta/files/f1", state: "ACTIVE" } }), { status: 200 });
      }
      if (url === geminiBatchUrl("google/gemini-nano-banana-2.1")) {
        const body = JSON.parse(String(init?.body));
        expect(body.batch.input_config.file_name).toBe("files/f1");
        return new Response(JSON.stringify({ name: "batches/b1", metadata: { state: "JOB_STATE_PENDING" } }), { status: 200 });
      }
      if (url === geminiResourceUrl("batches/b1")) {
        const count = calls.filter((c) => c === `GET ${url}`).length;
        return new Response(JSON.stringify(count === 1
          ? { name: "batches/b1", metadata: { state: "BATCH_STATE_RUNNING" } }
          : { name: "batches/b1", done: true, metadata: { state: "BATCH_STATE_SUCCEEDED" }, response: { responsesFile: "files/out-1" } }), { status: 200 });
      }
      if (url === geminiFileDownloadUrl("files/out-1")) {
        const imgLine = JSON.stringify({
          key: "acts-13-25/classical",
          response: {
            responseId: "resp-b1",
            usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 1600, thoughtsTokenCount: 480, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }] },
            candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: Buffer.from("batch-jpg").toString("base64") } }] } }],
          },
        });
        const modLine = JSON.stringify({
          key: "judges-19-29/classical",
          response: { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] },
        });
        const errLine = JSON.stringify({ key: "bad/classical", status: { code: 13, message: "internal" } });
        return new Response(`${imgLine}\n${modLine}\n${errLine}\n`, { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const uploaded = await uploadGeminiFile({ apiKey: "gm-key", bytes: new Uint8Array([1, 2, 3]), mimeType: "application/jsonl", displayName: "test", fetch: mockFetch });
    expect(uploaded).toEqual({ name: "files/f1", uri: "https://generativelanguage.googleapis.com/v1beta/files/f1" });

    const reqLine = buildGeminiBatchLine({
      key: "acts-13-25/classical", prompt: "Paint John.", model: "google/gemini-nano-banana-2.1", aspectRatio: "16:9", resolution: "1K",
      references: [{ kind: "file", mimeType: "image/jpeg", fileUri: uploaded.uri }],
    });
    expect(reqLine.request).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Paint John." }, { fileData: { mimeType: "image/jpeg", fileUri: uploaded.uri } }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "16:9" } },
    });

    const submitted = await submitGeminiBatch({ apiKey: "gm-key", model: "google/gemini-nano-banana-2.1", inputFileName: uploaded.name, displayName: "run", fetch: mockFetch });
    expect(submitted.name).toBe("batches/b1");

    const polled = await pollGeminiBatch({ apiKey: "gm-key", batchName: submitted.name, pollIntervalMs: 1, fetch: mockFetch });
    expect(polled).toMatchObject({ state: "BATCH_STATE_SUCCEEDED", responsesFile: "files/out-1" });

    const text = await downloadGeminiFile({ apiKey: "gm-key", fileName: polled.responsesFile!, fetch: mockFetch });
    const streamed: string[] = [];
    await streamGeminiFileLines({ apiKey: "gm-key", fileName: polled.responsesFile!, fetch: mockFetch, onLine: (l) => { streamed.push(l); } });
    expect(streamed).toEqual(text.trim().split("\n"));
    const [imgRes, modRes, errRes] = streamed.map((l) => parseGeminiBatchOutputLine(l, nb));

    expect(imgRes.ok).toBe(true);
    if (imgRes.ok) {
      expect(Buffer.from(imgRes.bytes).toString()).toBe("batch-jpg");
      // (3000*1.5e-6 + (480+480)*7.5e-6 + 1120*3e-5) * 0.5 = (0.0045 + 0.0072 + 0.0336) * 0.5 = 0.02265
      expect(imgRes.costUsd).toBeCloseTo(0.02265, 6);
      expect(imgRes.costUsd).toBeCloseTo(geminiUsageUsd(imgRes.response, nb, GEMINI_BATCH_DISCOUNT)!, 9);
    }
    expect(modRes).toMatchObject({ key: "judges-19-29/classical", ok: false, moderated: true, costUsd: 0 });
    expect(errRes).toMatchObject({ key: "bad/classical", ok: false, moderated: false, costUsd: null });

    const bound = geminiBatchJobBoundUsd({ promptChars: 5000, referenceCount: 4, outputTokens1K: 1120, pricing: nb })!;
    expect(bound).toBeGreaterThan(0.025);
    expect(bound).toBeLessThan(0.04);
  });
});
