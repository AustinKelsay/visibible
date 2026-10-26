/** Load both real immutable modules. Only relative import paths are rewritten. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { hash, json, root, sharedSources } from "./common.mjs";

export const baselineCommit: string = json("plan.json").baselineCommit;
const files = ["preparation", "plan-review", "prompt"];
const show = (file: string) => execFileSync("git", ["show", `${baselineCommit}:${file}`], { cwd: root });
export const baselineHashes = Object.fromEntries(files.map((name) => [name, hash(show(`src/lib/engine/${name}.ts`))]));
for (const file of ["src/lib/engine/preparation.ts", ...sharedSources]) {
  assert.equal(hash(execFileSync("git", ["show", `${json("plan.json").candidateCommit}:${file}`], { cwd: root })), hash(fs.readFileSync(path.join(root, file))), `Immutable candidate changed: ${file}`);
}
// Freeze the real baseline modules; only unchanged external dependencies are shared.
for (const file of sharedSources.filter((f) => !["src/lib/engine/plan-review.ts", "src/lib/engine/prompt.ts", "src/lib/engine/situation.ts", "src/lib/engine/memory-store.ts"].includes(f))) {
  assert.equal(hash(show(file)), hash(fs.readFileSync(path.join(root, file))), `Shared baseline dependency changed: ${file}`);
}
const require = createRequire(path.join(root, "package.json"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "visibible-v7-conditions-baseline-"));
let baseline: typeof import("../../../src/lib/engine/preparation");
let review: typeof import("../../../src/lib/engine/plan-review");
let rendering: typeof import("../../../src/lib/engine/prompt");
try {
  for (const name of files) {
    const source = show(`src/lib/engine/${name}.ts`).toString("utf8");
    const rewritten = source.replace(/from "(\.[^"]+|zod)"/g, (_, specifier: string) => {
      const target = specifier === "zod" ? require.resolve("zod")
        : files.some((f) => specifier === `./${f}`) ? path.join(temporary, `${specifier}.mts`)
        : path.resolve(root, "src/lib/engine", `${specifier}.ts`);
      return `from "${pathToFileURL(target).href}"`;
    });
    fs.writeFileSync(path.join(temporary, `${name}.mts`), rewritten);
  }
  baseline = await import(pathToFileURL(path.join(temporary, "preparation.mts")).href);
  review = await import(pathToFileURL(path.join(temporary, "plan-review.mts")).href);
  rendering = await import(pathToFileURL(path.join(temporary, "prompt.mts")).href);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
const pipeline = json("plan.json").pipeline;
assert.equal(baseline.MOMENT_CAST_PROMPT_VERSION, pipeline.baselineMomentCast);
assert.equal(baseline.FORMLESS_PLAN_PROMPT_VERSION, pipeline.baselineFormlessPlan);
assert.equal(review.PLAN_REVIEW_PROMPT_VERSION, pipeline.baselineReview);
export const prepareBaseline = baseline.prepareMoment;
export const reviewBaseline = review.reviewPlan;

assert.equal(rendering.GENERIC_PROMPT_VERSION, pipeline.baselineRendering);
export const renderBaseline = rendering.buildRenderingPacket;
export const baselineReviewUser = review.planReviewUser;
