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
import type { WorkBrief } from "../work-preparation";

export const LOOK_SYSTEM = `You write a SECTION LOOK for an illustrated edition: one short shared visual description reused by every image of a story section, so that independently generated images of the section agree with each other. Return only JSON.
Rules: each value is one or two short phrases, at most 200 characters. Describe only what stays the same across the whole section: place, time of day, weather, light, and situational clothing or props. Leave out poses, actions and individual moments, and do not restate anyone's fixed appearance; canon does that. If the section spans a change (night into morning), say so once. Obey the work brief's depiction rules. Mention no text or written elements.`;
export const lookOutputSchema = z.object({ place: z.string(), timeOfDay: z.string(), weather: z.string(), light: z.string(), clothing: z.string() }).strict();

export const PLAN_SYSTEM = `You are the scene planner of an illustration engine. You get one moment of a work's text with its neighbours inside the same story section, the work brief's tone and depiction rules, the era, the section look, and the cast on stage in the section. Plan one single scene that depicts this moment. Return only JSON.
Rules: single scene, no collage. Choose which of the listed cast are present in this moment and name them in \`present\` by their ids; leave out cast who are elsewhere in the section. Keep every depiction rule. Do not describe anyone's fixed appearance (canon does that) and do not name an art style or rendering technique; describe pose, action, placement and situational detail. Each field is one or two short phrases, at most 220 characters. No text or written elements in the scene.`;
/** Bump for changes to this no-form planning contract or its cast format; only affected plans use it. */
export const FORMLESS_PLAN_PROMPT_VERSION = "2026-10-21-formless-presence-v1";
const FORMLESS_PLAN_SYSTEM = `${PLAN_SYSTEM}
Presence does not require a physical body. A cast entry marked hasForm: false still belongs in the moment when represented through the non-figurative presence allowed by the brief. If you describe that entry's presence or action in any scene field, include its id in \`present\` so its canon constraints reach the image model. Do not omit it because it has no body, and do not turn bodily source metaphors into a physical form. Select presence for this moment only; do not add cast who are absent or merely mentioned.`;
export const planOutputSchema = z.object({
  present: z.array(z.string()),
  primarySubject: z.string(), action: z.string(), setting: z.string(), secondaryElements: z.string(), mood: z.string(), timeOfDay: z.string(), composition: z.string(),
}).strict();

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

const CLAIM_TTL_MS = 60_000;
const WAIT_MS = 45_000;

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

async function askOnce<T>(model: TextModel, store: PreparationStore, kind: "look" | "plan", recordId: string, schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await model.complete({ label: `${kind}:${recordId}:${attempt}`, system, user, schemaName: kind === "look" ? "section_look" : "scene_plan", schema, maxTokens: 900, expectedCompletionTokens: 350 });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await store.recordSpend({ kind, recordId, model: model.id, outcome: `error: ${lastError.slice(0, 120)}`, costUsd: null, promptTokens: null, completionTokens: null, elapsedMs: 0 });
      continue;
    }
    const parsed = parseModelJson(schema, result.content);
    await store.recordSpend({ kind, recordId, model: result.model, outcome: "error" in parsed ? "invalid" : "ok", costUsd: result.usage.costUsd, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, elapsedMs: result.elapsedMs });
    if ("error" in parsed) { lastError = parsed.error; continue; }
    return parsed.value;
  }
  throw new PreparationUnavailableError(kind, lastError);
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
  const cast: Array<{ entryId: string; stageId: string; name: string; version: string; text: string; hasForm: boolean }> = [];
  for (const member of sectionPayload.cast) {
    const entry = await store.getActiveRecord("entry", member.entryId);
    if (!entry || entry.payload.kind !== "entry") continue;
    const stages = entry.payload.stages as Array<{ id: string; text: string }>;
    const stage = stages.find((s) => s.id === member.stageId) ?? stages[0];
    if (!stage) continue;
    cast.push({ entryId: member.entryId, stageId: stage.id, name: String(entry.payload.name), version: entry.version, text: stage.text, hasForm: entry.payload.hasForm !== false });
  }
  const rules = brief.depictionRules.map((r) => `- ${r.text}`).join("\n") || "- none";

  // The look depends on the section, the brief and the cast's identities.
  const lookInputs: InputRef[] = [{ kind: "section", recordId: sectionId, version: section.version }, { kind: "brief", recordId: options.workId, version: options.briefVersion },
    ...cast.map((c) => ({ kind: "entry", recordId: c.entryId, version: c.version }))];
  const look = await ensureRecord(store, options.workId, "look", sectionId, lookInputs, async () => {
    const user = `WORK BRIEF\nTone: ${brief.tone}\nDepiction rules:\n${rules}\nEra: ${era.label}. People: ${era.people} Dress: ${era.dress} Buildings and objects: ${era.buildingsAndObjects}\n\nSTORY SECTION: ${sectionPayload.title}\nON STAGE: ${cast.map((c) => c.name).join(", ") || "(no one listed)"}\nTEXT OF THE SECTION'S FIRST MOMENT (the look covers the whole section):\n${options.context.moment.text}`;
    const value = await askOnce(model, store, "look", sectionId, lookOutputSchema, LOOK_SYSTEM, user);
    return { kind: "look" as const, sectionId, ...value };
  }, timing);

  // Only affected sections change planning inputs; looks and all-formed plans remain reusable.
  const hasFormlessCast = cast.some((c) => !c.hasForm);
  // The plan depends on the moment, the look, the brief and the cast's canon; never on a style or translation.
  const planInputs: InputRef[] = [{ kind: "moment", recordId: options.momentId, version: moment.version }, { kind: "look", recordId: sectionId, version: look.version },
    { kind: "brief", recordId: options.workId, version: options.briefVersion }, ...cast.map((c) => ({ kind: "entry", recordId: c.entryId, version: c.version })),
    ...(hasFormlessCast ? [{ kind: "prompt", recordId: "scene_plan_formless_presence", version: FORMLESS_PLAN_PROMPT_VERSION }] : [])];
  const plan = await ensureRecord(store, options.workId, "plan", options.momentId, planInputs, async () => {
    const lookPayload = look.payload as Record<string, string>;
    const user = `WORK BRIEF\nTone: ${brief.tone}\nDepiction rules:\n${rules}\nEra: ${era.label}. People: ${era.people} Dress: ${era.dress} Technology: ${era.technology}\nSTORY SECTION: ${sectionPayload.title}\nSECTION LOOK: place: ${lookPayload.place}; time: ${lookPayload.timeOfDay}; weather: ${lookPayload.weather}; light: ${lookPayload.light}; clothing: ${lookPayload.clothing}\nCAST ON STAGE IN THIS SECTION (id: name):\n${cast.map((c) => `- ${c.entryId}: ${c.name}${hasFormlessCast ? ` (hasForm: ${c.hasForm})` : ""}`).join("\n") || "- (no one listed)"}\n\nMOMENT (${options.context.moment.reference}): ${options.context.moment.text}\nPREVIOUS: ${options.context.previous?.text.slice(0, 400) ?? "(section starts here)"}\nNEXT: ${options.context.next?.text.slice(0, 400) ?? "(section ends here)"}`;
    const value = await askOnce(model, store, "plan", options.momentId, planOutputSchema, hasFormlessCast ? FORMLESS_PLAN_SYSTEM : PLAN_SYSTEM, user);
    const known = new Set(cast.map((c) => c.entryId));
    const present = value.present.filter((id) => known.has(id));
    const { present: _ignored, ...fields } = value;
    void _ignored;
    return { kind: "plan" as const, momentId: options.momentId, entries: present.map((id) => ({ entryId: id, stageId: cast.find((c) => c.entryId === id)!.stageId })), plan: fields };
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
