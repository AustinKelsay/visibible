/** Shared paths, hashing and the private environment check. Never prints credentials. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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
export const sourceFiles = ["src/lib/engine/preparation.ts", "src/lib/engine/scene-grounding.ts", "src/lib/engine/plan-review.ts", "src/lib/engine/work-inputs.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "src/lib/canon-showing.ts", "convex/analysis.ts", "convex/schema.ts", "works/bible-web/work.json", "works/bible-web/brief.json"];
export const sources = () => Object.fromEntries(sourceFiles.map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));
/** mulberry32: a small, well-known seeded generator, so the draw is reproducible from the plan's seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const bookOf = (unitId: string) => unitId.replace(/-\d+-\d+$/, "");
