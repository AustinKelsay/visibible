/**
 * The image regression suite on the lean engine (ADR 0011, ADR 0012): one image call from the source text
 * (src/lib/engine/lean.ts), rendered through the request path's own assembly from a frozen snapshot of each work's
 * canon, sections and reference sheets. Against a run of the same snapshot, two arms differ only in what changed.
 *
 *   npm run evals:lean -- snapshot --run <name>
 *   npm run evals:lean -- cast --from <suite text run>
 *   npm run evals:lean -- plan --run <name> --from <snapshot run> --model <id> [--cap <usd>] [--cases <ids>] [--styles <ids>]
 *   npm run evals:lean -- run --run <name> --offline|--execute [--resume]
 *   npm run evals:lean -- blind --run <name> --baseline <dir with the full engine's results.ndjson> --baseline-images <dir> [--batches <n>]
 *   npm run evals:lean -- report --run <name> --scores <a>[,…],<b>[,…] [--operator <file>]
 *   npm run evals:lean -- pairing --run <name> --out <dir> [--baseline <dir>]
 *   npm run evals:lean -- pool --run <name> --out <dir> [--batches <n>]
 *   npm run evals:lean -- unpool --out <dir> --scores <pooled score files>
 *
 * `snapshot` reads each work's analysis once, read-only, from production (Bible, Holmes) or from its committed fixture
 * (Alice), with the reference images production would attach, into llm/releases/<name>/snapshot.json; the blobs go to
 * evals/images/runs/<name>/references (ignored). It makes no paid call and no production write, so take a fresh one
 * whenever canon or sheets have been corrected. A full-engine suite text run's snapshot (2026-11-07-suite-v3-text)
 * serves as well. `cast` compares name-based cast selection with the text run's planned casts, free. `plan` writes the
 * cases, the estimate and the cap; `run --execute` needs a committed `funding.json` beside it and ledgers every call. `blind`
 * mixes both arms' shown images into one scorer pack judged against the moment's text, since the lean arm has no
 * plan; the key says which arm each item came from. `report` settles the scores, applies the suite gate to the lean
 * arm with the full arm as its baseline, and also counts each arm at the launch bar, where small unreadable marks
 * are accepted (ADR 0006 amendment 7).
 *
 * Consistency (ADR 0008): `pairing` writes a run's results in the form `evals:consistency pairs` reads, each scene
 * described by its moment's text. Alone, it is the release check: an image counts as showing the places and named
 * members its prompt asked for (`leanDepicted`). With --baseline (a full-engine run) both arms take the full arm's
 * planned cast instead, so they get the same pairs and nothing tells them apart. Every verse the run attempted is
 * written, refused or failed ones without an image, so the gate sees them as run, not as missing. `pool` shuffles
 * every set's pairs into shared blind chunks; `unpool` returns each scorer's verdicts to the sets for
 * `evals:consistency report`.
 *
 * Paid runs read OPENROUTER_API_KEY, and snapshots NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET, from the private
 * env file named by VISIBIBLE_EVAL_ENV_FILE.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { createRequire } from "node:module";
import { ConvexHttpClient } from "convex/browser";
import { contentVersion } from "../../convex/_helpers/contentVersion";
import { loadEvalCases } from "@/lib/image-evals/cases";
import {
  drawFraction, evaluateSuiteGate, expectedHoldoutKeys, faultsFor, loadFaults, loadSuiteConfig, operatorFileSchema, scoreFileSchema, settleScores, suiteCases, summarizeBy,
  type JudgedItem, type ScoreFile, type SuiteCase,
} from "@/lib/image-evals/suite";
import { createLedger, GEMINI_BATCH_DISCOUNT, geminiUsageUsd, modelPricing, requestCeilingUsd, scrubForLog, type LedgerState, type ModelPricing } from "@/lib/image-evals/suite-run";
import { imageCapabilities } from "@/lib/image-catalog";
import { createOfflineOpenRouter } from "@/lib/image-evals/suite-offline";
import { createGeminiEvalImageProvider, createOpenRouterEvalImageProvider, geminiGenerateUrl } from "@/lib/image-evals/adapters";
import {
  buildGeminiBatchLine, deleteGeminiFile, GEMINI_SAFETY_REASONS, geminiBatchJobBoundUsd,
  isGeminiBatchSucceeded, parseGeminiBatchOutputLine, pollGeminiBatch, streamGeminiFileLines, submitGeminiBatch, uploadGeminiFile,
} from "@/lib/image-evals/gemini-batch";
import type { ReferenceRecord } from "@/lib/engine/lean-assemble";
import { analysisAccess, listAnalysisRecords, type AnalysisRecord } from "@/lib/engine/analysis-records";
import { applicableRules } from "@/lib/engine/prompt";
import { leanCastMember, leanDepicted, rankLeanCast, LEAN_MAX_SHEETS, LEAN_PROMPT_VERSION, type LeanCastMember } from "@/lib/engine/lean";
import { assembleLean } from "@/lib/engine/lean-assemble";
import { momentContext, momentForUnit, readWorkInputs, type WorkInputs } from "@/lib/engine/work-inputs";

// Node 20's tsx loader exposes this generated JavaScript through CommonJS.
const { api } = createRequire(import.meta.url)("../../convex/_generated/api") as typeof import("../../convex/_generated/api");
const root = fileURLToPath(new URL("../../", import.meta.url));
/** Calls in flight at once by default. The default cap leaves room for that many at their ceiling, since an unaffordable reservation stops the run. */
const DEFAULT_CONCURRENCY = 4;
const CEILING_HEADROOM_USD = 0.6;
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  run: { type: "string" }, from: { type: "string" }, model: { type: "string" }, cap: { type: "string" },
  execute: { type: "boolean", default: false }, offline: { type: "boolean", default: false }, resume: { type: "boolean", default: false },
  baseline: { type: "string" }, "baseline-images": { type: "string" }, "baseline-arm": { type: "string", default: "lean" }, batches: { type: "string", default: "1" },
  scores: { type: "string" }, operator: { type: "string" }, out: { type: "string" }, concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
  cases: { type: "string" }, styles: { type: "string" }, provider: { type: "string", default: "openrouter" },
} });
const command = positionals[0];
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const saveOnce = (file: string, data: unknown) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
const ndjson = (file: string) => existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const releases = path.join(root, "llm/releases");

const config = loadSuiteConfig(readJson(path.join(root, "evals/images/suite.json")));
const faults = loadFaults(readJson(path.join(root, "evals/images/faults.json")));
const allCases = loadEvalCases(readJson(path.join(root, "evals/images/cases.json")));
/** Offline rehearsals reserve this; a paid run reserves each call's catalog ceiling instead (see `run`). */
const RESERVE = { text: 0, image: 0.08, check: 0 };
/** Output image tokens at 1K, measured, for models the image catalog does not list; a model in neither cannot be bounded and is refused. */
const IMAGE_TOKENS_1K: Record<string, number> = { "google/gemini-nano-banana-2.1": 1120 };
const PRODUCTION_HEADROOM_USD = 5;
const SOURCES = ["src/lib/engine/lean.ts", "src/lib/engine/lean-assemble.ts", "src/lib/engine/prompt.ts", "src/lib/engine/depiction.ts", "src/lib/engine/work-inputs.ts", "src/lib/image-evals/adapters.ts",
  "src/lib/image-evals/gemini-batch.ts", "src/lib/image-evals/suite-run.ts", "scripts/evals/lean.mts", "evals/images/suite.json", "evals/images/cases.json", "evals/images/faults.json"];

type Snapshot = {
  /** Set by `snapshot`; a full-engine text run's snapshot has neither and is checked through its plan. */
  kind?: "lean-snapshot"; suite?: string;
  works: Record<string, { source?: string; status?: unknown; fixture?: { file: string; sha256: string }; records: Record<string, AnalysisRecord>;
    references: Record<string, ReferenceRecord | null>; files: Record<string, { sha256: string; bytes: number }> }>;
  cases: Array<{ id: string; caseId: string; work: string; momentId: string; sectionId: string; cast: string[] }>;
};
/** The fields of a results row that scoring reads. */
type ResultRow = { key: string; case: string; caseId: string; work: string; style: string; split: "dev" | "holdout"; outcome: string; standsFor?: string[]; chosen?: number; attempts: Array<{ file: string; sha256: string }>;
  prepared?: { plan: { present: string[] } } };
type Plan = { kind: "lean"; suite: string; faults: string; from: string; promptVersion: string; maxSheets: number;
  image: { model: string; aspectRatio: "16:9"; resolution: "1K" }; cases: SuiteCase[]; evaluation: { estimatedUsd: number; capUsd: number; reserves: typeof RESERVE; limits: Record<"text" | "image" | "check", number> } };

const inputsCache = new Map<string, Promise<WorkInputs>>();
const inputsFor = (workId: string) => { let p = inputsCache.get(workId); if (!p) { p = readWorkInputs(workId, root); inputsCache.set(workId, p); } return p; };
const snapshotOf = (run: string) => readJson(path.join(releases, run, "snapshot.json")) as Snapshot;

/** One case's moment, neighbours, section cast and the references production would consider, from the snapshot. */
async function caseInputs(snap: Snapshot, c: SuiteCase) {
  const inputs = await inputsFor(c.work);
  const w = snap.works[c.work];
  const sc = snap.cases.find((x) => x.caseId === c.caseId && x.work === c.work);
  assert.ok(sc, `${c.caseId}: not in the snapshot`);
  const moment = w.records[`moment:${sc.momentId}`]; const section = w.records[`section:${sc.sectionId}`];
  assert.ok(moment && section, `${c.caseId}: snapshot lacks its moment or section`);
  const context = momentContext(inputs.work, { id: moment.recordId, firstUnit: String(moment.payload.firstUnit), lastUnit: String(moment.payload.lastUnit) },
    { firstUnit: String(section.payload.firstUnit), lastUnit: String(section.payload.lastUnit) });
  const cast: LeanCastMember[] = [];
  for (const m of section.payload.cast as Array<{ entryId: string; stageId: string }>) {
    const entry = w.records[`entry:${m.entryId}`];
    const member = entry ? leanCastMember(m.entryId, m.stageId, entry.version, entry.payload as never) : null;
    if (member) cast.push(member);
  }
  return { inputs, w, sc, moment, section, context, cast };
}

/** Name-based selection against the text run's planned casts, per case: free. */
async function cast() {
  assert.ok(values.from, "--from <suite text run>");
  const snap = snapshotOf(values.from);
  const rows = ndjson(path.join(releases, values.from, "results.ndjson")).filter((r) => r.outcome === "planned");
  const cases = suiteCases(config, allCases, "text");
  let tp = 0, fp = 0, fn = 0, exact = 0, n = 0;
  const diffs: Array<Record<string, unknown>> = [];
  for (const c of cases) {
    const row = rows.find((r) => r.caseId === c.caseId); if (!row) continue;
    const { context, cast: members } = await caseInputs(snap, c);
    // Named members only: the rest are offered too, but this measures what names alone would find.
    const lean = new Set(rankLeanCast(members, context.moment.text, { previous: context.previous?.text, next: context.next?.text }).filter((m) => m.named.here + m.named.before + m.named.after > 0).map((m) => m.entryId));
    const planned = new Set((row.prepared.present as Array<{ entryId: string }>).map((p) => p.entryId));
    const extra = [...lean].filter((id) => !planned.has(id)); const missed = [...planned].filter((id) => !lean.has(id));
    tp += [...lean].filter((id) => planned.has(id)).length; fp += extra.length; fn += missed.length; n++;
    if (!extra.length && !missed.length) exact++; else diffs.push({ caseId: c.caseId, work: c.work, extra, missed });
  }
  const out = { from: values.from, cases: n, exact, precision: tp / (tp + fp), recall: tp / (tp + fn), diffs };
  console.log(JSON.stringify({ ...out, diffs: diffs.length }, null, 1));
  if (values.run) { mkdirSync(path.join(releases, values.run), { recursive: true }); writeFileSync(path.join(releases, values.run, "cast-comparison.json"), `${JSON.stringify(out, null, 1)}\n`); }
}

/**
 * The suite's image cases with their moments, sections, the canon of every section cast member and the references
 * production would consider, read once. Production is only queried; a fixture work's references are none.
 */
async function snapshot() {
  assert.ok(values.run, "--run");
  const runDir = path.join(releases, values.run); mkdirSync(runDir, { recursive: true });
  const snapshotFile = path.join(runDir, "snapshot.json");
  assert.ok(!existsSync(snapshotFile), "Keep the first snapshot");
  const cases = suiteCases(config, allCases, "image");
  const needsConvex = Object.values(config.works).some((w) => w.analysis === "convex");
  let env: Record<string, string | undefined> = {};
  if (needsConvex) {
    env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE ?? "", "utf8"));
    assert.ok(env.NEXT_PUBLIC_CONVEX_URL && env.CONVEX_SERVER_SECRET, "The eval env file needs NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET");
  }
  const client = needsConvex ? new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL!) : null;
  const blobDir = path.join(root, "evals/images/runs", values.run, "references");
  mkdirSync(blobDir, { recursive: true });
  let queries = 0;
  const out: Required<Pick<Snapshot, "kind" | "suite">> & Snapshot = { kind: "lean-snapshot", suite: config.version, works: {}, cases: [] };
  for (const [workId, settings] of Object.entries(config.works)) {
    const inputs = await inputsFor(workId);
    const records: Record<string, AnalysisRecord> = {};
    const references: Record<string, ReferenceRecord | null> = {};
    const files: Record<string, { sha256: string; bytes: number }> = {};
    const entry: Snapshot["works"][string] = { source: settings.analysis, records, references, files };
    out.works[workId] = entry;
    let get: (kind: "moment" | "section" | "entry", id: string) => Promise<AnalysisRecord | null>;
    let moments: Array<{ id: string; firstUnit: string; lastUnit: string }> | null = null;
    if (settings.analysis === "convex") {
      const status = await client!.query(api.analysis.getWorkStatus, { workId, ...analysisAccess(workId, env.CONVEX_SERVER_SECRET) }); queries++;
      assert.ok(status.ready, `${workId} is not ready in production`);
      assert.equal(status.workVersion, inputs.workVersion, `${workId}: production read another work file`);
      assert.equal(status.briefVersion, inputs.briefVersion, `${workId}: production registered another brief`);
      entry.status = status;
      get = async (kind, id) => {
        const key = `${kind}:${id}`;
        if (!(key in records)) {
          queries++;
          const r = await client!.query(api.analysis.getActiveRecord, { workId, kind, recordId: id, ...analysisAccess(workId, env.CONVEX_SERVER_SECRET) }) as AnalysisRecord | null;
          if (!r) return null;
          // References are current only when their inputs' versions match, so a version must be its payload's hash.
          assert.equal(contentVersion(r.payload), r.version, `${key}: stored version is not its payload's content hash`);
          records[key] = r;
        }
        return records[key];
      };
      if (inputs.work.momentMode !== "unit") {
        const all = await listAnalysisRecords(client!, workId, status.activeGeneration!, "moment", env.CONVEX_SERVER_SECRET); queries++;
        moments = all.map((r) => { const m = r.payload as { firstUnit: string; lastUnit: string }; return { id: r.recordId, firstUnit: String(m.firstUnit), lastUnit: String(m.lastUnit) }; });
        for (const r of all) records[`moment:${r.recordId}`] = r as AnalysisRecord;
      }
    } else {
      const fixtureFile = path.join(root, settings.analysis);
      const text = readFileSync(fixtureFile, "utf8");
      const fixture = JSON.parse(text) as { workId: string; workVersion: string; briefVersion: string; records: Array<Omit<AnalysisRecord, "version" | "inputs">> };
      assert.equal(fixture.workId, workId);
      assert.equal(fixture.workVersion, inputs.workVersion, `${workId}: the fixture was read from another work file`);
      assert.equal(fixture.briefVersion, inputs.briefVersion, `${workId}: the fixture was drafted against another brief`);
      entry.fixture = { file: settings.analysis, sha256: sha256(text) };
      for (const r of fixture.records) records[`${r.kind}:${r.recordId}`] = { ...r, version: contentVersion(r.payload), inputs: [] } as AnalysisRecord;
      get = async (kind, id) => records[`${kind}:${id}`] ?? null;
      if (inputs.work.momentMode !== "unit") moments = fixture.records.filter((r) => r.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) }));
    }
    const reference = async (kind: "sheet" | "styleReference", recordId: string) => {
      const key = `${kind}:${recordId}`;
      if (key in references) return;
      if (settings.analysis !== "convex") { references[key] = null; return; }
      queries++;
      const r = await client!.query(api.analysis.getReference, { workId, kind, recordId, ...analysisAccess(workId, env.CONVEX_SERVER_SECRET) }) as (ReferenceRecord & { storageId: string }) | null;
      references[key] = r ? { storageId: r.storageId, inputs: r.inputs, fingerprint: r.fingerprint, pinned: r.pinned } : null;
      if (!r || files[r.storageId]) return;
      queries++;
      const located = await client!.query(api.analysis.getReferenceBlobUrl, { serverSecret: env.CONVEX_SERVER_SECRET!, storageId: r.storageId as never });
      assert.ok(located?.url, `Reference blob ${r.storageId} is missing`);
      const response = await fetch(located.url, { signal: AbortSignal.timeout(20_000) });
      assert.ok(response.ok, `Reference blob ${r.storageId}: HTTP ${response.status}`);
      let bytes = new Uint8Array(await response.arrayBuffer());
      // Production sends references as JPEG; the run sends these bytes as JPEG too.
      if ((located.contentType ?? "") !== "image/jpeg") { const sharp = (await import("sharp")).default; bytes = new Uint8Array(await sharp(Buffer.from(bytes)).jpeg({ quality: 88 }).toBuffer()); }
      writeFileSync(path.join(blobDir, `${r.storageId}.jpg`), bytes);
      files[r.storageId] = { sha256: sha256(bytes), bytes: bytes.length };
    };
    for (const style of settings.imageStyles) await reference("styleReference", style);
    for (const c of cases.filter((x) => x.work === workId)) {
      const momentId = moments ? momentForUnit(inputs.work, c.unitId, moments)?.id : c.unitId;
      assert.ok(momentId, `${c.caseId}: no moment holds ${c.unitId}`);
      const moment = await get("moment", momentId); assert.ok(moment, `${c.caseId}: missing moment ${momentId}`);
      const sectionId = String(moment.payload.sectionId);
      const section = await get("section", sectionId); assert.ok(section, `${c.caseId}: missing section ${sectionId}`);
      const cast = section.payload.cast as Array<{ entryId: string; stageId: string }>;
      for (const member of cast) {
        assert.ok(await get("entry", member.entryId), `${c.caseId}: missing entry ${member.entryId}`);
        await reference("sheet", `${member.entryId}:${member.stageId}`);
      }
      out.cases.push({ id: c.unitId, caseId: c.caseId, work: workId, momentId, sectionId, cast: cast.map((m) => `${m.entryId}:${m.stageId}`) });
    }
    // Keep only what the cases read: their sections' moments, their sections and their casts' entries.
    const mine = out.cases.filter((c) => c.work === workId);
    const sections = new Set(mine.map((c) => c.sectionId));
    const entries = new Set(mine.flatMap((c) => c.cast.map((m) => m.slice(0, m.indexOf(":")))));
    for (const [key, r] of Object.entries(records)) {
      const keep = r.kind === "moment" ? sections.has(String(r.payload.sectionId)) : r.kind === "section" ? sections.has(r.recordId) : r.kind === "entry" ? entries.has(r.recordId) : false;
      if (!keep) delete records[key];
    }
  }
  saveOnce(snapshotFile, { at: new Date().toISOString(), ...out, readOnlyProductionQueries: queries, paidCalls: 0, productionMutations: 0 });
  const refs = Object.values(out.works).flatMap((w) => Object.values(w.references)).filter(Boolean).length;
  console.log(JSON.stringify({ cases: out.cases.length, records: Object.values(out.works).reduce((n, w) => n + Object.keys(w.records).length, 0), references: refs, readOnlyProductionQueries: queries, productionMutations: 0 }));
}

/** A snapshot `plan` may draw from: one `snapshot` took for this suite, or a full-engine suite text run's. */
function checkSnapshotRun(run: string) {
  const snap = snapshotOf(run);
  if (snap.kind === "lean-snapshot") { assert.equal(snap.suite, config.version, `${run} was taken for suite ${snap.suite}`); return; }
  const fromPlan = readJson(path.join(releases, run, "plan.json")) as { suite: string; tier: string };
  assert.equal(fromPlan.tier, "text", `${run} is neither a snapshot run nor a suite text run`); assert.equal(fromPlan.suite, config.version);
}

async function plan() {
  assert.ok(values.run && values.from && values.model, "--run, --from and --model are required");
  const runDir = path.join(releases, values.run); mkdirSync(runDir, { recursive: true });
  checkSnapshotRun(values.from);
  // Every image case, including those the full engine refused in its text run: the lean engine has no plan to refuse.
  // --cases and --styles narrow a pilot; a comparison run takes every case in every style.
  const only = new Set(list(values.cases)); const styles = new Set(list(values.styles));
  const all = suiteCases(config, allCases, "image").filter((c) => !only.size || only.has(c.caseId))
    .map((c) => ({ ...c, styles: c.styles.filter((s) => !styles.size || styles.has(s)) })).filter((c) => c.styles.length);
  const cases = [...all.filter((c) => c.split === "holdout"), ...all.filter((c) => c.split === "dev")];
  const shown = cases.reduce((n, c) => n + c.styles.length, 0);
  const isBatch = values.provider === "gemini-batch";
  const estimatedUsd = Math.round(shown * (isBatch ? 0.0215 : 0.037) * 1e4) / 1e4;
  const capUsd = values.cap ? Number(values.cap)
    : isBatch ? Math.ceil((estimatedUsd * 1.65 + 0.5) * 100) / 100
    : Math.ceil((estimatedUsd * 1.25 + DEFAULT_CONCURRENCY * CEILING_HEADROOM_USD) * 100) / 100;
  assert.ok(Number.isFinite(capUsd) && capUsd > 0);
  const out: Plan = { kind: "lean", suite: config.version, faults: faults.version, from: values.from, promptVersion: LEAN_PROMPT_VERSION, maxSheets: LEAN_MAX_SHEETS,
    image: { model: values.model, aspectRatio: "16:9", resolution: "1K" }, cases,
    evaluation: { estimatedUsd, capUsd, reserves: RESERVE, limits: { text: 0, image: shown + 10, check: 0 } } };
  saveOnce(path.join(runDir, "plan.json"), out);
  console.log(`lean run ${values.run}: ${cases.length} case(s), ${shown} image(s) on ${values.model}; estimate $${estimatedUsd.toFixed(2)}, cap $${capUsd.toFixed(2)}.`);
}

async function run() {
  assert.ok(values.run, "--run"); assert.ok(values.execute !== values.offline, "Choose --offline or --execute");
  const runDir = path.join(releases, values.run);
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  assert.equal(p.kind, "lean"); assert.equal(p.promptVersion, LEAN_PROMPT_VERSION, "The lean prompt changed since the plan");
  const snap = snapshotOf(p.from);
  const refDir = path.join(root, "evals/images/runs", p.from, "references");
  const outDir = values.offline ? mkdtempSync(path.join(os.tmpdir(), `lean-${values.run}-`)) : runDir;
  // A resumed run continues a stopped one: it renders only the images the run has not made, under what is left of the
  // cap after the earlier parts' measured and uncertain spend, and writes numbered ledger files beside the first.
  const useGemini = values.provider === "gemini";
  const useGeminiBatch = values.provider === "gemini-batch";
  assert.ok(values.provider === "openrouter" || useGemini || useGeminiBatch, `--provider must be openrouter, gemini or gemini-batch (got ${values.provider})`);
  const parts = ["", "-2", "-3", "-4"];
  let part = "";
  let capUsd = p.evaluation.capUsd;
  let attachBatchFile: string | null = null;
  if (values.resume) {
    assert.ok(values.execute, "--resume continues a paid run");
    const done = parts.filter((x) => existsSync(path.join(runDir, `run-finished${x}.json`)));
    const nextPart = parts[done.length];
    if (nextPart !== undefined && existsSync(path.join(runDir, `batch-job${nextPart}.json`))) {
      assert.ok(useGeminiBatch, `Unfinished batch job batch-job${nextPart}.json exists; resume with --provider gemini-batch`);
      part = nextPart;
      attachBatchFile = path.join(runDir, `batch-job${nextPart}.json`);
    } else {
      assert.ok(done.length && done.length < parts.length, "Nothing to resume");
      part = nextPart;
    }
    for (const x of done) { const f = readJson(path.join(runDir, `run-finished${x}.json`)); capUsd = Math.round((capUsd - f.measuredUsd - f.uncertainUsd) * 1e6) / 1e6; }
  }
  const imageDir = path.join(root, "evals/images/runs", values.run, values.offline ? "offline" : "images");
  let apiKey = "offline-rehearsal";
  let fetchImpl: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init);
  let pricing: ModelPricing | undefined;
  if (values.offline) fetchImpl = createOfflineOpenRouter().fetch;
  else {
    if (!attachBatchFile) {
      for (const name of [`run-started${part}.json`, `ledger${part}.json`, ...(part ? [] : ["results.ndjson"])]) assert.ok(!existsSync(path.join(runDir, name)), `One-shot artifact exists: ${name}`);
      const grant = readJson(path.join(runDir, "funding.json")) as { authorization: string; operationCapUsd: number };
      assert.ok(grant.authorization?.trim(), "funding.json needs an authorization"); assert.equal(grant.operationCapUsd, p.evaluation.capUsd, "funding.json must fund the plan's cap");
      assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit the plan, funding and code before calls");
    }
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const env = process.env.VISIBIBLE_EVAL_ENV_FILE ? parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8")) : {};
    const catalog = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data as Array<{ id: string } & Parameters<typeof modelPricing>[0]>;
    pricing = modelPricing(catalog.find((m) => m.id === p.image.model));
    assert.ok(pricing && pricing.imageOutput !== null && (imageCapabilities(p.image.model)?.outputTokens["1K"] ?? IMAGE_TOKENS_1K[p.image.model]),
      `${p.image.model} has no catalog price or known image size, so its calls cannot be bounded`);
    if (useGemini || useGeminiBatch) {
      const defaultKeyFile = path.join(os.homedir(), ".config/fragment/secrets/gemini-eval-key");
      apiKey = (env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? (existsSync(defaultKeyFile) ? readFileSync(defaultKeyFile, "utf8") : "")).trim();
      assert.ok(apiKey, "GEMINI_API_KEY is missing (set in VISIBIBLE_EVAL_ENV_FILE, env, or ~/.config/fragment/secrets/gemini-eval-key)");
      if (!attachBatchFile) {
        const grant = readJson(path.join(runDir, "funding.json")) as { authorization: string; operationCapUsd: number };
        saveOnce(path.join(runDir, `run-started${part}.json`), { at: new Date().toISOString(), provider: values.provider, commit, grant, capUsd,
          sources: Object.fromEntries(SOURCES.map((f) => [f, sha256(readFileSync(path.join(root, f)))])) });
      }
    } else {
      const grant = readJson(path.join(runDir, "funding.json")) as { authorization: string; operationCapUsd: number };
      apiKey = env.OPENROUTER_API_KEY!; assert.ok(apiKey, "OPENROUTER_API_KEY is missing from the eval env file");
      const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
      const balanceUsd = credits.total_credits - credits.total_usage;
      assert.ok(balanceUsd >= capUsd + PRODUCTION_HEADROOM_USD, `The account holds $${balanceUsd.toFixed(2)}; this run needs $${capUsd} plus $${PRODUCTION_HEADROOM_USD} for readers`);
      const key = (await (await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
      assert.ok(key.limit_remaining === null || key.limit_remaining >= capUsd + 1, `The key has $${key.limit_remaining} of its limit left; this run needs $${capUsd} plus $1`);
      saveOnce(path.join(runDir, `run-started${part}.json`), { at: new Date().toISOString(), provider: "openrouter", commit, grant, capUsd, balanceUsd, keyLimitRemaining: key.limit_remaining,
        sources: Object.fromEntries(SOURCES.map((f) => [f, sha256(readFileSync(path.join(root, f)))])) });
    }
  }
  mkdirSync(imageDir, { recursive: true });
  const record = (row: Record<string, unknown>) => appendFileSync(path.join(outDir, "results.ndjson"), `${JSON.stringify(row)}\n`);
  const made = new Set(ndjson(path.join(outDir, "results.ndjson")).filter((r) => r.outcome === "image").map((r) => r.key));
  const jobs = p.cases.flatMap((c) => c.styles.map((style) => ({ c, style }))).filter(({ c, style }) => !made.has(`${c.caseId}/${style}`));

  if (useGeminiBatch) {
    type BatchJobRecord = { batchName: string; inputFileName: string; refFileNames: string[]; keys: string[]; keyBounds: Record<string, number>; submittedAt: string; boundUsd: number };
    type AssembledJob = {
      key: string;
      base: Record<string, unknown>;
      sc: { momentId: string; sectionId: string };
      context: Awaited<ReturnType<typeof caseInputs>>["context"];
      rendering: Extract<Awaited<ReturnType<typeof assembleLean>>, { ok: true }>;
    };
    const attachedRecord = attachBatchFile ? (readJson(attachBatchFile) as BatchJobRecord) : null;
    const attachedKeySet = attachedRecord ? new Set(attachedRecord.keys) : null;
    const allJobs = p.cases.flatMap((c) => c.styles.map((style) => ({ c, style })));
    // On batch attachment, re-assemble every submitted key (including any already saved before an interruption)
    // so the ledger accounts for the entire batch's spend; `made` skips duplicate image/result writes.
    const batchJobs = attachedKeySet
      ? allJobs.filter(({ c, style }) => attachedKeySet.has(`${c.caseId}/${style}`))
      : jobs;
    const assembled: AssembledJob[] = [];
    const uniqueRefs = new Map<string, Uint8Array>();
    for (const { c, style } of batchJobs) {
      const key = `${c.caseId}/${style}`;
      const base = { tier: "image", case: c.unitId, caseId: c.caseId, work: c.work, split: c.split, key, style };
      const { inputs, w, sc, context } = await caseInputs(snap, c);
      const rendering = await assembleLean({
        inputs,
        getRecord: async (kind, recordId) => w.records[`${kind}:${recordId}`] ?? null,
        listMoments: async () => Object.values(w.records).filter((r) => r.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) })),
        getReference: async (kind, recordId) => w.references[`${kind}:${recordId}`] ?? null,
        loadReference: async (storageId) => {
          const bytes = new Uint8Array(readFileSync(path.join(refDir, `${storageId}.jpg`)));
          assert.equal(sha256(bytes), w.files[storageId].sha256, `Reference ${storageId} changed since the snapshot`);
          uniqueRefs.set(storageId, bytes);
          return bytes;
        },
        onReferenceUnavailable: (_kind, _id, error) => { throw error; },
      }, { workId: c.work, unitId: c.unitId, styleId: style, aspectRatio: p.image.aspectRatio });
      if (!rendering.ok) {
        if (!attachBatchFile) record({ ...base, outcome: "refused", stage: "lean", reason: rendering.reason, message: rendering.message });
        continue;
      }
      assert.equal(rendering.momentId, sc.momentId, `${key}: the snapshot names another moment`);
      assembled.push({ key, base, sc, context, rendering });
    }
    const byKey = new Map(assembled.map((j) => [j.key, j]));
    assert.ok(assembled.length <= p.evaluation.limits.image, `Batch has ${assembled.length} images, above limit ${p.evaluation.limits.image}`);

    const outputTokens1K = imageCapabilities(p.image.model)?.outputTokens["1K"] ?? IMAGE_TOKENS_1K[p.image.model];
    const keyBounds: Record<string, number> = attachedRecord?.keyBounds ? { ...attachedRecord.keyBounds } : {};
    if (!attachedRecord?.keyBounds) {
      for (const j of assembled) {
        const bound = pricing
          ? geminiBatchJobBoundUsd({ promptChars: j.rendering.prompt.length, referenceCount: j.rendering.sentReferences.length, outputTokens1K, pricing })
          : Math.round((p.evaluation.reserves.image * GEMINI_BATCH_DISCOUNT) * 1e6) / 1e6;
        assert.ok(bound !== null, `${p.image.model}: unable to bound batch job ${j.key}`);
        keyBounds[j.key] = bound;
      }
    }
    const totalBoundUsd = Math.round(Object.values(keyBounds).reduce((sum, b) => sum + b, 0) * 1e9) / 1e9;
    if (!values.offline && !attachBatchFile) {
      assert.ok(totalBoundUsd <= capUsd, `Batch pre-flight bound $${totalBoundUsd.toFixed(2)} exceeds cap $${capUsd.toFixed(2)}`);
    }

    const ledgerState: LedgerState = { capUsd, calls: [], measuredUsd: 0, uncertainUsd: totalBoundUsd, counts: { text: 0, image: 0, check: 0 }, blocked: null };
    const saveLedger = () => writeFileSync(path.join(outDir, `ledger${part}.json`), `${JSON.stringify(ledgerState, null, 2)}\n`);
    const logProvider = (entry: Record<string, unknown>) => appendFileSync(path.join(outDir, `provider${part}.ndjson`), `${JSON.stringify(entry)}\n`);
    saveLedger();

    const started = Date.now();
    let batchName = "offline/batch-1";
    let uploadedToCleanup: string[] = [];
    const seenKeys = new Set<string>();
    const handleOutputLine = (line: string, elapsedTotalMs: number) => {
      const item = parseGeminiBatchOutputLine(line, pricing);
      const job = byKey.get(item.key);
      if (!job) return;
      seenKeys.add(item.key);
      const reserve = keyBounds[item.key] ?? 0;
      const costUsd = values.offline ? Math.round((p.evaluation.reserves.image * GEMINI_BATCH_DISCOUNT) * 1e6) / 1e6 : item.costUsd;
      ledgerState.counts.image++;
      ledgerState.calls.push({ phase: item.key, kind: "image", status: item.ok ? "200" : item.moderated ? "403" : "500", measuredUsd: costUsd });
      if (costUsd !== null) {
        ledgerState.uncertainUsd = Math.max(0, Math.round((ledgerState.uncertainUsd - reserve) * 1e9) / 1e9);
        ledgerState.measuredUsd = Math.round((ledgerState.measuredUsd + costUsd) * 1e9) / 1e9;
      }
      logProvider({
        phase: item.key, kind: "image", batchName, at: new Date().toISOString(),
        status: item.ok ? 200 : item.moderated ? 403 : 500,
        reservedUsd: reserve,
        response: scrubForLog(item.response, apiKey, sha256),
        measuredUsageUsd: costUsd,
      });
      if (made.has(item.key)) return;
      if (item.ok) {
        const extension = item.mimeType === "image/jpeg" ? "jpg" : item.mimeType.split("/")[1] ?? "png";
        const file = path.join(imageDir, `${item.key.replaceAll("/", "__")}__a1.${extension}`);
        writeFileSync(file, item.bytes);
        const present = job.rendering.present.map((m) => m.entryId);
        record({
          ...job.base, outcome: "image", momentId: job.sc.momentId, sectionId: job.sc.sectionId, context: job.context,
          prompt: job.rendering.prompt, packet: job.rendering.packet,
          references: job.rendering.references.map((r) => ({ kind: r.kind, storageId: r.storageId, caption: r.caption })),
          prepared: { present: job.rendering.present.map((m) => ({ entryId: m.entryId, stageId: m.stageId })), plan: { present, primarySubject: `${job.context.moment.reference}: ${job.context.moment.text.slice(0, 200)}`, secondaryElements: "" } },
          attempts: [{ n: 1, file: path.relative(root, file), sha256: sha256(item.bytes), bytes: item.bytes.length, mimeType: item.mimeType, costUsd, elapsedMs: elapsedTotalMs, providerRequestId: item.providerRequestId }],
          chosen: 1, elapsedMs: elapsedTotalMs,
        });
      } else {
        record({ ...job.base, outcome: "failed", stage: "image", message: item.error.slice(0, 400), elapsedMs: elapsedTotalMs });
      }
    };

    if (values.offline) {
      // Exercise JSONL construction and batch response parsing with a tiny valid 1x1 JPEG.
      const tinyJpegB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
      for (const j of assembled) {
        const reqLine = buildGeminiBatchLine({
          key: j.key, prompt: j.rendering.prompt, model: p.image.model, aspectRatio: p.image.aspectRatio, resolution: p.image.resolution,
          references: j.rendering.sentReferences.map((r) => ({ kind: "file" as const, mimeType: "image/jpeg", fileUri: `https://generativelanguage.googleapis.com/v1beta/files/offline-${r.storageId}` })),
        });
        assert.ok(reqLine.key === j.key);
        handleOutputLine(JSON.stringify({
          key: j.key,
          response: {
            responseId: `offline-${j.key}`,
            usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 1600, thoughtsTokenCount: 480, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }] },
            candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: tinyJpegB64 } }] } }],
          },
        }), Date.now() - started);
      }
    } else {
      let jobRecord: BatchJobRecord;
      if (attachedRecord) {
        jobRecord = attachedRecord;
        batchName = jobRecord.batchName;
        uploadedToCleanup = [jobRecord.inputFileName, ...jobRecord.refFileNames];
        console.log(JSON.stringify({ batchAttach: batchName, keys: jobRecord.keys.length, boundUsd: jobRecord.boundUsd }));
      } else {
        // Upload each unique reference JPEG once via the Files API so JSONL stays small (~1.5 MB instead of ~185 MB).
        const refEntries = [...uniqueRefs.entries()];
        const refUriById = new Map<string, { name: string; uri: string }>();
        const refQueue = [...refEntries];
        await Promise.all(Array.from({ length: Math.min(4, Math.max(1, refQueue.length)) }, async () => {
          for (let item = refQueue.shift(); item; item = refQueue.shift()) {
            const [storageId, bytes] = item;
            const uploaded = await uploadGeminiFile({ apiKey, bytes, mimeType: "image/jpeg", displayName: `ref-${storageId}` });
            refUriById.set(storageId, uploaded);
          }
        }));
        const refFileNames = [...refUriById.values()].map((f) => f.name);
        console.log(JSON.stringify({ uploadedReferences: refFileNames.length, boundUsd: Math.round(totalBoundUsd * 100) / 100 }));

        const jsonlLines = assembled.map((j) => JSON.stringify(buildGeminiBatchLine({
          key: j.key, prompt: j.rendering.prompt, model: p.image.model, aspectRatio: p.image.aspectRatio, resolution: p.image.resolution,
          references: j.rendering.sentReferences.map((r) => ({ kind: "file" as const, mimeType: "image/jpeg", fileUri: refUriById.get(r.storageId)!.uri })),
        })));
        const jsonlBytes = new Uint8Array(Buffer.from(`${jsonlLines.join("\n")}\n`, "utf8"));
        const inputFile = await uploadGeminiFile({ apiKey, bytes: jsonlBytes, mimeType: "application/jsonl", displayName: `lean-${values.run}${part}` });
        const submitted = await submitGeminiBatch({ apiKey, model: p.image.model, inputFileName: inputFile.name, displayName: `lean-${values.run}${part}` });
        batchName = submitted.name;
        uploadedToCleanup = [inputFile.name, ...refFileNames];
        jobRecord = { batchName, inputFileName: inputFile.name, refFileNames, keys: assembled.map((j) => j.key), keyBounds, submittedAt: new Date().toISOString(), boundUsd: Math.round(totalBoundUsd * 1e4) / 1e4 };
        saveOnce(path.join(outDir, `batch-job${part}.json`), jobRecord);
        console.log(JSON.stringify({ batchSubmitted: batchName, state: submitted.state, images: assembled.length, boundUsd: jobRecord.boundUsd }));
      }

      const finalStatus = await pollGeminiBatch({
        apiKey, batchName, pollIntervalMs: 15_000,
        onPoll: (status, attempt) => {
          if (attempt === 1 || attempt % 4 === 0 || (status.state !== "BATCH_STATE_RUNNING" && status.state !== "JOB_STATE_RUNNING")) {
            console.log(JSON.stringify({ batchPoll: batchName, attempt, state: status.state, elapsedSec: Math.round((Date.now() - started) / 1000) }));
          }
        },
      });
      if (!isGeminiBatchSucceeded(finalStatus.state) || !finalStatus.responsesFile) {
        const reason = !isGeminiBatchSucceeded(finalStatus.state)
          ? `Gemini batch ${batchName} ended in ${finalStatus.state}: ${JSON.stringify(finalStatus.error ?? finalStatus.raw).slice(0, 300)}`
          : `Gemini batch ${batchName} succeeded without a responsesFile`;
        ledgerState.blocked = reason;
        for (const job of assembled) {
          ledgerState.counts.image++;
          ledgerState.calls.push({ phase: job.key, kind: "image", status: "uncertain", measuredUsd: null });
          if (!made.has(job.key)) record({ ...job.base, outcome: "failed", stage: "image", message: reason.slice(0, 400), elapsedMs: Date.now() - started });
        }
        saveLedger();
        if (uploadedToCleanup.length) await Promise.all(uploadedToCleanup.map((fileName) => deleteGeminiFile({ apiKey, fileName })));
        const finished = { at: new Date().toISOString(), batchName, measuredUsd: ledgerState.measuredUsd, uncertainUsd: ledgerState.uncertainUsd, counts: ledgerState.counts, blocked: ledgerState.blocked,
          outcomes: { failed: assembled.filter((j) => !made.has(j.key)).length }, imageMs: null, batchElapsedMs: Date.now() - started, productionMutations: 0 };
        writeFileSync(path.join(outDir, `run-finished${part}.json`), `${JSON.stringify(finished, null, 2)}\n`, { flag: "wx" });
        throw new Error(reason);
      }
      const elapsedDownloadStart = Date.now() - started;
      await streamGeminiFileLines({
        apiKey,
        fileName: finalStatus.responsesFile,
        onLine: (line) => handleOutputLine(line, elapsedDownloadStart),
      });
    }

    const elapsedTotalMs = Date.now() - started;
    for (const job of assembled) {
      if (!seenKeys.has(job.key)) {
        ledgerState.counts.image++;
        ledgerState.calls.push({ phase: job.key, kind: "image", status: "uncertain", measuredUsd: null });
        if (!made.has(job.key)) record({ ...job.base, outcome: "failed", stage: "image", message: `Missing from batch ${batchName} output`, elapsedMs: elapsedTotalMs });
      }
    }
    saveLedger();

    // Best-effort cleanup of uploaded temporary files.
    if (!values.offline && uploadedToCleanup.length) {
      await Promise.all(uploadedToCleanup.map((fileName) => deleteGeminiFile({ apiKey, fileName })));
    }

    const rows = ndjson(path.join(outDir, "results.ndjson")).filter((r) => !made.has(r.key));
    const outcomes: Record<string, number> = {};
    for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    const finished = { at: new Date().toISOString(), batchName, measuredUsd: ledgerState.measuredUsd, uncertainUsd: ledgerState.uncertainUsd, counts: ledgerState.counts, blocked: ledgerState.blocked, outcomes,
      imageMs: null, batchElapsedMs: elapsedTotalMs, productionMutations: 0 };
    writeFileSync(path.join(outDir, `run-finished${part}.json`), `${JSON.stringify(finished, null, 2)}\n`, { flag: values.offline ? "w" : "wx" });
    console.log(JSON.stringify({ done: true, outDir: values.offline ? outDir : path.relative(root, outDir), ...finished }));
    return;
  }

  // A content-filter refusal returns 200 with no image and zero or no usage; it is that image's failure at no cost, not
  // the run's, so it reaches the ledger as the moderation refusal it is.
  const upstream = fetchImpl;
  const filtered: typeof fetchImpl = async (url, init) => {
    const response = await upstream(url, init);
    if (!response.ok) return response;
    const body = await response.text();
    try {
      const payload = JSON.parse(body) as {
        choices?: Array<{ finish_reason?: string }>; usage?: { cost?: number };
        promptFeedback?: { blockReason?: string };
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
      };
      if (useGemini) {
        const hasImage = (payload.candidates ?? []).some((c) => c.content?.parts?.some((pt) => Boolean(pt?.inlineData?.data)));
        const reason = payload.promptFeedback?.blockReason ?? payload.candidates?.[0]?.finishReason ?? "";
        if (!hasImage && GEMINI_SAFETY_REASONS.test(reason))
          return new Response(JSON.stringify({ error: { message: "flagged: provider content filter", provider: payload } }), { status: 403, headers: { "Content-Type": "application/json" } });
      } else if (payload.choices?.[0]?.finish_reason === "content_filter" && !payload.usage?.cost) {
        return new Response(JSON.stringify({ error: { message: "flagged: provider content filter", provider: payload } }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
    } catch { /* a non-JSON body is the ledger's to judge */ }
    return new Response(body, { status: response.status, headers: response.headers });
  };
  // The most a call can cost: its text at the suite's ceiling, plus the output image at the model's image price. Reserved
  // before the call is sent, so spend cannot pass the cap whatever the model.
  const ceiling = pricing ? (_kind: string, request: Record<string, unknown>) => {
    const text = requestCeilingUsd("text", { model: p.image.model, ...request }, pricing);
    return text === null ? null : text + (imageCapabilities(p.image.model)?.outputTokens["1K"] ?? IMAGE_TOKENS_1K[p.image.model]) * pricing!.imageOutput!;
  } : undefined;
  const ledger = createLedger({ capUsd, reserves: p.evaluation.reserves, limits: p.evaluation.limits, fetch: filtered, ceiling,
    url: useGemini && !values.offline ? geminiGenerateUrl(p.image.model) : undefined,
    extractCost: useGemini && !values.offline ? (payload) => geminiUsageUsd(payload, pricing!) : undefined,
    save: (state) => writeFileSync(path.join(outDir, `ledger${part}.json`), `${JSON.stringify(state, null, 2)}\n`),
    log: (entry) => appendFileSync(path.join(outDir, `provider${part}.ndjson`), `${JSON.stringify(entry)}\n`),
    scrub: (value) => scrubForLog(value, apiKey, sha256) });
  const runOne = async ({ c, style }: (typeof jobs)[number]) => {
    const key = `${c.caseId}/${style}`;
    const base = { tier: "image", case: c.unitId, caseId: c.caseId, work: c.work, split: c.split, key, style };
    const started = Date.now();
    try {
      // The request path's own assembly, reading the snapshot where production reads Convex.
      const { inputs, w, sc, context } = await caseInputs(snap, c);
      const rendering = await assembleLean({
        inputs,
        getRecord: async (kind, recordId) => w.records[`${kind}:${recordId}`] ?? null,
        listMoments: async () => Object.values(w.records).filter((r) => r.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) })),
        getReference: async (kind, recordId) => w.references[`${kind}:${recordId}`] ?? null,
        loadReference: async (storageId) => {
          const bytes = new Uint8Array(readFileSync(path.join(refDir, `${storageId}.jpg`)));
          assert.equal(sha256(bytes), w.files[storageId].sha256, `Reference ${storageId} changed since the snapshot`);
          return bytes;
        },
        // Production drops a reference that will not load; a frozen run must not pay for an image without it.
        onReferenceUnavailable: (_kind, _id, error) => { throw error; },
      }, { workId: c.work, unitId: c.unitId, styleId: style, aspectRatio: p.image.aspectRatio });
      if (!rendering.ok) { record({ ...base, outcome: "refused", stage: "lean", reason: rendering.reason, message: rendering.message }); return; }
      assert.equal(rendering.momentId, sc.momentId, `${key}: the snapshot names another moment`);
      const references = rendering.sentReferences.map((r) => ({ bytes: r.bytes, mimeType: "image/jpeg" }));
      const provider = useGemini && !values.offline
        ? createGeminiEvalImageProvider({ apiKey, pricing, timeoutMs: 180_000, fetch: ledger.fetchFor("image", () => key) })
        : createOpenRouterEvalImageProvider({ apiKey, timeoutMs: 180_000, fetch: ledger.fetchFor("image", () => key) });
      const image = await provider.generate({ label: key, prompt: rendering.prompt, model: p.image.model, aspectRatio: p.image.aspectRatio, resolution: p.image.resolution, references });
      const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1] ?? "png";
      const file = path.join(imageDir, `${key.replaceAll("/", "__")}__a1.${extension}`);
      writeFileSync(file, image.bytes);
      const present = rendering.present.map((m) => m.entryId);
      record({ ...base, outcome: "image", momentId: sc.momentId, sectionId: sc.sectionId, context, prompt: rendering.prompt, packet: rendering.packet,
        references: rendering.references.map((r) => ({ kind: r.kind, storageId: r.storageId, caption: r.caption })),
        // The consistency tool reads a plan's present cast and a scene line; the lean arm's scene is its moment.
        prepared: { present: rendering.present.map((m) => ({ entryId: m.entryId, stageId: m.stageId })), plan: { present, primarySubject: `${context.moment.reference}: ${context.moment.text.slice(0, 200)}`, secondaryElements: "" } },
        attempts: [{ n: 1, file: path.relative(root, file), sha256: sha256(image.bytes), bytes: image.bytes.length, mimeType: image.mimeType, costUsd: image.costUsd, elapsedMs: image.elapsedMs, providerRequestId: image.providerRequestId ?? null }],
        chosen: 1, elapsedMs: Date.now() - started });
      console.log(JSON.stringify({ key, present, refs: rendering.references.length, usd: image.costUsd, ms: image.elapsedMs }));
    } catch (error) {
      record({ ...base, outcome: "failed", stage: "image", message: String(error).slice(0, 400), elapsedMs: Date.now() - started });
      console.log(JSON.stringify({ key, failed: String(error).slice(0, 200) }));
    }
  };
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) { if (ledger.state.blocked) return; await runOne(job); }
  }));
  const rows = ndjson(path.join(outDir, "results.ndjson")).filter((r) => !made.has(r.key));
  const outcomes: Record<string, number> = {};
  for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  const elapsed = rows.flatMap((r) => r.attempts?.map((a: { elapsedMs: number }) => a.elapsedMs) ?? []).sort((a: number, b: number) => a - b);
  const finished = { at: new Date().toISOString(), measuredUsd: ledger.state.measuredUsd, uncertainUsd: ledger.state.uncertainUsd, counts: ledger.state.counts, blocked: ledger.state.blocked, outcomes,
    imageMs: elapsed.length ? { median: elapsed[Math.floor(elapsed.length / 2)], p90: elapsed[Math.floor(elapsed.length * 0.9)] } : null, productionMutations: 0 };
  writeFileSync(path.join(outDir, `run-finished${part}.json`), `${JSON.stringify(finished, null, 2)}\n`, { flag: values.offline ? "w" : "wx" });
  console.log(JSON.stringify({ done: true, outDir: values.offline ? outDir : path.relative(root, outDir), ...finished }));
}

/** Asked beside the suite's faults: it separates readable writing from the small marks the launch bar accepts. */
const READABLE_TEXT = "readable_text";

/** Both arms' shown images in one pack (or candidate alone when baseline images are absent, reusing baseline's committed scores), judged against the moment's text. */
async function blind() {
  assert.ok(values.run && values.baseline, "--run and --baseline are required");
  const baseline = path.relative(root, path.resolve(root, values.baseline));
  const runDir = path.join(releases, values.run);
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  const scoringDir = path.join(runDir, "scoring");
  assert.ok(!existsSync(scoringDir), "Keep the first scorer packs");
  mkdirSync(scoringDir, { recursive: true });
  const blindDir = path.join(root, "evals/images/runs", values.run, "blind"); mkdirSync(blindDir, { recursive: true });
  const snap = snapshotOf(p.from);
  const singleArm = !values["baseline-images"];
  const arms = [
    { arm: "lean", rows: ndjson(path.join(runDir, "results.ndjson")), resolve: (file: string) => path.join(root, file) },
    ...(singleArm ? [] : [{ arm: "full", rows: ndjson(path.join(root, baseline, "results.ndjson")), resolve: (file: string) => path.join(path.resolve(values["baseline-images"]!), path.basename(file)) }]),
  ];
  const pool: Array<{ arm: string; row: ResultRow; file: string; sha: string }> = [];
  for (const { arm, rows, resolve } of arms) for (const row of rows.filter((r) => r.outcome === "image")) {
    const attempt = row.attempts[(row.chosen ?? 1) - 1];
    const file = resolve(attempt.file);
    assert.equal(sha256(readFileSync(file)), attempt.sha256, `${arm} ${row.key}: image does not match its recorded hash`);
    pool.push({ arm, row, file, sha: attempt.sha256 });
  }
  const order = [...pool].sort((a, b) => drawFraction(`${config.seed}:${values.run}:joint`, `${a.arm}/${a.row.key}`) - drawFraction(`${config.seed}:${values.run}:joint`, `${b.arm}/${b.row.key}`));
  const items: Array<Record<string, unknown>> = []; const key: Array<Record<string, unknown>> = [];
  for (const [index, { arm, row, file, sha }] of order.entries()) {
    const id = `j${String(index + 1).padStart(3, "0")}`;
    const inputs = await inputsFor(row.work);
    const c = p.cases.find((x) => x.caseId === row.caseId)!;
    const { context, cast: members } = await caseInputs(snap, c);
    const ask = [...faultsFor(faults, "image", { effects: Boolean(inputs.depiction.modes.effects) }).map((f) => f.id), READABLE_TEXT];
    const accepted = faults.image.filter((f) => ask.includes(f.id) && f.acceptedIn?.includes(row.style)).map((f) => f.id);
    // Arm-neutral: every subject without form in the section may never be drawn, whichever arm selected it.
    const neverDrawn = members.filter((m) => m.depiction === "effects").map((m) => m.name);
    const blindFile = path.join(blindDir, `${id}${path.extname(file)}`);
    copyFileSync(file, blindFile);
    items.push({ id, ask, accepted, file: path.relative(root, blindFile), work: inputs.work.work.title, reference: context.moment.reference, text: context.moment.text,
      previous: context.previous?.text ?? null, next: context.next?.text ?? null, depictionRules: applicableRules(inputs.brief, row.style), neverDrawn });
    key.push({ id, arm, key: row.key, caseId: row.caseId, work: row.work, style: row.style, split: row.split, faults: ask, sha256: sha });
  }
  const batches = Math.max(1, Number(values.batches)); const size = Math.ceil(items.length / batches);
  for (let b = 0; b < batches; b++) saveOnce(path.join(scoringDir, `items-${b + 1}.json`), { tier: "image", items: items.slice(b * size, (b + 1) * size) });
  writeFileSync(path.join(scoringDir, "SCORING.md"), jointInstructions(), { flag: "wx" });
  saveOnce(path.join(scoringDir, "key.json"), { run: values.run, baseline, ...(singleArm ? { singleArm: true, baselineArm: values["baseline-arm"] } : {}), suite: p.suite, faults: p.faults, items: key });
  console.log(`${items.length} item(s) (${pool.filter((x) => x.arm === "lean").length} lean, ${pool.filter((x) => x.arm === "full").length} full) in ${batches} batch(es) under ${path.relative(root, scoringDir)}.`);
}

function jointInstructions() {
  const fault = (id: string, question: string) => `- \`${id}\` (${faults.image.find((f) => f.id === id)!.label}): ${question}`;
  const q = Object.fromEntries(faults.image.map((f) => [f.id, f.question]));
  const lines = faults.image.map((f) => f.id === "extra_figures"
    ? fault(f.id, "Does it show a prominent figure the moment's text does not call for, such as a narrator, a speaker inside their own words, or a named figure who is not in the moment?")
    : f.id === "scene_mismatch" ? fault(f.id, "Does it fail to show the moment the text describes: the wrong subject, action or place?")
    : `${fault(f.id, q[f.id])}${f.effectsOnly ? " Answer `na` when the item lists no subject under `neverDrawn`." : ""}${f.acceptedIn?.length ? " When the item lists it under `accepted`, record it, but it does not make the item flawed." : ""}`);
  return `# Joint scoring instructions: image tier (faults ${faults.version}, judged against the text)

Your items file lists illustrations. Each item gives the image file, the moment's text (\`text\`) with the verse or line before and after it for context, the work's depiction rules, \`neverDrawn\` (subjects that may never be drawn as a figure) and under \`accepted\` any fault its style accepts. Judge each image against the moment's text: it should show that moment, with the people and places the text names. View every image file yourself at full resolution and judge only from what you see and its own item. Answer only the faults the item's \`ask\` lists. Do not read \`key.json\` or any other file in the run folder, and do not look at another scorer's answers. Never edit, crop or overwrite an image file; if you need a crop, write it to your own scratch folder.

\`${READABLE_TEXT}\` is not a fault of its own: it says how serious any lettering is, so it never changes your \`overall\` verdict. When you answer \`lettering\` \`yes\`, say in \`notes\` what the marks are.

For each item, answer every fault its \`ask\` lists with \`yes\` (the fault is present), \`no\` or \`na\` (it cannot apply), then give one \`overall\` verdict: \`acceptable\`, \`flawed\` (any fault present that the item does not list under \`accepted\`) or \`uncertain\`, and \`notes\`: one or two sentences naming what drives your answers, with where you saw it.

${lines.join("\n")}
- \`${READABLE_TEXT}\`: Is any of that lettering a readable word in the reader's language, a caption, or an artist's signature, initials or signature-like scrawl? Answer \`no\` when the only marks are small or unreadable: pseudo-script, squiggles on a page, letter shapes that spell no word, clock numerals, playing-card corner indices or pips. Answer \`na\` when \`lettering\` is \`no\`.

Write JSON to the path you are given, in this shape:

\`\`\`json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "j001", "faults": { "${faults.image[0].id}": "no", "…": "…" }, "overall": "acceptable", "notes": "..." }
] }
\`\`\`

Score every item you are given exactly once, answering every fault its \`ask\` lists.
`;
}

async function report() {
  assert.ok(values.run, "--run");
  const runDir = path.join(releases, values.run);
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  const scoringDir = path.join(runDir, "scoring");
  const key = readJson(path.join(scoringDir, "key.json")) as { baseline: string; singleArm?: boolean; baselineArm?: string; items: Array<{ id: string; arm: string; key: string; caseId: string; work: string; style: string; split: string; faults: string[] }> };
  const files = list(values.scores).map((f) => scoreFileSchema.parse(readJson(path.resolve(root, f))));
  const byScorer = new Map<string, ScoreFile>();
  for (const f of files) { const prior = byScorer.get(f.scorer); byScorer.set(f.scorer, prior ? { ...prior, scores: [...prior.scores, ...f.scores] } : f); }
  const operator = values.operator ? operatorFileSchema.parse(readJson(path.resolve(root, values.operator))) : undefined;
  const { settled, disputes } = settleScores(key.items.map((i) => ({ id: i.id, faults: i.faults })), [...byScorer.values()], operator);
  writeFileSync(path.join(scoringDir, "scores.json"), `${JSON.stringify({ scorers: [...byScorer.keys()], operator: operator?.scorer ?? null, settled, disputes }, null, 2)}\n`);
  if (disputes.length) { writeFileSync(path.join(scoringDir, "disputes.json"), `${JSON.stringify(disputes, null, 2)}\n`); console.log(`${disputes.length} disputed; rule on scoring/disputes.json, then report again with --operator.`); }
  // Each arm's items: its images scored here, plus its refusals. As in the suite report, a provider failure is not an item.
  const armItems = (arm: string, rows: Array<ResultRow>, styleOf: (c: string) => string[], keyItems: typeof key.items, settledMap: Record<string, JudgedItem["score"] & object>) => {
    const items: JudgedItem[] = [];
    for (const row of rows) {
      if (row.outcome === "image") { const k = keyItems.find((i) => i.arm === arm && i.key === row.key)!; items.push({ key: row.key, caseId: row.caseId, work: row.work, style: row.style, split: row.split, refused: false, score: settledMap[k.id] ?? null }); }
      else if (row.outcome === "refused") for (const style of row.standsFor ?? (row.style ? [row.style] : styleOf(row.caseId)))
        items.push({ key: `${row.caseId}/${style}`, caseId: row.caseId, work: row.work, style, split: row.split, refused: true, score: null });
    }
    return items;
  };
  const styleOf = (caseId: string): string[] => [...(p.cases.find((c) => c.caseId === caseId)?.styles ?? [])];
  const leanRows = ndjson(path.join(runDir, "results.ndjson"));
  const baseKey = key.singleArm
    ? (readJson(path.join(root, key.baseline, "scoring/key.json")) as { baseline?: string; suite?: string; items: typeof key.items })
    : null;
  const baseArm = key.singleArm ? (key.baselineArm ?? "lean") : "full";
  assert.ok(baseArm === "lean" || baseArm === "full", `Unsupported baseline arm: ${baseArm}`);
  const baseResultsDir = !key.singleArm || baseArm === "lean"
    ? path.join(root, key.baseline)
    : (assert.ok(baseKey?.baseline, `Baseline key at ${key.baseline}/scoring/key.json has no baseline path for arm "full"`), path.join(root, baseKey.baseline));
  const fullRows = ndjson(path.join(baseResultsDir, "results.ndjson"));
  const baseKeyItems = baseKey ? baseKey.items : key.items;
  const baseSuite = baseKey ? (baseKey.suite ?? (readJson(path.join(root, key.baseline, "plan.json")) as Plan).suite) : p.suite;
  const baseScoresFile = key.singleArm ? (readJson(path.join(root, key.baseline, "scoring/scores.json")) as { settled: typeof settled; disputes: unknown[] }) : null;
  const baseSettled = baseScoresFile ? baseScoresFile.settled : settled;
  const baseDisputes = baseScoresFile ? baseScoresFile.disputes.length : disputes.length;
  const lean = armItems("lean", leanRows, styleOf, key.items, settled);
  const full = armItems(baseArm, fullRows, styleOf, baseKeyItems, baseSettled);
  // The operator's classification of lettering the scorers called readable (scoring/small-marks.json), made by blind id:
  // a card index or clock numeral is readable yet accepted by the ADR, so its answer becomes no for the launch bar only.
  const marksFile = path.join(scoringDir, "small-marks.json");
  const acceptedMarks = new Set(existsSync(marksFile) ? (readJson(marksFile) as { items: Array<{ id: string; classification: string }> }).items.filter((i) => i.classification === "accepted small marks").map((i) => i.id) : []);
  const forBar = Object.fromEntries(Object.entries(settled).map(([id, score]) => [id, acceptedMarks.has(id) ? { ...score, faults: { ...score.faults, [READABLE_TEXT]: "no" as const } } : score]));
  const baseMarksFile = key.singleArm ? path.join(root, key.baseline, "scoring/small-marks.json") : marksFile;
  const baseAcceptedMarks = new Set(existsSync(baseMarksFile) ? (readJson(baseMarksFile) as { items: Array<{ id: string; classification: string }> }).items.filter((i) => i.classification === "accepted small marks").map((i) => i.id) : []);
  const baseForBar = Object.fromEntries(Object.entries(baseSettled).map(([id, score]) => [id, baseAcceptedMarks.has(id) ? { ...score, faults: { ...score.faults, [READABLE_TEXT]: "no" as const } } : score]));
  // The launch bar (ADR 0006 amendment 7): an image whose only fault is lettering that nobody can read is acceptable.
  const launchBar = (items: JudgedItem[]) => items.map((i) => {
    if (!i.score || i.score.overall === "uncertain" || i.score.faults[READABLE_TEXT] === "yes") return i;
    const present = faults.image.filter((f) => i.score!.faults[f.id] === "yes" && !(i.style && f.acceptedIn?.includes(i.style))).map((f) => f.id);
    return present.length === 1 && present[0] === "lettering" ? { ...i, score: { ...i.score, overall: "acceptable" as const } } : i;
  });
  const baseLabel = key.singleArm ? "baseline" : "full";
  const summary = { lean: summarizeBy(lean, faults.image), [baseLabel]: summarizeBy(full, faults.image) };
  const launch = { lean: summarizeBy(launchBar(armItems("lean", leanRows, styleOf, key.items, forBar)), faults.image), [baseLabel]: summarizeBy(launchBar(armItems(baseArm, fullRows, styleOf, baseKeyItems, baseForBar)), faults.image) };
  const gate = evaluateSuiteGate({ config, faults: faults.image, expected: expectedHoldoutKeys(config, allCases, "image"),
    candidate: { suiteVersion: p.suite, items: lean, disputes: disputes.length }, baseline: { suiteVersion: baseSuite, items: full, disputes: baseDisputes } });
  writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify({ run: values.run, baseline: key.baseline, disputes: disputes.length, summary, launchBar: launch, gate }, null, 2)}\n`);
  const pct = (r: { rate: number | null; yes: number; judged: number }) => r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(0)}% (${r.yes}/${r.judged})`;
  for (const [arm, s] of Object.entries(launch)) console.log(`${arm} launch bar (small marks accepted): ${pct(s.overall.acceptable)}; ${Object.entries(s.byWork).map(([w, x]) => `${w} ${pct(x.acceptable)}`).join(", ")}`);
  for (const [arm, s] of Object.entries(summary)) {
    console.log(`${arm}: acceptable ${pct(s.overall.acceptable)}, refused ${pct(s.overall.refused)}`);
    for (const [work, w] of Object.entries(s.byWork)) console.log(`  ${work}: ${pct(w.acceptable)}`);
    for (const [split, w] of Object.entries(s.bySplit)) console.log(`  ${split}: ${pct(w.acceptable)}`);
    for (const f of faults.image) console.log(`  ${f.id}: ${pct(s.overall.faults[f.id])}`);
  }
  console.log(gate.pass ? `Gate passes: lean against ${baseLabel}.` : `Gate FAILS: lean against ${baseLabel}:\n  ${gate.reasons.join("\n  ")}`);
}

async function pairing() {
  assert.ok(values.run && values.out, "--run and --out are required");
  const p = readJson(path.join(releases, values.run, "plan.json")) as Plan;
  const snap = snapshotOf(p.from);
  const arms: Record<string, ResultRow[]> = { lean: ndjson(path.join(releases, values.run, "results.ndjson")) };
  if (values.baseline) arms.full = ndjson(path.join(root, values.baseline, "results.ndjson"));
  // Matched against a baseline, both arms take its planned cast; alone, each image takes what its own prompt asked for.
  const planned = arms.full ? new Map(arms.full.filter((r) => r.outcome === "image" && r.prepared).map((r) => [r.caseId, r.prepared!.plan.present])) : null;
  const own = async (c: SuiteCase) => {
    const { context, cast: members } = await caseInputs(snap, c);
    return leanDepicted(rankLeanCast(members, context.moment.text, { previous: context.previous?.text, next: context.next?.text })).map((m) => m.entryId);
  };
  for (const [arm, rows] of Object.entries(arms)) {
    const dir = path.join(path.resolve(values.out), arm); mkdirSync(dir, { recursive: true });
    const lines: string[] = [];
    let shown = 0;
    // Only the run's own cases, so a narrower run pairs against the same cases of a wider baseline. A resumed run can
    // hold a failed row and a later image for one key; the image stands.
    const imaged = new Set(rows.filter((r) => r.outcome === "image").map((r) => r.key));
    for (const row of rows.filter((r) => p.cases.some((c) => c.caseId === r.caseId) && (r.outcome === "image" || !imaged.has(r.key)))) {
      const c = p.cases.find((x) => x.caseId === row.caseId)!;
      const present = row.outcome !== "image" ? null : planned ? planned.get(row.caseId) ?? null : await own(c);
      // A verse with no image here, or none in the baseline to match, was attempted: it counts as run, never as paired.
      if (!present) { lines.push(JSON.stringify({ case: row.case, caseId: row.caseId, work: row.work, style: row.style, outcome: row.outcome === "image" ? "unmatched" : row.outcome })); continue; }
      const { context } = await caseInputs(snap, c);
      const scene = `${context.moment.reference}: ${context.moment.text.replace(/\s+/g, " ").slice(0, 300)}`;
      lines.push(JSON.stringify({ case: row.case, caseId: row.caseId, work: row.work, style: row.style, outcome: "image", chosen: row.chosen ?? 1, attempts: row.attempts,
        prepared: { plan: { present, primarySubject: scene, secondaryElements: "" } } }));
      shown++;
    }
    writeFileSync(path.join(dir, "results.ndjson"), `${lines.join("\n")}\n`);
    writeFileSync(path.join(dir, "snapshot.json"), `${JSON.stringify({ from: p.from, cases: snap.cases })}\n`);
    console.log(`${arm}: ${shown} shown image(s), ${lines.length - shown} attempted without one, in ${path.relative(root, dir)}`);
  }
}

type PooledPair = { id: string; file: string } & Record<string, unknown>;
/** Every `<set>/pairs.json` under --out, as written by `evals:consistency pairs`; a set is `<arm>/<work>`. */
const pairSets = (out: string) => ["lean", "full"].flatMap((arm) => Object.keys(config.works).map((work) => `${arm}/${work}`)).filter((set) => existsSync(path.join(out, set, "pairs.json")));

async function pool() {
  assert.ok(values.run && values.out, "--run and --out are required");
  const out = path.resolve(values.out);
  const all = pairSets(out).flatMap((set) => (readJson(path.join(out, set, "pairs.json")) as { pairs: PooledPair[] }).pairs.map((pair) => ({ set, pair })));
  all.sort((a, b) => drawFraction(`${config.seed}:${values.run}:pool`, `${a.set}/${a.pair.id}`) - drawFraction(`${config.seed}:${values.run}:pool`, `${b.set}/${b.pair.id}`));
  const pooled = all.map(({ set, pair }, index) => ({ id: `c${String(index + 1).padStart(3, "0")}`, set, pairId: pair.id, pair }));
  // Chunks name only pooled copies, so no path tells a scorer which set a pair came from.
  mkdirSync(path.join(out, "pool", "composites"), { recursive: true });
  for (const { id, set, pair } of pooled) copyFileSync(path.join(out, set, pair.file), path.join(out, "pool", "composites", `${id}.jpg`));
  const batches = Math.max(1, Number(values.batches)); const size = Math.ceil(pooled.length / batches);
  for (let b = 0; b < batches; b++) saveOnce(path.join(out, "pool", `pairs-${b + 1}.json`), { schemaVersion: 1, instructions: "evals/images/consistency-scoring.md",
    pairs: pooled.slice(b * size, (b + 1) * size).map(({ id, pair }) => ({ ...pair, id, file: path.join(out, "pool", "composites", `${id}.jpg`) })) });
  saveOnce(path.join(out, "pool", "key.json"), { run: values.run, pairs: pooled.map(({ id, set, pairId }) => ({ id, set, pairId })) });
  console.log(`${pooled.length} pair(s) from ${pairSets(out).length} set(s) in ${batches} chunk(s) under ${path.relative(root, path.join(out, "pool"))}.`);
}

async function unpool() {
  assert.ok(values.out && values.scores, "--out and --scores are required");
  const out = path.resolve(values.out);
  const key = new Map((readJson(path.join(out, "pool", "key.json")) as { pairs: Array<{ id: string; set: string; pairId: string }> }).pairs.map((x) => [x.id, x]));
  const bySet = new Map<string, Array<Record<string, unknown>>>();
  for (const file of list(values.scores)) {
    const scored = readJson(path.resolve(root, file)) as { scorer: string; scores: Array<{ id: string } & Record<string, unknown>> };
    for (const score of scored.scores) {
      const at = key.get(score.id); assert.ok(at, `${file}: unknown pair ${score.id}`);
      const name = `${at.set}/${scored.scorer}`;
      bySet.set(name, [...(bySet.get(name) ?? []), { ...score, id: at.pairId }]);
    }
  }
  for (const [name, scores] of bySet) {
    const scorer = path.basename(name);
    writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify({ scorer, scoredBeforeUnblinding: true, scores }, null, 1)}\n`);
    console.log(`${name}: ${scores.length} verdict(s)`);
  }
}

const commands: Record<string, () => Promise<void>> = { snapshot, cast, plan, run, blind, report, pairing, pool, unpool };
assert.ok(commands[command], `Unknown command: ${command}`);
await commands[command]();
