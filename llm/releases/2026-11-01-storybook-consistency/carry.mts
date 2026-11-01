/**
 * Offline scoring bookkeeping for the consistency report over the baseline's matrices plus this run.
 *
 *   npx tsx carry.mts split <pairs dir> [batch size]   carry the baseline's verdicts; batch the rest for blind scorers
 *   npx tsx carry.mts merge <pairs dir>                one scorer-a, scorer-b and operator file over every pair
 *
 * A pair the baseline already judged (same group, style and two image hashes) keeps its two blind verdicts and any
 * operator ruling. Every other pair goes to two new blind scorers per batch. Batch files hold only what scorers may see.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pairScoreFileSchema, type ConsistencyPair } from "../../../src/lib/image-evals/consistency";
import { dir, root } from "./common.mjs";

const [command, pairsArg, sizeArg] = process.argv.slice(2);
assert.ok(pairsArg && (command === "split" || command === "merge"), "Usage: carry.mts split|merge <pairs dir> [batch size]");
const pairsDir = path.resolve(pairsArg);
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const baselineDir = path.join(root, "llm/releases/2026-10-30-suite-baseline-image/consistency/bible-web");
const identity = (p: ConsistencyPair) => [p.groupId, p.style, ...[p.left.sha256, p.right.sha256].sort()].join("|");
const key = read(path.join(pairsDir, "key.json")) as { pairs: ConsistencyPair[] };
const baseline = new Map((read(path.join(baselineDir, "key.json")).pairs as ConsistencyPair[]).map((p) => [identity(p), p.id]));
const carriedFrom = new Map(key.pairs.filter((p) => baseline.has(identity(p))).map((p) => [p.id, baseline.get(identity(p))!]));
// Images and groups are unchanged, so every judged baseline pair must reappear.
assert.equal(carriedFrom.size, baseline.size, "A baseline pair is missing from the new pairs");

if (command === "split") {
  const size = Number(sizeArg ?? 20);
  const blind = read(path.join(pairsDir, "pairs.json"));
  const fresh = (blind.pairs as Array<{ id: string }>).filter((p) => !carriedFrom.has(p.id));
  const batches = Math.ceil(fresh.length / size);
  fs.mkdirSync(path.join(pairsDir, "batches"), { recursive: true });
  fs.mkdirSync(path.join(pairsDir, "scores"), { recursive: true });
  for (let b = 0; b < batches; b++) {
    const pairs = fresh.slice(b * size, (b + 1) * size);
    fs.writeFileSync(path.join(pairsDir, "batches", `batch-${b + 1}.json`), JSON.stringify({ schemaVersion: 1, instructions: blind.instructions, pairs }, null, 2) + "\n");
  }
  fs.writeFileSync(path.join(dir, "carried.json"), JSON.stringify({ baseline: path.relative(root, baselineDir), carried: Object.fromEntries(carriedFrom), toScore: fresh.map((p) => p.id), batches, batchSize: size }, null, 2) + "\n");
  console.log(JSON.stringify({ pairs: key.pairs.length, carried: carriedFrom.size, toScore: fresh.length, batches }));
} else {
  const base = { a: pairScoreFileSchema.parse(read(path.join(baselineDir, "scorer-a.json"))), b: pairScoreFileSchema.parse(read(path.join(baselineDir, "scorer-b.json"))), operator: pairScoreFileSchema.parse(read(path.join(baselineDir, "operator.json"))) };
  const carried = (file: typeof base.a) => [...carriedFrom].flatMap(([id, from]) => file.scores.filter((s) => s.id === from).map((s) => ({ id, verdict: s.verdict, notes: `Baseline ${from}: ${s.notes}` })));
  const batchFiles = (side: string) => fs.readdirSync(path.join(pairsDir, "scores")).filter((f) => f.endsWith(`-${side}.json`)).sort()
    .flatMap((f) => pairScoreFileSchema.parse(read(path.join(pairsDir, "scores", f))).scores);
  for (const side of ["a", "b"] as const) {
    const scores = [...carried(base[side]), ...batchFiles(side)];
    fs.writeFileSync(path.join(dir, `scorer-${side}.json`), JSON.stringify({ scorer: `scorer-${side}`, scoredBeforeUnblinding: true, scores }, null, 2) + "\n");
  }
  const settled = fs.existsSync(path.join(dir, "operator-new.json")) ? pairScoreFileSchema.parse(read(path.join(dir, "operator-new.json"))).scores : [];
  fs.writeFileSync(path.join(dir, "operator.json"), JSON.stringify({ scorer: "operator", scoredBeforeUnblinding: true, scores: [...carried(base.operator), ...settled] }, null, 2) + "\n");
  console.log(JSON.stringify({ carried: carriedFrom.size, newA: batchFiles("a").length, newB: batchFiles("b").length, operator: carried(base.operator).length + settled.length }));
}
