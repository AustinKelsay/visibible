/** Retained experiment helpers. Execution requires the separately recorded owner allowance. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { createOpenRouterTextModel, READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const json = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
export const save = (file: string, value: unknown) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
export const sourceFiles = ["src/lib/reading-pass/canon.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "src/lib/engine/preparation.ts", "src/lib/engine/prompt.ts", "src/lib/engine/assemble.ts", "src/lib/image-evals/generic.ts", "src/lib/image-evals/runner.ts", "src/lib/image-evals/adapters.ts", "styles/classical.json", "styles/watercolor.json", "styles/icon.json", "works/bible-web/work.json", "works/bible-web/brief.json"];
export const sources = () => Object.fromEntries(sourceFiles.map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));
export const noModel = { id: "forbidden", complete: async () => { throw new Error("No unbudgeted preparation permitted"); } };

/** No production writes, reading pass, image calls or unbounded model paths. */
export function environment() {
  const file = process.env.VISIBIBLE_EVAL_ENV_FILE;
  assert.ok(file, "Private production environment file required");
  const env = parseEnv(fs.readFileSync(file, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  for (const key of ["NEXT_PUBLIC_CONVEX_URL", "CONVEX_SERVER_SECRET", "OPENROUTER_API_KEY"]) assert.ok(env[key], `Missing ${key}`);
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.ok(!url.includes("/api/mutation") && !url.includes("/api/action") && !url.includes("/chat/completions"), "Only the bounded adapter may make model calls; production writes forbidden");
    return nativeFetch(input, init);
  };
  return { env: { NEXT_PUBLIC_CONVEX_URL: env.NEXT_PUBLIC_CONVEX_URL!, CONVEX_SERVER_SECRET: env.CONVEX_SERVER_SECRET!, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY! }, nativeFetch };
}

export function requireSnapshot() {
  const before = json("before.json");
  assert.ok(Date.now() - Date.parse(before.at) < 30 * 60_000, "Fresh read-only snapshot required");
  assert.deepEqual(sources(), before.sourceFiles);
  assert.ok(before.balanceUsd >= 0.17);
  assert.ok(before.publicCatalog.artStyles.every((s: { id: string; available: boolean }) => s.id === "classical" || !s.available));
  return before;
}

export function clean(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("data:image/")) {
    const match = value.match(/^data:([^;]+);base64,([\s\S]*)$/);
    assert.ok(match);
    const bytes = Buffer.from(match[2], "base64");
    return { omittedImageData: true, mimeType: match[1], bytes: bytes.length, sha256: hash(bytes) };
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "user_id").map(([key, child]) => [key,
      row.type === "reasoning.encrypted" && key === "data" && typeof child === "string"
        ? { omittedEncryptedData: true, bytes: Buffer.byteLength(child), sha256: hash(child) } : clean(child)]));
  }
  return value;
}

/** Shared admission ledger: preparation only, never transferred to/from image or smoke buckets. */
type ProviderTextRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: { json_schema?: { name?: string } };
  reasoning?: unknown;
  provider?: unknown;
  max_tokens?: number;
};

export function textModel(phase: "canon" | "plan", apiKey: string, nativeFetch: typeof fetch, validate: (request: ProviderTextRequest) => void) {
  const plan = json("plan.json");
  assert.ok(process.argv.includes("--execute"), "Retained code is not replay authorization");
  requireSnapshot();
  assert.ok(plan.preparation.measuredBeforeUsd + plan.preparation.uncertaintyBeforeUsd + plan.preparation.capUsd <= plan.preparation.authorizedUsd);
  const executionFile = `${phase}-execution.json`;
  save(executionFile, { at: new Date().toISOString(), phase, status: "started", productionMutations: 0 });
  const ledgerFile = path.join(dir, "preparation-ledger.json");
  const ledger = fs.existsSync(ledgerFile) ? json("preparation-ledger.json") : { calls: [], measuredUsd: 0, uncertainUsd: 0, blocked: null };
  const flush = () => fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n");
  const boundedFetch = async (input: string, init: RequestInit) => {
    assert.equal(input, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(ledger.blocked, null);
    assert.equal(ledger.uncertainUsd, 0);
    assert.ok(ledger.calls.length < plan.preparation.maximumCalls);
    assert.ok(ledger.calls.filter((c: { phase: string }) => c.phase === phase).length < 2);
    assert.ok(ledger.measuredUsd + plan.preparation.reservePerCallUsd <= plan.preparation.capUsd);
    const request: ProviderTextRequest = JSON.parse(String(init.body));
    assert.equal(request.model, READING_PASS_MODEL);
    assert.equal(request.response_format?.json_schema?.name, phase === "canon" ? "canon_entry" : "scene_plan");
    assert.deepEqual(request.reasoning, { effort: "none" });
    assert.deepEqual(request.provider, { require_parameters: true, order: ["anthropic"], allow_fallbacks: false });
    validate(request);
    const call = { phase, startedAt: new Date().toISOString(), measuredUsd: null as number | null, status: "in-flight" };
    ledger.calls.push(call);
    ledger.uncertainUsd += plan.preparation.reservePerCallUsd;
    flush();
    try {
      const response = await nativeFetch(input, init);
      const payload = await response.clone().json();
      const cost = extractOpenRouterUsageUsd(payload);
      fs.appendFileSync(path.join(dir, "text-provider.ndjson"), JSON.stringify(clean({ phase, startedAt: call.startedAt, completedAt: new Date().toISOString(), status: response.status, request, response: payload, measuredUsageUsd: cost })) + "\n");
      if (cost === null) ledger.blocked = "Missing provider usage";
      else { ledger.uncertainUsd -= plan.preparation.reservePerCallUsd; ledger.measuredUsd += cost; }
      call.measuredUsd = cost;
      call.status = String(response.status);
      if (!response.ok) ledger.blocked = `Provider HTTP ${response.status}`;
      if (ledger.measuredUsd > plan.preparation.capUsd) ledger.blocked = "Measured cost exceeded admission reserve";
      flush();
      return response;
    } catch (error) {
      ledger.blocked = error instanceof Error ? error.message : String(error);
      call.status = "uncertain";
      flush();
      throw error;
    }
  };
  return { model: createOpenRouterTextModel({ apiKey, fetch: boundedFetch, timeoutMs: 120_000 }), finish: (status: string) => {
    fs.writeFileSync(path.join(dir, executionFile), JSON.stringify({ at: new Date().toISOString(), phase, status, productionMutations: 0, ledger }, null, 2) + "\n");
  } };
}
