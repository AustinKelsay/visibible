/**
 * Depiction profiles (ADR 0010): each work supplies its own wording to the engine's prompts and checks, so a work
 * without the Bible's subjects never receives the Bible's wording. Holmes runs through the real assembly with its
 * real work, brief and profile; the Bible's own requests are pinned byte for byte in bible-engine-golden.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import { DEPICTION_MODES, depictionModeOf, loadDepictionProfile, readDepictionProfile, storedDepiction } from "../engine/depiction";
import { createMemoryPreparationStore, type MemoryRecordInput } from "../engine/memory-store";
import { prepareMoment, PreparationUnavailableError } from "../engine/preparation";
import { buildRenderingPacket, engineRules, rankSheetCandidates, type SelectedCanon } from "../engine/prompt";
import { checkScene, sceneCheckFaults } from "../engine/scene-check";
import { readWorkInputs, type MomentRange } from "../engine/work-inputs";
import { createOpenRouterTextModel } from "../reading-pass/model";
import { createOpenRouterVisionChecker } from "../engine/reference-adapters";
import { SHARED_STYLES } from "../work-preparation";
import { bibleDepictionJson, testDepiction } from "../../../tests/fixtures/depiction";

/** Wording the Bible's evaluations put into the engine; none of it belongs in another work's requests. */
const BIBLE_WORDING = ["throne", "chariot", "crucifixion", "halo", "scroll", "tablet", "king ready for battle", "standing in the gap",
  "UNSEEN PRESENCE", "the presence", "hasForm: false", "hasForm false", "no-form", "presence without form", "shown through effects", "figure_in_light", "bright area", "embodied_formless", "radiance"];
const bibleWordingIn = (text: string) => BIBLE_WORDING.filter((term) => text.toLowerCase().includes(term.toLowerCase()));

function recordingFetch(answer: (body: { response_format: { json_schema: { name: string } }; messages: unknown[] }) => unknown, bodies: string[]) {
  return async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    bodies.push(body);
    const content = JSON.stringify(answer(JSON.parse(body)));
    return new Response(JSON.stringify({ id: "req", model: "scripted", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 } }), { status: 200 });
  };
}

describe("the repo's depiction profiles", () => {
  it("gives every work with a brief its own valid profile, and only the Bible has subjects without form", () => {
    const works = readdirSync(path.join(process.cwd(), "works")).filter((id) => existsSync(path.join(process.cwd(), "works", id, "brief.json")));
    expect(works.sort()).toEqual(["alice-in-wonderland", "bible-web", "holmes-adventures"]);
    for (const workId of works) expect(readDepictionProfile(workId).workId).toBe(workId);
    expect(readDepictionProfile("bible-web").modes.effects).toBeDefined();
    expect(readDepictionProfile("holmes-adventures").modes).toEqual({});
    expect(readDepictionProfile("alice-in-wonderland").modes).toEqual({});
  });

  it("rejects a profile for another work, unknown fields and multi-line wording", () => {
    expect(() => loadDepictionProfile(bibleDepictionJson, "holmes-adventures")).toThrow(/bible-web was given for holmes-adventures/);
    expect(() => loadDepictionProfile({ ...bibleDepictionJson, extra: "x" }, "bible-web")).toThrow();
    expect(() => loadDepictionProfile({ ...bibleDepictionJson, writingSurfaces: "scrolls\nand tablets" }, "bible-web")).toThrow(/single-line/);
    expect(() => loadDepictionProfile({ ...bibleDepictionJson, modes: { symbol: {} } }, "bible-web")).toThrow();
  });

  it("reads each entry's depiction from its stored form flag, absent meaning drawn", () => {
    expect(DEPICTION_MODES).toEqual(["form", "effects", "symbol"]);
    expect(depictionModeOf({})).toBe("form");
    expect(depictionModeOf({ hasForm: true })).toBe("form");
    expect(depictionModeOf({ hasForm: false })).toBe("effects");
    // A symbol keeps hasForm false, so a deployment from before symbols reads it as effects.
    expect(depictionModeOf({ hasForm: false, depiction: "symbol" })).toBe("symbol");
    expect(storedDepiction("effects")).toEqual({ hasForm: false });
    expect(storedDepiction("form")).toEqual({ hasForm: true });
    expect(storedDepiction("symbol")).toEqual({ hasForm: false, depiction: "symbol" });
  });

  it("versions what plans and looks read apart from rendering-only wording", () => {
    const base = testDepiction("bible-web");
    const renderOnly = loadDepictionProfile({ ...bibleDepictionJson, writingSurfaces: "scrolls or tablets", seriousSubjects: [] }, "bible-web");
    expect(renderOnly.version).not.toBe(base.version);
    expect([renderOnly.planVersion, renderOnly.lookVersion]).toEqual([base.planVersion, base.lookVersion]);
    const planner = loadDepictionProfile({ ...bibleDepictionJson, closedDocuments: "scrolls stay rolled" }, "bible-web");
    expect([planner.planVersion === base.planVersion, planner.lookVersion === base.lookVersion]).toEqual([false, true]);
    const effects = bibleDepictionJson.modes.effects as Record<string, unknown>;
    const look = loadDepictionProfile({ ...bibleDepictionJson, modes: { effects: { ...effects, lookSystem: "Cast marked hasForm: false are never drawn." } } }, "bible-web");
    expect([look.planVersion === base.planVersion, look.lookVersion === base.lookVersion]).toEqual([true, false]);
  });
});

describe("Holmes through the real assembly", () => {
  const STORY = "a-scandal-in-bohemia";
  const entry = (name: string, entryKind: SelectedCanon["kind"], text: string, hasForm = true) =>
    ({ kind: "entry" as const, name, entryKind, hasForm, stages: [{ id: "main", text }] });
  const records = (withRoad: boolean): MemoryRecordInput[] => [
    { kind: "entry", recordId: "sherlock_holmes", payload: entry("Sherlock Holmes", "character", "Sherlock Holmes: tall and lean, hawk-nosed, in a grey dressing-gown.") },
    { kind: "entry", recordId: "dr_watson", payload: entry("Dr. Watson", "character", "Dr. Watson: sturdy, moustached, in a brown tweed suit.") },
    { kind: "entry", recordId: "baker_street", payload: entry("221B Baker Street", "location", "221B Baker Street: a first-floor sitting-room with a bow window and a coal fire.") },
    // The Holmes reading pass marked this road as having no form; Holmes has no wording for such subjects.
    { kind: "entry", recordId: "southampton_road", payload: entry("Southampton Road", "location", "Southampton Road: a broad highway of packed earth and cobbles.", false) },
    { kind: "section", recordId: `${STORY}-1-1`, payload: { kind: "section", title: "Watson calls at Baker Street", firstUnit: `${STORY}-1-1`, lastUnit: `${STORY}-1-5`,
      era: "late-victorian-england-1880s-to-1890s", cast: [{ entryId: "sherlock_holmes", stageId: "main" }, { entryId: "dr_watson", stageId: "main" }, { entryId: "baker_street", stageId: "main" },
        ...(withRoad ? [{ entryId: "southampton_road", stageId: "main" }] : [])] } },
    { kind: "moment", recordId: `${STORY}-1-1`, payload: { kind: "moment", sectionId: `${STORY}-1-1`, firstUnit: `${STORY}-1-1`, lastUnit: `${STORY}-1-2` } },
    { kind: "moment", recordId: `${STORY}-1-3`, payload: { kind: "moment", sectionId: `${STORY}-1-1`, firstUnit: `${STORY}-1-3`, lastUnit: `${STORY}-1-5` } },
  ];
  const plan = { focusQuote: "he waved me to an armchair", instant: "Holmes waves Watson to an armchair by the fire.",
    selectedCast: [{ entryId: "sherlock_holmes", evidence: "he waved me" }, { entryId: "dr_watson", evidence: "waved me to an armchair" }, { entryId: "baker_street", evidence: "the well-remembered door" }],
    primarySubject: "Holmes standing by the fire", action: "waves Watson to an armchair", setting: "the Baker Street sitting-room at night",
    secondaryElements: "Watson in his coat by the armchair", mood: "warm reunion", timeOfDay: "night, by lamplight", composition: "medium shot across the room" };
  const look = { place: "The Baker Street sitting-room", timeOfDay: "Night", weather: "Wet March evening outside", light: "Lamplight and coal fire", clothing: "Holmes in a dressing-gown; Watson in a coat" };

  async function assemble(withRoad: boolean) {
    const inputs = await readWorkInputs("holmes-adventures");
    const bodies: string[] = [];
    const model = createOpenRouterTextModel({ apiKey: "test-key", fetch: recordingFetch((body) => {
      const schema = body.response_format.json_schema.name;
      return schema === "section_look" ? look : schema === "scene_plan" ? plan : { problems: [] };
    }, bodies) });
    const memory = createMemoryPreparationStore(records(withRoad));
    const moments: MomentRange[] = await memory.listMoments();
    const deps: AssembleDeps = { inputs, store: memory.store, model, listMoments: async () => moments,
      getReference: async () => null, loadReference: async () => { throw new Error("No reference is stored"); } };
    const result = await assembleRendering(deps, { workId: "holmes-adventures", unitId: `${STORY}-1-4`, styleId: "watercolor", variationNumber: 2, aspectRatio: "16:9" });
    return { inputs, bodies, result };
  }

  it("sends Holmes no Bible wording in its look, plan, review, rendering prompt or image check", async () => {
    const { inputs, bodies, result } = await assemble(false);
    if (!result.ok) throw new Error(result.message);
    const requests = bodies.map((body) => JSON.parse(body) as { messages: Array<{ content: string }>; response_format: { json_schema: { name: string; schema: unknown } } });
    expect(requests.map((r) => r.response_format.json_schema.name)).toEqual(["scene_plan"]);

    const checkBodies: string[] = [];
    const checker = createOpenRouterVisionChecker({ apiKey: "test-key", fetch: recordingFetch((body) => JSON.stringify(body.messages).includes("First describe")
      ? { edges: "painted", marks: "none", unpainted_edge: false, painted_frame: false, lettering: false, reasons: [] }
      : { unpainted_edge: false, painted_frame: false, lettering: false, reasons: [] }, checkBodies) });
    const checked = await checkScene(checker, { bytes: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg" },
      { people: ["Sherlock Holmes", "Dr. Watson"], description: `${plan.primarySubject}; ${plan.secondaryElements}`, depiction: inputs.depiction }, "holmes");
    expect(checked.faults).toEqual([]);

    for (const text of [result.prompt, ...bodies, ...checkBodies]) expect(bibleWordingIn(text)).toEqual([]);
    // Holmes's own wording takes the Bible's place.
    expect(result.prompt).toContain("no writing on letters, newspapers, books, signs or boards,");
    expect(result.prompt).toContain("serious depictions of battles, blood and death and non-sexual nudity may be, treated seriously.");
    expect(result.prompt).not.toMatch(/^8\) /m);
    expect(result.packet.depictionVersion).toBe(inputs.depiction.version);
    const [planRequest] = requests;
    expect(planRequest.messages[0].content).not.toContain("hasForm");
    expect(planRequest.messages[0].content).toContain("ask for no visible writing: letters, telegrams, newspapers and notebooks stay folded or closed, and signs and boards are blank.");
    expect(planRequest.messages[0].content).toContain("people, groups, places and objects.");
    expect(planRequest.messages[0].content).toContain("never make them a figure of their own words.");
    const questions = checkBodies.map((body) => JSON.parse(body).messages[0].content[0].text as string);
    for (const question of questions) {
      expect(question).toContain("for three visible faults");
      expect(question).toContain("inscriptions on objects such as letters or signs,");
    }
    expect(questions.some((q) => q.includes("First describe the edges and any marks, then answer."))).toBe(true);
  });

  it("refuses a Holmes subject marked without form before any model call, instead of using the Bible's wording", async () => {
    const { bodies, result } = await assemble(true);
    expect(result).toMatchObject({ ok: false, reason: "preparation", stage: "look" });
    if (result.ok) return;
    expect(result.message).toContain("holmes-adventures has no wording for subjects without form, so it cannot depict southampton_road");
    expect(bodies).toEqual([]);
  });

  it("refuses to render a selected subject without form when the work has no wording for it", () => {
    const depiction = readDepictionProfile("holmes-adventures");
    const brief = JSON.parse(readFileSync(path.join(process.cwd(), "works", "holmes-adventures", "brief.json"), "utf8"));
    const result = buildRenderingPacket({
      work: { id: "holmes-adventures", title: "The Adventures of Sherlock Holmes" },
      moment: { id: "m", sectionId: "s", reference: "R", text: "A road." }, brief, briefVersion: "bv", eraId: brief.eras[0].id,
      style: SHARED_STYLES.get("classical"), styleVersion: "sv", look: { version: "l", ...look }, situation: null,
      plan: { version: "p", primarySubject: "a road", action: "", setting: "", secondaryElements: "", mood: "", timeOfDay: "", composition: "" },
      canon: [{ entryId: "southampton_road", stageId: "main", kind: "location", name: "Southampton Road", text: "Southampton Road: a road.", hasForm: false, version: "v" }],
      aspectRatio: "16:9", depiction,
    });
    expect(result).toMatchObject({ ok: false, finalChars: 0 });
    if (!result.ok) expect(result.error).toContain("cannot depict southampton_road");
  });

  it("asks a work without subjects without form only about edges, frames and lettering", () => {
    const holmes = readDepictionProfile("holmes-adventures");
    expect(engineRules(holmes)).toHaveLength(7);
    expect(engineRules(testDepiction("bible-web"))).toHaveLength(8);
    // A figure answer never arrives, so it never counts.
    expect(sceneCheckFaults({ unpainted_edge: true, painted_frame: false, lettering: false, reasons: [] },
      { edges: "", marks: "", unpainted_edge: false, painted_frame: false, lettering: true, reasons: [] })).toEqual(["lettering", "edge"]);
  });
});

describe("profile wording and cached scene plans", () => {
  const WORK = "lake";
  const brief = { schemaVersion: 1 as const, workId: WORK, tone: "Quiet.", depictionRules: [], styleIds: ["classical"],
    eras: [{ id: "lake", label: "Lake", people: "Fisherfolk.", dress: "Wool.", buildingsAndObjects: "Boats.", technology: "Sail." }] };
  const records: MemoryRecordInput[] = [
    { kind: "entry", recordId: "jonah", payload: { kind: "entry", name: "Jonah", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Jonah: a fisherman." }] } },
    { kind: "section", recordId: "lake-1-1", payload: { kind: "section", title: "The lake", firstUnit: "lake-1-1", lastUnit: "lake-1-1", era: "lake", cast: [{ entryId: "jonah", stageId: "main" }] } },
    { kind: "moment", recordId: "lake-1-1", payload: { kind: "moment", sectionId: "lake-1-1", firstUnit: "lake-1-1", lastUnit: "lake-1-1" } },
  ];
  const model = () => {
    const calls: string[] = [];
    return { calls, model: createOpenRouterTextModel({ apiKey: "test-key", fetch: recordingFetch((body) => {
      const schema = body.response_format.json_schema.name;
      return schema === "section_look" ? { place: "shore", timeOfDay: "dawn", weather: "calm", light: "low sun", clothing: "wool" }
        : schema === "scene_plan" ? { focusQuote: "nets", instant: "Jonah mends nets.", selectedCast: [{ entryId: "jonah", evidence: "Jonah" }], primarySubject: "Jonah",
          action: "mends nets", setting: "shore", secondaryElements: "boats", mood: "quiet", timeOfDay: "dawn", composition: "wide" }
        : { problems: [] };
    }, calls) }) };
  };
  const context = { moment: { id: "lake-1-1", reference: "Lake 1:1", text: "Jonah mended his nets." }, previous: null, next: null };
  const withProfile = (overrides: Record<string, unknown>) => loadDepictionProfile({ ...bibleDepictionJson, workId: WORK, ...overrides }, WORK);

  it("remakes a plan when the planner's wording changes, and only then", async () => {
    const memory = createMemoryPreparationStore(records);
    const run = async (depiction: ReturnType<typeof withProfile>) => {
      const { calls, model: m } = model();
      await prepareMoment({ workId: WORK, momentId: "lake-1-1", store: memory.store, model: m, brief, briefVersion: "bv", depiction, context, holder: "h", now: () => 0, sleep: async () => {} });
      return calls.map((body) => JSON.parse(body).response_format.json_schema.name);
    };
    expect(await run(withProfile({}))).toEqual(["scene_plan"]);
    // Rendering-only wording leaves the cached look and plan in place.
    expect(await run(withProfile({ writingSurfaces: "nets or sails", seriousSubjects: [] }))).toEqual([]);
    // The planner's own wording remakes the plan but keeps the look, which never read it.
    expect(await run(withProfile({ closedDocuments: "letters stay folded" }))).toEqual(["scene_plan"]);
  });

  it("refuses another work's profile instead of planning or rendering with it", async () => {
    const memory = createMemoryPreparationStore(records);
    const { calls, model: m } = model();
    await expect(prepareMoment({ workId: WORK, momentId: "lake-1-1", store: memory.store, model: m, brief, briefVersion: "bv", depiction: testDepiction("bible-web"), context, holder: "h", now: () => 0, sleep: async () => {} }))
      .rejects.toThrow(PreparationUnavailableError);
    expect(calls).toEqual([]);
  });
});

describe("the symbol mode", () => {
  const bible = testDepiction("bible-web");
  const symbolWording = (bibleDepictionJson.modes as { symbol: { renderBlock: string; planSystem: string } }).symbol;
  const satan: SelectedCanon = { entryId: "satan", stageId: "main", kind: "character", name: "Satan", text: "Satan: no human face or body; a vast red serpentine dragon.", hasForm: true, depiction: "symbol", version: "s1" };
  const job: SelectedCanon = { entryId: "job", stageId: "main", kind: "character", name: "Job", text: "Job: a grey-bearded herdsman in wool.", hasForm: true, depiction: "form", version: "j1" };
  const look = { place: "a court of cloud", timeOfDay: "day", weather: "still", light: "bright", clothing: "robes" };
  const render = (workId: string, canon: SelectedCanon[], depiction = bible) => {
    const brief = JSON.parse(readFileSync(path.join(process.cwd(), "works", "bible-web", "brief.json"), "utf8"));
    return buildRenderingPacket({ work: { id: workId, title: "T" }, moment: { id: "m", sectionId: "s", reference: "R 1:1", text: "Satan came among them." },
      brief: { ...brief, workId }, briefVersion: "bv", eraId: brief.eras[0].id, style: SHARED_STYLES.get("classical"), styleVersion: "sv",
      look: { version: "l", ...look }, situation: null, canon, aspectRatio: "16:9", depiction,
      plan: { version: "p", primarySubject: "Satan coiled before the court", action: "Satan answers", setting: "a court of cloud", secondaryElements: "Job far below", mood: "dread", timeOfDay: "day", composition: "wide" } });
  };

  it("draws a symbol entry from its canon, never names it as a person, and gives it no sheet", () => {
    const result = render("bible-web", [job, satan]);
    if (!result.ok) throw new Error(result.error);
    expect(result.prompt).toContain(`${symbolWording.renderBlock} Satan.`);
    expect(result.prompt).toContain("SELECTED CHARACTERS: Job\n");
    expect(result.prompt).toContain(`- ${satan.text}`);
    // Not a subject without form: no unseen-presence line, no renaming, and the verse stays in the prompt.
    expect(result.prompt).not.toContain("UNSEEN PRESENCE");
    expect(result.prompt).toContain("Satan coiled before the court");
    expect(result.prompt).toContain('"Satan came among them."');
    expect(rankSheetCandidates([satan, job]).map((c) => c.entryId)).toEqual(["job"]);
  });

  it("refuses a symbol entry in a work without symbol wording", () => {
    const result = render("holmes-adventures", [satan], readDepictionProfile("holmes-adventures"));
    expect(result).toMatchObject({ ok: false, finalChars: 0 });
    if (!result.ok) expect(result.error).toContain("has no wording for subjects shown only as a symbol, so it cannot depict satan");
  });

  it("versions the planner's symbol wording apart from every other plan", () => {
    const changed = loadDepictionProfile({ ...bibleDepictionJson, modes: { ...bibleDepictionJson.modes, symbol: { ...symbolWording, planSystem: "- Draw symbols in their form." } } }, "bible-web");
    expect(changed.symbolVersion).not.toBe(bible.symbolVersion);
    expect([changed.planVersion, changed.lookVersion]).toEqual([bible.planVersion, bible.lookVersion]);
    const renderOnly = loadDepictionProfile({ ...bibleDepictionJson, modes: { ...bibleDepictionJson.modes, symbol: { ...symbolWording, renderBlock: "SYMBOL:" } } }, "bible-web");
    expect(renderOnly.symbolVersion).toBe(bible.symbolVersion);
  });

  it("tells the planner the symbol's form, records the wording it read, and selects its canon form", async () => {
    const WORK = "court";
    const brief = { schemaVersion: 1 as const, workId: WORK, tone: "Grave.", depictionRules: [], styleIds: ["classical"],
      eras: [{ id: "court", label: "Court", people: "Herders.", dress: "Wool.", buildingsAndObjects: "Tents.", technology: "Hand tools." }] };
    const records: MemoryRecordInput[] = [
      { kind: "entry", recordId: "job", payload: { kind: "entry", name: "Job", entryKind: "character", hasForm: true, stages: [{ id: "main", text: job.text }] } },
      { kind: "entry", recordId: "satan", payload: { kind: "entry", name: "Satan", entryKind: "character", hasForm: false, depiction: "symbol", stages: [{ id: "main", text: satan.text }] } },
      { kind: "section", recordId: "court-1-1", payload: { kind: "section", title: "The court", firstUnit: "court-1-1", lastUnit: "court-1-1", era: "court", cast: [{ entryId: "job", stageId: "main" }, { entryId: "satan", stageId: "main" }] } },
      { kind: "moment", recordId: "court-1-1", payload: { kind: "moment", sectionId: "court-1-1", firstUnit: "court-1-1", lastUnit: "court-1-1" } },
    ];
    const bodies: string[] = [];
    const model = createOpenRouterTextModel({ apiKey: "test-key", fetch: recordingFetch((body) => {
      const schema = body.response_format.json_schema.name;
      return schema === "section_look" ? look : schema === "scene_plan" ? { focusQuote: "Satan came", instant: "Satan coils before the court.",
        selectedCast: [{ entryId: "satan", evidence: "Satan came" }], primarySubject: "a red dragon coiled in the court", action: "it answers", setting: "court of cloud",
        secondaryElements: "none", mood: "dread", timeOfDay: "day", composition: "wide" } : { problems: [] };
    }, bodies) });
    const memory = createMemoryPreparationStore(records);
    const depiction = loadDepictionProfile({ ...bibleDepictionJson, workId: WORK }, WORK);
    const context = { moment: { id: "court-1-1", reference: "Court 1:1", text: "Satan came among them." }, previous: null, next: null };
    await prepareMoment({ workId: WORK, momentId: "court-1-1", store: memory.store, model, brief, briefVersion: "bv", depiction, context, holder: "h", now: () => 0, sleep: async () => {} });
    const [plan] = bodies.map((b) => JSON.parse(b) as { messages: Array<{ content: string }> });
    expect(plan.messages[0].content.endsWith(`\n${symbolWording.planSystem}`)).toBe(true);
    expect(plan.messages[1].content).toContain(`- satan: Satan (shown only as its canon form: ${satan.text})`);
    expect(bodies).toHaveLength(1);
    const stored = await memory.store.getActiveRecord("plan", "court-1-1");
    expect(stored?.inputs).toContainEqual({ kind: "prompt", recordId: "depiction_symbol", version: depiction.symbolVersion });
    // A work without symbol wording refuses before any model call.
    const refused: string[] = [];
    const holmesLike = loadDepictionProfile({ ...bibleDepictionJson, workId: WORK, modes: { effects: bibleDepictionJson.modes.effects } }, WORK);
    await expect(prepareMoment({ workId: WORK, momentId: "court-1-1", store: createMemoryPreparationStore(records).store,
      model: createOpenRouterTextModel({ apiKey: "test-key", fetch: recordingFetch(() => ({}), refused) }), brief, briefVersion: "bv", depiction: holmesLike, context, holder: "h", now: () => 0, sleep: async () => {} }))
      .rejects.toThrow(/no wording for subjects shown only as a symbol/);
    expect(refused).toEqual([]);
  });
});
