/**
 * Lazy text preparation for one moment (#171, spec #165 §5): the section look, shared by every
 * image of a story section, and the style-neutral scene plan, shared by every art style and
 * reader translation of a moment. Both are made with Claude Haiku 5.5 the first time they are
 * needed, stored in the active analysis generation with the versions they were made from, and
 * reused until an input changes. A required look or plan that cannot be made raises a retryable
 * error before any image call; there is no unplanned or legacy fallback. Concurrent misses take
 * a claim so only one caller funds the call; the others wait for the record. Owner spend is
 * recorded per call and no guest credit is touched.
 */
import { z } from "zod";
import type { TextModel } from "../reading-pass/model";
import { parseModelJson } from "../reading-pass/model";
import { canonShowingSchema, compileCanonShowing } from "../canon-showing";
import type { WorkBrief } from "../work-preparation";
import { planningNeighbors, sceneGroundingSchema, sceneGroundingProblem } from "./scene-grounding";
import { PLAN_REVIEW_PROMPT_VERSION, PLAN_SCENE_FIELDS, reviewPlan, type PlanReviewProblem } from "./plan-review";

export const LOOK_SYSTEM = `You write a SECTION LOOK for an illustrated edition: one short shared visual description reused by every image of a story section, so that independently generated images of the section agree with each other. Return only JSON.
Rules: each value is one or two short phrases, at most 200 characters. Describe only what stays the same across the whole section: place, time of day, weather, light, and situational clothing or props. Leave out poses, actions and individual moments, and do not restate anyone's fixed appearance; canon does that. If the section spans a change (night into morning), say so once. Obey the work brief's depiction rules. Mention no text or written elements.`;
export const lookOutputSchema = z.object({ place: z.string(), timeOfDay: z.string(), weather: z.string(), light: z.string(), clothing: z.string() }).strict();
/** Bump for changes to this no-form look contract or its cast format; only affected looks use it. */
export const FORMLESS_LOOK_PROMPT_VERSION = "2026-10-22-formless-look-v1";
const FORMLESS_LOOK_SYSTEM = `${LOOK_SYSTEM}
Cast marked hasForm: false have no physical body. Use their assigned canon constraints to choose permitted effects for the shared setting. Bodily wording about those subjects in the source is a metaphor, not permission to describe anatomy, hair, clothing, silhouettes or figures made of light in any look field. Do not repeat prohibited features as denials or substitutes, such as a faceless figure or radiance suggesting garments. A seated metaphor permits an unoccupied seat and surrounding effects, not a seated presence. Keep formed characters' own situational clothing and props attached to them; never transfer a no-form subject's bodily metaphors to them.
The complete canon is supplied separately to rendering. Where constraints list effect names for placement, choose only from those effects and leave their fixed colour, brightness and texture to canon. Historical prose constraints may still include the full description. Describe only the effects needed for the section's shared setting or illumination, without enumerating all effects or copying fixed appearance into the look. Situational illumination and formed characters' clothing remain valid look details. The cast list covers the whole section; do not force every cast member into the shared setting or add individual poses, actions or moments.`;
const formlessLookOutputSchema = (() => {
  // As with plans, enforce length locally without emitting Anthropic's unsupported maxLength.
  const field = (description: string) => z.string().refine((text) => text.length <= 200, "Must be at most 200 characters").describe(`${description} At most 200 characters.`);
  return z.object({
    place: field("The shared physical place and surroundings. For a no-form subject's seated metaphor, describe an unoccupied seat and permitted surrounding effects, without bodily substitutes or fixed canon appearance."),
    timeOfDay: field("The time of day or change in time across the section, without a subject's fixed appearance."),
    weather: field("Shared environmental conditions, without bodily metaphors or fixed canon appearance."),
    light: field("Situational illumination shared by the section. Name a permitted no-form effect only where needed for the setting, leaving its fixed colour, brightness and texture to canon. Do not repeat prohibited features as denials."),
    clothing: field("Only formed characters' situational clothing and shared props. Do not describe a no-form subject's clothing, hair, anatomy or garment substitutes, even as a denial. Leave fixed appearance to canon."),
  }).strict();
})();

export const PLAN_SYSTEM = `You are the scene planner of an illustration engine. You get one moment of a work's text with its neighbours inside the same story section, the work brief's tone and depiction rules, the era, the section look, and the cast on stage in the section. Plan one single scene that depicts this moment. Return only JSON.
Rules: single scene, no collage. Choose which of the listed cast are present in this moment and name them in \`present\` by their ids; leave out cast who are elsewhere in the section. Keep every depiction rule. Do not describe anyone's fixed appearance (canon does that) and do not name an art style or rendering technique; describe pose, action, placement and situational detail. Each field is one or two short phrases, at most 220 characters. No text or written elements in the scene.
Establish presence from the scene being illustrated. A shared wardrobe, a narrator's viewpoint or a neighboring mention alone does not establish presence. Neighbors may resolve identity and continuity in the current scene; do not import cast from a separate adjacent event. The section cast and look cover multiple moments, not a roster to depict in every image. Apply shared clothing and props only to selected entries. Every cast entry described in any scene field must be selected in \`present\`; never describe an available cast member without selecting it. People, crowds, roles and animals with no cast entry may be described by role and situation when the moment needs them; they receive no fixed appearance and are never given a recurring character's name.
Identify the action the moment depicts before selecting cast. If it is inside a narrated story, parable, dream, vision or recollection, depict that scene's actors and setting. Do not place its framing speaker, listener or narrator inside it unless the text establishes their participation there. Reporting "I saw" supplies a viewpoint, not a visible observer. Shared look details from the framing scene do not establish the inner scene's cast or place.
Choose the scene before applying the shared look. In \`grounding.focusQuote\`, copy a short exact clause from MOMENT for the action or state to illustrate. If the moment recounts multiple actions, choose one representative instant; do not illustrate all steps. A character cannot occupy successive poses or places at once. After the cast evidence, state that instant once in \`grounding.instant\`: where each selected formed character is and their one pose or movement, and the state or placement of selected places, objects and no-form effects (an effect's placement, never a bodily pose, seated presence or denied figure). Then write every scene field from that sentence, repeating its poses and places and adding no earlier or later step; for example, someone still walking toward a door cannot also be seated at the table. Set \`grounding.singleInstant\` false if the fields cannot match it.
For each selected \`present\` ID, provide one \`grounding.cast\` record, in any order, with exact words from MOMENT anchoring its participation at that instant. You may also add a record for section cast you considered and left out, classified honestly as framing, mentioned, separate_event or uncertain; such a record selects no one. Every quote copies its source exactly; to skip words, give exact fragments in source order separated by an ellipsis (…), never paraphrased or reordered. Classify participation honestly: in_scene, framing, mentioned, separate_event or uncertain. Only in_scene may be rendered; a nonparticipating or uncertain selection will stop preparation rather than be silently removed. A first-person report of seeing or telling is framing evidence, not evidence of visible participation. Cast introduced in a later event remain absent from the chosen instant even if the shared look describes their clothes. A neighbor may resolve a current pronoun, ownership or continuing location, but cannot supply presence missing from MOMENT. Copy any needed neighbor evidence separately, with contextSource previous or next; otherwise use none and an empty contextQuote. Include locations, objects and permitted no-form presences in this evidence, not only people. A selected location or object that continues from a neighbor may leave its MOMENT quote empty and be anchored by an exact quote from that neighbor alone; characters and groups always need words from MOMENT. These evidence quotes are audit data, never scene prose. Apply the section look only after choosing this instant and its participants.
Report \`missingCast\` when the moment requires a named character or group whom the story follows beyond this moment, so its look must stay consistent across images, and it has no cast entry; this applies to secondary characters as well as the main actor. Never report a role, a generic crowd or an animal, a person named only in passing (for example in a list), or anyone in the available cast: describe those without canon instead. A recurring named group is not a generic crowd, even when it appears as one. If an available cast member's presence is uncertain, choose an instant the text establishes rather than reporting it missing. A moment without an event (a list, law, saying or greeting) still gets a scene that illustrates its content or setting. Do not replace a missing named character with a framing figure or omit that character to fit the list. When \`missingCast\` is nonempty, return empty \`present\`, empty \`grounding.focusQuote\`, \`grounding.cast\` and \`grounding.instant\`, and empty scene fields; preparation will stop for a source correction. Otherwise return an empty \`missingCast\` list. This is a report of missing required canon, not a request to create it.`;
/** All plans use the selected-cast contract; a change refreshes plans lazily, without remaking looks. */
export const MOMENT_CAST_PROMPT_VERSION = "2026-10-23-moment-cast-v6";
/** Bump for changes to this no-form planning contract or its cast format; only affected plans use it. */
export const FORMLESS_PLAN_PROMPT_VERSION = "2026-10-23-formless-effects-v6";
const FORMLESS_PLAN_SYSTEM = `${PLAN_SYSTEM}
Presence does not require a physical body. A cast entry marked hasForm: false still belongs in the moment when represented through the non-figurative presence allowed by the brief and its supplied canon constraints. If you describe that entry's presence or action in any scene field, include its id in \`present\` so its canon constraints reach the image model. An effect standing for a no-form cast member counts as that member being depicted, even when unnamed, called background light, or placed at the edge of the scene: for example divine radiance, veiled radiance, or a fire-like glow representing God. Select its id and provide in_scene evidence from this moment, just as for a formed character. If the moment does not establish that presence, omit the effect from grounding.instant and every scene field instead of copying it from the section look. Ordinary sunlight, lamplight, embers and weather that do not represent a cast member require no such selection. Select presence for this moment only; do not add cast who are absent or merely mentioned.
For each no-form subject, use its assigned canon to choose the permitted visible effects and their placement in the setting. Bodily wording about that subject in the source is a metaphor, not permission to give it a physical form. In every scene field, describe the permitted effects rather than bodily poses, anatomy, clothing, human silhouettes or figures made of light. Do not repeat prohibited features as denials or substitutes, such as a faceless figure or radiance suggesting garments. When the source describes a no-form subject as seated, describe the unoccupied seat and the permitted surrounding effects rather than a seated presence. Keep formed characters' own poses, clothing and actions; never transfer a no-form subject's bodily metaphors to them.
Canon is supplied separately to rendering in full. When the constraints list effect names for placement, choose only from those effects; their fixed appearance is deliberately omitted from this planning input. Historical prose constraints may still include the full description. Name only the permitted effect needed for this moment's placement or movement; leave its fixed colour, brightness and texture to canon. Do not enumerate all effects or copy the canon's descriptive qualifiers into any scene field. For example, given canon "The presence: brilliant gold radiance", plan "radiance spreading above the arch; the witness approaches". The plan contributes where the effect appears and what happens around it. Situational illumination and formed characters' clothing still belong in the plan when the moment or look requires them; these are separate from the no-form subject's fixed appearance.`;
export const planOutputSchema = z.object({
  present: z.array(z.string()),
  // Guidance only: each field restates grounding.instant; no code checks pose consistency.
  primarySubject: z.string().describe("The main subject at the chosen instant, in the pose and place stated in grounding.instant."),
  action: z.string().describe("What happens at that one instant, matching grounding.instant; no earlier or later step."),
  setting: z.string().describe("The physical place and surroundings of this single scene, consistent with the section look and era."),
  secondaryElements: z.string().describe("Supporting selected cast, props and details with their placement at the same instant."),
  mood: z.string().describe("The emotional atmosphere of this moment."),
  timeOfDay: z.string().describe("This moment's time of day and situational illumination, consistent with the section look."),
  composition: z.string().describe("Viewpoint, framing and relative placement of that same instant, introducing no other pose. Independent of art style and rendering technique."),
}).strict();

/** Structure is validated; the field descriptions guide the model but cannot validate depiction semantics. */
function formlessPlanOutputSchema(entryIds: string[]) {
  // Anthropic rejects maxLength in a raw output schema. Keep the limit in descriptions and
  // local validation; Zod refinements are not emitted by responseSchema's JSON conversion.
  const field = (description: string) => z.string().refine((text) => text.length <= 220, "Must be at most 220 characters").describe(`${description} At most 220 characters.`);
  return z.object({
    present: z.array(z.enum(entryIds)).describe("IDs of section cast present in this moment, including no-form subjects represented through their permitted effects. Leave out cast who are elsewhere or merely mentioned."),
    primarySubject: field("The main subject's placement or a formed character's situational pose. For a no-form subject, name the permitted effect and its position without its fixed colour, brightness or texture. For a seated metaphor, describe an unoccupied seat with effects around it. Example: radiance above an unoccupied seat; the witness looks up."),
    action: field("What formed characters do and how permitted effects move or change in this moment. Name a no-form subject's effect without its fixed colour, brightness or texture. Keep formed characters' own actions and situational clothing attached to them."),
    setting: field("The physical place, surfaces and surroundings of this single scene, consistent with the section look and era."),
    secondaryElements: field("Supporting people, props and permitted effects with their placement. Name a no-form subject's effect without its fixed colour, brightness or texture; include only effects needed for this moment, without bodily or garment substitutes."),
    mood: field("The emotional atmosphere of this moment, conveyed through the setting and formed characters' reactions."),
    timeOfDay: field("This moment's time of day and situational illumination, consistent with the section look. Leave the no-form subject's fixed appearance in canon."),
    composition: field("Viewpoint, framing and relative placement of formed subjects, objects and permitted effects in one scene. Keep this independent of art style and rendering technique."),
  }).strict();
}

/** All plans report missing required canon and reject unknown or duplicate selections locally. */
function planningResponseSchema(entryIds: string[], hasFormlessCast: boolean) {
  const base = hasFormlessCast ? formlessPlanOutputSchema(entryIds) : planOutputSchema;
  // An empty enum is not a useful provider schema. Refinement still rejects every ID locally.
  const id = entryIds.length ? z.enum(entryIds) : z.string().refine(() => false, "No section cast is available");
  // Put the source choice first in the provider schema, before scene prose and shared styling.
  return z.object({ grounding: sceneGroundingSchema, ...base.shape,
    present: z.array(id).refine((ids) => new Set(ids).size === ids.length, "Cast IDs must be distinct")
      .describe("Distinct IDs of available section cast present in the depicted scene, including permitted no-form effects. Empty when no cast is needed or required canon is missing."),
    missingCast: z.array(z.string().refine((name) => name.trim().length > 0, "A missing subject needs a name or role"))
      .describe("Named characters or groups the story follows beyond this moment, required here and absent from the available section cast. Include such actors inside embedded stories or visions. Never roles, crowds, animals, people named only in passing, or entries already in the cast. Usually empty; never invent canon or substitute framing figures."),
  }).strict();
}

export type AnalysisRecord = { kind: string; recordId: string; version: string; inputs: Array<{ kind: string; recordId: string; version: string }>; payload: Record<string, unknown> & { kind: string } };
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
  look: { version: string; payload: z.infer<typeof lookOutputSchema> };
  plan: { version: string; payload: z.infer<typeof planOutputSchema> };
  /** The entries present in the moment with the stage the section assigns them, and their canon versions. */
  present: Array<{ entryId: string; stageId: string; version: string }>;
  /** Owner spend for calls this request made, if any. */
  calls: number;
};

// A plan may take two plan replies and two reviews, each with one malformed-reply retry.
const CLAIM_TTL_MS = 120_000;
const WAIT_MS = 90_000;

/** Project only compiler-verified structured stages; never infer effects from historical prose. */
function planningConstraint(name: string, stage: { text: string; showing?: unknown }): string {
  const parsed = canonShowingSchema.safeParse(stage.showing);
  // Owner prose edits can leave old metadata behind. Text stays authoritative in that case.
  if (!parsed.success || compileCanonShowing(name, parsed.data) !== stage.text) return stage.text;
  return `effect names for placement: ${[...new Set(parsed.data.map((part) => part.effect))].join(", ")}`;
}

function sameInputs(record: AnalysisRecord, expected: InputRef[]) {
  if (record.inputs.length !== expected.length) return false;
  return expected.every((e) => record.inputs.some((i) => i.kind === e.kind && i.recordId === e.recordId && i.version === e.version));
}

const inFlight = new Map<string, Promise<AnalysisRecord>>();

/** Single-flight per instance plus a store claim across instances; waiters poll for the record. */
async function ensureRecord(
  store: PreparationStore, workId: string, kind: "look" | "plan", recordId: string, expectedInputs: InputRef[],
  make: () => Promise<Record<string, unknown> & { kind: "look" | "plan" }>, options: { holder: string; now: () => number; sleep: (ms: number) => Promise<void> },
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
        return { kind, recordId, version, inputs: expectedInputs, payload };
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

async function askOnce<T>(model: TextModel, store: PreparationStore, kind: "look" | "plan", recordId: string, schema: z.ZodType<T>, system: string, user: string, unavailable?: (value: T) => string | null): Promise<T> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await model.complete({ label: `${kind}:${recordId}:${attempt}`, system, user, schemaName: kind === "look" ? "section_look" : "scene_plan", schema,
        maxTokens: kind === "plan" ? 2400 : 900, expectedCompletionTokens: kind === "plan" ? 900 : 350 });
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
  context: MomentContext;
  /** Instance-unique holder id for claims. */
  holder?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PreparedMoment> {
  const { store, brief } = options;
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
  const cast: Array<{ entryId: string; stageId: string; name: string; version: string; constraint: string; hasForm: boolean; entryKind: string }> = [];
  for (const member of sectionPayload.cast) {
    const entry = await store.getActiveRecord("entry", member.entryId);
    if (!entry || entry.payload.kind !== "entry") throw new PreparationUnavailableError("plan", `missing canon entry ${member.entryId}`);
    const stages = entry.payload.stages as Array<{ id: string; text: string; showing?: unknown }>;
    const stage = stages.find((s) => s.id === member.stageId);
    if (!stage || !stage.text.trim()) throw new PreparationUnavailableError("plan", `missing canon stage ${member.entryId}:${member.stageId}`);
    const name = String(entry.payload.name);
    cast.push({ entryId: member.entryId, stageId: stage.id, name, version: entry.version,
      constraint: planningConstraint(name, stage), hasForm: entry.payload.hasForm !== false, entryKind: String(entry.payload.entryKind ?? "character") });
  }
  const rules = brief.depictionRules.map((r) => `- ${r.text}`).join("\n") || "- none";
  const hasFormlessCast = cast.some((c) => !c.hasForm);
  const formlessConstraints = cast.filter((c) => !c.hasForm).map((c) => `- ${c.entryId} (stage: ${c.stageId}): ${c.constraint}`).join("\n");

  // Only affected sections add the no-form look contract; all-formed requests stay unchanged.
  const lookInputs: InputRef[] = [{ kind: "section", recordId: sectionId, version: section.version }, { kind: "brief", recordId: options.workId, version: options.briefVersion },
    ...cast.map((c) => ({ kind: "entry", recordId: c.entryId, version: c.version })),
    ...(hasFormlessCast ? [{ kind: "prompt", recordId: "section_look_formless_presence", version: FORMLESS_LOOK_PROMPT_VERSION }] : [])];
  const look = await ensureRecord(store, options.workId, "look", sectionId, lookInputs, async () => {
    const castContext = hasFormlessCast
      ? `CAST ON STAGE IN THIS SECTION (id: name):\n${cast.map((c) => `- ${c.entryId}: ${c.name} (hasForm: ${c.hasForm})`).join("\n")}\n\nNO-FORM CANON CONSTRAINTS (setting context; fixed descriptions are not section-look fields):\n${formlessConstraints}`
      : `ON STAGE: ${cast.map((c) => c.name).join(", ") || "(no one listed)"}`;
    const user = `WORK BRIEF\nTone: ${brief.tone}\nDepiction rules:\n${rules}\nEra: ${era.label}. People: ${era.people} Dress: ${era.dress} Buildings and objects: ${era.buildingsAndObjects}\n\nSTORY SECTION: ${sectionPayload.title}\n${castContext}\nTEXT OF THE SECTION'S FIRST MOMENT (the look covers the whole section):\n${options.context.moment.text}`;
    const value = await askOnce(model, store, "look", sectionId, hasFormlessCast ? formlessLookOutputSchema : lookOutputSchema, hasFormlessCast ? FORMLESS_LOOK_SYSTEM : LOOK_SYSTEM, user);
    return { kind: "look" as const, sectionId, ...value };
  }, timing);

  // Include the section directly: a stage reassignment can leave the regenerated look's content hash unchanged.
  // The plan never depends on a style or translation.
  const planInputs: InputRef[] = [{ kind: "moment", recordId: options.momentId, version: moment.version }, { kind: "section", recordId: sectionId, version: section.version },
    { kind: "look", recordId: sectionId, version: look.version },
    { kind: "brief", recordId: options.workId, version: options.briefVersion }, ...cast.map((c) => ({ kind: "entry", recordId: c.entryId, version: c.version })),
    { kind: "prompt", recordId: "scene_plan_moment_cast", version: MOMENT_CAST_PROMPT_VERSION },
    { kind: "prompt", recordId: "scene_plan_review", version: PLAN_REVIEW_PROMPT_VERSION },
    ...(hasFormlessCast ? [{ kind: "prompt", recordId: "scene_plan_formless_presence", version: FORMLESS_PLAN_PROMPT_VERSION }] : [])];
  const plan = await ensureRecord(store, options.workId, "plan", options.momentId, planInputs, async () => {
    const lookPayload = look.payload as Record<string, string>;
    const formlessCanon = hasFormlessCast
      ? `\n\nNO-FORM CANON CONSTRAINTS (planning context; fixed descriptions are not scene-plan fields):\n${formlessConstraints}`
      : "";
    const neighbors = planningNeighbors(options.context);
    const user = `WORK BRIEF\nTone: ${brief.tone}\nDepiction rules:\n${rules}\nEra: ${era.label}. People: ${era.people} Dress: ${era.dress} Technology: ${era.technology}\nSTORY SECTION: ${sectionPayload.title}\n\nMOMENT (${options.context.moment.reference}): ${options.context.moment.text}\nPREVIOUS: ${neighbors.previous ?? "(section starts here)"}\nNEXT: ${neighbors.next ?? "(section ends here)"}\n\nCAST ON STAGE IN THIS SECTION (id: name):\n${cast.map((c) => `- ${c.entryId}: ${c.name}${hasFormlessCast ? ` (hasForm: ${c.hasForm})` : ""}`).join("\n") || "- (no one listed)"}${formlessCanon}\n\nSECTION LOOK (shared conditions; not evidence of moment presence): place: ${lookPayload.place}; time: ${lookPayload.timeOfDay}; weather: ${lookPayload.weather}; light: ${lookPayload.light}; clothing: ${lookPayload.clothing}`;
    const castIds = cast.map((c) => c.entryId);
    // Locations and objects may continue from a neighbor; an entry without a kind is treated as a character.
    const continuingIds = cast.filter((c) => c.entryKind === "location" || c.entryKind === "object").map((c) => c.entryId);
    const schema = planningResponseSchema(castIds, hasFormlessCast);
    const reviewCast = cast.map((c) => ({ entryId: c.entryId, name: c.name, hasForm: c.hasForm }));
    // Each plan is reviewed against its moment before storage. The first rejected plan, by evidence
    // checks or review, gets exactly one re-plan with the problems as feedback; a second rejection
    // stops preparation. A source gap (missingCast) or a review that cannot be read stops at once.
    let feedback = "", rejected: { evidence?: string; problems?: PlanReviewProblem[] } | null = null;
    for (let round = 1; round <= 2; round++) {
      let evidenceProblem: string | null = null;
      let value: z.infer<typeof schema>;
      try {
        value = await askOnce(model, store, "plan", options.momentId, schema, hasFormlessCast ? FORMLESS_PLAN_SYSTEM : PLAN_SYSTEM, user + feedback, (reply) => {
          if (reply.missingCast.length) return `required canon unavailable: ${reply.missingCast.join(", ")}`;
          evidenceProblem = sceneGroundingProblem(reply.grounding, reply.present, options.context, castIds, continuingIds);
          return evidenceProblem;
        });
      } catch (error) {
        if (round === 2 || !evidenceProblem) throw error;
        rejected = { evidence: evidenceProblem };
        feedback = replanFeedback([`evidence: ${evidenceProblem}`]);
        continue;
      }
      const { present, grounding, missingCast: _ignored, ...fields } = value;
      void _ignored;
      const review = await reviewPlan(model, (entry) => store.recordSpend({ kind: "plan", recordId: options.momentId, ...entry }), options.momentId,
        { rules, context: options.context, sectionTitle: sectionPayload.title, cast: reviewCast, present, fields: Object.fromEntries(PLAN_SCENE_FIELDS.map((f) => [f, fields[f]])) as Record<(typeof PLAN_SCENE_FIELDS)[number], string> });
      if ("unavailable" in review) throw new PreparationUnavailableError("plan", review.unavailable);
      if (review.problems.length) {
        if (round === 2) throw new PreparationUnavailableError("plan", `plan review: ${review.problems.map((p) => `${p.kind}${p.entryId ? ` ${p.entryId}` : ""}`).join(", ")}`);
        rejected = { problems: review.problems };
        feedback = replanFeedback(review.problems.map((p) => `${p.kind}: ${p.reason} (plan said: "${p.planQuote}")`));
        continue;
      }
      return { kind: "plan" as const, momentId: options.momentId, entries: present.map((id) => ({ entryId: id, stageId: cast.find((c) => c.entryId === id)!.stageId })), plan: fields, grounding,
        review: { rounds: round, ...(rejected ?? {}) } };
    }
    throw new PreparationUnavailableError("plan", "plan review exhausted");
  }, timing);

  const planPayload = plan.payload as unknown as { entries: Array<{ entryId: string; stageId: string }>; plan: z.infer<typeof planOutputSchema> };
  const lookPayload = look.payload as unknown as z.infer<typeof lookOutputSchema>;
  return {
    sectionId, era: era.id,
    look: { version: look.version, payload: { place: lookPayload.place, timeOfDay: lookPayload.timeOfDay, weather: lookPayload.weather, light: lookPayload.light, clothing: lookPayload.clothing } },
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
