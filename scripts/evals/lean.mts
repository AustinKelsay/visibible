/**
 * The lean-engine comparison: does one image call from the source text (src/lib/engine/lean.ts, no look, plan, review
 * or image check) on a stronger model match the full engine's suite images? It reuses a suite text run's frozen
 * snapshot (canon, sections and reference sheets), so the two arms differ only in pipeline and model.
 *
 *   npm run evals:lean -- cast --from <suite text run>
 *   npm run evals:lean -- plan --run <name> --from <suite text run> --model <id> [--cap <usd>] [--cases <ids>] [--styles <ids>]
 *   npm run evals:lean -- run --run <name> --offline|--execute [--resume]
 *   npm run evals:lean -- blind --run <name> --baseline <dir with the full engine's results.ndjson> --baseline-images <dir> [--batches <n>]
 *   npm run evals:lean -- report --run <name> --scores <a>[,…],<b>[,…] [--operator <file>]
 *   npm run evals:lean -- pairing --run <name> --baseline <dir> --out <dir>
 *   npm run evals:lean -- pool --run <name> --out <dir> [--batches <n>]
 *   npm run evals:lean -- unpool --out <dir> --scores <pooled score files>
 *
 * `cast` compares name-based cast selection with the text run's planned casts, free. `plan` writes the cases, the
 * estimate and the cap; `run --execute` needs a committed `funding.json` beside it and ledgers every call. `blind`
 * mixes both arms' shown images into one scorer pack judged against the moment's text, since the lean arm has no
 * plan; the key says which arm each item came from. `report` settles the scores, applies the suite gate to the lean
 * arm with the full arm as its baseline, and also counts each arm at the launch bar, where small unreadable marks
 * are accepted (ADR 0006 amendment 7).
 *
 * Consistency (ADR 0008) is paired the same way. `pairing` writes each arm's results in the form `evals:consistency
 * pairs` reads, made alike: both take the full arm's planned cast as the cast present and describe a scene by its
 * moment's text, so the two arms get the same pairs and nothing tells them apart. `pool` shuffles every set's pairs
 * into shared blind chunks; `unpool` returns each scorer's verdicts to the sets for `evals:consistency report`.
 *
 * Paid runs read OPENROUTER_API_KEY from the private env file named by VISIBIBLE_EVAL_ENV_FILE.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { contentVersion } from "../../convex/_helpers/contentVersion";
import { loadEvalCases } from "@/lib/image-evals/cases";
import {
  drawFraction, evaluateSuiteGate, expectedHoldoutKeys, faultsFor, loadFaults, loadSuiteConfig, operatorFileSchema, scoreFileSchema, settleScores, suiteCases, summarizeBy,
  type JudgedItem, type ScoreFile, type SuiteCase,
} from "@/lib/image-evals/suite";
import { createLedger, modelPricing, requestCeilingUsd, scrubForLog, type ModelPricing } from "@/lib/image-evals/suite-run";
import { imageCapabilities } from "@/lib/image-catalog";
import { createOfflineOpenRouter } from "@/lib/image-evals/suite-offline";
import { createOpenRouterEvalImageProvider } from "@/lib/image-evals/adapters";
import { referenceIsCurrent, type ReferenceRecord } from "@/lib/engine/assemble";
import type { AnalysisRecord } from "@/lib/engine/preparation";
import { applicableRules } from "@/lib/engine/prompt";
import { buildLeanRendering, leanCastMember, rankLeanCast, LEAN_MAX_SHEETS, LEAN_PROMPT_VERSION, type LeanCastMember, type LeanReference } from "@/lib/engine/lean";
import { momentContext, readWorkInputs, type WorkInputs } from "@/lib/engine/work-inputs";

const root = fileURLToPath(new URL("../../", import.meta.url));
/** Calls in flight at once by default. The default cap leaves room for that many at their ceiling, since an unaffordable reservation stops the run. */
const DEFAULT_CONCURRENCY = 4;
const CEILING_HEADROOM_USD = 0.6;
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  run: { type: "string" }, from: { type: "string" }, model: { type: "string" }, cap: { type: "string" },
  execute: { type: "boolean", default: false }, offline: { type: "boolean", default: false }, resume: { type: "boolean", default: false },
  baseline: { type: "string" }, "baseline-images": { type: "string" }, batches: { type: "string", default: "1" },
  scores: { type: "string" }, operator: { type: "string" }, out: { type: "string" }, concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
  cases: { type: "string" }, styles: { type: "string" },
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
const SOURCES = ["src/lib/engine/lean.ts", "src/lib/engine/prompt.ts", "src/lib/engine/depiction.ts", "src/lib/engine/work-inputs.ts", "src/lib/image-evals/adapters.ts",
  "src/lib/image-evals/suite-run.ts", "scripts/evals/lean.mts", "evals/images/suite.json", "evals/images/cases.json", "evals/images/faults.json"];

type Snapshot = {
  works: Record<string, { records: Record<string, AnalysisRecord>; references: Record<string, ReferenceRecord | null>; files: Record<string, { sha256: string; bytes: number }> }>;
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

async function plan() {
  assert.ok(values.run && values.from && values.model, "--run, --from and --model are required");
  const runDir = path.join(releases, values.run); mkdirSync(runDir, { recursive: true });
  const fromPlan = readJson(path.join(releases, values.from, "plan.json")) as { suite: string; tier: string };
  assert.equal(fromPlan.tier, "text"); assert.equal(fromPlan.suite, config.version);
  // Every image case, including those the full engine refused in its text run: the lean engine has no plan to refuse.
  // --cases and --styles narrow a pilot; a comparison run takes every case in every style.
  const only = new Set(list(values.cases)); const styles = new Set(list(values.styles));
  const all = suiteCases(config, allCases, "image").filter((c) => !only.size || only.has(c.caseId))
    .map((c) => ({ ...c, styles: c.styles.filter((s) => !styles.size || styles.has(s)) })).filter((c) => c.styles.length);
  const cases = [...all.filter((c) => c.split === "holdout"), ...all.filter((c) => c.split === "dev")];
  const shown = cases.reduce((n, c) => n + c.styles.length, 0);
  const estimatedUsd = Math.round(shown * 0.037 * 1e4) / 1e4;
  const capUsd = values.cap ? Number(values.cap) : Math.ceil((estimatedUsd * 1.25 + DEFAULT_CONCURRENCY * CEILING_HEADROOM_USD) * 100) / 100;
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
  let part = "";
  let capUsd = p.evaluation.capUsd;
  if (values.resume) {
    assert.ok(values.execute, "--resume continues a paid run");
    const parts = ["", "-2", "-3", "-4"];
    const done = parts.filter((x) => existsSync(path.join(runDir, `run-finished${x}.json`)));
    assert.ok(done.length && done.length < parts.length, "Nothing to resume");
    part = parts[done.length];
    for (const x of done) { const f = readJson(path.join(runDir, `run-finished${x}.json`)); capUsd = Math.round((capUsd - f.measuredUsd - f.uncertainUsd) * 1e6) / 1e6; }
  }
  const imageDir = path.join(root, "evals/images/runs", values.run, values.offline ? "offline" : "images");
  let apiKey = "offline-rehearsal";
  let fetchImpl: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init);
  let pricing: ModelPricing | undefined;
  if (values.offline) fetchImpl = createOfflineOpenRouter().fetch;
  else {
    for (const name of [`run-started${part}.json`, `ledger${part}.json`, ...(part ? [] : ["results.ndjson"])]) assert.ok(!existsSync(path.join(runDir, name)), `One-shot artifact exists: ${name}`);
    const grant = readJson(path.join(runDir, "funding.json")) as { authorization: string; operationCapUsd: number };
    assert.ok(grant.authorization?.trim(), "funding.json needs an authorization"); assert.equal(grant.operationCapUsd, p.evaluation.capUsd, "funding.json must fund the plan's cap");
    assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim(), "", "Commit the plan, funding and code before calls");
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const env = parseEnv(readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE ?? "", "utf8"));
    apiKey = env.OPENROUTER_API_KEY!; assert.ok(apiKey, "OPENROUTER_API_KEY is missing from the eval env file");
    const catalog = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data as Array<{ id: string } & Parameters<typeof modelPricing>[0]>;
    pricing = modelPricing(catalog.find((m) => m.id === p.image.model));
    assert.ok(pricing && pricing.imageOutput !== null && (imageCapabilities(p.image.model)?.outputTokens["1K"] ?? IMAGE_TOKENS_1K[p.image.model]),
      `${p.image.model} has no catalog price or known image size, so its calls cannot be bounded`);
    const credits = (await (await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
    const balanceUsd = credits.total_credits - credits.total_usage;
    assert.ok(balanceUsd >= capUsd + PRODUCTION_HEADROOM_USD, `The account holds $${balanceUsd.toFixed(2)}; this run needs $${capUsd} plus $${PRODUCTION_HEADROOM_USD} for readers`);
    const key = (await (await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;
    assert.ok(key.limit_remaining === null || key.limit_remaining >= capUsd + 1, `The key has $${key.limit_remaining} of its limit left; this run needs $${capUsd} plus $1`);
    saveOnce(path.join(runDir, `run-started${part}.json`), { at: new Date().toISOString(), commit, grant, capUsd, balanceUsd, keyLimitRemaining: key.limit_remaining,
      sources: Object.fromEntries(SOURCES.map((f) => [f, sha256(readFileSync(path.join(root, f)))])) });
  }
  mkdirSync(imageDir, { recursive: true });
  // A content-filter refusal returns 200 with no image and zero usage; it is that image's failure at no cost, not the
  // run's, so it reaches the ledger as the moderation refusal it is.
  const upstream = fetchImpl;
  const filtered: typeof fetchImpl = async (url, init) => {
    const response = await upstream(url, init);
    if (!response.ok) return response;
    const body = await response.text();
    try {
      const payload = JSON.parse(body) as { choices?: Array<{ finish_reason?: string }>; usage?: { cost?: number } };
      if (payload.choices?.[0]?.finish_reason === "content_filter" && payload.usage?.cost === 0)
        return new Response(JSON.stringify({ error: { message: "flagged: provider content filter", provider: payload } }), { status: 403, headers: { "Content-Type": "application/json" } });
    } catch { /* a non-JSON body is the ledger's to judge */ }
    return new Response(body, { status: response.status, headers: response.headers });
  };
  // The most a call can cost: its text at the suite's ceiling, plus the output image at the model's image price. Reserved
  // before the call is sent, so spend cannot pass the cap whatever the model.
  const ceiling = pricing ? (_kind: string, request: Record<string, unknown>) => {
    const text = requestCeilingUsd("text", request, pricing);
    return text === null ? null : text + (imageCapabilities(p.image.model)?.outputTokens["1K"] ?? IMAGE_TOKENS_1K[p.image.model]) * pricing!.imageOutput!;
  } : undefined;
  const ledger = createLedger({ capUsd, reserves: p.evaluation.reserves, limits: p.evaluation.limits, fetch: filtered, ceiling,
    save: (state) => writeFileSync(path.join(outDir, `ledger${part}.json`), `${JSON.stringify(state, null, 2)}\n`),
    log: (entry) => appendFileSync(path.join(outDir, `provider${part}.ndjson`), `${JSON.stringify(entry)}\n`),
    scrub: (value) => scrubForLog(value, apiKey, sha256) });
  const record = (row: Record<string, unknown>) => appendFileSync(path.join(outDir, "results.ndjson"), `${JSON.stringify(row)}\n`);
  const made = new Set(ndjson(path.join(outDir, "results.ndjson")).filter((r) => r.outcome === "image").map((r) => r.key));
  const jobs = p.cases.flatMap((c) => c.styles.map((style) => ({ c, style }))).filter(({ c, style }) => !made.has(`${c.caseId}/${style}`));
  const runOne = async ({ c, style }: (typeof jobs)[number]) => {
    const key = `${c.caseId}/${style}`;
    const base = { tier: "image", case: c.unitId, caseId: c.caseId, work: c.work, split: c.split, key, style };
    const started = Date.now();
    try {
      const { inputs, w, sc, section, context, cast: members } = await caseInputs(snap, c);
      const styleEntry = inputs.styles[style]; assert.ok(styleEntry, `${c.work} has no ${style} style`);
      const classical = inputs.styles.classical;
      // The same currency rule production applies: a reference is used only when it was made from the current inputs.
      const available: LeanReference[] = [];
      const styleRef = w.references[`styleReference:${style}`];
      if (styleRef && referenceIsCurrent(styleRef, [{ kind: "style", recordId: style, version: styleEntry.version }])) available.push({ kind: "styleReference", styleId: style, storageId: styleRef.storageId, version: styleRef.fingerprint });
      for (const m of members) {
        const r = w.references[`sheet:${m.entryId}:${m.stageId}`];
        if (r && referenceIsCurrent(r, [{ kind: "entry", recordId: m.entryId, version: m.version }, { kind: "stage", recordId: `${m.entryId}:${m.stageId}`, version: contentVersion(m.text) },
          ...(classical ? [{ kind: "style", recordId: "classical", version: classical.version }] : [])])) available.push({ kind: "sheet", entryId: m.entryId, stageId: m.stageId, storageId: r.storageId, version: r.fingerprint });
      }
      const rendering = buildLeanRendering({ work: { id: c.work, title: inputs.work.work.title }, moment: { id: sc.momentId, sectionId: sc.sectionId, reference: context.moment.reference, text: context.moment.text },
        neighbors: { previous: context.previous?.text ?? null, next: context.next?.text ?? null }, brief: inputs.brief, eraId: String(section.payload.era ?? inputs.brief.eras[0].id),
        style: styleEntry.style, cast: members, references: available, depiction: inputs.depiction, aspectRatio: p.image.aspectRatio });
      if (!rendering.ok) { record({ ...base, outcome: "refused", stage: "lean", message: rendering.error }); return; }
      const references = rendering.references.map((r) => {
        const bytes = new Uint8Array(readFileSync(path.join(refDir, `${r.storageId}.jpg`)));
        assert.equal(sha256(bytes), w.files[r.storageId].sha256, `Reference ${r.storageId} changed since the snapshot`);
        return { bytes, mimeType: "image/jpeg" };
      });
      const provider = createOpenRouterEvalImageProvider({ apiKey, timeoutMs: 180_000, fetch: ledger.fetchFor("image", () => key) });
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

/** Both arms' shown images in one pack, judged against the moment's text; the key keeps each item's arm. */
async function blind() {
  assert.ok(values.run && values.baseline && values["baseline-images"], "--run, --baseline and --baseline-images are required");
  const baseline = path.relative(root, path.resolve(root, values.baseline));
  const runDir = path.join(releases, values.run);
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  const scoringDir = path.join(runDir, "scoring");
  assert.ok(!existsSync(scoringDir), "Keep the first scorer packs");
  mkdirSync(scoringDir, { recursive: true });
  const blindDir = path.join(root, "evals/images/runs", values.run, "blind"); mkdirSync(blindDir, { recursive: true });
  const snap = snapshotOf(p.from);
  const arms = [
    { arm: "lean", rows: ndjson(path.join(runDir, "results.ndjson")), resolve: (file: string) => path.join(root, file) },
    { arm: "full", rows: ndjson(path.join(root, baseline, "results.ndjson")), resolve: (file: string) => path.join(path.resolve(values["baseline-images"]!), path.basename(file)) },
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
  saveOnce(path.join(scoringDir, "key.json"), { run: values.run, baseline, suite: p.suite, faults: p.faults, items: key });
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

For each item, answer every fault below with \`yes\` (the fault is present), \`no\` or \`na\` (it cannot apply), then give one \`overall\` verdict: \`acceptable\`, \`flawed\` (any fault present that the item does not list under \`accepted\`) or \`uncertain\`, and \`notes\`: one or two sentences naming what drives your answers, with where you saw it.

${lines.join("\n")}
- \`${READABLE_TEXT}\`: Is any of that lettering a readable word in the reader's language, a caption, or an artist's signature, initials or signature-like scrawl? Answer \`no\` when the only marks are small or unreadable: pseudo-script, squiggles on a page, letter shapes that spell no word, clock numerals, playing-card corner indices or pips. Answer \`na\` when \`lettering\` is \`no\`.

Write JSON to the path you are given, in this shape:

\`\`\`json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "j001", "faults": { "${faults.image[0].id}": "no", "…": "…" }, "overall": "acceptable", "notes": "..." }
] }
\`\`\`

Score every item you are given exactly once, answering every fault.
`;
}

async function report() {
  assert.ok(values.run, "--run");
  const runDir = path.join(releases, values.run);
  const p = readJson(path.join(runDir, "plan.json")) as Plan;
  const scoringDir = path.join(runDir, "scoring");
  const key = readJson(path.join(scoringDir, "key.json")) as { baseline: string; items: Array<{ id: string; arm: string; key: string; caseId: string; work: string; style: string; split: string; faults: string[] }> };
  const files = list(values.scores).map((f) => scoreFileSchema.parse(readJson(path.resolve(root, f))));
  const byScorer = new Map<string, ScoreFile>();
  for (const f of files) { const prior = byScorer.get(f.scorer); byScorer.set(f.scorer, prior ? { ...prior, scores: [...prior.scores, ...f.scores] } : f); }
  const operator = values.operator ? operatorFileSchema.parse(readJson(path.resolve(root, values.operator))) : undefined;
  const { settled, disputes } = settleScores(key.items.map((i) => ({ id: i.id, faults: i.faults })), [...byScorer.values()], operator);
  writeFileSync(path.join(scoringDir, "scores.json"), `${JSON.stringify({ scorers: [...byScorer.keys()], operator: operator?.scorer ?? null, settled, disputes }, null, 2)}\n`);
  if (disputes.length) { writeFileSync(path.join(scoringDir, "disputes.json"), `${JSON.stringify(disputes, null, 2)}\n`); console.log(`${disputes.length} disputed; rule on scoring/disputes.json, then report again with --operator.`); }
  // Each arm's items: its images scored here, plus its refusals. As in the suite report, a provider failure is not an item.
  const armItems = (arm: string, rows: Array<ResultRow>, styleOf: (c: string) => string[], settled: Record<string, JudgedItem["score"] & object>) => {
    const items: JudgedItem[] = [];
    for (const row of rows) {
      if (row.outcome === "image") { const k = key.items.find((i) => i.arm === arm && i.key === row.key)!; items.push({ key: row.key, caseId: row.caseId, work: row.work, style: row.style, split: row.split, refused: false, score: settled[k.id] ?? null }); }
      else if (row.outcome === "refused") for (const style of row.standsFor ?? (row.style ? [row.style] : styleOf(row.caseId)))
        items.push({ key: `${row.caseId}/${style}`, caseId: row.caseId, work: row.work, style, split: row.split, refused: true, score: null });
    }
    return items;
  };
  const styleOf = (caseId: string): string[] => [...(p.cases.find((c) => c.caseId === caseId)?.styles ?? [])];
  const [leanRows, fullRows] = [ndjson(path.join(runDir, "results.ndjson")), ndjson(path.join(root, key.baseline, "results.ndjson"))];
  const lean = armItems("lean", leanRows, styleOf, settled);
  const full = armItems("full", fullRows, styleOf, settled);
  // The operator's classification of lettering the scorers called readable (scoring/small-marks.json), made by blind id:
  // a card index or clock numeral is readable yet accepted by the ADR, so its answer becomes no for the launch bar only.
  const marksFile = path.join(scoringDir, "small-marks.json");
  const acceptedMarks = new Set(existsSync(marksFile) ? (readJson(marksFile) as { items: Array<{ id: string; classification: string }> }).items.filter((i) => i.classification === "accepted small marks").map((i) => i.id) : []);
  const forBar = Object.fromEntries(Object.entries(settled).map(([id, score]) => [id, acceptedMarks.has(id) ? { ...score, faults: { ...score.faults, [READABLE_TEXT]: "no" as const } } : score]));
  // The launch bar (ADR 0006 amendment 7): an image whose only fault is lettering that nobody can read is acceptable.
  const launchBar = (items: JudgedItem[]) => items.map((i) => {
    if (!i.score || i.score.overall === "uncertain" || i.score.faults[READABLE_TEXT] === "yes") return i;
    const present = faults.image.filter((f) => i.score!.faults[f.id] === "yes" && !(i.style && f.acceptedIn?.includes(i.style))).map((f) => f.id);
    return present.length === 1 && present[0] === "lettering" ? { ...i, score: { ...i.score, overall: "acceptable" as const } } : i;
  });
  const summary = { lean: summarizeBy(lean, faults.image), full: summarizeBy(full, faults.image) };
  const launch = { lean: summarizeBy(launchBar(armItems("lean", leanRows, styleOf, forBar)), faults.image), full: summarizeBy(launchBar(armItems("full", fullRows, styleOf, forBar)), faults.image) };
  const gate = evaluateSuiteGate({ config, faults: faults.image, expected: expectedHoldoutKeys(config, allCases, "image"),
    candidate: { suiteVersion: p.suite, items: lean, disputes: disputes.length }, baseline: { suiteVersion: p.suite, items: full, disputes: disputes.length } });
  writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify({ run: values.run, baseline: key.baseline, disputes: disputes.length, summary, launchBar: launch, gate }, null, 2)}\n`);
  const pct = (r: { rate: number | null; yes: number; judged: number }) => r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(0)}% (${r.yes}/${r.judged})`;
  for (const [arm, s] of Object.entries(launch)) console.log(`${arm} launch bar (small marks accepted): ${pct(s.overall.acceptable)}; ${Object.entries(s.byWork).map(([w, x]) => `${w} ${pct(x.acceptable)}`).join(", ")}`);
  for (const [arm, s] of Object.entries(summary)) {
    console.log(`${arm}: acceptable ${pct(s.overall.acceptable)}, refused ${pct(s.overall.refused)}`);
    for (const [work, w] of Object.entries(s.byWork)) console.log(`  ${work}: ${pct(w.acceptable)}`);
    for (const [split, w] of Object.entries(s.bySplit)) console.log(`  ${split}: ${pct(w.acceptable)}`);
    for (const f of faults.image) console.log(`  ${f.id}: ${pct(s.overall.faults[f.id])}`);
  }
  console.log(gate.pass ? "Gate passes: lean against full." : `Gate FAILS: lean against full:\n  ${gate.reasons.join("\n  ")}`);
}

async function pairing() {
  assert.ok(values.run && values.baseline && values.out, "--run, --baseline and --out are required");
  const p = readJson(path.join(releases, values.run, "plan.json")) as Plan;
  const snap = snapshotOf(p.from);
  const arms: Record<string, ResultRow[]> = { lean: ndjson(path.join(releases, values.run, "results.ndjson")), full: ndjson(path.join(root, values.baseline, "results.ndjson")) };
  const planned = new Map(arms.full.filter((r) => r.outcome === "image" && r.prepared).map((r) => [r.caseId, r.prepared!.plan.present]));
  for (const [arm, rows] of Object.entries(arms)) {
    const dir = path.join(path.resolve(values.out), arm); mkdirSync(dir, { recursive: true });
    const lines: string[] = [];
    for (const row of rows.filter((r) => r.outcome === "image" && planned.has(r.caseId))) {
      const { context } = await caseInputs(snap, p.cases.find((c) => c.caseId === row.caseId)!);
      const scene = `${context.moment.reference}: ${context.moment.text.replace(/\s+/g, " ").slice(0, 300)}`;
      lines.push(JSON.stringify({ case: row.case, caseId: row.caseId, work: row.work, style: row.style, outcome: "image", chosen: row.chosen ?? 1, attempts: row.attempts,
        prepared: { plan: { present: planned.get(row.caseId), primarySubject: scene, secondaryElements: "" } } }));
    }
    writeFileSync(path.join(dir, "results.ndjson"), `${lines.join("\n")}\n`);
    writeFileSync(path.join(dir, "snapshot.json"), `${JSON.stringify({ from: p.from, cases: snap.cases })}\n`);
    console.log(`${arm}: ${lines.length} shown image(s) in ${path.relative(root, dir)}`);
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

const commands: Record<string, () => Promise<void>> = { cast, plan, run, blind, report, pairing, pool, unpool };
assert.ok(commands[command], `Unknown command: ${command}`);
await commands[command]();
