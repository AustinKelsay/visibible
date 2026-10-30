/**
 * The image regression suite (ADR 0011): one frozen set of cases across several works, scored by fault, with a gate that
 * fails when any fault gets worse on cases nobody tuned against. Cases live in evals/images/cases.json; the suite's
 * settings in evals/images/suite.json; the faults scorers judge in evals/images/faults.json.
 *
 * - **Split.** A case used to tune the engine before the suite existed is `tuned` and always in the dev split. Every
 *   other case is drawn into dev or holdout by a hash of the suite seed and its id, so nobody chooses the holdout.
 * - **Draws.** Random cases come from a seeded draw over a work's units, replayable from the seed, so nobody chooses
 *   them either. A drawn case joins the image tier exactly when it falls in the holdout, so the image gate always has
 *   cases nobody tuned against.
 * - **Tiers.** The text tier prepares every case's look and plan (cheap); the image tier renders a subset in each of
 *   its work's image styles, through the check and retry readers get.
 * - **Gate.** Per fault, on holdout items both runs judged, the candidate's rate may not exceed the baseline's by more
 *   than the margin. Unsettled scores, missing items or a different suite fail closed.
 *
 * Nothing here calls a model or reads the network.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { caseUnitId, caseWork, type EvalCase } from "./cases";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SUITE_TIERS = ["text", "image"] as const;
export type SuiteTier = (typeof SUITE_TIERS)[number];
export type Split = "dev" | "holdout";

const workSchema = z.object({
  /** `convex`: the deployment's active analysis, read once into the run's snapshot. Otherwise a committed analysis fixture. */
  analysis: z.string().min(1),
  /** The styles the image tier renders this work in, in order; each must be one its brief offers. */
  imageStyles: z.array(z.string().regex(SLUG)).min(1),
  /** The work's consistency groups (ADR 0008), paired with `npm run evals:consistency -- pairs --groups <file>`. */
  consistency: z.string().min(1),
}).strict();

const drawSchema = z.object({
  work: z.string().regex(SLUG),
  /** Names the draw in the seed and on its cases (`drawn`). */
  label: z.string().regex(SLUG),
  count: z.number().int().positive(),
}).strict();

export const suiteConfigSchema = z.object({
  schemaVersion: z.literal(1),
  /** The suite's identity: a baseline and a candidate must share it. Bump it when cases change. */
  version: z.string().min(1),
  seed: z.string().min(1),
  holdoutShare: z.number().gt(0).lt(1),
  works: z.record(z.string().regex(SLUG), workSchema),
  draws: z.array(drawSchema),
  gate: z.object({
    /** The largest rise in a fault's holdout rate, as a share of judged items, that still passes. */
    margin: z.number().gt(0).lt(1),
    /** A rise of this many items or fewer always passes, so one item never fails a small sample. */
    minItems: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type SuiteConfig = z.infer<typeof suiteConfigSchema>;

const faultSchema = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(1),
  /** What the scorer answers `yes` or `no` to; `na` where it cannot apply. */
  question: z.string().min(1),
  /** Asked only for works whose depiction profile words subjects without form. */
  effectsOnly: z.boolean().optional(),
  /** Styles where it is recorded but is not a fault, such as Watercolor's soft edges (ADR 0006). */
  acceptedIn: z.array(z.string().regex(SLUG)).optional(),
}).strict();
export const faultFileSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().min(1),
  /** Faults in a scene plan, judged against the moment's text. */
  text: z.array(faultSchema).min(1),
  /** Faults in a shown image, judged against its plan. */
  image: z.array(faultSchema).min(1),
}).strict();
export type FaultFile = z.infer<typeof faultFileSchema>;
export type Fault = z.infer<typeof faultSchema>;

export function loadSuiteConfig(input: unknown): SuiteConfig {
  const config = suiteConfigSchema.parse(input);
  const labels = new Set<string>();
  for (const draw of config.draws) {
    if (!config.works[draw.work]) throw new Error(`Draw ${draw.label} names unknown work ${draw.work}`);
    if (labels.has(draw.label)) throw new Error(`Duplicate draw label: ${draw.label}`);
    labels.add(draw.label);
  }
  return config;
}

export function loadFaults(input: unknown): FaultFile {
  const file = faultFileSchema.parse(input);
  for (const tier of SUITE_TIERS) {
    const ids = file[tier].map((f) => f.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${tier} fault id`);
  }
  return file;
}

/** A number in [0, 1) from the seed and a key; the same inputs always give the same number. */
export function drawFraction(seed: string, key: string): number {
  return parseInt(createHash("sha256").update(`${seed}\u0000${key}`).digest("hex").slice(0, 12), 16) / 2 ** 48;
}

/** The case's split: tuned cases are dev; every other case is drawn by the seed. */
export function splitOf(config: Pick<SuiteConfig, "seed" | "holdoutShare">, c: Pick<EvalCase, "id" | "tuned">): Split {
  if (c.tuned) return "dev";
  return drawFraction(config.seed, `split:${c.id}`) < config.holdoutShare ? "holdout" : "dev";
}

/**
 * The units a draw picks, in draw order: positions in the work's units from the seed, skipping repeats and `exclude`
 * (units other cases already use). Deterministic, so the committed drawn cases can be replayed and checked.
 */
export function drawUnits(seed: string, label: string, units: readonly string[], count: number, exclude: ReadonlySet<string> = new Set()): string[] {
  if (units.length - exclude.size < count) throw new Error(`Draw ${label} asks for ${count} of ${units.length} units`);
  const picked: string[] = [];
  for (let i = 0; picked.length < count; i++) {
    if (i > 100 * count + units.length) throw new Error(`Draw ${label} did not converge`);
    const unit = units[Math.floor(drawFraction(seed, `draw:${label}:${i}`) * units.length)];
    if (!exclude.has(unit) && !picked.includes(unit)) picked.push(unit);
  }
  return picked;
}

export const tiersOf = (c: Pick<EvalCase, "tiers">): readonly SuiteTier[] => c.tiers ?? SUITE_TIERS;

/** One case as the runner sees it. */
export type SuiteCase = { caseId: string; work: string; unitId: string; reference: string; split: Split; tiers: readonly SuiteTier[]; styles: readonly string[] };

/** The suite's cases for one tier: every case of a configured work that takes part in it. */
export function suiteCases(config: SuiteConfig, cases: readonly EvalCase[], tier: SuiteTier): SuiteCase[] {
  const out: SuiteCase[] = [];
  const units = new Set<string>();
  for (const c of cases) {
    const work = caseWork(c);
    const settings = config.works[work];
    if (!settings) continue;
    const unitId = caseUnitId(c);
    const key = `${work}/${unitId}`;
    if (units.has(key)) throw new Error(`Two suite cases use ${key}; results are keyed by unit`);
    units.add(key);
    const tiers = tiersOf(c);
    if (!tiers.includes(tier)) continue;
    out.push({ caseId: c.id, work, unitId, reference: c.reference, split: splitOf(config, c), tiers, styles: settings.imageStyles });
  }
  return out;
}

/** Every holdout item a run of the tier must have: one per case for text, one per case and image style for images. */
export function expectedHoldoutKeys(config: SuiteConfig, cases: readonly EvalCase[], tier: SuiteTier): string[] {
  return suiteCases(config, cases, tier).filter((c) => c.split === "holdout")
    .flatMap((c) => tier === "text" ? [`${c.caseId}/text`] : c.styles.map((style) => `${c.caseId}/${style}`));
}

/** The faults asked of one work in one tier and style. */
export function faultsFor(faults: FaultFile, tier: SuiteTier, options: { effects: boolean }): Fault[] {
  return faults[tier].filter((f) => !f.effectsOnly || options.effects);
}

/** Scorer instructions for one tier, generated from the fault file so every run asks the same questions. */
export function scoringInstructions(faults: FaultFile, tier: SuiteTier): string {
  const list = faults[tier].map((f) => `- \`${f.id}\` (${f.label}): ${f.question}${f.effectsOnly ? " Answer `na` when the item lists no subject without form." : ""}${f.acceptedIn?.length ? " When the item lists it under `accepted`, record it, but it does not make the item flawed." : ""}`).join("\n");
  const what = tier === "text"
    ? "Your items file lists scene plans. Each item gives the moment's text and its same-section neighbours, the work's depiction rules, the section's cast (with whether each member may be drawn), and the plan: the cast it selected and its scene fields. Judge the plan against the moment's text only. Answer only the faults the item's `ask` lists."
    : "Your items file lists illustrations. Each item gives the image file, the moment's text, the work's depiction rules, the cast its plan selected (with `neverDrawn`, any selected subject that may never be drawn as a figure), the scene it asked for, and under `accepted` any fault its style accepts. View every image file yourself at full resolution and judge only from what you see and its own item. Answer only the faults the item's `ask` lists.";
  return `# Suite scoring instructions: ${tier} tier (faults ${faults.version})

${what} Do not read \`key.json\` or any other file in the run folder, and do not look at another scorer's answers.

For each item, answer every fault below with \`yes\` (the fault is present), \`no\` or \`na\` (it cannot apply), then give one \`overall\` verdict: \`acceptable\`, \`flawed\` (any fault present that the item does not list under \`accepted\`) or \`uncertain\`, and \`notes\`: one or two sentences naming what drives your answers, with where you saw it.

${list}

Write JSON to the path you are given, in this shape:

\`\`\`json
{ "scorer": "<name>", "scoredBeforeUnblinding": true, "scores": [
  { "id": "${tier === "text" ? "p001" : "i001"}", "faults": { "${faults[tier][0].id}": "no", "…": "…" }, "overall": "acceptable", "notes": "..." }
] }
\`\`\`

Score every item you are given exactly once, answering every fault.
`;
}

export const ANSWERS = ["yes", "no", "na"] as const;
export type Answer = (typeof ANSWERS)[number];
export const VERDICTS = ["acceptable", "flawed", "uncertain"] as const;
export type Verdict = (typeof VERDICTS)[number];

const scoreSchema = z.object({
  id: z.string().min(1),
  faults: z.record(z.string(), z.enum(ANSWERS)),
  overall: z.enum(VERDICTS),
  notes: z.string(),
}).strict();
export const scoreFileSchema = z.object({
  scorer: z.string().min(1),
  scoredBeforeUnblinding: z.literal(true),
  scores: z.array(scoreSchema),
}).strict();
/** The operator settles only disputed fields, so its faults may be partial and its verdict absent. */
export const operatorFileSchema = z.object({
  scorer: z.string().min(1),
  scoredBeforeUnblinding: z.literal(true),
  scores: z.array(z.object({ id: z.string().min(1), faults: z.record(z.string(), z.enum(ANSWERS)).optional(), overall: z.enum(VERDICTS).optional(), notes: z.string() }).strict()),
}).strict();
export type ScoreFile = z.infer<typeof scoreFileSchema>;
export type OperatorFile = z.infer<typeof operatorFileSchema>;
export type SettledScore = { faults: Record<string, Answer>; overall: Verdict };
export type Dispute = { id: string; fields: string[] };

/** `na` and `no` both mean "not a fault", so scorers who differ only there agree. */
const agrees = (a: Answer, b: Answer) => a === b || (a !== "yes" && b !== "yes");
const merged = (a: Answer, b: Answer): Answer => (a === b ? a : "no");

/**
 * Two independent scorers' answers, settled: a field both agree on is adopted, a field they differ on takes the
 * operator's answer, and anything left is a dispute. Every item needs every fault from both scorers.
 */
export function settleScores(items: ReadonlyArray<{ id: string; faults: readonly string[] }>, scorers: readonly ScoreFile[], operator?: OperatorFile) {
  if (scorers.length !== 2) throw new Error("Two independent scorers are needed");
  if (new Set(scorers.map((s) => s.scorer)).size !== 2) throw new Error("The two scorers must be different");
  const byScorer = scorers.map((file) => {
    const map = new Map(file.scores.map((s) => [s.id, s]));
    if (map.size !== file.scores.length) throw new Error(`${file.scorer} scored an item twice`);
    return map;
  });
  const ruling = new Map((operator?.scores ?? []).map((s) => [s.id, s]));
  const settled: Record<string, SettledScore> = {};
  const disputes: Dispute[] = [];
  for (const item of items) {
    const [a, b] = byScorer.map((map, i) => {
      const score = map.get(item.id);
      if (!score) throw new Error(`${scorers[i].scorer} did not score ${item.id}`);
      for (const fault of item.faults) if (!score.faults[fault]) throw new Error(`${scorers[i].scorer} did not answer ${fault} for ${item.id}`);
      return score;
    });
    const operatorScore = ruling.get(item.id);
    const fields: string[] = [];
    const faults: Record<string, Answer> = {};
    for (const fault of item.faults) {
      const [x, y] = [a.faults[fault], b.faults[fault]];
      if (agrees(x, y)) faults[fault] = merged(x, y);
      else if (operatorScore?.faults?.[fault]) faults[fault] = operatorScore.faults[fault];
      else fields.push(fault);
    }
    const overall: Verdict | undefined = a.overall === b.overall ? a.overall : operatorScore?.overall;
    if (!overall) fields.push("overall");
    if (fields.length) { disputes.push({ id: item.id, fields }); continue; }
    settled[item.id] = { faults, overall: overall! };
  }
  return { settled, disputes };
}

/** One judged item: a plan (text tier) or a shown image (image tier), or a refusal before either existed. */
export type JudgedItem = { key: string; caseId: string; work: string; style: string | null; split: Split; refused: boolean; score: SettledScore | null };

export type Rate = { yes: number; judged: number; rate: number | null };
const rate = (yes: number, judged: number): Rate => ({ yes, judged, rate: judged ? yes / judged : null });

/** A fault counts on an item that was judged for it, unless its style accepts it. */
function faultPresent(fault: Fault, item: JudgedItem): boolean | null {
  const answer = item.score?.faults[fault.id];
  if (!answer || answer === "na") return null;
  if (answer === "yes" && item.style && fault.acceptedIn?.includes(item.style)) return false;
  return answer === "yes";
}

export type Summary = { items: number; refused: Rate; acceptable: Rate; faults: Record<string, Rate> };

/** Refusals over all items; acceptability and each fault over the items that were judged for them. */
export function summarize(items: readonly JudgedItem[], faults: readonly Fault[]): Summary {
  const judged = items.filter((i) => !i.refused && i.score);
  const out: Summary = {
    items: items.length,
    refused: rate(items.filter((i) => i.refused).length, items.length),
    // Acceptable is the share of all items, refusals included: a refused plan shows a reader nothing.
    acceptable: rate(judged.filter((i) => i.score!.overall === "acceptable").length, items.length),
    faults: {},
  };
  for (const fault of faults) {
    const answers = judged.map((i) => faultPresent(fault, i)).filter((x): x is boolean => x !== null);
    out.faults[fault.id] = rate(answers.filter(Boolean).length, answers.length);
  }
  return out;
}

/** Summaries overall and by work, style and split, for the report. */
export function summarizeBy(items: readonly JudgedItem[], faults: readonly Fault[]) {
  const group = (key: (i: JudgedItem) => string | null) => {
    const groups = new Map<string, JudgedItem[]>();
    for (const item of items) { const k = key(item); if (k !== null) groups.set(k, [...(groups.get(k) ?? []), item]); }
    return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => [k, summarize(list, faults)]));
  };
  return { overall: summarize(items, faults), byWork: group((i) => i.work), byStyle: group((i) => i.style), bySplit: group((i) => i.split) };
}

export type GateCheck = { measure: string; candidate: Rate; baseline: Rate; allowed: number; pass: boolean };
export type GateResult = { pass: boolean; reasons: string[]; checks: GateCheck[] };

/**
 * The per-fault gate on holdout items: refusals, every fault and the unacceptable share may each rise by at most
 * `max(margin × judged, minItems)` items over the baseline's rate. Fails closed on a different suite, unsettled
 * scores, or an expected holdout item (from the suite, not from either run) that either run has no result for.
 */
export function evaluateSuiteGate(options: {
  config: SuiteConfig; faults: readonly Fault[];
  /** The tier's holdout keys from the frozen suite (expectedHoldoutKeys). */
  expected: readonly string[];
  candidate: { suiteVersion: string; items: readonly JudgedItem[]; disputes: number };
  baseline: { suiteVersion: string; items: readonly JudgedItem[]; disputes: number };
}): GateResult {
  const { config, faults, candidate, baseline, expected } = options;
  const reasons: string[] = [];
  if (candidate.suiteVersion !== baseline.suiteVersion) reasons.push(`Different suites: candidate ${candidate.suiteVersion}, baseline ${baseline.suiteVersion}`);
  // Either run unsettled would leave items out of its rates, so both must be fully scored.
  if (candidate.disputes) reasons.push(`${candidate.disputes} scored item(s) are still disputed`);
  if (baseline.disputes) reasons.push(`${baseline.disputes} baseline item(s) are still disputed`);
  if (!expected.length) reasons.push("The suite has no holdout items for this tier");
  const keep = new Set(expected);
  for (const [name, run] of [["candidate", candidate], ["baseline", baseline]] as const) {
    const have = new Set(run.items.map((i) => i.key));
    const missing = expected.filter((key) => !have.has(key));
    if (missing.length) reasons.push(`The ${name} has no result for ${missing.length} holdout item(s): ${missing.slice(0, 5).join(", ")}`);
    const unscored = run.items.filter((i) => keep.has(i.key) && !i.refused && !i.score).map((i) => i.key);
    if (unscored.length) reasons.push(`${unscored.length} ${name} holdout item(s) are unscored: ${unscored.slice(0, 5).join(", ")}`);
  }
  const pick = (items: readonly JudgedItem[]) => summarize(items.filter((i) => keep.has(i.key)), faults);
  const [after, before] = [pick(candidate.items), pick(baseline.items)];
  const checks: GateCheck[] = [];
  const check = (measure: string, cand: Rate, base: Rate) => {
    const allowed = Math.max(config.gate.margin * cand.judged, config.gate.minItems);
    // Compare as item counts at the candidate's sample size, so both rates are read on the same scale.
    const rise = cand.judged && base.rate !== null ? cand.yes - base.rate * cand.judged : 0;
    const pass = rise <= allowed + 1e-9;
    checks.push({ measure, candidate: cand, baseline: base, allowed, pass });
    if (!pass) reasons.push(`${measure} rose from ${(base.rate! * 100).toFixed(0)}% to ${(cand.rate! * 100).toFixed(0)}% on holdout (allowed ${allowed.toFixed(1)} item(s))`);
  };
  check("refused", after.refused, before.refused);
  for (const fault of faults) check(fault.id, after.faults[fault.id], before.faults[fault.id]);
  const unacceptable = (s: Summary): Rate => rate(s.items - s.acceptable.yes, s.items);
  check("not acceptable", unacceptable(after), unacceptable(before));
  return { pass: reasons.length === 0, reasons, checks };
}
