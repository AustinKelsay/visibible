/** Shared paths and the private environment check. Never prints credentials. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const rateDir = path.join(dir, "../2026-10-23-grounding-rate-check");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const json = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
export const rate = (name: string) => JSON.parse(fs.readFileSync(path.join(rateDir, name), "utf8"));
export const save = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
export function environment() {
  assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
  const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(env.OPENROUTER_API_KEY);
  return { key: env.OPENROUTER_API_KEY };
}
type Row = { kind: string; recordId: string; record: { payload: Record<string, unknown>; version: string } | null };
export const row = (state: { records: Row[] }, kind: string, recordId: string) => state.records.find((r) => r.kind === kind && r.recordId === recordId)?.record ?? null;
