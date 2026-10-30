/**
 * The image regression suite (ADR 0011): one committed runner for every measurement, so a release folder holds a
 * run's data and never its own copy of the code. Each step refuses to overwrite what an earlier step wrote.
 *
 *   npm run evals:suite -- plan --run <name> --tier text [--cap <usd>]
 *   npm run evals:suite -- plan --run <name> --tier image --from <text run> [--cap <usd>]
 *   npm run evals:suite -- snapshot --run <text run>
 *   npm run evals:suite -- run --run <name> --offline
 *   npm run evals:suite -- run --run <name> --execute
 *   npm run evals:suite -- blind --run <name> [--batches <n>]
 *   npm run evals:suite -- report --run <name> --scores <a>[,<a2>…],<b>[,…] [--operator <file>] [--baseline <run>]
 *
 * `plan` writes llm/releases/<run>/plan.json with the cases, pipeline versions, estimate and the cap the owner is
 * asked to fund. `snapshot` reads each work's analysis once, read-only, from production (Bible, Holmes) or from its
 * committed fixture (Alice), with the reference images production would attach; an image run reuses its text run's
 * snapshot and draws the plans that run stored. `run --offline` rehearses with scripted replies into a temporary
 * folder; `run --execute` needs a committed `funding.json` and a clean checkout, then ledgers every paid call.
 * `blind` writes scorer packs without case, style or split; `report` settles two scorers (and the operator's rulings),
 * summarizes by fault, work, style and split, and with --baseline applies the per-fault gate on holdout items.
 *
 * Paid runs read OPENROUTER_API_KEY, and snapshots NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET, from the private
 * env file named by VISIBIBLE_EVAL_ENV_FILE. Images and reference blobs stay under evals/images/runs/<run> (ignored).
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { contentVersion } from "../../convex/_helpers/contentVersion";
import { loadEvalCases } from "@/lib/image-evals/cases";
import {
  evaluateSuiteGate, faultsFor, loadFaults, loadSuiteConfig, operatorFileSchema, scoreFileSchema, scoringInstructions, settleScores, suiteCases, summarizeBy,
  drawFraction, type JudgedItem, type ScoreFile, type SuiteCase, type SuiteTier,
} from "@/lib/image-evals/suite";
import { createLedger, runSuite, scrubForLog, type SuiteWork } from "@/lib/image-evals/suite-run";
import { createOfflineOpenRouter } from "@/lib/image-evals/suite-offline";
import { createOpenRouterEvalImageProvider } from "@/lib/image-evals/adapters";
import { listAnalysisRecords } from "@/lib/engine/analysis-records";
import type { ReferenceRecord } from "@/lib/engine/assemble";
import type { AnalysisRecord } from "@/lib/engine/preparation";
import { FORMLESS_LOOK_PROMPT_VERSION, FORMLESS_PLAN_PROMPT_VERSION, MOMENT_CAST_PROMPT_VERSION } from "@/lib/engine/preparation";
import { PLAN_REVIEW_PROMPT_VERSION } from "@/lib/engine/plan-review";
import { GENERIC_PROMPT_VERSION } from "@/lib/engine/prompt";
import { SCENE_CHECK_VERSION } from "@/lib/engine/scene-check";
import { createOpenRouterVisionChecker } from "@/lib/engine/reference-adapters";
import { momentForUnit, readWorkInputs, type WorkInputs } from "@/lib/engine/work-inputs";
import { createOpenRouterTextModel, READING_PASS_MODEL } from "@/lib/reading-pass/model";
import { DEFAULT_ASPECT_RATIO, DEFAULT_IMAGE_MODEL, DEFAULT_RESOLUTION } from "@/lib/image-models";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  run: { type: "string" }, tier: { type: "string" }, from: { type: "string" }, cap: { type: "string" },
  execute: { type: "boolean", default: false }, offline: { type: "boolean", default: false },
  batches: { type: "string", default: "1" }, scores: { type: "string" }, operator: { type: "string" }, baseline: { type: "string" },
} });
const command = positionals[0];
if (!values.run || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.run)) throw new Error("Usage: npm run evals:suite -- plan|snapshot|run|blind|report --run <kebab-case name> …");
const runDir = path.join(root, "llm/releases", values.run);
const blobDir = path.join(root, "evals/images/runs", values.run);
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const saveOnce = (file: string, data: unknown) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
const ndjson = (file: string) => existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const config = loadSuiteConfig(readJson(path.join(root, "evals/images/suite.json")));
const faults = loadFaults(readJson(path.join(root, "evals/images/faults.json")));
const allCases = loadEvalCases(readJson(path.join(root, "evals/images/cases.json")));
const PIPELINE = { momentCast: MOMENT_CAST_PROMPT_VERSION, formlessPlan: FORMLESS_PLAN_PROMPT_VERSION, formlessLook: FORMLESS_LOOK_PROMPT_VERSION,
  review: PLAN_REVIEW_PROMPT_VERSION, rendering: GENERIC_PROMPT_VERSION, sceneCheck: SCENE_CHECK_VERSION, textModel: READING_PASS_MODEL };
/** Measured on the 28–29 October matrices: text calls, image calls (retries included) and check calls. */
const ESTIMATE = { textCallUsd: 0.0005, textCallsPerCase: 3.5, imageUsd: 0.0342, retryShare: 0.15, checkUsd: 0.0003 };
const RESERVE = { text: 0.005, image: 0.06, check: 0.002 };
/** The eval key shares the production account's balance; a run must leave this much for readers. */
const PRODUCTION_HEADROOM_USD = 5;
/** Everything a paid run's result depends on, hashed into run-started.json and required to be committed. */
const SHARED_SOURCES = ["src/lib/engine/preparation.ts", "src/lib/engine/assemble.ts", "src/lib/engine/situation.ts", "src/lib/engine/scene-grounding.ts", "src/lib/engine/plan-review.ts",
  "src/lib/engine/prompt.ts", "src/lib/engine/scene-check.ts", "src/lib/engine/reference-adapters.ts", "src/lib/engine/work-inputs.ts", "src/lib/engine/depiction.ts",
  "src/lib/engine/memory-store.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "src/lib/image-response.ts", "src/lib/image-evals/adapters.ts",
  "src/lib/image-evals/suite.ts", "src/lib/image-evals/suite-run.ts", "src/lib/canon-showing.ts", "src/lib/work-preparation.ts", "convex/_helpers/contentVersion.ts",
  "scripts/evals/suite.mts", "evals/images/suite.json", "evals/images/cases.json", "evals/images/faults.json", "package-lock.json"];

type Plan = {
  suite: string; faults: string; tier: SuiteTier; from: string | null; pipeline: typeof PIPELINE;
  image: { model: string; aspectRatio: "16:9"; resolution: string }; checker: { model: string; reasoningEffort: "low"; maxTokens: number };
  works: Record<string, { analysis: string; workVersion: string; briefVersion: string; effects: boolean; title: string }>;
  cases: SuiteCase[]; refusedInTextRun: Array<{ caseId: string; work: string; unitId: string; split: string; reason: string }>;
  evaluation: { estimatedUsd: number; proposedCapUsd: number; reserves: typeof RESERVE; limits: Record<"text" | "image" | "check", number> };
};
type Snapshot = {
  works: Record<string, { source: string; status?: unknown; fixture?: { file: string; sha256: string }; records: Record<string, AnalysisRecord>;
    references: Record<string, ReferenceRecord | null>; files: Record<string, { sha256: string; bytes: number }> }>;
  cases: Array<{ id: string; caseId: string; work: string; momentId: string; sectionId: string; cast: string[] }>;
};

function readEvalEnvironment() {
  const file = process.env.VISIBIBLE_EVAL_ENV_FILE;
  assert.ok(file, "Set VISIBIBLE_EVAL_ENV_FILE to the private evaluation env file");
  const env = parseEnv(readFileSync(file, "utf8"));
  // The evaluation env file, not a live server's: no owner session, production Convex read-only.
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  return env;
}

const inputsCache = new Map<string, Promise<WorkInputs>>();
const inputsFor = (workId: string) => { let p = inputsCache.get(workId); if (!p) { p = readWorkInputs(workId, root); inputsCache.set(workId, p); } return p; };

async function plan() {
  const tier = values.tier as SuiteTier;
  assert.ok(tier === "text" || tier === "image", "--tier text|image");
  mkdirSync(runDir, { recursive: true });
  let cases = suiteCases(config, allCases, tier);
  const refusedInTextRun: Plan["refusedInTextRun"] = [];
  if (tier === "image") {
    assert.ok(values.from, "An image run draws a text run's plans: --from <text run>");
    const fromDir = path.join(root, "llm/releases", values.from);
    const fromPlan = readJson(path.join(fromDir, "plan.json")) as Plan;
    assert.equal(fromPlan.tier, "text"); assert.equal(fromPlan.suite, config.version);
    assert.deepEqual(fromPlan.pipeline, PIPELINE, "The text run used other prompt versions; plan a new text run");
    assert.ok(existsSync(path.join(fromDir, "run-finished.json")), "The text run has not finished");
    const rows = ndjson(path.join(fromDir, "results.ndjson"));
    const planned = new Set(rows.filter((r) => r.outcome === "planned").map((r) => r.caseId));
    for (const c of cases.filter((c) => !planned.has(c.caseId))) {
      const row = rows.find((r) => r.caseId === c.caseId);
      refusedInTextRun.push({ caseId: c.caseId, work: c.work, unitId: c.unitId, split: c.split, reason: row ? `${row.outcome}: ${row.reason ?? row.message ?? ""}` : "not run" });
    }
    cases = cases.filter((c) => planned.has(c.caseId));
  }
  // Holdout first, so a run stopped by its cap loses dev cases before any the gate reads.
  cases = [...cases.filter((c) => c.split === "holdout"), ...cases.filter((c) => c.split === "dev")];
  const works: Plan["works"] = {};
  for (const workId of new Set(cases.map((c) => c.work).concat(refusedInTextRun.map((c) => c.work)))) {
    const inputs = await inputsFor(workId);
    for (const style of config.works[workId].imageStyles) assert.ok(inputs.styles[style], `${workId}'s brief does not offer ${style}`);
    works[workId] = { analysis: config.works[workId].analysis, workVersion: inputs.workVersion, briefVersion: inputs.briefVersion, effects: Boolean(inputs.depiction.modes.effects), title: inputs.work.work.title };
  }
  const shown = cases.reduce((n, c) => n + c.styles.length, 0);
  const estimatedUsd = tier === "text"
    ? cases.length * ESTIMATE.textCallsPerCase * ESTIMATE.textCallUsd
    : shown * (1 + ESTIMATE.retryShare) * (ESTIMATE.imageUsd + 2 * ESTIMATE.checkUsd);
  const limits = tier === "text" ? { text: cases.length * 8, image: 0, check: 0 } : { text: 0, image: shown * 2, check: shown * 4 };
  const proposedCapUsd = values.cap ? Number(values.cap) : Math.ceil(estimatedUsd * 1.25 * 100) / 100;
  assert.ok(Number.isFinite(proposedCapUsd) && proposedCapUsd > 0, "--cap must be a positive USD amount");
  const out: Plan = {
    suite: config.version, faults: faults.version, tier, from: values.from ?? null, pipeline: PIPELINE,
    image: { model: DEFAULT_IMAGE_MODEL, aspectRatio: DEFAULT_ASPECT_RATIO as "16:9", resolution: DEFAULT_RESOLUTION },
    checker: { model: "anthropic/claude-haiku-5.5", reasoningEffort: "low", maxTokens: 1500 },
    works, cases, refusedInTextRun,
    evaluation: { estimatedUsd: Math.round(estimatedUsd * 1e4) / 1e4, proposedCapUsd, reserves: RESERVE, limits },
  };
  saveOnce(path.join(runDir, "plan.json"), out);
  const bySplit = (split: string) => cases.filter((c) => c.split === split).length;
  console.log(`${tier} run ${values.run}: ${cases.length} case(s) (${bySplit("dev")} dev, ${bySplit("holdout")} holdout)${tier === "image" ? `, ${shown} shown image(s), ${refusedInTextRun.length} refused in the text run` : ""}; estimate $${estimatedUsd.toFixed(2)}, proposed cap $${proposedCapUsd.toFixed(2)}.`);
}

async function snapshot() {
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  assert.equal(p.tier, "text", "Only text runs take a snapshot; an image run reuses its text run's");
  const snapshotFile = path.join(runDir, "snapshot.json");
  assert.ok(!existsSync(snapshotFile), "Keep the first snapshot");
  const needsConvex = Object.values(p.works).some((w) => w.analysis === "convex");
  const env = needsConvex ? readEvalEnvironment() : {};
  const client = needsConvex ? new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL!) : null;
  let queries = 0;
  const out: Snapshot = { works: {}, cases: [] };
  mkdirSync(path.join(blobDir, "references"), { recursive: true });
  for (const [workId, w] of Object.entries(p.works)) {
    const inputs = await inputsFor(workId);
    const cases = p.cases.filter((c) => c.work === workId);
    const records: Record<string, AnalysisRecord> = {};
    const references: Record<string, ReferenceRecord | null> = {};
    const files: Record<string, { sha256: string; bytes: number }> = {};
    const entry = { source: w.analysis, records, references, files } as Snapshot["works"][string];
    out.works[workId] = entry;
    let get: (kind: AnalysisRecord["kind"], id: string) => Promise<AnalysisRecord | null>;
    let moments: Array<{ id: string; firstUnit: string; lastUnit: string }> | null = null;
    if (w.analysis === "convex") {
      const status = await client!.query(api.analysis.getWorkStatus, { workId }); queries++;
      assert.ok(status.ready, `${workId} is not ready in production`);
      assert.equal(status.workVersion, inputs.workVersion, `${workId}: production read another work file`);
      assert.equal(status.briefVersion, inputs.briefVersion, `${workId}: production registered another brief`);
      entry.status = status;
      get = async (kind, id) => {
        const key = `${kind}:${id}`;
        if (!(key in records)) {
          queries++;
          const r = await client!.query(api.analysis.getActiveRecord, { workId, kind: kind as never, recordId: id }) as AnalysisRecord | null;
          if (!r) return null;
          // The run's memory store recomputes versions from payloads; reference staleness depends on their matching.
          assert.equal(contentVersion(r.payload), r.version, `${key}: stored version is not its payload's content hash`);
          records[key] = r;
        }
        return records[key];
      };
      if (inputs.work.work.momentMode !== "unit") {
        const all = await listAnalysisRecords(client!, workId, status.activeGeneration!, "moment"); queries++;
        moments = all.map((r) => ({ id: r.recordId, firstUnit: String((r.payload as { firstUnit: string }).firstUnit), lastUnit: String((r.payload as { lastUnit: string }).lastUnit) }));
        for (const r of all) records[`moment:${r.recordId}`] = r as AnalysisRecord;
      }
    } else {
      const fixtureFile = path.join(root, w.analysis);
      const text = readFileSync(fixtureFile, "utf8");
      const fixture = JSON.parse(text) as { workId: string; workVersion: string; briefVersion: string; records: Array<Omit<AnalysisRecord, "version" | "inputs">> };
      assert.equal(fixture.workId, workId); assert.equal(fixture.workVersion, inputs.workVersion, `${workId}: the fixture was read from another work file`);
      assert.equal(fixture.briefVersion, inputs.briefVersion, `${workId}: the fixture was drafted against another brief`);
      entry.fixture = { file: w.analysis, sha256: sha256(text) };
      for (const r of fixture.records) records[`${r.kind}:${r.recordId}`] = { ...r, version: contentVersion(r.payload), inputs: [] } as AnalysisRecord;
      get = async (kind, id) => records[`${kind}:${id}`] ?? null;
      if (inputs.work.work.momentMode !== "unit") moments = fixture.records.filter((r) => r.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) }));
    }
    const reference = async (kind: "sheet" | "styleReference", recordId: string) => {
      const key = `${kind}:${recordId}`;
      if (key in references) return;
      if (w.analysis !== "convex") { references[key] = null; return; }
      queries++;
      const r = await client!.query(api.analysis.getReference, { workId, kind, recordId }) as (ReferenceRecord & { storageId: string }) | null;
      references[key] = r ? { storageId: r.storageId, inputs: r.inputs, fingerprint: r.fingerprint, pinned: r.pinned } : null;
      if (!r || files[r.storageId]) return;
      queries++;
      const located = await client!.query(api.analysis.getReferenceBlobUrl, { serverSecret: env.CONVEX_SERVER_SECRET!, storageId: r.storageId as never });
      assert.ok(located?.url, `Reference blob ${r.storageId} is missing`);
      const response = await fetch(located.url, { signal: AbortSignal.timeout(20_000) }); assert.ok(response.ok);
      let bytes = new Uint8Array(await response.arrayBuffer());
      if ((located.contentType ?? "") !== "image/jpeg") { const sharp = (await import("sharp")).default; bytes = new Uint8Array(await sharp(Buffer.from(bytes)).jpeg({ quality: 88 }).toBuffer()); }
      writeFileSync(path.join(blobDir, "references", `${r.storageId}.jpg`), bytes);
      files[r.storageId] = { sha256: sha256(bytes), bytes: bytes.length };
    };
    for (const style of config.works[workId].imageStyles) await reference("styleReference", style);
    for (const c of cases) {
      const momentId = moments ? momentForUnit(inputs.work, c.unitId, moments)?.id : c.unitId;
      assert.ok(momentId, `${c.caseId}: no moment holds ${c.unitId}`);
      const moment = await get("moment", momentId); assert.ok(moment, `${c.caseId}: missing moment ${momentId}`);
      const sectionId = String(moment.payload.sectionId);
      const section = await get("section", sectionId); assert.ok(section, `${c.caseId}: missing section ${sectionId}`);
      // Owner looks and plans are literal inputs production uses; generated ones are made fresh by each run.
      for (const kind of ["look", "plan"] as const) {
        const id = kind === "look" ? sectionId : momentId;
        const r = await get(kind, id);
        if (r && r.source !== "owner") delete records[`${kind}:${id}`];
      }
      const cast = section.payload.cast as Array<{ entryId: string; stageId: string }>;
      for (const member of cast) {
        assert.ok(await get("entry", member.entryId), `${c.caseId}: missing entry ${member.entryId}`);
        await reference("sheet", `${member.entryId}:${member.stageId}`);
      }
      out.cases.push({ id: c.unitId, caseId: c.caseId, work: workId, momentId, sectionId, cast: cast.map((m) => `${m.entryId}:${m.stageId}`) });
    }
    // A unit's moment lies in its section, so only the moments of the cases' sections are ever read.
    const sections = new Set(out.cases.filter((c) => c.work === workId).map((c) => c.sectionId));
    for (const [key, r] of Object.entries(records)) if (r.kind === "moment" && !sections.has(String(r.payload.sectionId))) delete records[key];
    if (w.analysis !== "convex") {
      const cast = new Set(out.cases.filter((c) => c.work === workId).flatMap((c) => c.cast.map((m) => m.slice(0, m.indexOf(":")))));
      for (const [key, r] of Object.entries(records)) if ((r.kind === "section" && !sections.has(r.recordId)) || (r.kind === "entry" && !cast.has(r.recordId))) delete records[key];
    }
  }
  saveOnce(snapshotFile, { at: new Date().toISOString(), ...out, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 });
  const refs = Object.values(out.works).flatMap((w) => Object.values(w.references)).filter(Boolean).length;
  console.log(JSON.stringify({ cases: out.cases.length, records: Object.values(out.works).reduce((n, w) => n + Object.keys(w.records).length, 0), references: refs, readOnlyProductionQueries: queries, productionMutations: 0 }));
}

async function run() {
  assert.ok(values.execute !== values.offline, "Choose --offline (a free rehearsal) or --execute (a paid run)");
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  assert.deepEqual(p.pipeline, PIPELINE, "Prompt versions changed since the plan; plan a new run");
  assert.equal(p.suite, config.version); assert.equal(p.faults, faults.version);
  const sourceRun = p.tier === "image" ? p.from! : values.run!;
  const snap = readJson(path.join(root, "llm/releases", sourceRun, "snapshot.json")) as Snapshot;
  const refDir = path.join(root, "evals/images/runs", sourceRun, "references");
  const outDir = values.offline ? mkdtempSync(path.join(os.tmpdir(), `suite-${values.run}-`)) : runDir;
  const imageDir = values.offline ? path.join(outDir, "images") : path.join(blobDir, "images");
  let apiKey = "offline-rehearsal";
  let fetchImpl: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init);
  const offline = values.offline ? createOfflineOpenRouter({ letteringEvery: 5 }) : null;
  const cap = p.evaluation.proposedCapUsd;
  if (offline) fetchImpl = offline.fetch;
  else {
    for (const name of ["run-started.json", "frozen-commit.json", "ledger.json", "provider.ndjson", "results.ndjson"]) assert.ok(!existsSync(path.join(runDir, name)), `One-shot artifact exists: ${name}`);
    const fundingFile = path.join(runDir, "funding.json");
    assert.ok(existsSync(fundingFile), "Owner funding is required: commit funding.json beside plan.json");
    const grant = readJson(fundingFile) as { authorization: string; operationCapUsd: number };
    assert.ok(typeof grant.authorization === "string" && grant.authorization.trim(), "funding.json needs the owner's authorization");
    assert.equal(grant.operationCapUsd, cap, "funding.json must fund the plan's cap");
    assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit the plan, snapshot and funding before calls");
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const frozen = [...SHARED_SOURCES, ...["plan.json", "funding.json"].map((f) => path.relative(root, path.join(runDir, f))), path.relative(root, path.join(root, "llm/releases", sourceRun, "snapshot.json"))];
    const hashes = Object.fromEntries(frozen.map((f) => [f, sha256(readFileSync(path.join(root, f)))]));
    for (const [file, hash] of Object.entries(hashes)) assert.equal(sha256(execFileSync("git", ["show", `${commit}:${file}`], { cwd: root, maxBuffer: 50_000_000 })), hash, `Not committed: ${file}`);
    const env = readEvalEnvironment();
    apiKey = env.OPENROUTER_API_KEY!; assert.ok(apiKey, "OPENROUTER_API_KEY is missing from the eval env file");
    const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
    const balanceUsd = credits.total_credits - credits.total_usage;
    assert.ok(balanceUsd >= cap + PRODUCTION_HEADROOM_USD, `The account holds $${balanceUsd.toFixed(2)}; this run needs $${cap} plus $${PRODUCTION_HEADROOM_USD} left for readers`);
    const key = (await (await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
    assert.ok(key.limit_remaining === null || key.limit_remaining >= cap + 1, `The key has $${key.limit_remaining} of its limit left; this run needs $${cap} plus $1`);
    saveOnce(path.join(runDir, "frozen-commit.json"), { at: new Date().toISOString(), commit, grant });
    saveOnce(path.join(runDir, "run-started.json"), { at: new Date().toISOString(), balanceUsd, keyLimitRemaining: key.limit_remaining, sources: hashes });
  }
  mkdirSync(imageDir, { recursive: true });
  const ledger = createLedger({
    capUsd: cap, reserves: p.evaluation.reserves, limits: p.evaluation.limits, fetch: fetchImpl,
    save: (state) => writeFileSync(path.join(outDir, "ledger.json"), `${JSON.stringify(state, null, 2)}\n`),
    log: (entry) => appendFileSync(path.join(outDir, "provider.ndjson"), `${JSON.stringify(entry)}\n`),
    scrub: (value) => scrubForLog(value, apiKey, sha256),
  });
  // Seeds: the looks and plans the text run stored, one per record, with the inputs they were made from.
  const seeds = new Map<string, Map<string, AnalysisRecord>>();
  if (p.tier === "image") {
    for (const row of ndjson(path.join(root, "llm/releases", p.from!, "results.ndjson"))) {
      if (row.outcome !== "planned") continue;
      const bucket = seeds.get(row.work) ?? new Map<string, AnalysisRecord>(); seeds.set(row.work, bucket);
      for (const r of [row.records.look, row.records.plan] as AnalysisRecord[]) {
        const key = `${r.kind}:${r.recordId}`;
        if (bucket.has(key)) assert.equal(bucket.get(key)!.version, r.version, `${key}: the text run stored two versions`);
        else bucket.set(key, r);
      }
    }
  }
  const works = new Map<string, SuiteWork>();
  for (const workId of Object.keys(p.works)) {
    const w = snap.works[workId];
    works.set(workId, {
      inputs: await inputsFor(workId),
      records: Object.values(w.records).map((r) => ({ kind: r.kind, recordId: r.recordId, payload: r.payload, source: r.source })),
      seeded: seeds.has(workId) ? [...seeds.get(workId)!.values()] : undefined,
      getReference: async (kind, recordId) => w.references[`${kind}:${recordId}`] ?? null,
      loadReference: async (storageId) => {
        const bytes = new Uint8Array(readFileSync(path.join(refDir, `${storageId}.jpg`)));
        assert.equal(sha256(bytes), w.files[storageId].sha256, `Reference ${storageId} changed since the snapshot`);
        return bytes;
      },
    });
  }
  const record = (row: Record<string, unknown>) => appendFileSync(path.join(outDir, "results.ndjson"), `${JSON.stringify(row)}\n`);
  for (const c of p.refusedInTextRun) record({ key: `${c.caseId}/*`, tier: p.tier, case: c.unitId, caseId: c.caseId, work: c.work, split: c.split, outcome: "refused", stage: "text-run",
    standsFor: config.works[c.work].imageStyles, message: c.reason });
  await runSuite({
    tier: p.tier, cases: p.cases, works, aspectRatio: p.image.aspectRatio, concurrency: 3,
    image: p.tier === "image" ? { model: p.image.model, resolution: p.image.resolution, checkTimeoutMs: 30_000 } : undefined,
    providers: (phase) => ({
      text: createOpenRouterTextModel({ apiKey, timeoutMs: 120_000, fetch: ledger.fetchFor("text", phase) }),
      image: createOpenRouterEvalImageProvider({ apiKey, timeoutMs: 180_000, fetch: ledger.fetchFor("image", phase) }),
      checker: createOpenRouterVisionChecker({ apiKey, fetch: ledger.fetchFor("check", phase), reasoningEffort: p.checker.reasoningEffort, maxTokens: p.checker.maxTokens, timeoutMs: 30_000 }),
    }),
    blocked: () => ledger.state.blocked,
    record,
    saveImage: (key, n, image) => {
      const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1] ?? "png";
      const file = path.join(imageDir, `${key.replaceAll("/", "__")}__a${n}.${extension}`);
      writeFileSync(file, image.bytes);
      return { file: path.relative(values.offline ? outDir : root, file), sha256: sha256(image.bytes) };
    },
    log: (line) => console.log(line),
  });
  const rows = ndjson(path.join(outDir, "results.ndjson"));
  const outcomes: Record<string, number> = {};
  for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  const finished = { at: new Date().toISOString(), measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd, counts: ledger.state.counts, blocked: ledger.state.blocked, outcomes, productionMutations: 0 };
  writeFileSync(path.join(outDir, "run-finished.json"), `${JSON.stringify(finished, null, 2)}\n`, { flag: values.offline ? "w" : "wx" });
  console.log(JSON.stringify({ done: true, offline: values.offline, outDir: values.offline ? outDir : path.relative(root, outDir), ...finished }));
}

/** A deterministic blind order: the seed and run name shuffle items so batches never follow cases, styles or splits. */
const blindOrder = <T extends { key: string }>(items: T[]) => [...items].sort((a, b) => drawFraction(`${config.seed}:${values.run}`, a.key) - drawFraction(`${config.seed}:${values.run}`, b.key));

async function blind() {
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  const scoringDir = path.join(runDir, "scoring");
  assert.ok(!existsSync(scoringDir), "Keep the first scorer packs");
  mkdirSync(scoringDir, { recursive: true });
  const rows = ndjson(path.join(runDir, "results.ndjson"));
  const scored = blindOrder(rows.filter((r) => r.outcome === (p.tier === "text" ? "planned" : "image")));
  const key: Array<Record<string, unknown>> = [];
  const items: Array<Record<string, unknown>> = [];
  if (p.tier === "image") mkdirSync(path.join(blobDir, "blind"), { recursive: true });
  for (const [index, row] of scored.entries()) {
    const id = `${p.tier === "text" ? "p" : "i"}${String(index + 1).padStart(3, "0")}`;
    const inputs = await inputsFor(row.work);
    const ask = faultsFor(faults, p.tier, { effects: Boolean(inputs.depiction.modes.effects) }).map((f) => f.id);
    const entryName = (entryId: string) => (snapshotRecords(p).get(row.work)?.get(`entry:${entryId}`)?.payload as { name?: string } | undefined)?.name ?? entryId;
    const selected = (row.prepared.present as Array<{ entryId: string }>).map((e) => entryName(e.entryId));
    const plan = row.prepared.plan as Record<string, string>;
    const scene = { primarySubject: plan.primarySubject, action: plan.action, setting: plan.setting, secondaryElements: plan.secondaryElements, mood: plan.mood, timeOfDay: plan.timeOfDay, composition: plan.composition };
    const moment = { work: inputs.work.work.title, reference: row.context.moment.reference, text: row.context.moment.text };
    if (p.tier === "text") {
      const section = snapshotRecords(p).get(row.work)?.get(`section:${row.sectionId}`);
      const cast = ((section?.payload.cast ?? []) as Array<{ entryId: string }>).map((m) => {
        const e = snapshotRecords(p).get(row.work)?.get(`entry:${m.entryId}`)?.payload as { name?: string; entryKind?: string; hasForm?: boolean } | undefined;
        return { name: e?.name ?? m.entryId, kind: e?.entryKind ?? "unknown", mayBeDrawn: e?.hasForm !== false };
      });
      items.push({ id, ask, ...moment, previous: row.context.previous?.text ?? null, next: row.context.next?.text ?? null,
        depictionRules: inputs.brief.depictionRules.map((r) => r.text), sectionCast: cast, plan: { selected, ...scene } });
    } else {
      const attempt = row.attempts[row.chosen - 1];
      const file = path.join(blobDir, "blind", `${id}${path.extname(attempt.file)}`);
      copyFileSync(path.join(root, attempt.file), file);
      const neverDrawn = (row.prepared.present as Array<{ entryId: string }>).filter((e) => (snapshotRecords(p).get(row.work)?.get(`entry:${e.entryId}`)?.payload as { hasForm?: boolean } | undefined)?.hasForm === false).map((e) => entryName(e.entryId));
      items.push({ id, ask, file: path.relative(root, file), ...moment, selected, neverDrawn, scene });
    }
    key.push({ id, key: row.key, caseId: row.caseId, work: row.work, style: row.style ?? null, split: row.split, faults: ask });
  }
  const batches = Math.max(1, Number(values.batches));
  const size = Math.ceil(items.length / batches);
  for (let b = 0; b < batches; b++) saveOnce(path.join(scoringDir, `items-${b + 1}.json`), { tier: p.tier, items: items.slice(b * size, (b + 1) * size) });
  writeFileSync(path.join(scoringDir, "SCORING.md"), scoringInstructions(faults, p.tier), { flag: "wx" });
  saveOnce(path.join(scoringDir, "key.json"), { run: values.run, tier: p.tier, suite: p.suite, faults: p.faults, items: key });
  console.log(`${items.length} item(s) in ${batches} batch(es) under ${path.relative(root, scoringDir)}; scorers read SCORING.md and one items file each, never key.json.`);
}

const recordsCache = new Map<string, Map<string, AnalysisRecord>>();
function snapshotRecords(p: Plan): Map<string, Map<string, AnalysisRecord>> {
  const sourceRun = p.tier === "image" ? p.from! : values.run!;
  if (!recordsCache.size) {
    const snap = readJson(path.join(root, "llm/releases", sourceRun, "snapshot.json")) as Snapshot;
    for (const [workId, w] of Object.entries(snap.works)) recordsCache.set(workId, new Map(Object.entries(w.records)));
  }
  return recordsCache;
}

/** The run's items, each with its settled score, and its refusals. */
function judgedItems(dir: string): { items: JudgedItem[]; disputes: number; tier: SuiteTier; suiteVersion: string } {
  const p = readJson(path.join(dir, "plan.json")) as Plan;
  const key = readJson(path.join(dir, "scoring/key.json")) as { items: Array<{ id: string; key: string }> };
  const settled = readJson(path.join(dir, "scoring/scores.json")) as { settled: Record<string, { faults: Record<string, "yes" | "no" | "na">; overall: "acceptable" | "flawed" | "uncertain" }>; disputes: unknown[] };
  const byKey = new Map(key.items.map((i) => [i.key, settled.settled[i.id] ?? null]));
  const items: JudgedItem[] = [];
  for (const row of ndjson(path.join(dir, "results.ndjson"))) {
    const refused = row.outcome === "refused";
    const judged = row.outcome === (p.tier === "text" ? "planned" : "image");
    if (!refused && !judged) continue;
    // A refusal names the styles it stands for: all of them when the moment's look or plan failed.
    const styles: Array<string | null> = p.tier === "text" ? [null] : refused ? row.standsFor : [row.style];
    for (const style of styles) {
      const itemKey = p.tier === "text" ? `${row.caseId}/text` : `${row.caseId}/${style}`;
      items.push({ key: itemKey, caseId: row.caseId, work: row.work, style, split: row.split, refused, score: refused ? null : byKey.get(itemKey) ?? null });
    }
  }
  return { items, disputes: settled.disputes.length, tier: p.tier, suiteVersion: p.suite };
}

async function report() {
  const scoringDir = path.join(runDir, "scoring");
  const key = readJson(path.join(scoringDir, "key.json")) as { tier: SuiteTier; items: Array<{ id: string; faults: string[] }> };
  const files = list(values.scores).map((f) => scoreFileSchema.parse(readJson(path.resolve(root, f))));
  // A scorer may have scored several batches; merge each scorer's files.
  const byScorer = new Map<string, ScoreFile>();
  for (const f of files) {
    const prior = byScorer.get(f.scorer);
    byScorer.set(f.scorer, prior ? { ...prior, scores: [...prior.scores, ...f.scores] } : f);
  }
  const operator = values.operator ? operatorFileSchema.parse(readJson(path.resolve(root, values.operator))) : undefined;
  const { settled, disputes } = settleScores(key.items.map((i) => ({ id: i.id, faults: i.faults })), [...byScorer.values()], operator);
  writeFileSync(path.join(scoringDir, "scores.json"), `${JSON.stringify({ scorers: [...byScorer.keys()], operator: operator?.scorer ?? null, settled, disputes }, null, 2)}\n`);
  if (disputes.length) {
    writeFileSync(path.join(scoringDir, "disputes.json"), `${JSON.stringify(disputes, null, 2)}\n`);
    console.log(`${disputes.length} item(s) disputed; the operator rules on scoring/disputes.json, then report again with --operator.`);
  }
  const candidate = judgedItems(runDir);
  const tierFaults = faults[candidate.tier];
  const summary = summarizeBy(candidate.items, tierFaults);
  let gate = null;
  if (values.baseline) {
    const baseline = judgedItems(path.join(root, "llm/releases", values.baseline));
    assert.equal(baseline.tier, candidate.tier, "Compare runs of the same tier");
    gate = { baseline: values.baseline, ...evaluateSuiteGate({ config, faults: tierFaults, candidate, baseline }) };
  }
  writeFileSync(path.join(runDir, "items.json"), `${JSON.stringify(candidate.items, null, 1)}\n`);
  writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify({ run: values.run, tier: candidate.tier, suite: candidate.suiteVersion, faults: faults.version, disputes: disputes.length, summary, gate }, null, 2)}\n`);
  const pct = (r: { rate: number | null; yes: number; judged: number }) => r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(0)}% (${r.yes}/${r.judged})`;
  console.log(`acceptable ${pct(summary.overall.acceptable)}, refused ${pct(summary.overall.refused)}`);
  for (const f of tierFaults) console.log(`  ${f.id}: ${pct(summary.overall.faults[f.id])}`);
  for (const [split, s] of Object.entries(summary.bySplit)) console.log(`  ${split}: acceptable ${pct(s.acceptable)}`);
  if (gate) console.log(gate.pass ? `Gate passes against ${gate.baseline}.` : `Gate FAILS against ${gate.baseline}:\n  ${gate.reasons.join("\n  ")}`);
}

const commands: Record<string, () => Promise<void>> = { plan, snapshot, run, blind, report };
assert.ok(commands[command], `Unknown command: ${command}`);
await commands[command]();
