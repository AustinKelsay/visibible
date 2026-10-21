/** One authorized diagnostic comparison. Retained for audit; never authorization to replay it. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { packetProvider, hash } from "../2026-10-21-daniel-schema-pilot/packets.mjs";
import { loadEvalCases, type EvalArm } from "../../../src/lib/image-evals/cases";
import { runImageEval, type EvalRunState, type EvalImageProvider } from "../../../src/lib/image-evals/runner";
import { createOpenRouterEvalImageProvider } from "../../../src/lib/image-evals/adapters";
import { buildReport, buildScoreTemplate, renderContactSheet } from "../../../src/lib/image-evals/report";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const json = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const plan = json(path.join(dir, "plan.json"));
assert.ok(process.argv.includes("--execute"), "Requires --execute and the recorded owner authorization");
assert.ok(!fs.existsSync(path.join(dir, "execution.json")), "Already executed; no automatic resume");
assert.equal(plan.evaluationAuthorizedUsd, 16.50);
assert.equal(plan.combinedCapUsd, 0.50);
assert.ok(plan.evaluationMeasuredBeforeUsd + plan.evaluationUncertaintyBeforeUsd + plan.combinedCapUsd <= plan.evaluationAuthorizedUsd);
const before = json(path.join(dir, "before.json"));
assert.ok(Date.now() - Date.parse(before.at) < 15 * 60_000, "Fresh read-only preflight required");
assert.equal(before.authorizationPending, false);
assert.ok(before.balanceUsd >= plan.combinedCapUsd);
assert.equal(before.packets.length, 12);
for (const [file, expected] of Object.entries(before.sourceFiles)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, `Changed source: ${file}`);
const envFile = process.env.VISIBIBLE_EVAL_ENV_FILE;
assert.ok(envFile, "Private production environment file required");
const env = parseEnv(fs.readFileSync(envFile, "utf8"));
assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
for (const key of ["NEXT_PUBLIC_CONVEX_URL", "CONVEX_SERVER_SECRET", "OPENROUTER_API_KEY"]) assert.ok(env[key], `Missing ${key}`);
const cases = loadEvalCases(json(path.join(dir, "cases.json")));
const arms = plan.styles.map((id: string) => `generic:${id}`) as EvalArm[];
const estimateUsd = { image: 0.035, planner: 0, preparation: 0.0005 };
const nativeFetch = globalThis.fetch;
// Enforce read-only production access even if a future adapter bypasses the read-only store.
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/api/mutation") || url.includes("/api/action") || url.includes("/chat/completions")) throw new Error("Only the bounded image adapter may make paid calls; mutations forbidden");
  return nativeFetch(input, init);
};
const privateTrace = path.join(os.tmpdir(), "visibible-reference-comparison-provider.private.ndjson");
const publicTrace = path.join(os.tmpdir(), "visibible-reference-comparison-provider.ndjson");
for (const file of [privateTrace, publicTrace]) fs.writeFileSync(file, "", { flag: "wx", mode: 0o600 });
const clean = (value: unknown): unknown => {
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
};
let chargedUsd = 0, uncertainUsd = 0, imageCalls = 0;
let blocked: string | null = null;
let mode = "normal";
let activeLabel = "";
const sent = new Set<string>();
const execution = () => ({ at: new Date().toISOString(), imageCalls, preparationCalls: 0, chargedUsd, uncertainUsd, blocked, combinedCapUsd: plan.combinedCapUsd, paidLabels: [...sent], productionMutations: 0 });
const boundedFetch = async (input: string, init: RequestInit) => {
  assert.equal(input, "https://openrouter.ai/api/v1/chat/completions");
  assert.ok(!blocked, blocked ?? "");
  assert.ok(imageCalls < plan.maximumImageCalls);
  assert.ok(chargedUsd + uncertainUsd + plan.imageReserveUsd <= plan.combinedCapUsd, "Combined admission cap reached");
  const request = JSON.parse(String(init.body));
  const content = request.messages?.[0]?.content;
  const prompt = typeof content === "string" ? content : content?.[0]?.text;
  const expected = before.packets.find((p: { promptSha256: string; omitStyleReference: boolean }) => p.omitStyleReference === (mode === "omitted") && p.promptSha256 === hash(prompt));
  const key = `${mode}:${activeLabel}`;
  assert.ok(expected && !sent.has(key), "Only unused prevalidated packets may be sent");
  assert.equal(activeLabel, `${cases[0].id}/generic:${expected.styleId}/${expected.n}`);
  assert.equal(request.model, plan.imageModel);
  assert.deepEqual(request.modalities, ["image", "text"]);
  assert.equal(request.image_config.aspect_ratio, plan.aspectRatio);
  assert.equal(request.image_config.image_size ?? "1K", plan.resolution);
  const images = Array.isArray(content) ? content.slice(1) : [];
  assert.equal(images.length, expected.references.length);
  for (const [i, part] of images.entries()) assert.equal(hash(Buffer.from(part.image_url.url.split(",")[1], "base64")), expected.references[i].sha256);
  sent.add(key);
  imageCalls++;
  const startedAt = new Date().toISOString();
  let logged = false;
  try {
    const response = await nativeFetch(input, init);
    const payload = await response.clone().json();
    const cost = extractOpenRouterUsageUsd(payload);
    if (cost === null) { uncertainUsd += plan.imageReserveUsd; blocked = "Missing provider usage"; }
    else chargedUsd += cost;
    if (!response.ok) blocked = `Provider HTTP ${response.status}`;
    if (chargedUsd + uncertainUsd > plan.combinedCapUsd) blocked = "Measured usage exceeded admission reserve";
    const row = { mode, label: activeLabel, kind: "image", startedAt, completedAt: new Date().toISOString(), status: response.status, request, response: payload, measuredUsageUsd: cost };
    fs.appendFileSync(privateTrace, JSON.stringify(row) + "\n");
    fs.appendFileSync(publicTrace, JSON.stringify(clean(row)) + "\n");
    logged = true;
    save(path.join(dir, "execution.json"), execution());
    return response;
  } catch (error) {
    blocked = error instanceof Error ? error.message : String(error);
    if (!logged) {
      uncertainUsd += plan.imageReserveUsd;
      const row = { mode, label: activeLabel, kind: "image", startedAt, completedAt: new Date().toISOString(), error: blocked, uncertainUsage: true };
      for (const file of [privateTrace, publicTrace]) fs.appendFileSync(file, JSON.stringify(row) + "\n");
    }
    save(path.join(dir, "execution.json"), execution());
    throw error;
  }
};
try {
  const generic = await packetProvider({ NEXT_PUBLIC_CONVEX_URL: env.NEXT_PUBLIC_CONVEX_URL!, CONVEX_SERVER_SECRET: env.CONVEX_SERVER_SECRET!, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY! }, { id: "forbidden", complete: async () => { throw new Error("No preparation allowed"); } });
  const adapter = createOpenRouterEvalImageProvider({ apiKey: env.OPENROUTER_API_KEY!, fetch: boundedFetch });
  const image: EvalImageProvider = { id: adapter.id, generate: async (request) => { activeLabel = request.label; return adapter.generate(request); } };
  for (mode of ["normal", "omitted"]) {
    if (blocked) break;
    const runDir = path.join(root, "evals/images/runs", plan.runs[mode]);
    const statePath = path.join(runDir, "state.json");
    const state = json(statePath) as EvalRunState;
    assert.equal(Object.keys(state.samples).length, 0, "No paid run may resume");
    assert.equal(state.spentUsd, 0);
    assert.equal(state.omitStyleReference, mode === "omitted");
    const options = {
      cases, arms, repeats: plan.repeats, budgetUsd: plan.combinedCapUsd - chargedUsd - uncertainUsd,
      estimateUsd, omitStyleReference: mode === "omitted", state,
      saveState: async (next: EvalRunState) => save(statePath, next), log: console.log,
      providers: { generic, image, planner: null, resolvePassage: async () => { throw new Error("Only imported WEB permitted"); }, sink: { save: async (key: string, bytes: Uint8Array, mimeType: string) => {
        assert.equal(mimeType, "image/jpeg");
        const file = path.join(runDir, "outputs", `${key}.jpg`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes, { flag: "wx" });
        return path.relative(runDir, file);
      } } },
    };
    const result = await runImageEval(options);
    save(path.join(runDir, "manifest.final.json"), result.manifest);
    const report = buildReport(result.state, cases, { arms, repeats: plan.repeats });
    save(path.join(runDir, "report.json"), report);
    save(path.join(runDir, "scores.json"), buildScoreTemplate(report));
    fs.writeFileSync(path.join(runDir, "contact-sheet.html"), renderContactSheet(report));
    if (Object.values(result.state.samples).some((s) => s.status !== "completed") || result.state.stopped) blocked ??= "Incomplete or failed run; no further paid calls";
  }
} finally {
  globalThis.fetch = nativeFetch;
  save(path.join(dir, "execution.json"), execution());
  console.log(JSON.stringify(execution()));
}
