/**
 * Work depiction profiles (ADR 0010): every work has its own wording, a work without wording for a mode cannot depict
 * an entry in it, and nothing of the Bible's wording reaches another work's image prompt (ADR 0012).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEPICTION_MODES, depictionModeOf, loadDepictionProfile, readDepictionProfile, storedDepiction } from "../engine/depiction";
import { buildLeanRendering, type LeanCastMember, type LeanInput } from "../engine/lean";
import { readWorkInputs } from "../engine/work-inputs";
import { SHARED_STYLES } from "../work-preparation";
import { bibleDepictionJson, testDepiction } from "../../../tests/fixtures/depiction";

/** Wording the Bible's evaluations put into the engine; none of it belongs in another work's requests. */
const BIBLE_WORDING = ["throne", "chariot", "crucifixion", "halo", "scroll", "tablet", "king ready for battle", "standing in the gap",
  "UNSEEN PRESENCE", "IMAGERY, NOT FORM", "the presence", "hasForm", "no-form", "presence without form", "shown through effects", "radiance"];
const bibleWordingIn = (text: string) => BIBLE_WORDING.filter((term) => text.toLowerCase().includes(term.toLowerCase()));

const member = (entryId: string, name: string, kind: LeanCastMember["kind"], text: string, depiction: LeanCastMember["depiction"] = "form"): LeanCastMember =>
  ({ entryId, stageId: "main", kind, name, aliases: [], text, depiction, version: `v-${entryId}` });

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
    // The planner's and the image check's wording went with them.
    expect(() => loadDepictionProfile({ ...bibleDepictionJson, closedDocuments: "letters stay closed" }, "bible-web")).toThrow();
    expect(() => loadDepictionProfile({ ...bibleDepictionJson, writingSurfaces: "scrolls\nand tablets" }, "bible-web")).toThrow(/single-line/);
    expect(() => loadDepictionProfile({ ...bibleDepictionJson, modes: { symbol: {} } }, "bible-web")).toThrow();
  });

  it("words the rules for a prompt built from the text, with no scene plan", () => {
    const effects = readDepictionProfile("bible-web").modes.effects!;
    expect(`${effects.renderRule} ${effects.renderBlock}`).not.toMatch(/scene plan|selected/i);
    expect(effects.renderRule).toContain("the moment names");
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
});

describe("another work's prompt", () => {
  const holmes = member("sherlock_holmes", "Sherlock Holmes", "character", "Sherlock Holmes: tall and lean, hawk-nosed, in a grey dressing-gown.");
  const watson = member("dr_watson", "Dr. Watson", "character", "Dr. Watson: sturdy, moustached, in a brown tweed suit.");
  const bakerStreet = member("baker_street", "221B Baker Street", "location", "221B Baker Street: a first-floor sitting-room with a bow window and a coal fire.");
  const holmesInput = async (cast: LeanCastMember[]): Promise<LeanInput> => {
    const inputs = await readWorkInputs("holmes-adventures");
    return {
      work: { id: "holmes-adventures", title: inputs.work.work.title },
      moment: { id: "m", sectionId: "s", reference: "A Scandal in Bohemia ¶4", text: "He waved me to an armchair, threw across his case of cigars, and indicated a spirit case." },
      neighbors: { previous: "He was pleased to see me.", next: null }, brief: inputs.brief, eraId: inputs.brief.eras[0].id, style: SHARED_STYLES.get("watercolor")!,
      cast, references: [], depiction: inputs.depiction, aspectRatio: "16:9",
    };
  };

  it("sends Holmes no Bible wording", async () => {
    const result = buildLeanRendering(await holmesInput([holmes, watson, bakerStreet]));
    if (!result.ok) throw new Error(result.error);
    expect(bibleWordingIn(result.prompt)).toEqual([]);
    expect(result.prompt).toContain(holmes.text);
  });

  it("refuses a Holmes subject marked without form, instead of using the Bible's wording", async () => {
    // The Holmes reading pass once marked a road as having no form; Holmes has no wording for such subjects.
    const road = member("southampton_road", "Southampton Road", "location", "Southampton Road: a broad highway.", "effects");
    const result = buildLeanRendering(await holmesInput([holmes, road]));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("has no wording for subjects without form, so it cannot depict southampton_road") });
  });
});

describe("the symbol mode", () => {
  const symbolWording = (bibleDepictionJson.modes as { symbol: { renderBlock: string } }).symbol;
  const satan = member("satan", "Satan", "character", "Satan: no human face or body; a vast red serpentine dragon.", "symbol");
  const job = member("job", "Job", "character", "Job: a grey-bearded herdsman in wool.");
  const render = (workId: string, cast: LeanCastMember[], depiction = testDepiction(workId)) => {
    const brief = JSON.parse(readFileSync(path.join(process.cwd(), "works", "bible-web", "brief.json"), "utf8"));
    return buildLeanRendering({ work: { id: workId, title: "T" }, moment: { id: "m", sectionId: "s", reference: "Job 1:6", text: "Satan came among them." },
      brief: { ...brief, workId }, eraId: brief.eras[0].id, style: SHARED_STYLES.get("classical")!, cast,
      references: [{ kind: "sheet", entryId: "satan", stageId: "main", storageId: "blob-satan", version: "f" }, { kind: "sheet", entryId: "job", stageId: "main", storageId: "blob-job", version: "f" }],
      depiction, aspectRatio: "16:9" });
  };

  it("draws a symbol entry from its canon, never as a person, and gives it no sheet", () => {
    const result = render("bible-web", [job, satan]);
    if (!result.ok) throw new Error(result.error);
    expect(result.prompt).toContain(`${symbolWording.renderBlock} Satan.`);
    expect(result.prompt).toContain(`- ${satan.text}`);
    // Not a subject without form: no unseen-presence line and no renaming, so the verse keeps its words.
    expect(result.prompt).not.toContain("UNSEEN PRESENCE");
    expect(result.prompt).toContain('"Satan came among them."');
    expect(result.references.map((r) => r.kind === "sheet" && r.entryId)).toEqual(["job"]);
  });

  it("refuses a symbol entry in a work without symbol wording", () => {
    const result = render("holmes-adventures", [satan], readDepictionProfile("holmes-adventures"));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("has no wording for subjects shown only as a symbol, so it cannot depict satan") });
  });
});
