/** Frozen inputs and local artifacts; credentials are read only after funding preflight. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { responseSchema } from "../../../src/lib/reading-pass/prompts";
import type { TextModelRequest } from "../../../src/lib/reading-pass/model";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const json = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
export const save = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
export function environment() {
  assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
  const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  assert.equal(env.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com");
  assert.ok(env.OPENROUTER_API_KEY);
  return { url: env.NEXT_PUBLIC_CONVEX_URL, key: env.OPENROUTER_API_KEY };
}
export function randomFrom(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const sharedSources = ["convex/_helpers/contentVersion.ts", "src/lib/engine/situation.ts", "src/lib/engine/scene-grounding.ts", "src/lib/engine/plan-review.ts", "src/lib/engine/prompt.ts", "src/lib/engine/work-inputs.ts", "src/lib/engine/memory-store.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "src/lib/image-response.ts", "src/lib/image-prompts.ts", "src/lib/canon-showing.ts", "src/lib/work-input.ts", "src/lib/work-preparation.ts", "styles/classical.json", "styles/watercolor.json", "styles/icon.json", "works/bible-web/brief.json"];
export const sources = () => Object.fromEntries(["src/lib/engine/preparation.ts", ...sharedSources, "works/bible-web/work.json"].map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));
export const plain = (request: TextModelRequest) => ({ system: request.system, user: request.user, schemaName: request.schemaName,
  schema: responseSchema(request.schema), maxTokens: request.maxTokens, expectedCompletionTokens: request.expectedCompletionTokens, reasoningEffort: request.reasoningEffort ?? "none" });
export const frozen = () => ({ ...sources(), ...Object.fromEntries([
  "common.mts", "baseline.mts", "pricing.mts", "scenarios.mts", "dry-run.mts", "model.mts", "run.mts", "audit.mts", "score.mts", "plan.json", "pricing.json", "../2026-10-24-rendering-review-check/sample-set.json", "../2026-10-24-rendering-review-check/controls.mts", "README.md",
  "controls.mts", "rehearse.mts", "../../../package.json", "../../../package-lock.json",
].map((name) => [path.relative(root, path.resolve(dir, name)), hash(fs.readFileSync(path.resolve(dir, name)))])) });
