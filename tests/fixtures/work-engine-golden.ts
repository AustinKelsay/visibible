/**
 * The exact model requests the engine makes for a work other than the Bible, captured per work (ADR 0011's free tier):
 * the scene-plan request with its provider schema, the rendering prompt and packet in each style
 * the work offers, and both scene-check questions. A change to the engine's shared wording shows up as a diff in every
 * work it reaches, so a prompt change names the works whose images it can change. The Bible keeps its own frozen
 * baseline in bible-engine-golden.ts.
 *
 * Regenerate deliberately with `WRITE_ENGINE_GOLDEN=1 npx vitest run src/lib/__tests__/work-engine-golden.test.ts`
 * and review the diff as a prompt change.
 */
import { readFileSync } from "node:fs";
import { buildRenderingPacket, type SelectedCanon } from "../../src/lib/engine/prompt";
import { prepareMoment, type MomentContext } from "../../src/lib/engine/preparation";
import { createMemoryPreparationStore, type MemoryRecordInput } from "../../src/lib/engine/memory-store";
import { createOpenRouterTextModel } from "../../src/lib/reading-pass/model";
import { createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { checkScene } from "../../src/lib/engine/scene-check";
import { SHARED_STYLES, validateWorkBrief } from "../../src/lib/work-preparation";
import { loadDepictionProfile } from "../../src/lib/engine/depiction";

type Scenario = {
  momentId: string; sectionId: string; title: string; reference: string; context: MomentContext;
  cast: Array<{ entryId: string; name: string; kind: SelectedCanon["kind"]; text: string }>;
  look: Record<string, string>; plan: Record<string, unknown>;
};

const SCENARIOS: Record<string, Scenario> = {
  "holmes-adventures": {
    momentId: "a-scandal-in-bohemia-1-1", sectionId: "a-scandal-in-bohemia-1-1", title: "Holmes's deductions on Watson's marriage", reference: "A Scandal in Bohemia, Part I ¶1",
    context: { moment: { id: "a-scandal-in-bohemia-1-1", reference: "A Scandal in Bohemia, Part I ¶1", text: "One night I was returning from a journey to a patient, when my way led me through Baker Street. As I passed the well-remembered door, I was seized with a keen desire to see Holmes again." },
      previous: null, next: { text: "His rooms were brilliantly lit, and, even as I looked up, I saw his tall, spare figure pass twice in a dark silhouette against the blind." } },
    cast: [
      { entryId: "sherlock_holmes", name: "Sherlock Holmes", kind: "character", text: "Sherlock Holmes: tall and lean, hawk-nosed, in a grey dressing-gown." },
      { entryId: "dr_watson", name: "Dr. Watson", kind: "character", text: "Dr. Watson: sturdy, moustached, in a brown tweed suit." },
      { entryId: "baker_street", name: "221B Baker Street", kind: "location", text: "221B Baker Street: a first-floor sitting-room with a bow window and a coal fire." },
    ],
    look: { place: "Baker Street at night", timeOfDay: "Night", weather: "Wet March evening", light: "Gaslight through the blinds", clothing: "Watson in a coat and hat" },
    plan: { focusQuote: "As I passed the well-remembered door", instant: "Watson pauses on the wet pavement below the lit windows of 221B.",
      selectedCast: [{ entryId: "dr_watson", evidence: "I passed the well-remembered door" }, { entryId: "baker_street", evidence: "through Baker Street" }],
      primarySubject: "Watson pausing on the pavement", action: "looks up at the lit window", setting: "Baker Street at night in the rain",
      secondaryElements: "a tall silhouette on the blind above", mood: "nostalgic", timeOfDay: "night, by gaslight", composition: "low view up to the bow window" },
  },
  "alice-in-wonderland": {
    momentId: "pig-and-pepper-50", sectionId: "pig-and-pepper-50", title: "Talk with the Cheshire Cat", reference: "Pig and Pepper ¶50",
    context: { moment: { id: "pig-and-pepper-50", reference: "Pig and Pepper ¶50", text: "The Cat only grinned when it saw Alice. It looked good-natured, she thought: still it had very long claws and a great many teeth, so she felt that it ought to be treated with respect." },
      previous: null, next: { text: "“Cheshire Puss,” she began, rather timidly, as she did not at all know whether it would like the name." } },
    cast: [
      { entryId: "alice", name: "Alice", kind: "character", text: "Alice: a girl of about seven with long light-brown hair, in a blue dress and white pinafore." },
      { entryId: "cheshire_cat", name: "Cheshire Cat", kind: "character", text: "Cheshire Cat: a large striped cat with a very wide grin, long claws and many teeth." },
      { entryId: "the_duchess_s_wood", name: "the Duchess's wood", kind: "location", text: "the Duchess's wood: tall old trees with low boughs and dappled light." },
    ],
    look: { place: "A wood of old trees", timeOfDay: "Afternoon", weather: "Still and dry", light: "Dappled sunlight", clothing: "Alice in her pinafore" },
    plan: { focusQuote: "The Cat only grinned when it saw Alice", instant: "The Cheshire Cat grins down at Alice from a low bough.",
      selectedCast: [{ entryId: "alice", evidence: "when it saw Alice" }, { entryId: "cheshire_cat", evidence: "The Cat only grinned" }, { entryId: "the_duchess_s_wood", evidence: "a bough of a tree" }],
      primarySubject: "the Cheshire Cat grinning on a bough", action: "grins down at Alice", setting: "a wood of old trees",
      secondaryElements: "Alice looking up respectfully", mood: "curious", timeOfDay: "afternoon", composition: "Alice small below, the Cat above" },
  },
};

function recordingFetch(answer: (schema: string) => unknown, bodies: string[]) {
  let count = 0;
  return async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    bodies.push(body);
    const parsed = JSON.parse(body);
    const content = JSON.stringify(answer(parsed.response_format.json_schema.name));
    return new Response(JSON.stringify({ id: `req-${++count}`, model: "scripted", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 } }), { status: 200 });
  };
}

/** Every captured request for the work's scenario, keyed by step. */
export async function captureWorkEngineRequests(workId: string): Promise<Record<string, string>> {
  const scenario = SCENARIOS[workId];
  if (!scenario) throw new Error(`No golden scenario for ${workId}`);
  const brief = validateWorkBrief(JSON.parse(readFileSync(new URL(`../../works/${workId}/brief.json`, import.meta.url), "utf8")));
  const profile = loadDepictionProfile(JSON.parse(readFileSync(new URL(`../../works/${workId}/depiction.json`, import.meta.url), "utf8")), workId);
  const era = brief.eras[0].id;
  const records: MemoryRecordInput[] = [
    ...scenario.cast.map((c): MemoryRecordInput => ({ kind: "entry", recordId: c.entryId, payload: { kind: "entry", name: c.name, entryKind: c.kind, hasForm: true, stages: [{ id: "main", text: c.text }] } })),
    { kind: "section", recordId: scenario.sectionId, payload: { kind: "section", title: scenario.title, firstUnit: scenario.momentId, lastUnit: scenario.momentId, era,
      cast: scenario.cast.map((c) => ({ entryId: c.entryId, stageId: "main" })) } },
    { kind: "moment", recordId: scenario.momentId, payload: { kind: "moment", sectionId: scenario.sectionId, firstUnit: scenario.momentId, lastUnit: scenario.momentId } },
  ];
  const out: Record<string, string> = {};

  const bodies: string[] = [];
  const model = createOpenRouterTextModel({ apiKey: "test-key", fetch: recordingFetch(() => scenario.plan, bodies) });
  const { store } = createMemoryPreparationStore(records);
  await prepareMoment({ workId, momentId: scenario.momentId, store, model, brief, briefVersion: "golden-brief", context: scenario.context, depiction: profile,
    holder: "golden", now: () => 0, sleep: async () => {} });
  bodies.forEach((body, index) => { out[`prepare:${index}`] = body; });

  const selected = scenario.cast.filter((c) => (scenario.plan.selectedCast as Array<{ entryId: string }>).some((s) => s.entryId === c.entryId));
  const canon: SelectedCanon[] = selected.map((c) => ({ entryId: c.entryId, stageId: "main", kind: c.kind, name: c.name, text: c.text, hasForm: true, version: `${c.entryId}-v1` }));
  const plan = scenario.plan as Record<string, string>;
  for (const styleId of brief.styleIds) {
    const result = buildRenderingPacket({
      work: { id: workId, title: workId }, moment: { id: scenario.momentId, sectionId: scenario.sectionId, reference: scenario.reference, text: scenario.context.moment.text },
      neighbors: { previous: scenario.context.previous?.text ?? null, next: scenario.context.next?.text ?? null },
      brief, briefVersion: "golden-brief", eraId: era, style: SHARED_STYLES.get(styleId), styleVersion: `${styleId}-v1`, look: { version: "look-v1", ...scenario.look } as never, situation: null,
      plan: { version: "plan-v1", primarySubject: plan.primarySubject, action: plan.action, setting: plan.setting, secondaryElements: plan.secondaryElements, mood: plan.mood, timeOfDay: plan.timeOfDay, composition: plan.composition },
      canon, references: [], variationNumber: 2, aspectRatio: "16:9", depiction: profile,
    });
    if (!result.ok) { out[`render:${styleId}`] = `REJECTED ${result.finalChars}: ${result.error}`; continue; }
    out[`render:${styleId}:prompt`] = result.prompt;
    out[`render:${styleId}:packet`] = JSON.stringify(result.packet);
  }

  const checkBodies: string[] = [];
  const checker = createOpenRouterVisionChecker({ apiKey: "test-key", fetch: recordingFetch(() => ({}), checkBodies), reasoningEffort: "low", maxTokens: 1500 });
  await checkScene(checker, { bytes: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg" },
    { people: canon.filter((c) => c.kind === "character").map((c) => c.name), description: `${plan.primarySubject}; ${plan.secondaryElements}`, depiction: profile }, `golden:${workId}`).catch(() => null);
  checkBodies.sort().forEach((body, index) => { out[`check:${index}`] = body; });
  return out;
}

export const GOLDEN_WORKS = Object.keys(SCENARIOS);
