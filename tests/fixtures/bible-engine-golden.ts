/**
 * The exact model requests the engine makes for the Bible, captured as a byte-for-byte baseline: the
 * rendering prompt and packet, the look, plan and plan-review requests (system, user and provider JSON
 * schema), and both scene-check questions with their schemas. `bible-engine-golden.json` was written by
 * this module from the engine as it stood before the Bible's wording moved into its depiction profile;
 * the test proves the profile-driven engine still sends the Bible the same bytes, so no image changes.
 *
 * Only the calls into the engine may change with its API; the scenarios and the golden file must not.
 */
import { readFileSync } from "node:fs";
import { buildRenderingPacket, type AvailableReference, type RenderingInput, type SelectedCanon } from "../../src/lib/engine/prompt";
import { prepareMoment, type MomentContext } from "../../src/lib/engine/preparation";
import { createMemoryPreparationStore, type MemoryRecordInput } from "../../src/lib/engine/memory-store";
import { createOpenRouterTextModel } from "../../src/lib/reading-pass/model";
import { createOpenRouterVisionChecker } from "../../src/lib/engine/reference-adapters";
import { checkScene, type SceneCheckContext } from "../../src/lib/engine/scene-check";
import { SHARED_STYLES, validateWorkBrief } from "../../src/lib/work-preparation";

const brief = validateWorkBrief(JSON.parse(readFileSync(new URL("../../works/bible-web/brief.json", import.meta.url), "utf8")));
const EXODUS = "exodus-wilderness-and-conquest-of-canaan";
const MONARCHY = "monarchy-of-israel-and-judah";

const god = { kind: "entry" as const, name: "God / Yahweh, the Father and God of Israel", entryKind: "character" as const, hasForm: false,
  stages: [{ id: "main", text: "God the Father: no human face or body; presence shown only as radiance, cloud and fire." }] };
const moses = { kind: "entry" as const, name: "Moses", entryKind: "character" as const, hasForm: true,
  stages: [{ id: "elder", text: "Moses: a tall, lean man of eighty with a long white beard, in a coarse brown wool cloak and a shepherd's staff." }] };
const aaron = { kind: "entry" as const, name: "Aaron", entryKind: "character" as const, hasForm: true,
  stages: [{ id: "priest", text: "Aaron: a broad-shouldered man of eighty-three with a grey beard, in white linen priestly garments." }] };
const sinai = { kind: "entry" as const, name: "Mount Sinai", entryKind: "location" as const, hasForm: true,
  stages: [{ id: "main", text: "Mount Sinai: a steep granite mountain of red-brown rock above a gravel plain." }] };
const david = { kind: "entry" as const, name: "David", entryKind: "character" as const, hasForm: true,
  stages: [{ id: "king", text: "David: a ruddy man of forty with a short dark beard, in a dyed wool robe and a plain gold circlet." }] };

const records: MemoryRecordInput[] = [
  { kind: "entry", recordId: "god", payload: god },
  { kind: "entry", recordId: "moses", payload: moses },
  { kind: "entry", recordId: "aaron", payload: aaron },
  { kind: "entry", recordId: "mount_sinai", payload: sinai },
  { kind: "entry", recordId: "david", payload: david },
  { kind: "section", recordId: "exodus-19-16", payload: { kind: "section", title: "The LORD descends on Sinai", firstUnit: "exodus-19-16", lastUnit: "exodus-19-20", era: EXODUS,
    cast: [{ entryId: "moses", stageId: "elder" }, { entryId: "god", stageId: "main" }, { entryId: "mount_sinai", stageId: "main" }] } },
  { kind: "section", recordId: "exodus-32-1", payload: { kind: "section", title: "The golden calf", firstUnit: "exodus-32-1", lastUnit: "exodus-32-6", era: EXODUS,
    cast: [{ entryId: "aaron", stageId: "priest" }, { entryId: "moses", stageId: "elder" }] } },
  { kind: "section", recordId: "2-samuel-6-12", payload: { kind: "section", title: "David brings up the ark", firstUnit: "2-samuel-6-12", lastUnit: "2-samuel-6-15", era: MONARCHY,
    cast: [{ entryId: "david", stageId: "king" }] } },
  { kind: "moment", recordId: "exodus-19-18", payload: { kind: "moment", sectionId: "exodus-19-16", firstUnit: "exodus-19-18", lastUnit: "exodus-19-18" } },
  { kind: "moment", recordId: "exodus-32-4", payload: { kind: "moment", sectionId: "exodus-32-1", firstUnit: "exodus-32-4", lastUnit: "exodus-32-4" } },
  { kind: "moment", recordId: "2-samuel-6-14", payload: { kind: "moment", sectionId: "2-samuel-6-12", firstUnit: "2-samuel-6-14", lastUnit: "2-samuel-6-14" } },
  // An owner look is a literal constraint: the planner copies it and rendering uses it verbatim.
  { kind: "look", recordId: "2-samuel-6-12", source: "owner", payload: { kind: "look", sectionId: "2-samuel-6-12", place: "The road into Jerusalem", timeOfDay: "Midday",
    weather: "Dry and bright", light: "High sun", clothing: "David in a linen ephod; the crowd in festival wool" } },
];

const contexts: Record<string, MomentContext> = {
  "exodus-19-18": { moment: { id: "exodus-19-18", reference: "Exodus 19:18", text: "Mount Sinai, the whole of it, smoked, because Yahweh descended on it in fire; and its smoke ascended like the smoke of a furnace, and the whole mountain quaked greatly." },
    previous: { text: "Moses led the people out of the camp to meet God; and they stood at the lower part of the mountain." }, next: { text: "When the sound of the trumpet grew louder and louder, Moses spoke, and God answered him by a voice." } },
  "exodus-32-4": { moment: { id: "exodus-32-4", reference: "Exodus 32:4", text: "He received what they handed him, fashioned it with an engraving tool, and made it a molded calf." },
    previous: { text: "All the people took off the golden rings which were in their ears, and brought them to Aaron." }, next: null },
  "2-samuel-6-14": { moment: { id: "2-samuel-6-14", reference: "2 Samuel 6:14", text: "David danced before Yahweh with all his might; and David was clothed in a linen ephod." },
    previous: null, next: { text: "So David and all the house of Israel brought up Yahweh's ark with shouting and with the sound of the trumpet." } },
};

const lookReply = { place: "The gravel plain below a smoking mountain", timeOfDay: "Morning", weather: "Thick cloud and smoke over the summit", light: "Fire glowing through smoke", clothing: "Wool cloaks and head coverings" };
const planReplies: Record<string, unknown> = {
  "exodus-19-18": { focusQuote: "the whole mountain quaked greatly", instant: "The people stand at the foot of Sinai as smoke and fire pour from its summit.",
    selectedCast: [{ entryId: "moses", evidence: "Moses led the people" }, { entryId: "mount_sinai", evidence: "Mount Sinai, the whole of it, smoked" }, { entryId: "god", evidence: "descended on it in fire" }],
    primarySubject: "Mount Sinai wrapped in billowing smoke and fire", action: "the mountain quakes as smoke rises like a furnace", setting: "the gravel plain at the foot of Sinai",
    secondaryElements: "Moses at the front of the trembling crowd", mood: "awe and dread", timeOfDay: "morning under dark smoke", composition: "wide view from the plain up to the summit" },
  "exodus-32-4": { focusQuote: "made it a molded calf", instant: "Aaron lifts the finished golden calf from its mould.",
    selectedCast: [{ entryId: "aaron", evidence: "He received what they handed him" }],
    primarySubject: "Aaron holding up a golden calf", action: "lifts the newly cast calf", setting: "a camp workshop of tents and a clay furnace",
    secondaryElements: "people with bare ears watching", mood: "uneasy excitement", timeOfDay: "afternoon", composition: "medium shot at the furnace" },
  "2-samuel-6-14": { focusQuote: "David danced before Yahweh with all his might", instant: "David dances with arms raised before the ark.",
    selectedCast: [{ entryId: "david", evidence: "David danced" }],
    primarySubject: "David dancing with arms raised", action: "whirls in a linen ephod", setting: "the road into Jerusalem",
    secondaryElements: "priests carrying the ark behind him", mood: "exultant", timeOfDay: "midday", composition: "low wide angle with the ark behind" },
};
// The Sinai plan's first review asks for one re-plan, so the feedback round is captured too.
const firstSinaiReview = { problems: [{ kind: "outside_instant", entryId: "moses", planQuote: "Moses at the front of the trembling crowd", reason: "Moses is not at the mountain at this instant." }] };

function recordingFetch(answer: (body: { response_format: { json_schema: { name: string } }; messages: unknown[] }, count: number) => unknown, bodies: string[]) {
  let count = 0;
  return async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    bodies.push(body);
    const content = JSON.stringify(answer(JSON.parse(body), count++));
    return new Response(JSON.stringify({ id: `req-${count}`, model: "scripted", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 } }), { status: 200 });
  };
}

async function capturePreparation(momentId: string): Promise<string[]> {
  const bodies: string[] = [];
  let sinaiReviews = 0;
  const fetch = recordingFetch((body) => {
    const schema = body.response_format.json_schema.name;
    if (schema === "section_look") return lookReply;
    if (schema === "scene_plan") return planReplies[momentId];
    if (momentId === "exodus-19-18" && sinaiReviews++ === 0) return firstSinaiReview;
    return { problems: [] };
  }, bodies);
  const model = createOpenRouterTextModel({ apiKey: "test-key", fetch });
  const { store } = createMemoryPreparationStore(records);
  await prepareMoment({ workId: "bible-web", momentId, store, model, brief, briefVersion: "golden-brief", context: contexts[momentId],
    holder: "golden", now: () => 0, sleep: async () => {} });
  return bodies;
}

const canonOf = (recordId: string, payload: { name: string; entryKind: SelectedCanon["kind"]; hasForm: boolean; stages: Array<{ id: string; text: string }> }): SelectedCanon =>
  ({ entryId: recordId, stageId: payload.stages[0].id, kind: payload.entryKind, name: payload.name, text: payload.stages[0].text, hasForm: payload.hasForm, version: `${recordId}-v1` });
const references: AvailableReference[] = [
  { kind: "styleReference", styleId: "classical", storageId: "st-classical", version: "sr1" },
  { kind: "styleReference", styleId: "fresco", storageId: "st-fresco", version: "sr2" },
  { kind: "sheet", entryId: "moses", stageId: "elder", storageId: "sh-moses", version: "s1" },
  { kind: "sheet", entryId: "mount_sinai", stageId: "main", storageId: "sh-sinai", version: "s2" },
  { kind: "sheet", entryId: "aaron", stageId: "priest", storageId: "sh-aaron", version: "s3" },
];
const plan = (momentId: string) => {
  const reply = planReplies[momentId] as Record<string, string>;
  return { version: `${momentId}-plan`, primarySubject: reply.primarySubject, action: reply.action, setting: reply.setting, secondaryElements: reply.secondaryElements, mood: reply.mood, timeOfDay: reply.timeOfDay, composition: reply.composition };
};
const look = { version: "look-v1", ...lookReply };
const renderingBase = (momentId: string, sectionId: string, eraId: string, styleId: string, canon: SelectedCanon[], extra: Partial<RenderingInput> = {}): RenderingInput => ({
  work: { id: "bible-web", title: "The Holy Bible (World English Bible)" },
  moment: { id: momentId, sectionId, reference: contexts[momentId].moment.reference, text: contexts[momentId].moment.text },
  neighbors: { previous: contexts[momentId].previous?.text ?? null, next: contexts[momentId].next?.text ?? null },
  brief, briefVersion: "golden-brief", eraId, style: SHARED_STYLES.get(styleId), styleVersion: `${styleId}-v1`, look, situation: null,
  plan: plan(momentId), canon, references, variationNumber: 2, aspectRatio: "16:9", ...extra,
});

function captureRendering(): Record<string, string> {
  const out: Record<string, string> = {};
  const scenarios: Record<string, RenderingInput> = {
    // A no-form subject selected: the source text, neighbours and its name are kept out.
    "presence-classical": renderingBase("exodus-19-18", "exodus-19-16", EXODUS, "classical", [canonOf("moses", moses), canonOf("mount_sinai", sinai), canonOf("god", god)]),
    "formed-watercolor": renderingBase("exodus-32-4", "exodus-32-1", EXODUS, "watercolor", [canonOf("aaron", aaron), canonOf("moses", moses)], { variationNumber: 1 }),
    "owner-look-icon": renderingBase("2-samuel-6-14", "2-samuel-6-12", MONARCHY, "icon", [canonOf("david", david)], {
      situation: { place: "The road into Jerusalem", timeOfDay: "Midday", weather: "Dry and bright", light: "High sun", clothing: "David in a linen ephod; the crowd in festival wool" }, variationNumber: 3 }),
    "place-only-fresco": renderingBase("exodus-19-18", "exodus-19-16", EXODUS, "fresco", [canonOf("mount_sinai", sinai)], { aspectRatio: "21:9" }),
    // Near the cap the variation note and neighbour hints go first; far over it nothing is sent.
    "budget-trims": renderingBase("exodus-32-4", "exodus-32-1", EXODUS, "classical", [{ ...canonOf("aaron", aaron), text: `Aaron: ${"a grey-bearded priest in white linen. ".repeat(185)}` }]),
    "over-budget-rejected": renderingBase("exodus-32-4", "exodus-32-1", EXODUS, "classical", [{ ...canonOf("aaron", aaron), text: `Aaron: ${"a grey-bearded priest in white linen. ".repeat(260)}` }]),
    "omit-style-reference": renderingBase("exodus-32-4", "exodus-32-1", EXODUS, "classical", [canonOf("aaron", aaron)], { omitStyleReference: true, aspectRatio: "3:2" }),
  };
  for (const [name, input] of Object.entries(scenarios)) {
    const result = buildRenderingPacket(input);
    if (!result.ok) { out[`render:${name}`] = `REJECTED ${result.finalChars}: ${result.error}`; continue; }
    // The profile version is new packet data; the baseline compares everything the engine sent before it.
    const packet: Record<string, unknown> = { ...result.packet };
    delete packet.depictionVersion;
    out[`render:${name}:prompt`] = result.prompt;
    out[`render:${name}:packet`] = JSON.stringify(packet);
  }
  return out;
}

async function captureSceneCheck(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const contextsByName: Record<string, SceneCheckContext> = {
    "people": { people: ["Moses"], description: "Mount Sinai wrapped in billowing smoke and fire; Moses at the front of the trembling crowd" },
    "no-people-soft-edges": { people: [], description: "the gravel plain at the foot of Sinai; none", softEdges: true },
  };
  for (const [name, context] of Object.entries(contextsByName)) {
    const bodies: string[] = [];
    const faults = { figure_in_light: false, unpainted_edge: false, painted_frame: false, lettering: false };
    // The describe-first question adds what it saw; its schema rejects those fields on the direct question.
    const fetch = recordingFetch((body) => JSON.stringify(body.messages).includes("First describe")
      ? { edges: "painted", bright_areas: "none", marks: "none", ...faults, reasons: [] } : { ...faults, reasons: [] }, bodies);
    const checker = createOpenRouterVisionChecker({ apiKey: "test-key", fetch, reasoningEffort: "low", maxTokens: 1500 });
    await checkScene(checker, { bytes: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg" }, context, `golden:${name}`);
    bodies.sort().forEach((body, index) => { out[`check:${name}:${index}`] = body; });
  }
  return out;
}

/** Every captured request, keyed by scenario. */
export async function captureBibleEngineRequests(): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...captureRendering() };
  for (const momentId of Object.keys(contexts)) {
    (await capturePreparation(momentId)).forEach((body, index) => { out[`prepare:${momentId}:${index}`] = body; });
  }
  return { ...out, ...(await captureSceneCheck()) };
}
