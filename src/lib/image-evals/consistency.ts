/**
 * Consistency evaluation (ADR 0008): whether images that should agree with each other do. The per-image launch bar
 * (ADR 0006) judges each image alone; these fixed groups judge one recurring character across stories, or one place
 * across moments, in blind pairs of the images a run would have shown, always within one art style. Two independent
 * scorers judge every pair, an operator settles their disagreements, and the gate reads the agreement rates.
 * Nothing here calls a model.
 */
import { z } from "zod";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const groupSchema = z.object({
  id: z.string().regex(SLUG, "Group ids are kebab-case"),
  /** `character`: the same person in every image. `setting`: the same place in every image. */
  kind: z.enum(["character", "setting"]),
  /** What scorers compare, by name, such as "Simon Peter" or "the shore of the Sea of Galilee". */
  subject: z.string().min(1),
  /** A canon entry the moment's plan must select before its image counts. Required for characters. */
  entryId: z.string().min(1).optional(),
  /** Unit ids in reading order. */
  units: z.array(z.string().min(1)).min(2),
  note: z.string().optional(),
}).strict().refine((group) => group.kind !== "character" || group.entryId, { message: "A character group names its canon entry" });

export const consistencyGroupFileSchema = z.object({
  schemaVersion: z.literal(1),
  workId: z.string().regex(SLUG),
  groups: z.array(groupSchema).min(1),
}).strict();

export type ConsistencyGroup = z.infer<typeof groupSchema>;
export type ConsistencyKind = ConsistencyGroup["kind"];
export const CONSISTENCY_KINDS: readonly ConsistencyKind[] = ["character", "setting"];

/** Parse the committed groups, refusing repeated group ids and repeated units within a group. */
export function loadConsistencyGroups(input: unknown): ConsistencyGroup[] {
  const file = consistencyGroupFileSchema.parse(input);
  const ids = new Set<string>();
  for (const group of file.groups) {
    if (ids.has(group.id)) throw new Error(`Duplicate consistency group: ${group.id}`);
    ids.add(group.id);
    if (new Set(group.units).size !== group.units.length) throw new Error(`Consistency group ${group.id} repeats a unit`);
  }
  return file.groups;
}

/**
 * One image a reader would have been shown: the cast its plan selected, the canon stage its section assigns each cast
 * entry, and a short description that helps a scorer find the subject.
 */
export type ShownImage = { unitId: string; style: string; file: string; sha256: string; present: string[]; stages: Record<string, string>; scene: string };

const snapshotSchema = z.object({ cases: z.array(z.object({ id: z.string(), cast: z.array(z.string()) }).passthrough()) }).passthrough();

/** Each case's canon stages from a launch-matrix `snapshot.json`, whose section cast lists `entry:stage`. */
export function stagesFromSnapshot(input: unknown): Map<string, Record<string, string>> {
  return new Map(snapshotSchema.parse(input).cases.map((c) => [c.id, Object.fromEntries(c.cast.map((member) => {
    const at = member.indexOf(":");
    if (at < 1 || at === member.length - 1) throw new Error(`Snapshot case ${c.id} has a cast member without a stage: ${member}`);
    return [member.slice(0, at), member.slice(at + 1)];
  }))]));
}

const resultRowSchema = z.object({
  case: z.string(),
  style: z.string(),
  outcome: z.string(),
  chosen: z.number().int().positive().nullable().optional(),
  prepared: z.object({
    plan: z.object({ present: z.array(z.string()), primarySubject: z.string(), secondaryElements: z.string() }).passthrough(),
  }).passthrough().nullable().optional(),
  attempts: z.array(z.object({ file: z.string(), sha256: z.string() }).passthrough()).optional(),
}).passthrough();

/**
 * The shown images in a launch-matrix `results.ndjson`: one row per case (a unit id) and style, the shown attempt
 * named by `chosen`. A case's plan is shared by its styles and recorded on the row that prepared it. Refused and
 * failed rows have no image.
 */
export function shownImagesFromResults(rows: readonly unknown[], stages: ReadonlyMap<string, Record<string, string>>): ShownImage[] {
  const parsed = rows.map((raw) => resultRowSchema.parse(raw));
  const plans = new Map<string, NonNullable<(typeof parsed)[number]["prepared"]>["plan"]>();
  for (const row of parsed) if (row.prepared?.plan && !plans.has(row.case)) plans.set(row.case, row.prepared.plan);
  const images: ShownImage[] = [];
  for (const row of parsed) {
    if (row.outcome !== "image") continue;
    const attempt = row.attempts?.[(row.chosen ?? 1) - 1];
    const plan = row.prepared?.plan ?? plans.get(row.case);
    if (!attempt || !plan) throw new Error(`Result ${row.case}/${row.style} has an image but no shown attempt or plan`);
    const caseStages = stages.get(row.case);
    if (!caseStages) throw new Error(`The snapshot has no canon stages for ${row.case}`);
    images.push({ unitId: row.case, style: row.style, file: attempt.file, sha256: attempt.sha256, present: plan.present, stages: caseStages, scene: `${plan.primarySubject}; ${plan.secondaryElements}` });
  }
  return images;
}

export type PairSide = { unitId: string; file: string; sha256: string; scene: string };
export type ConsistencyPair = { id: string; groupId: string; kind: ConsistencyKind; subject: string; style: string; left: PairSide; right: PairSide };
/**
 * Which of a group's units had a shown image in a style, which of those selected the group's entry, and how many
 * eligible pairs were left out because their sections assign the entry different canon stages (a youth and a king).
 */
export type GroupCoverage = { groupId: string; style: string; units: number; imaged: number; eligible: string[]; pairs: number; otherStage: number };

/** FNV-1a: the same inputs and seed always give the same blind order and sides. */
function hashOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Every pair of eligible images within each group and style. An image is eligible when its unit belongs to the group
 * and, for a group with an entry, its plan selected that entry; such a pair also needs the same canon stage on both
 * sides, since a stage change is meant to look different. Sides and the blind order come from the seed.
 */
export function buildConsistencyPairs(groups: readonly ConsistencyGroup[], images: readonly ShownImage[], seed = "consistency"): { pairs: ConsistencyPair[]; coverage: GroupCoverage[] } {
  const byKey = new Map<string, ShownImage>();
  for (const image of images) {
    const key = `${image.unitId}|${image.style}`;
    if (byKey.has(key)) throw new Error(`Two shown images for ${image.unitId} in ${image.style}`);
    byKey.set(key, image);
  }
  const styles = [...new Set(images.map((image) => image.style))].sort();
  const side = (image: ShownImage): PairSide => ({ unitId: image.unitId, file: image.file, sha256: image.sha256, scene: image.scene });
  const unordered: Array<{ key: string; pair: Omit<ConsistencyPair, "id"> }> = [];
  const coverage: GroupCoverage[] = [];
  for (const group of groups) {
    for (const style of styles) {
      const imaged = group.units.map((unit) => byKey.get(`${unit}|${style}`)).filter((image): image is ShownImage => Boolean(image));
      const eligible = imaged.filter((image) => !group.entryId || image.present.includes(group.entryId));
      const before = unordered.length;
      let otherStage = 0;
      for (let a = 0; a < eligible.length; a++) {
        for (let b = a + 1; b < eligible.length; b++) {
          const entry = group.entryId;
          if (entry && (eligible[a].stages[entry] === undefined || eligible[a].stages[entry] !== eligible[b].stages[entry])) {
            otherStage++;
            continue;
          }
          const key = `${seed}|${group.id}|${style}|${eligible[a].unitId}|${eligible[b].unitId}`;
          const [left, right] = hashOf(`${key}|side`) % 2 === 1 ? [eligible[b], eligible[a]] : [eligible[a], eligible[b]];
          unordered.push({ key, pair: { groupId: group.id, kind: group.kind, subject: group.subject, style, left: side(left), right: side(right) } });
        }
      }
      coverage.push({ groupId: group.id, style, units: group.units.length, imaged: imaged.length, eligible: eligible.map((image) => image.unitId), pairs: unordered.length - before, otherStage });
    }
  }
  const ordered = unordered.map((entry) => ({ ...entry, rank: hashOf(entry.key) })).sort((x, y) => x.rank - y.rank || x.key.localeCompare(y.key));
  const width = Math.max(3, String(ordered.length).length);
  const pairs = ordered.map(({ pair }, index) => ({ id: `pair${String(index + 1).padStart(width, "0")}`, ...pair }));
  return { pairs, coverage };
}

export function pairQuestion(pair: Pick<ConsistencyPair, "kind" | "subject">): string {
  return pair.kind === "character"
    ? `Is ${pair.subject} the same person in the left and right images?`
    : `Do the left and right images show the same place (${pair.subject})?`;
}

/** What a scorer sees: no group, style, unit or source file, only the question and each side's scene description. */
export function blindPairs(pairs: readonly ConsistencyPair[], composite: (id: string) => string) {
  return pairs.map((pair) => ({ id: pair.id, file: composite(pair.id), kind: pair.kind, subject: pair.subject, question: pairQuestion(pair), left: pair.left.scene, right: pair.right.scene }));
}

export const PAIR_VERDICTS = ["same", "different", "unclear"] as const;
export type PairVerdict = (typeof PAIR_VERDICTS)[number];

export const pairScoreFileSchema = z.object({
  scorer: z.string().min(1),
  scoredBeforeUnblinding: z.literal(true),
  scores: z.array(z.object({ id: z.string(), verdict: z.enum(PAIR_VERDICTS), notes: z.string() }).strict()),
}).strict();
export type PairScoreFile = z.infer<typeof pairScoreFileSchema>;

function verdictsOf(file: PairScoreFile, allowed: ReadonlySet<string>, refusal: (id: string) => string): Map<string, PairVerdict> {
  const verdicts = new Map<string, PairVerdict>();
  for (const score of file.scores) {
    if (!allowed.has(score.id)) throw new Error(refusal(score.id));
    if (verdicts.has(score.id)) throw new Error(`${file.scorer} scored ${score.id} twice`);
    verdicts.set(score.id, score.verdict);
  }
  return verdicts;
}

export type SettledVerdict = PairVerdict | "disputed";

/**
 * Every scorer must judge every pair once. A unanimous verdict stands; a disagreement takes the operator's verdict,
 * and stays disputed without one. The operator may settle only disputed pairs.
 */
export function settleVerdicts(pairIds: readonly string[], scorers: readonly PairScoreFile[], operator?: PairScoreFile) {
  if (scorers.length < 2) throw new Error("Consistency pairs need at least two independent scorers");
  const ids = new Set(pairIds);
  const judged = scorers.map((file) => {
    const verdicts = verdictsOf(file, ids, (id) => `${file.scorer} scored an unknown pair: ${id}`);
    const missing = pairIds.filter((id) => !verdicts.has(id));
    if (missing.length) throw new Error(`${file.scorer} did not score ${missing.join(", ")}`);
    return verdicts;
  });
  const disputed = pairIds.filter((id) => new Set(judged.map((verdicts) => verdicts.get(id))).size > 1);
  const settled = operator ? verdictsOf(operator, new Set(disputed), (id) => `The operator may settle only disputed pairs, not ${id}`) : new Map<string, PairVerdict>();
  const verdicts: Record<string, SettledVerdict> = {};
  for (const id of pairIds) verdicts[id] = disputed.includes(id) ? settled.get(id) ?? "disputed" : judged[0].get(id)!;
  return { verdicts, disputed, unanimous: pairIds.length - disputed.length };
}

/** `rate` is the share judged the same among pairs judged same or different; unclear and disputed pairs are counted apart. */
export type Tally = { pairs: number; same: number; different: number; unclear: number; disputed: number; rate: number | null };
export type KindSummary = { overall: Tally; byStyle: Record<string, Tally>; byGroup: Record<string, Record<string, Tally>> };
export type ConsistencySummary = Record<ConsistencyKind, KindSummary>;

const emptyTally = (): Tally => ({ pairs: 0, same: 0, different: 0, unclear: 0, disputed: 0, rate: null });
function count(tally: Tally, verdict: SettledVerdict) {
  tally.pairs++;
  tally[verdict]++;
  const decided = tally.same + tally.different;
  tally.rate = decided ? tally.same / decided : null;
}

export function summarizeConsistency(pairs: readonly ConsistencyPair[], verdicts: Readonly<Record<string, SettledVerdict>>): ConsistencySummary {
  const summary = Object.fromEntries(CONSISTENCY_KINDS.map((kind) => [kind, { overall: emptyTally(), byStyle: {}, byGroup: {} }])) as ConsistencySummary;
  for (const pair of pairs) {
    const verdict = verdicts[pair.id];
    if (!verdict) throw new Error(`No verdict for ${pair.id}`);
    const kind = summary[pair.kind];
    const group = (kind.byGroup[pair.groupId] ??= {});
    for (const tally of [kind.overall, (kind.byStyle[pair.style] ??= emptyTally()), (group[pair.style] ??= emptyTally())]) count(tally, verdict);
  }
  return summary;
}

export type ConsistencyBar = {
  version: string;
  /** Lowest share of decided pairs judged the same. */
  minRate: Record<ConsistencyKind, number>;
  /** Fewest pairs judged same or different before a rate counts. */
  minDecided: Record<ConsistencyKind, number>;
  /** Most pairs a measure may leave unclear. */
  maxUnclearShare: number;
  /** Largest fall from the previous measurement's rate. */
  maxDrop: number;
};

/**
 * The consistency part of the launch bar (ADR 0008). The character floor sits about ten points under the 29 October
 * baseline in the released styles (84%); the setting floor is provisional until a run measures enough neighbouring moments.
 */
export const CONSISTENCY_BAR: ConsistencyBar = {
  version: "2026-10-29-consistency-v1",
  minRate: { character: 0.75, setting: 0.5 },
  minDecided: { character: 30, setting: 20 },
  maxUnclearShare: 1 / 3,
  maxDrop: 0.1,
};

export type GateCheck = { kind: ConsistencyKind; tally: Tally; baselineRate: number | null; pass: boolean; reasons: string[] };
const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * The gate pools the released styles, because a single style's sample is too small to gate on; the per-style rates
 * are reported beside it. A measure fails closed on unsettled disputes, too few decided pairs or too many unclear ones.
 */
export function evaluateConsistencyGate(
  pairs: readonly ConsistencyPair[],
  verdicts: Readonly<Record<string, SettledVerdict>>,
  styles: readonly string[],
  baseline: Partial<Record<ConsistencyKind, number | null>> = {},
  bar: ConsistencyBar = CONSISTENCY_BAR,
): { pass: boolean; styles: string[]; barVersion: string; checks: GateCheck[] } {
  const pooled = summarizeConsistency(pairs.filter((pair) => styles.includes(pair.style)), verdicts);
  const checks = CONSISTENCY_KINDS.map((kind): GateCheck => {
    const tally = pooled[kind].overall;
    const decided = tally.same + tally.different;
    const baselineRate = baseline[kind] ?? null;
    const reasons: string[] = [];
    if (tally.disputed) reasons.push(`${tally.disputed} pairs still disputed`);
    if (decided < bar.minDecided[kind]) reasons.push(`only ${decided} pairs judged same or different; needs ${bar.minDecided[kind]}`);
    if (tally.pairs && tally.unclear / tally.pairs > bar.maxUnclearShare) reasons.push(`${tally.unclear} of ${tally.pairs} pairs unclear`);
    if (tally.rate !== null && tally.rate < bar.minRate[kind]) reasons.push(`${percent(tally.rate)} judged the same; bar ${percent(bar.minRate[kind])}`);
    if (tally.rate !== null && baselineRate !== null && tally.rate < baselineRate - bar.maxDrop) reasons.push(`fell from ${percent(baselineRate)} to ${percent(tally.rate)}`);
    return { kind, tally, baselineRate, pass: reasons.length === 0, reasons };
  });
  return { pass: checks.every((check) => check.pass), styles: [...styles], barVersion: bar.version, checks };
}
