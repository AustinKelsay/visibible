/** Shared paths, hashing and the private environment for the launch matrix third run. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
/** Full-size references and images stay outside git (evals/images/runs is ignored); hashes are committed. */
export const blobs = path.join(root, "evals/images/runs/2026-10-28-style-bakeoff");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const json = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
export const save = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
export function readEnvironment() {
  assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
  const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  assert.equal(env.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com");
  return env;
}
export const sharedSources = ["src/lib/engine/preparation.ts", "src/lib/engine/assemble.ts", "src/lib/engine/situation.ts", "src/lib/engine/scene-grounding.ts", "src/lib/engine/plan-review.ts", "src/lib/engine/prompt.ts", "src/lib/engine/work-inputs.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "src/lib/image-response.ts", "src/lib/image-evals/adapters.ts", "src/lib/canon-showing.ts", "src/lib/work-preparation.ts", "convex/_helpers/contentVersion.ts", "styles/classical.json", "styles/watercolor.json", "styles/icon.json", "works/bible-web/brief.json"];
export const frozen = () => Object.fromEntries([...sharedSources.map((f) => path.join(root, f)), ...["common.mts", "snapshot.mts", "run.mts", "plan.json", "snapshot.json", "candidates/gouache.json", "candidates/engraving.json", "candidates/fresco.json", "../../../package-lock.json"].map((f) => path.resolve(dir, f))]
  .map((file) => [path.relative(root, file), hash(fs.readFileSync(file))]));
