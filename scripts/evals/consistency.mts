/**
 * Consistency evaluation command (ADR 0008): blind pairs of shown images that should agree, judged by two independent
 * scorers, settled by an operator and checked against the consistency part of the launch bar. It makes no model calls.
 *
 *   npm run evals:consistency -- pairs --results <results.ndjson>[,<results.ndjson>] --out <dir> [--images-root <dir>]
 *   npm run evals:consistency -- report --out <dir> --scores <a.json>,<b.json> --styles <released styles> [--operator <file>] [--baseline <report.json>]
 *
 * `pairs` reads launch-matrix results (one row per case and style) with the `snapshot.json` beside each, which gives
 * every case's canon stages, checks every paired image against its recorded SHA-256 and writes <out>/pairs.json (what scorers see), <out>/key.json (what they must not see) and
 * <out>/composites/<pair>.jpg (left and right side by side). Image paths in the results resolve against --images-root,
 * this checkout by default. `report` settles the scorers' verdicts, writes <out>/report.json and prints the gate;
 * --styles names the released styles the gate pools, so an owner-only style never counts toward a release, and
 * --baseline the previous measurement it must not fall below. Scoring instructions: evals/images/consistency-scoring.md.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import {
  CONSISTENCY_KINDS, blindPairs, buildConsistencyPairs, evaluateConsistencyGate, loadConsistencyGroups, pairScoreFileSchema,
  settleVerdicts, shownImagesFromResults, stagesFromSnapshot, summarizeConsistency, versesNotRun, type ConsistencyKind, type ConsistencyPair, type GroupCoverage, type Tally,
} from "@/lib/image-evals/consistency";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  results: { type: "string" }, "images-root": { type: "string", default: root }, out: { type: "string" },
  groups: { type: "string", default: path.join(root, "evals/images/consistency.json") }, seed: { type: "string", default: "consistency" },
  scores: { type: "string" }, operator: { type: "string" }, styles: { type: "string" }, baseline: { type: "string" },
} });
const command = positionals[0];
if (!values.out || (command !== "pairs" && command !== "report")) throw new Error("Usage: npm run evals:consistency -- pairs|report --out <dir> …");
const out = path.resolve(values.out);
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const list = (value: string | undefined) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const write = (file: string, data: unknown) => writeFile(path.join(out, file), `${JSON.stringify(data, null, 2)}\n`);

type Key = {
  schemaVersion: 1; seed: string; groups: { file: string; sha256: string }; sources: Array<{ file: string; sha256: string }>;
  notRun: Record<ConsistencyKind, string[]>; coverage: GroupCoverage[]; pairs: ConsistencyPair[];
};

/** Left and right at the same height with a grey gap, so a scorer judges one picture per pair. */
async function composite(left: Buffer, right: Buffer, file: string) {
  const height = 640, gap = 24;
  const [a, b] = await Promise.all([left, right].map((bytes) => sharp(bytes).resize({ height }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true })));
  await sharp({ create: { width: a.info.width + gap + b.info.width, height, channels: 3, background: "#808080" } })
    .composite([{ input: a.data, left: 0, top: 0 }, { input: b.data, left: a.info.width + gap, top: 0 }])
    .jpeg({ quality: 88 }).toFile(file);
}

/** The snapshot beside a run's results; a suite image run (ADR 0011) uses the snapshot of the text run its plan names. */
async function snapshotBeside(results: string): Promise<string> {
  const dir = path.dirname(results);
  const beside = path.join(dir, "snapshot.json");
  if (existsSync(beside)) return beside;
  const plan = existsSync(path.join(dir, "plan.json")) ? JSON.parse(await readFile(path.join(dir, "plan.json"), "utf8")) as { from?: string | null } : {};
  if (!plan.from) throw new Error(`No snapshot.json beside ${results}, and its plan names no text run`);
  return path.join(path.dirname(dir), plan.from, "snapshot.json");
}

async function pairs() {
  const resultFiles = list(values.results);
  if (!resultFiles.length) throw new Error("pairs needs --results");
  const groupsText = await readFile(values.groups!, "utf8");
  const groups = loadConsistencyGroups(JSON.parse(groupsText));
  const sources: Key["sources"] = [];
  const images = [];
  const attempted = new Set<string>();
  for (const file of resultFiles) {
    const text = await readFile(file, "utf8");
    const snapshotFile = await snapshotBeside(file);
    const snapshotText = await readFile(snapshotFile, "utf8");
    sources.push({ file: path.relative(root, path.resolve(file)), sha256: sha256(text) }, { file: path.relative(root, path.resolve(snapshotFile)), sha256: sha256(snapshotText) });
    const rows = text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as { case: string });
    for (const row of rows) attempted.add(row.case);
    images.push(...shownImagesFromResults(rows, stagesFromSnapshot(JSON.parse(snapshotText))));
  }
  const built = buildConsistencyPairs(groups, images, values.seed);
  await mkdir(path.join(out, "composites"), { recursive: true });
  const bytes = new Map<string, Buffer>();
  const load = async (side: ConsistencyPair["left"]) => {
    if (!bytes.has(side.file)) {
      const data = await readFile(path.resolve(values["images-root"]!, side.file));
      if (sha256(data) !== side.sha256) throw new Error(`${side.file} does not match its recorded SHA-256`);
      bytes.set(side.file, data);
    }
    return bytes.get(side.file)!;
  };
  for (const pair of built.pairs) await composite(await load(pair.left), await load(pair.right), path.join(out, "composites", `${pair.id}.jpg`));
  const notRun = versesNotRun(groups, attempted);
  const key: Key = { schemaVersion: 1, seed: values.seed!, groups: { file: path.relative(root, path.resolve(values.groups!)), sha256: sha256(groupsText) }, sources, notRun, coverage: built.coverage, pairs: built.pairs };
  await write("key.json", key);
  await write("pairs.json", { schemaVersion: 1, instructions: "evals/images/consistency-scoring.md", pairs: blindPairs(built.pairs, (id) => `composites/${id}.jpg`) });
  console.log(`${built.pairs.length} pairs from ${images.length} shown images in ${out}`);
  for (const kind of CONSISTENCY_KINDS) if (notRun[kind].length) console.log(`  ${kind} verses never run: ${notRun[kind].join(", ")}`);
  for (const row of built.coverage) console.log(`  ${row.groupId.padEnd(24)} ${row.style.padEnd(11)} ${row.imaged}/${row.units} imaged, ${row.eligible.length} eligible, ${row.pairs} pairs${row.otherStage ? `, ${row.otherStage} left out for another stage` : ""}`);
}

const show = (tally: Tally) => `${tally.rate === null ? "  –" : `${String(Math.round(tally.rate * 100)).padStart(3)}%`} same of ${tally.same + tally.different} decided (${tally.unclear} unclear, ${tally.disputed} disputed)`;

async function report() {
  const key = (await readJson(path.join(out, "key.json"))) as Key;
  const scorers = await Promise.all(list(values.scores).map(async (file) => pairScoreFileSchema.parse(await readJson(file))));
  const operator = values.operator ? pairScoreFileSchema.parse(await readJson(values.operator)) : undefined;
  const settled = settleVerdicts(key.pairs.map((pair) => pair.id), scorers, operator);
  const styles = list(values.styles);
  if (!styles.length) throw new Error("report needs --styles <released styles>: the gate pools only released styles");
  const previous = values.baseline ? await readJson(values.baseline) as { gate: { checks: Array<{ kind: ConsistencyKind; tally: Tally }> } } : null;
  const baseline = Object.fromEntries((previous?.gate.checks ?? []).map((check) => [check.kind, check.tally.rate]));
  const summary = summarizeConsistency(key.pairs, settled.verdicts);
  const gate = evaluateConsistencyGate(key.pairs, settled.verdicts, styles, { baseline, notRun: key.notRun });
  await write("report.json", {
    schemaVersion: 1, groups: key.groups, sources: key.sources, baseline: values.baseline ? path.relative(root, path.resolve(values.baseline)) : null,
    scorers: scorers.map((file) => file.scorer), operator: operator?.scorer ?? null, unanimous: settled.unanimous, disputed: settled.disputed,
    notRun: key.notRun, coverage: key.coverage, verdicts: settled.verdicts, summary, gate,
  });
  console.log(`${key.pairs.length} pairs; ${settled.unanimous} unanimous, ${settled.disputed.length} disputed${operator ? " and settled" : ""}`);
  for (const kind of CONSISTENCY_KINDS) {
    console.log(`${kind}: ${show(summary[kind].overall)}`);
    for (const [style, tally] of Object.entries(summary[kind].byStyle)) console.log(`  ${style.padEnd(11)} ${show(tally)}`);
  }
  console.log(`Gate (${gate.barVersion}, pooling ${gate.styles.join(", ")}): ${gate.pass ? "pass" : "fail"}`);
  for (const check of gate.checks) console.log(`  ${check.kind}: ${check.pass ? "pass" : check.reasons.join("; ")}`);
}

await (command === "pairs" ? pairs() : report());
