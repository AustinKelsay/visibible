/** Load actual immutable v8 code, rewriting import paths only; never substitute a prompt in v9. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { hash, json, root, sharedSources } from "./common.mjs";

export const baselineCommit: string = json("plan.json").baselineCommit;
const show = (file: string) => execFileSync("git", ["show", `${baselineCommit}:${file}`], { cwd: root });
export const baselineSource = show("src/lib/engine/preparation.ts").toString("utf8");
export const baselineSha256 = hash(baselineSource);
for (const file of sharedSources) assert.equal(hash(show(file)), hash(fs.readFileSync(path.join(root, file))), `Shared baseline dependency changed: ${file}`);
const require = createRequire(path.join(root, "package.json"));
const rewritten = baselineSource.replace(/from "(\.[^"]+|zod)"/g, (_, specifier: string) => {
  const target = specifier === "zod" ? require.resolve("zod") : path.resolve(root, "src/lib/engine", `${specifier}.ts`);
  return `from "${pathToFileURL(target).href}"`;
});
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-v8-baseline-"));
let baseline: typeof import("../../../src/lib/engine/preparation");
try {
  const file = path.join(temporary, "preparation.mts");
  fs.writeFileSync(file, rewritten);
  baseline = await import(pathToFileURL(file).href);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
assert.equal(baseline.MOMENT_CAST_PROMPT_VERSION, json("plan.json").pipeline.baselineMomentCast);
assert.equal(baseline.FORMLESS_PLAN_PROMPT_VERSION, json("plan.json").pipeline.baselineFormlessPlan);
export const prepareBaseline = baseline.prepareMoment;
