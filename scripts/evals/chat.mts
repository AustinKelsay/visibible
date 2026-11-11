/**
 * Chat eval command (llm/workflow/CHAT_EVAL_AND_RELEASE.md; logic in src/lib/chat-evals.ts).
 *
 *   npm run evals:chat -- run --out <dir> --key-file <file> [--arms baseline,candidate] [--model <id>] [--label <name>]
 *       [--system-suffix <file>] [--budget-usd 0.25] [--concurrency 3] [--overwrite]
 *   npm run evals:chat -- run --out <dir> --dry-run
 *   npm run evals:chat -- pairs --out <dir> --a <results.ndjson> --a-arm <arm> --a-label <name>
 *       --b <results.ndjson> --b-arm <arm> --b-label <name> [--seed <text>] [--chunk 15]
 *   npm run evals:chat -- report --out <report dir> --runs <pairs dir>[,<pairs dir>…] --baseline <label> --candidate <label>
 *       --judge "<who scored and how>"
 *
 * `run` sends every case in evals/chat/cases.json through each arm and writes <out>/results.ndjson. It makes paid
 * OpenRouter calls unless --dry-run, which uses a fake model and placeholder Scripture and makes no network call.
 * --budget-usd stops starting calls whose worst case would pass the cap (they are recorded as skipped).
 * --system-suffix appends a file's text to the candidate's system prompt, to measure a prompt change before making it.
 * It refuses to replace existing results without --overwrite, and exits 1 if any case errored or was skipped.
 *
 * `pairs` writes blind pairs for scorers (<out>/pairs-N.json, 15 cases each) and the key (<out>/key.json), which
 * scorers must not see. Scorers follow evals/chat/scoring.md and write <out>/scores-N.json. `report` unblinds one or
 * more such folders (pooled; each keyed case must be scored once), writes <out>/report.json and prints the gate.
 * Every command writes a manifest (case set and runner identity, settings, inputs' hashes); `pairs` and `report`
 * refuse inputs made from a different case set.
 */
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { createOpenAI } from "@ai-sdk/openai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { LanguageModel } from "ai";
import { getChapter, type ChapterData, type Translation } from "@/lib/bible-api";
import { getChatModelPricing } from "@/lib/chat-models";
import {
  buildChatEvalPairs, chatEvalCasesSchema, chatPairScoresSchema, createBudget, rowCostUsd, runChatEvalCase, summarizeChatScores,
  type ChatEvalArm, type ChatEvalDeps, type ChatEvalRow, type ChatScoredRun, type TokenPricing,
} from "@/lib/chat-evals";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  out: { type: "string" }, "key-file": { type: "string" }, "dry-run": { type: "boolean", default: false },
  model: { type: "string", default: "openai/gpt-oss-120b" }, label: { type: "string" },
  arms: { type: "string", default: "baseline,candidate" }, cases: { type: "string", default: path.join(root, "evals/chat/cases.json") },
  concurrency: { type: "string", default: "3" }, overwrite: { type: "boolean", default: false },
  "context-length": { type: "string" }, runs: { type: "string" }, judge: { type: "string" }, "system-suffix": { type: "string" }, "budget-usd": { type: "string" },
  a: { type: "string" }, "a-arm": { type: "string" }, "a-label": { type: "string" },
  b: { type: "string" }, "b-arm": { type: "string" }, "b-label": { type: "string" },
  seed: { type: "string", default: "chat" }, chunk: { type: "string", default: "15" },
  baseline: { type: "string" }, candidate: { type: "string" },
} });
const command = positionals[0];
if (!values.out || !["run", "pairs", "report"].includes(command)) throw new Error("Usage: npm run evals:chat -- run|pairs|report --out <dir> …");
const out = path.resolve(values.out);
await mkdir(out, { recursive: true });
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const readRows = async (file: string) => (await readFile(file, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as ChatEvalRow);
const casesText = await readFile(values.cases!, "utf8");
const caseSet = chatEvalCasesSchema.parse(JSON.parse(casesText));
const cases = caseSet.cases;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const git = (...args: string[]) => { try { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); } catch { return null; } };
const identity = {
  cases: { file: path.relative(root, values.cases!), version: caseSet.version, sha256: sha256(casesText) },
  runner: { commit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain", "--", "scripts/evals/chat.mts", "src/lib/chat-evals.ts", "src/lib/chat-request.ts")) },
};
const writeManifest = (dir: string, manifest: Record<string, unknown>) =>
  writeFile(path.join(dir, "manifest.json"), `${JSON.stringify({ command, ...identity, ...manifest }, null, 1)}\n`);
/** The case set a results or pairs folder was made from; folders from before manifests existed are accepted as unknown. */
async function checkCases(dir: string) {
  const file = path.join(dir, "manifest.json");
  if (!existsSync(file)) return null;
  const manifest = await readJson(file);
  if (manifest.cases?.sha256 !== identity.cases.sha256) throw new Error(`${dir} was made from a different case set (${manifest.cases?.sha256})`);
  return { dir: path.relative(root, dir), sha256: sha256(await readFile(file, "utf8")) };
}

if (command === "run") await run();
if (command === "pairs") await pairs();
if (command === "report") await report();

async function run() {
  const resultsFile = path.join(out, "results.ndjson");
  if (existsSync(resultsFile) && !values.overwrite) {
    throw new Error(`${resultsFile} exists; its answers were paid for. Use a new --out, or pass --overwrite.`);
  }
  const model = values.model!;
  const arms = values.arms!.split(",").map((arm) => arm.trim()) as ChatEvalArm[];
  if (arms.some((arm) => arm !== "baseline" && arm !== "candidate")) throw new Error("--arms takes baseline and/or candidate");
  const systemSuffix = values["system-suffix"] ? (await readFile(values["system-suffix"], "utf8")).trim() : undefined;

  let deps: ChatEvalDeps;
  let pricing: TokenPricing = { promptUsd: 0, completionUsd: 0 };
  // Production bounds history and output by the model's catalog context window; so does the eval, unless overridden.
  let contextLength = values["context-length"] ? Number(values["context-length"]) : 131072;
  let baselineMaxOutputTokens: number | undefined;
  if (values["dry-run"]) {
    deps = { languageModel: fakeModel(), chapters: placeholderChapter };
  } else {
    if (!values["key-file"]) throw new Error("--key-file is required unless --dry-run");
    const apiKey = (await readFile(values["key-file"], "utf8")).trim();
    const openRouter = createOpenAI({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey });
    const listed = await listModel(model);
    pricing = listed.pricing;
    baselineMaxOutputTokens = listed.maxCompletionTokens;
    if (!values["context-length"]) {
      const catalog = await getChatModelPricing(model, apiKey);
      if (!catalog?.contextLength) throw new Error(`${model} is not in the chat catalog; pass --context-length to measure it anyway`);
      contextLength = catalog.contextLength;
    }
    const memo = new Map<string, Promise<ChapterData | null>>();
    deps = {
      languageModel: openRouter.chat(model),
      chapters: (slug, chapter, translation) => {
        const key = `${slug}-${chapter}-${translation}`;
        if (!memo.has(key)) memo.set(key, getChapter(slug, chapter, translation));
        return memo.get(key)!;
      },
      stats: (id) => generationStats(apiKey, id),
    };
  }
  const budget = values["budget-usd"] ? createBudget(Number(values["budget-usd"]), pricing) : undefined;
  deps.budget = budget;
  const settings = { model, arms, label: values.label ?? null, dryRun: values["dry-run"], contextLength, baselineMaxOutputTokens: baselineMaxOutputTokens ?? null,
    systemSuffix: systemSuffix ? { file: values["system-suffix"], sha256: sha256(systemSuffix), text: systemSuffix } : null,
    budgetUsd: values["budget-usd"] ? Number(values["budget-usd"]) : null, pricing, startedAt: new Date().toISOString() };
  await writeManifest(out, settings);

  const jobs = cases.flatMap((item) => arms.map((arm) => ({ item, arm })));
  let next = 0;
  let failures = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { item, arm } = jobs[next++];
      const row: ChatEvalRow = await runChatEvalCase(item, arm, deps, { model, systemSuffix, contextLength, baselineMaxOutputTokens });
      if (values.label) row.label = values.label;
      if (row.status === "error" || row.status === "skipped") failures++;
      await appendFile(resultsFile, `${JSON.stringify(row)}\n`);
      console.log(`${item.id} ${arm}: ${row.status}${row.finishReason ? ` ${row.finishReason} out=${row.outputTokens}` : ""}${row.error ? ` ${row.error}` : ""}`);
    }
  };
  await writeFile(resultsFile, "");
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
  const rows = await readRows(resultsFile);
  const spentUsd = rows.reduce((sum, row) => sum + (row.status === "answered" || row.status === "error" ? rowCostUsd(row, pricing) : 0), 0);
  await writeManifest(out, { ...settings, finishedAt: new Date().toISOString(), rows: rows.length, failures, spentUsd, budgetCountedUsd: budget?.spentUsd ?? null });
  console.log(`spent about $${spentUsd.toFixed(4)}${budget ? ` (budget counted $${budget.spentUsd.toFixed(4)})` : ""}`);
  if (failures > 0) {
    console.error(`${failures} of ${jobs.length} runs errored or were skipped; their rows are in ${resultsFile}. Rerun them into a new --out.`);
    process.exitCode = 1;
  }
}

async function pairs() {
  for (const name of ["a", "a-arm", "a-label", "b", "b-arm", "b-label"] as const) {
    if (!values[name]) throw new Error(`pairs needs --${name}`);
  }
  const side = async (file: string, arm: string, label: string) => ({ label, rows: (await readRows(file)).filter((row) => row.arm === arm) });
  const { pairs: all, key } = buildChatEvalPairs(cases,
    await side(values.a!, values["a-arm"]!, values["a-label"]!),
    await side(values.b!, values["b-arm"]!, values["b-label"]!),
    values.seed!);
  const size = Number(values.chunk);
  for (let index = 0; index * size < all.length; index++) {
    await writeFile(path.join(out, `pairs-${index + 1}.json`), `${JSON.stringify(all.slice(index * size, (index + 1) * size), null, 1)}\n`);
  }
  await writeFile(path.join(out, "key.json"), `${JSON.stringify(key, null, 1)}\n`);
  const rubric = await readFile(path.join(root, "evals/chat/scoring.md"), "utf8");
  await writeManifest(out, {
    seed: values.seed, chunk: size, rubric: { file: "evals/chat/scoring.md", sha256: sha256(rubric) },
    a: { results: path.relative(root, path.resolve(values.a!)), arm: values["a-arm"], label: values["a-label"], manifest: await checkCases(path.dirname(path.resolve(values.a!))) },
    b: { results: path.relative(root, path.resolve(values.b!)), arm: values["b-arm"], label: values["b-label"], manifest: await checkCases(path.dirname(path.resolve(values.b!))) },
    keySha256: sha256(await readFile(path.join(out, "key.json"), "utf8")),
  });
  console.log(`${all.length} pairs in ${Math.ceil(all.length / size)} files; key.json is for the report only`);
}

async function report() {
  if (!values.baseline || !values.candidate) throw new Error("report needs --baseline and --candidate labels");
  if (!values.judge) throw new Error('report needs --judge "<who scored and how>", recorded with the result');
  const dirs = (values.runs ?? out).split(",").map((dir) => path.resolve(dir.trim()));
  const runs: ChatScoredRun[] = [];
  const inputs = [];
  for (const dir of dirs) {
    const keyText = await readFile(path.join(dir, "key.json"), "utf8");
    const files = (await readdir(dir)).filter((file) => /^scores-\d+\.json$/.test(file)).sort();
    if (files.length === 0) throw new Error(`no scores-N.json in ${dir}`);
    const texts = await Promise.all(files.map((file) => readFile(path.join(dir, file), "utf8")));
    runs.push({ run: path.relative(root, dir), key: JSON.parse(keyText), scores: texts.flatMap((text) => chatPairScoresSchema.parse(JSON.parse(text))) });
    inputs.push({ dir: path.relative(root, dir), pairsManifest: await checkCases(dir), keySha256: sha256(keyText),
      scores: files.map((file, index) => ({ file, sha256: sha256(texts[index]) })) });
  }
  const summary = summarizeChatScores(runs, { baseline: values.baseline, candidate: values.candidate });
  await writeFile(path.join(out, "report.json"), `${JSON.stringify({ ...identity, judge: values.judge, inputs, ...summary }, null, 1)}\n`);
  console.log(JSON.stringify({ baseline: summary.baseline.overall, candidate: summary.candidate.overall, means: { baseline: summary.baseline.means, candidate: summary.candidate.means }, preferred: summary.preferred, gate: summary.gate }, null, 1));
}

/** List price and the largest answer the model allows, from OpenRouter's catalog. */
async function listModel(model: string): Promise<{ pricing: TokenPricing; maxCompletionTokens: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  const { data } = await response.json() as { data: Array<{ id: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; top_provider?: { max_completion_tokens?: number | null } }> };
  const entry = data.find((item) => item.id === model);
  if (!entry?.pricing?.prompt || !entry.pricing.completion) throw new Error(`${model} has no OpenRouter pricing`);
  return {
    pricing: { promptUsd: Number(entry.pricing.prompt), completionUsd: Number(entry.pricing.completion) },
    maxCompletionTokens: entry.top_provider?.max_completion_tokens ?? entry.context_length ?? 131072,
  };
}

/** OpenRouter's record of a call: which provider served it and what it cost. Available a moment after the call. */
async function generationStats(apiKey: string, id: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (response.ok) {
      const { data } = await response.json() as { data: { provider_name?: string; total_cost?: number } };
      return { provider: data.provider_name ?? null, costUsd: data.total_cost ?? null };
    }
  }
  return { provider: null, costUsd: null };
}

function fakeModel(): LanguageModel {
  return new MockLanguageModelV3({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: "Dry run answer." },
      { type: "text-end", id: "answer" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 },
      } },
    ] }) }),
  });
}

async function placeholderChapter(slug: string, chapter: number, translation: Translation): Promise<ChapterData> {
  return {
    bookId: slug, bookName: slug, chapter, translationId: translation, translationName: translation,
    verses: Array.from({ length: 200 }, (_, index) => ({ bookId: slug, bookName: slug, chapter, verse: index + 1, text: `Placeholder text of ${slug} ${chapter}:${index + 1}.` })),
  };
}
