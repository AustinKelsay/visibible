/**
 * Lazy text preparation for one moment (#171, spec #165 §5): a scene plan with
 * resolved moment conditions, shared by every art style and reader translation. It is made with
 * the configured text model when first needed, stored in the active analysis generation with the versions they were made from, and
 * reused until an input changes. Preparation is forgiving: the plan review advises, depicted cast are
 * selected for their canon, and a plan is kept with notes after one re-plan. A plan that
 * still cannot be made (unreadable replies, or a no-form subject drawn as a body) raises a retryable
 * error before any image call, which the request route returns as is. Wording that belongs to one work,
 * including everything about subjects without form, comes from its depiction profile (ADR 0010). Concurrent
 * misses take a claim so only one caller funds the call; the others wait for the record. Owner spend
 * is recorded per call and no guest credit is touched.
 */
import { z } from "zod";
import type { TextModel } from "../reading-pass/model";
import { parseModelJson } from "../reading-pass/model";
import type { WorkBrief } from "../work-preparation";
import { planningNeighbors } from "./scene-grounding";
import { PLAN_REVIEW_PROMPT_VERSION, PLAN_SCENE_FIELDS, reviewPlan, type PlanReviewProblem } from "./plan-review";
import type { SelectedCanon } from "./prompt";
import { ownerLookVersion, type Situation } from "./situation";
import { depictionModeOf, effectsWordingFor, readDepictionProfile, symbolWordingFor, type DepictionMode, type DepictionProfile, type EffectsWording, type SymbolWording } from "./depiction";

const lookOutputSchema = z.object({ place: z.string(), timeOfDay: z.string(), weather: z.string(), light: z.string(), clothing: z.string() }).strict();

/** The planner's general contract; the work names its written objects and examples, and whether it has subjects without form. */
export function planSystem(depiction: DepictionProfile): string {
  return `You plan one illustration of one moment of a work's text. You get the moment with its neighbours in the same story section, the work brief, the era, the section cast and any owner-authored setting constraints. Return only JSON.
- Draw one scene at one instant: no collage and no sequence of steps. If the moment recounts several actions, pick one representative instant. If it has no event (a list, genealogy, law, saying or greeting), illustrate its content or setting through people, places and things, never as a written document.
- Show what the moment is about. When the moment is mostly someone's words (a prophecy, oracle, poem, proverb, prayer, letter, argument or teaching, or a story, parable, vision or memory being told), draw what the words describe and leave the speaker, writer and listeners out, unless the text shows them inside that scene (a visionary within the vision). Never put a speaker, writer or listener into a scene their words only describe, and never make them a figure of their own words${depiction.speakerExamples ? `, such as ${depiction.speakerExamples}` : ""}.
- In \`selectedCast\`, list every section cast entry that will be visible: ${depiction.modes.effects ? "people, groups, places, objects, and any presence without form shown through its effects" : "people, groups, places and objects"}. Give a few words of the text for each. Leave out cast who are elsewhere or only mentioned. Anyone without a cast entry may appear as an unnamed role or crowd when the moment needs them.
- Describe pose, action, placement and situational detail. Leave fixed appearance to canon, name no art style, and ask for no visible writing: ${depiction.closedDocuments}, and signs and boards are blank. Describe only what can be seen; leave out unseen or invisible beings, because anything named gets drawn. Keep every depiction rule.
- The scene fields carry this moment's place, time, light and situational clothing. OWNER LOOK CONSTRAINTS, when given, are binding: keep the setting and time of day consistent with them.
- Each field is one or two short phrases.`;
}
/** All plans use the forgiving general contract; a change refreshes plans lazily. */
export const MOMENT_CAST_PROMPT_VERSION = "2026-10-30-moment-cast-v16";
/** Bump for changes to the no-form planning addendum; only sections with no-form cast use it. */
export const FORMLESS_PLAN_PROMPT_VERSION = "2026-10-28-formless-effects-v17";
const formlessPlanSystem = (depiction: DepictionProfile, effects: EffectsWording) => `${planSystem(depiction)}\n${effects.planSystem}`;
export const planOutputSchema = z.object({
  present: z.array(z.string()),
  // Guidance only: each field restates grounding.instant; no code checks pose consistency.
  primarySubject: z.string().describe("The main subject at the chosen instant, in the pose and place stated in grounding.instant."),
  action: z.string().describe("What happens at that one instant, matching grounding.instant; no earlier or later step."),
  setting: z.string().describe("The physical place and surroundings of this single scene, consistent with the source and era."),
  secondaryElements: z.string().describe("Supporting selected cast, props and details with their placement at the same instant."),
  mood: z.string().describe("The emotional atmosphere of this moment."),
  timeOfDay: z.string().describe("This moment's time of day and situational illumination, consistent with the source."),
  composition: z.string().describe("Viewpoint, framing and relative placement of that same instant, introducing no other pose. Independent of art style and rendering technique."),
}).strict();

/** Longest stored scene or condition value; a longer reply is trimmed rather than refused. */
const PLAN_FIELD_MAX_CHARS = 400;

/**
 * Only structure is validated. The provider schema limits cast IDs to the section's own (strict structured
 * output enforces it; a reply outside it is malformed and retried once). Repeated IDs are dropped and long
 * values trimmed in code, so a usable plan is not refused for formatting; the field descriptions guide the model.
 */
function planningResponseSchema(entryIds: string[], effects: EffectsWording | null, depiction: DepictionProfile) {
  // An empty enum is not a valid provider schema; IDs outside the cast are dropped after parsing.
  const id = entryIds.length ? z.enum(entryIds) : z.string();
  const field = (description: string) => z.string().describe(`${description} One or two short phrases.`);
  const formless = effects ? ` ${effects.planField}` : "";
  return z.object({
    focusQuote: z.string().describe("A few words copied from MOMENT naming what this image shows."),
    instant: z.string().describe("One sentence fixing the single instant to draw: who is where, doing what."),
    selectedCast: z.array(z.object({ entryId: id, evidence: z.string().describe("A few words from the text that put this entry in the scene.") }).strict())
      .describe(`Every section cast entry visible in the image, once each: ${depiction.modes.effects ? "people, groups, places, objects and presences shown through effects" : "people, groups, places and objects"}. Empty when none is.`),
    primarySubject: field(`The main subject and its pose or placement at that instant.${formless}`),
    action: field(`What happens at that one instant.${formless}`),
    setting: field("The physical place and surroundings, consistent with the text and era."),
    secondaryElements: field("Supporting people, props and effects with their placement."),
    mood: field("The emotional atmosphere of the moment."),
    timeOfDay: field("This moment's time of day, weather and situational light."),
    composition: field("Viewpoint, framing and placement of the subjects, independent of art style."),
  }).strict();
}

export type AnalysisRecord = { source?: "generated" | "owner"; kind: string; recordId: string; version: string; inputs: Array<{ kind: string; recordId: string; version: string }>; payload: Record<string, unknown> & { kind: string } };
export type InputRef = { kind: string; recordId: string; version: string };

export type MomentContext = {
  moment: { id: string; reference: string; text: string };
  previous: { text: string } | null;
  next: { text: string } | null;
};

/** The analysis reads and writes preparation needs; the Convex analysis module implements it in production. */
export interface PreparationStore {
  getActiveRecord(kind: "section" | "moment" | "entry" | "look" | "plan", recordId: string): Promise<AnalysisRecord | null>;
  putDerivedRecord(args: { kind: "look" | "plan"; recordId: string; payload: Record<string, unknown> & { kind: "look" | "plan" }; inputs: InputRef[] }): Promise<{ version: string }>;
  claim(kind: "look" | "plan", recordId: string, holder: string, ttlMs: number): Promise<{ held: boolean }>;
  release(kind: "look" | "plan", recordId: string, holder: string): Promise<void>;
  recordSpend(entry: { kind: string; recordId: string; model: string; outcome: string; costUsd: number | null; promptTokens: number | null; completionTokens: number | null; elapsedMs: number }): Promise<void>;
}

export class PreparationUnavailableError extends Error {
  readonly retryable = true;
  constructor(public readonly stage: "look" | "plan", message: string) {
    super(`Preparing scene: ${stage} unavailable: ${message}`);
  }
}

export type PreparedMoment = {
  sectionId: string;
  era: string | null;
  look: { version: string; payload: z.infer<typeof lookOutputSchema>; policy: "literal-constraint-v1" } | null;
  /** Owner look constraints rendered verbatim; null when none were selected. */
  situation: Situation | null;
  plan: { version: string; payload: z.infer<typeof planOutputSchema> };
  /** The entries present in the moment with the stage the section assigns them, and their canon versions. */
  present: Array<{ entryId: string; stageId: string; version: string }>;
  /** Owner spend for calls this request made, if any. */
  calls: number;
};

// A plan may take two plan replies and two reviews, each with one malformed-reply retry.
const CLAIM_TTL_MS = 120_000;
const WAIT_MS = 90_000;

function sameInputs(record: AnalysisRecord, expected: InputRef[]) {
  if (record.inputs.length !== expected.length) return false;
  return expected.every((e) => record.inputs.some((i) => i.kind === e.kind && i.recordId === e.recordId && i.version === e.version));
}

const inFlight = new Map<string, Promise<AnalysisRecord>>();

/** Single-flight per instance plus a store claim across instances; waiters poll for the record. */
async function ensureRecord(
  store: PreparationStore, workId: string, kind: "plan", recordId: string, expectedInputs: InputRef[],
  make: () => Promise<Record<string, unknown> & { kind: "plan" }>, options: { holder: string; now: () => number; sleep: (ms: number) => Promise<void> },
): Promise<AnalysisRecord> {
  const existing = await store.getActiveRecord(kind, recordId);
  if (existing && sameInputs(existing, expectedInputs)) return existing;
  // Shared only by requests for the same work, record and input versions: two works may reuse a
  // unit id, and two requests may hold different brief versions.
  const key = `${workId}/${kind}/${recordId}/${expectedInputs.map((i) => `${i.kind}:${i.recordId}:${i.version}`).sort().join("|")}`;
  const running = inFlight.get(key);
  if (running) return running;
  const task = (async () => {
    try {
      const claim = await store.claim(kind, recordId, options.holder, CLAIM_TTL_MS);
      if (!claim.held) {
        const deadline = options.now() + WAIT_MS;
        while (options.now() < deadline) {
          await options.sleep(500);
          const record = await store.getActiveRecord(kind, recordId);
          if (record && sameInputs(record, expectedInputs)) return record;
        }
        throw new PreparationUnavailableError(kind, "another request is still preparing it");
      }
      try {
        // Another instance may have written and released between the first read and the claim.
        const fresh = await store.getActiveRecord(kind, recordId);
        if (fresh && sameInputs(fresh, expectedInputs)) return fresh;
        const payload = await make();
        const { version } = await store.putDerivedRecord({ kind, recordId, payload, inputs: expectedInputs });
        return { kind, recordId, version, inputs: expectedInputs, payload, source: "generated" as const };
      } finally {
        await store.release(kind, recordId, options.holder);
      }
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
}

async function askOnce<T>(model: TextModel, store: PreparationStore, kind: "plan", recordId: string, schema: z.ZodType<T>, system: string, user: string, unavailable?: (value: T) => string | null): Promise<T> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await model.complete({ label: `${kind}:${recordId}:${attempt}`, system, user, schemaName: "scene_plan", schema,
        maxTokens: 2400, expectedCompletionTokens: 1200 });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await store.recordSpend({ kind, recordId, model: model.id, outcome: `error: ${lastError.slice(0, 120)}`, costUsd: null, promptTokens: null, completionTokens: null, elapsedMs: 0 });
      continue;
    }
    const parsed = parseModelJson(schema, result.content);
    const reason = "error" in parsed ? null : unavailable?.(parsed.value);
    await store.recordSpend({ kind, recordId, model: result.model, outcome: "error" in parsed ? "invalid" : reason ? "unavailable" : "ok", costUsd: result.usage.costUsd, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, elapsedMs: result.elapsedMs });
    if ("error" in parsed) { lastError = parsed.error; continue; }
    if (reason) throw new PreparationUnavailableError(kind, reason);
    return parsed.value;
  }
  throw new PreparationUnavailableError(kind, lastError);
}

/** Appended to the planner request for the single re-plan; the problems come from code checks or the review. */
function replanFeedback(problems: string[]) {
  return `\n\nA PREVIOUS PLAN FOR THIS MOMENT WAS REJECTED. Write a new plan that fixes every problem below and keeps what was correct:\n${problems.map((p) => `- ${p}`).join("\n")}`;
}

export async function prepareMoment(options: {
  workId: string;
  momentId: string;
  store: PreparationStore;
  model: TextModel;
  brief: WorkBrief;
  briefVersion: string;
  /** The work's depiction profile: its wording for the planner, the review and subjects without form. Read from the checkout when omitted. */
  depiction?: DepictionProfile;
  context: MomentContext;
  /** Instance-unique holder id for claims. */
  holder?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PreparedMoment> {
  const { store, brief } = options;
  const depiction = options.depiction ?? readDepictionProfile(options.workId);
  if (depiction.workId !== options.workId) throw new PreparationUnavailableError("look", `the depiction profile of ${depiction.workId} was given for ${options.workId}`);
  const holder = options.holder ?? `instance-${Math.random().toString(36).slice(2)}`;
  const timing = { holder, now: options.now ?? Date.now, sleep: options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))) };
  let calls = 0;
  const model: TextModel = { id: options.model.id, complete: async (request) => { calls++; return options.model.complete(request); } };

  const moment = await store.getActiveRecord("moment", options.momentId);
  if (!moment || moment.payload.kind !== "moment") throw new PreparationUnavailableError("plan", `unknown moment ${options.momentId}`);
  const sectionId = String(moment.payload.sectionId);
  const section = await store.getActiveRecord("section", sectionId);
  if (!section || section.payload.kind !== "section") throw new PreparationUnavailableError("look", `unknown section ${sectionId}`);
  const sectionPayload = section.payload as unknown as { title: string; era?: string; cast: Array<{ entryId: string; stageId: string; named?: boolean }> };
  const era = brief.eras.find((e) => e.id === sectionPayload.era) ?? brief.eras[0];
  const cast: Array<{ entryId: string; stageId: string; name: string; version: string; text: string; hasForm: boolean; mode: DepictionMode; entryKind: SelectedCanon["kind"] }> = [];
  for (const member of sectionPayload.cast) {
    const entry = await store.getActiveRecord("entry", member.entryId);
    if (!entry || entry.payload.kind !== "entry") throw new PreparationUnavailableError("plan", `missing canon entry ${member.entryId}`);
    const stages = entry.payload.stages as Array<{ id: string; text: string; showing?: unknown }>;
    const stage = stages.find((s) => s.id === member.stageId);
    if (!stage || !stage.text.trim()) throw new PreparationUnavailableError("plan", `missing canon stage ${member.entryId}:${member.stageId}`);
    const name = String(entry.payload.name);
    cast.push({ entryId: member.entryId, stageId: stage.id, name, version: entry.version,
      // A symbol entry has a form (its non-human one), so only effects entries count as without form.
      text: stage.text, hasForm: depictionModeOf(entry.payload) !== "effects", mode: depictionModeOf(entry.payload), entryKind: (entry.payload.entryKind ?? "character") as SelectedCanon["kind"] });
  }
  const rules = brief.depictionRules.map((r) => `- ${r.text}`).join("\n") || "- none";
  const hasFormlessCast = cast.some((c) => !c.hasForm);
  // A work without wording for subjects without form cannot prepare them; refuse before any model call.
  let effects: EffectsWording | null = null;
  let symbol: SymbolWording | null = null;
  const symbolCast = cast.filter((c) => c.mode === "symbol");
  try {
    effects = hasFormlessCast ? effectsWordingFor(depiction, cast.filter((c) => !c.hasForm).map((c) => c.entryId)) : null;
    symbol = symbolCast.length ? symbolWordingFor(depiction, symbolCast.map((c) => c.entryId)) : null;
  } catch (error) {
    throw new PreparationUnavailableError("look", error instanceof Error ? error.message : String(error));
  }

  // Generated section guides are retired. Owner and unknown-provenance constraints remain binding.
  const existingLook = await store.getActiveRecord("look", sectionId);
  const look = ownerLookVersion(existingLook) === null ? null : existingLook;
  const lookPayload = look ? lookOutputSchema.parse(Object.fromEntries(Object.keys(lookOutputSchema.shape).map((field) => [field, look.payload[field]]))) : null;
  const policy = look ? "literal-constraint-v1" : "no-owner-look-v1";
  const assertLookCurrent = async () => {
    const current = await store.getActiveRecord("look", sectionId);
    if (ownerLookVersion(current) !== (look?.version ?? null)) throw new PreparationUnavailableError("look", "owner constraints changed during preparation");
  };

  // Include the section directly so stage reassignments refresh the plan.
  // The plan never depends on a style or translation.
  const planInputs: InputRef[] = [{ kind: "moment", recordId: options.momentId, version: moment.version }, { kind: "section", recordId: sectionId, version: section.version },
    ...(look ? [{ kind: "look", recordId: sectionId, version: look.version }] : []),
    { kind: "prompt", recordId: "scene_plan_look_ownership", version: policy },
    { kind: "brief", recordId: options.workId, version: options.briefVersion }, ...cast.map((c) => ({ kind: "entry", recordId: c.entryId, version: c.version })),
    { kind: "prompt", recordId: "scene_plan_moment_cast", version: MOMENT_CAST_PROMPT_VERSION },
    { kind: "prompt", recordId: "scene_plan_review", version: PLAN_REVIEW_PROMPT_VERSION },
    ...(hasFormlessCast ? [{ kind: "prompt", recordId: "scene_plan_formless_presence", version: FORMLESS_PLAN_PROMPT_VERSION }] : []),
    { kind: "prompt", recordId: "depiction_plan", version: depiction.planVersion },
    ...(symbol ? [{ kind: "prompt", recordId: "depiction_symbol", version: depiction.symbolVersion }] : [])];
  const plan = await ensureRecord(store, options.workId, "plan", options.momentId, planInputs, async () => {
    const neighbors = planningNeighbors(options.context);
    const user = `WORK BRIEF\nTone: ${brief.tone}\nDepiction rules:\n${rules}\nEra: ${era.label}. People: ${era.people} Dress: ${era.dress} Technology: ${era.technology}\nSTORY SECTION: ${sectionPayload.title}\n\nMOMENT (${options.context.moment.reference}): ${options.context.moment.text}\nPREVIOUS: ${neighbors.previous ?? "(section starts here)"}\nNEXT: ${neighbors.next ?? "(section ends here)"}\n\nCAST ON STAGE IN THIS SECTION (id: name):\n${cast.map((c) => `- ${c.entryId}: ${c.name}${hasFormlessCast ? ` (hasForm: ${c.hasForm})` : ""}${c.mode === "symbol" ? ` (shown only as its canon form: ${c.text})` : ""}`).join("\n") || "- (no one listed)"}`;
    const castIds = cast.map((c) => c.entryId);
    const schema = planningResponseSchema(castIds, effects, depiction);
    const lookContext = lookPayload ? `\n\nOWNER LOOK CONSTRAINTS (copy all values exactly):\n${JSON.stringify(lookPayload)}` : "";
    const reviewCast = cast.map((c) => ({ entryId: c.entryId, name: c.name, hasForm: c.hasForm }));
    const trim = (text: string) => text.length <= PLAN_FIELD_MAX_CHARS ? text : `${text.slice(0, PLAN_FIELD_MAX_CHARS - 1).trimEnd()}…`;
    // Forgiving preparation: the review advises rather than gates. A depicted but unselected cast entry is
    // selected so it gets its canon; other problems get one re-plan, after which the plan is kept with notes.
    // Only a no-form subject still drawn as a body after the re-plan stops preparation.
    let feedback = "", firstProblems: PlanReviewProblem[] | undefined;
    for (let round = 1; round <= 2; round++) {
      const notes: string[] = [];
      const system = `${effects ? formlessPlanSystem(depiction, effects) : planSystem(depiction)}${symbol ? `\n${symbol.planSystem}` : ""}`;
      const reply = await askOnce(model, store, "plan", options.momentId, schema, system, user + lookContext + feedback);
      const selected = reply.selectedCast.filter((entry, index, all) => castIds.includes(entry.entryId) && all.findIndex((e) => e.entryId === entry.entryId) === index);
      const present = selected.map((entry) => entry.entryId);
      const fields = Object.fromEntries(PLAN_SCENE_FIELDS.map((field) => [field, trim(reply[field])])) as Record<(typeof PLAN_SCENE_FIELDS)[number], string>;
      // Only owner constraints are rendered as conditions; a generated guide was advisory and the plan carries its own.
      const situation = lookPayload ?? undefined;
      const review = await reviewPlan(model, (entry) => store.recordSpend({ kind: "plan", recordId: options.momentId, ...entry }), options.momentId,
        { rules, depiction, context: options.context, sectionTitle: sectionPayload.title, cast: reviewCast, present, fields,
          rendering: { look: situation, lookPolicy: look ? "literal-constraint-v1" : undefined, canon: present.map((id) => {
            const entry = cast.find((c) => c.entryId === id)!;
            return { entryId: id, stageId: entry.stageId, kind: entry.entryKind, name: entry.name, text: entry.text, hasForm: entry.hasForm, depiction: entry.mode, version: entry.version };
          }) } });
      let remaining: PlanReviewProblem[] = [];
      if ("unavailable" in review) notes.push(review.unavailable);
      else {
        for (const problem of review.problems) {
          if (problem.kind === "unselected_figure" && castIds.includes(problem.entryId) && !present.includes(problem.entryId)) {
            present.push(problem.entryId);
            notes.push(`selected ${problem.entryId}: depicted but not selected`);
          }
        }
        // A re-plan cannot add missing canon or change owner text, so those are only noted.
        remaining = review.problems.filter((p) => p.kind !== "unselected_figure" && p.kind !== "missing_canon" && !(p.kind === "look_conflict" && policy === "literal-constraint-v1"));
        const noted = review.problems.filter((p) => p.kind === "missing_canon" || (p.kind === "look_conflict" && policy === "literal-constraint-v1"));
        if (noted.length) notes.push(`noted: ${noted.map((p) => `${p.kind}: ${p.reason}`).join("; ")}`);
      }
      if (remaining.length && round === 1) {
        firstProblems = remaining;
        feedback = replanFeedback(remaining.map((p) => `${p.kind}: ${p.reason} (${p.kind === "look_conflict" ? "moment conditions" : "plan"} said: "${p.planQuote}")`));
        continue;
      }
      const embodied = remaining.filter((p) => p.kind === "embodied_formless");
      if (embodied.length) throw new PreparationUnavailableError("plan", `a subject without form is still drawn as a figure: ${embodied.map((p) => p.entryId).join(", ")}`);
      if (remaining.length) notes.push(`kept with: ${remaining.map((p) => `${p.kind}${p.entryId ? ` ${p.entryId}` : ""}`).join(", ")}`);
      await assertLookCurrent();
      return { kind: "plan" as const, momentId: options.momentId, entries: present.map((id) => ({ entryId: id, stageId: cast.find((c) => c.entryId === id)!.stageId })), plan: fields,
        grounding: { focusQuote: reply.focusQuote, instant: reply.instant, singleInstant: !remaining.some((p) => p.kind === "not_one_instant"),
          cast: selected.map((entry) => ({ entryId: entry.entryId, momentQuote: entry.evidence, contextSource: "none" as const, contextQuote: "", participation: "in_scene" as const })) },
        review: { rounds: round, ...(firstProblems ? { problems: firstProblems } : {}), ...(notes.length ? { notes } : {}) } };
    }
    throw new PreparationUnavailableError("plan", "plan review exhausted");
  }, timing);

  await assertLookCurrent();
  const planPayload = plan.payload as unknown as { entries: Array<{ entryId: string; stageId: string }>; plan: z.infer<typeof planOutputSchema> };
  return {
    sectionId, era: era.id, situation: lookPayload,
    look: look && lookPayload ? { version: look.version, policy: "literal-constraint-v1", payload: lookPayload } : null,
    plan: { version: plan.version, payload: { ...planPayload.plan, present: planPayload.entries.map((e) => e.entryId) } },
    present: planPayload.entries.map((e) => ({ entryId: e.entryId, stageId: e.stageId, version: cast.find((c) => c.entryId === e.entryId)?.version ?? "" })),
    calls,
  };
}

/** The production store over the Convex analysis module, with the server secret. */
export function createConvexPreparationStore(client: { query: (ref: unknown, args: unknown) => Promise<unknown>; mutation: (ref: unknown, args: unknown) => Promise<unknown> }, api: Record<string, unknown>, workId: string, serverSecret: string): PreparationStore {
  const a = api as { getActiveRecord: unknown; putDerivedRecord: unknown; claimPreparation: unknown; releasePreparation: unknown; recordPreparationSpend: unknown };
  return {
    getActiveRecord: (kind, recordId) => client.query(a.getActiveRecord, { workId, kind, recordId }) as Promise<AnalysisRecord | null>,
    putDerivedRecord: (args) => client.mutation(a.putDerivedRecord, { serverSecret, workId, ...args }) as Promise<{ version: string }>,
    claim: (kind, recordId, holder, ttlMs) => client.mutation(a.claimPreparation, { serverSecret, workId, kind, recordId, holder, ttlMs }) as Promise<{ held: boolean }>,
    release: async (kind, recordId, holder) => { await client.mutation(a.releasePreparation, { serverSecret, workId, kind, recordId, holder }); },
    recordSpend: async (entry) => { await client.mutation(a.recordPreparationSpend, { serverSecret, workId, ...entry, costUsd: entry.costUsd ?? undefined, promptTokens: entry.promptTokens ?? undefined, completionTokens: entry.completionTokens ?? undefined }); },
  };
}
