/** Independent model judgments for the fixed identity diagnostic. Never generates or repairs an image. */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs, parseEnv } from "node:util";
import assert from "node:assert/strict";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { readWorkInputs } from "../../src/lib/engine/work-inputs";
import { createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog } from "../../src/lib/image-evals/suite-run";

const root = path.resolve(import.meta.dirname, "../..");
const run = "2026-10-30-identity-visuals";
const dir = path.join(root, "llm/releases", run);
const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const read = <T,>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
const save = (file: string, data: unknown) => writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + "\n");
const { values } = parseArgs({ options: { prepare: { type: "boolean" }, scorer: { type: "string" }, execute: { type: "boolean" } } });
type Attempt = { n: number; file: string; sha256: string };
type Row = { caseId: string; work: string; case: string; style: string; outcome: string; context: { moment: { text: string } }; attempts?: Attempt[]; chosen?: number };
type Item = { id: string; kind: "image" | "pair"; question: string; images: Attempt[]; cases: string[]; category: string; chosen?: boolean };
const inputFiles = ["images-results.ndjson", "images-remaining-results.ndjson", "plan.json"];
const rows = inputFiles.slice(0, 2).flatMap(file => readFileSync(path.join(dir, file), "utf8").trim().split("\n").map(s => JSON.parse(s) as Row));
assert.equal(rows.length, 45);
assert.equal(new Set(rows.map(r => r.caseId)).size, 45);
const plan = read<{ conditions: Array<{ id: string; work: string }>; scenes: Array<{ id: string; work: string }> }>("plan.json");
const answer = z.enum(["yes", "no", "uncertain"]);
const imageSchema = z.object({ sourceFaithful: answer, unsupportedProps: answer, stateCorrect: answer, styleAdherent: answer, artifactFree: answer, distinctiveAdaptation: answer, notes: z.string() }).strict();
const pairSchema = z.object({ identity: z.enum(["same", "different", "unclear"]), notes: z.string() }).strict();
if (values.prepare) {
  assert.ok(!existsSync(path.join(dir, "scoring-items.json")), "Do not replace the scoring packet");
  const works = new Map(await Promise.all(["alice-in-wonderland", "bible-web"].map(async id => [id, await readWorkInputs(id, root)] as const)));
  const items: Item[] = [];
  for (const row of rows) {
    const work = works.get(row.work)!;
    const unit = work.work.getUnit(row.case);
    const source = work.work.units.filter(u => u.divisionId === unit.divisionId).map(u => u.text).join("\n");
    const question = `Judge this illustration against the focal source and its chapter context, not an inferred scene plan. Return the requested JSON and concise visual evidence. A moment can depict any coherent instant in its focal text; it need not show every event or person. Explicit source facts and changing state outrank recurring appearance. Do not penalize plausible unspecified clothing, composition or invented background detail unless it changes events or contradicts the source.\nsourceFaithful: yes if the depicted instant preserves the focal action and facts; no for a material contradiction. unsupportedProps: yes for a conspicuous plot-specific object from another episode, not ordinary background dressing. stateCorrect: yes if age, size, condition and clothing fit this instant, no for a contradiction. styleAdherent: yes if the requested medium is visible. artifactFree: no for visible writing, accidental border/bare margin, malformed anatomy or geometry; scene framing such as a doorway is allowed. distinctiveAdaptation: yes only for a recognizable borrowed fictional adaptation design, not a generic dress color or pinafore; do not identify real people. Use uncertain when visual evidence cannot resolve a judgment.\nFOCAL SOURCE:\n${row.context.moment.text}\nCHAPTER CONTEXT (not all events belong in the picture):\n${source}\nART STYLE:\n${JSON.stringify(work.styles[row.style].style)}`;
    for (const attempt of row.attempts ?? []) items.push({ id: "", kind: "image", question, images: [attempt], cases: [row.caseId], category: "fidelity", chosen: row.chosen === attempt.n });
  }
  const pair = (a: string, b: string, category: string) => {
    const left = rows.find(r => r.caseId === a)!, right = rows.find(r => r.caseId === b)!;
    assert.ok(left && right);
    const images = [left, right].flatMap(r => r.attempts?.filter(i => i.n === r.chosen) ?? []);
    const target = left.work === "bible-web" ? "Peter" : "the White Rabbit";
    items.push({ id: "", kind: "pair", cases: [a, b], category, images,
      question: `Compare the LEFT and RIGHT illustrations for recurring identity of ${target}. Return same, different, or unclear with visual evidence. Require the target to be clearly identifiable in BOTH images. Absence, tiny or hidden face, ambiguous assignment among several figures, or missing image means unclear, never same. Do not infer identity from the name or white fur alone: compare distinguishing face/head/body proportions and compatible design. Ignore rendering medium, camera, expression, legitimate action/wardrobe changes, and source-required size changes. Do not score setting or lighting consistency. LEFT focal source: ${left.context.moment.text}\nRIGHT focal source: ${right.context.moment.text}` });
  };
  for (const c of plan.conditions) {
    const scenes = plan.scenes.filter(s => s.work === c.work);
    for (const s of scenes) for (let a = 1; a <= 3; a++) for (let b = a + 1; b <= 3; b++) pair(`${c.id}-${s.id}-${a}`, `${c.id}-${s.id}-${b}`, "same-scene");
    for (let a = 0; a < scenes.length; a++) for (let b = a + 1; b < scenes.length; b++) for (let n = 1; n <= 3; n++) pair(`${c.id}-${scenes[a].id}-${n}`, `${c.id}-${scenes[b].id}-${n}`, "cross-scene");
  }
  for (const c of ["alice-theme", "alice-model"]) for (const s of plan.scenes.filter(s => s.work === "alice-in-wonderland")) for (let n = 1; n <= 3; n++) pair(`alice-candidate-${s.id}-${n}`, `${c}-${s.id}-${n}`, c);
  // Deterministic shuffle; labels, model names, conditions and prior judgments are not sent to scorers.
  items.sort((a, b) => hash(JSON.stringify(a.cases) + a.images[0]?.file).localeCompare(hash(JSON.stringify(b.cases) + b.images[0]?.file)));
  items.forEach((item, i) => item.id = `v${String(i + 1).padStart(3, "0")}`);
  assert.equal(items.filter(i => i.kind === "pair").length, 108);
  for (const item of items) for (const image of item.images) assert.equal(hash(readFileSync(path.join(root, image.file))), image.sha256);
  save("scoring-items.json", items);
  save("scoring-plan.json", { capUsd: 0.75, perScorerCapUsd: 0.375, operationCapUsd: 6, readerReserveUsd: 5, model: "anthropic/claude-haiku-5.5", passes: ["a", "b"], items: items.length, images: items.filter(i => i.kind === "image").length, pairs: 108, missingImagePairs: items.filter(i => i.kind === "pair" && i.images.length !== 2).length, caveat: "Independent calls without shared answers; same model, correlated errors possible. Model judgments, not human acceptance. Root review is unblinded. Criteria finalized after unblinded inspection of plans, reference sheets and contact sheets, before these scoring calls.", files: Object.fromEntries([...inputFiles, "scoring-items.json"].map(f => [f, hash(readFileSync(path.join(dir, f)))])) });
  console.log(`Prepared ${items.length} judgments per scorer.`);
} else {
  assert.ok(values.execute && ["a", "b"].includes(values.scorer ?? ""), "Use --prepare or --execute --scorer a|b");
  const scorer = values.scorer!, prefix = `score-${scorer}`;
  assert.ok(!existsSync(path.join(dir, `${prefix}-started.json`)), "Do not reroll scorer answers");
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit scoring contract before paid calls");
  const scoring = read<{ perScorerCapUsd: number; operationCapUsd: number; readerReserveUsd: number; model: string; files: Record<string, string> }>("scoring-plan.json");
  for (const [file, expected] of Object.entries(scoring.files)) assert.equal(hash(readFileSync(path.join(dir, file))), expected);
  assert.ok(existsSync(path.join(dir, "images-remaining-finished.json")), "Rendering must have closed before reallocating unused allowance");
  const prior = ["canon", "references", "text", "images", "images-remaining", ...(scorer === "b" ? ["score-a"] : [])];
  const spent = prior.reduce((n, phase) => { const ledger = read<{ measuredUsd: number; uncertainUsd: number }>(`${phase}-ledger.json`); return n + ledger.measuredUsd + ledger.uncertainUsd; }, 0);
  assert.ok(spent + scoring.perScorerCapUsd * (scorer === "a" ? 2 : 1) <= scoring.operationCapUsd);
  if (scorer === "b") assert.ok(existsSync(path.join(dir, "score-a-finished.json")));
  const env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE!, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  const apiKey = env.OPENROUTER_API_KEY; assert.ok(apiKey);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const [credits, key] = await Promise.all(["credits", "key"].map(async endpoint => (await (await fetch(`https://openrouter.ai/api/v1/${endpoint}`, { headers })).json()).data));
  const remaining = scoring.perScorerCapUsd * (scorer === "a" ? 2 : 1);
  assert.ok(credits.total_credits - credits.total_usage >= remaining + scoring.readerReserveUsd);
  assert.ok(key.limit_remaining === null || key.limit_remaining >= remaining + 1);
  const catalog = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data;
  const price = modelPricing(catalog.find((m: { id: string }) => m.id === scoring.model)); assert.ok(price);
  const scriptHash = hash(readFileSync(import.meta.filename));
  save(`${prefix}-started.json`, { at: new Date().toISOString(), spentIncludingUncertainUsd: spent, capUsd: scoring.perScorerCapUsd, scriptHash, inputs: scoring.files, price });
  const ledger = createLedger({ capUsd: scoring.perScorerCapUsd, reserves: { text: 0, image: 0, check: 0.005 }, limits: { text: 0, image: 0, check: 250 }, fetch: (u, i) => fetch(u, i), ceiling: (kind, req) => requestCeilingUsd(kind, req, price), save: s => save(`${prefix}-ledger.json`, s), log: e => appendFileSync(path.join(dir, `${prefix}-provider.ndjson`), JSON.stringify(e) + "\n"), scrub: v => scrubForLog(v, apiKey, hash) });
  const items = read<Item[]>("scoring-items.json");
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < items.length && !ledger.state.blocked) {
      const item = items[cursor++];
      if (item.kind === "pair" && item.images.length !== 2) {
        appendFileSync(path.join(dir, `${prefix}-answers.ndjson`), JSON.stringify({ id: item.id, value: { identity: "unclear", notes: "A scheduled image failed; no visual pair exists." }, automaticMissing: true }) + "\n"); continue;
      }
      const buffers = item.images.map(i => { const b = readFileSync(path.join(root, i.file)); assert.equal(hash(b), i.sha256); return b; });
      let bytes = buffers[0];
      if (item.kind === "pair") {
        const sizes = await Promise.all(buffers.map(b => sharp(b).metadata()));
        bytes = await sharp({ create: { width: sizes[0].width! + sizes[1].width!, height: Math.max(sizes[0].height!, sizes[1].height!), channels: 3, background: "#555555" } }).composite([{ input: buffers[0], left: 0, top: 0 }, { input: buffers[1], left: sizes[0].width!, top: 0 }]).jpeg({ quality: 95 }).toBuffer();
      }
      const checker = createOpenRouterVisionChecker({ apiKey, model: scoring.model, fetch: ledger.fetchFor("check", () => `${scorer}/${item.id}`), reasoningEffort: "low", maxTokens: 1500 });
      const schema: z.ZodType<unknown> = item.kind === "pair" ? pairSchema : imageSchema;
      const result = await checker.check({ label: item.id, question: item.question, schema, image: { bytes, mimeType: "image/jpeg" } });
      appendFileSync(path.join(dir, `${prefix}-answers.ndjson`), JSON.stringify({ id: item.id, ...result }) + "\n");
    }
  }));
  assert.equal(ledger.state.blocked, null);
  assert.equal(hash(readFileSync(import.meta.filename)), scriptHash);
  const answers = readFileSync(path.join(dir, `${prefix}-answers.ndjson`), "utf8").trim().split("\n").map(s => JSON.parse(s));
  assert.equal(new Set(answers.map(a => a.id)).size, items.length);
  save(`${prefix}-finished.json`, { at: new Date().toISOString(), answers: answers.length, measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd });
  console.log(`${scorer}: ${answers.length} judgments, $${ledger.state.measuredUsd}`);
}
