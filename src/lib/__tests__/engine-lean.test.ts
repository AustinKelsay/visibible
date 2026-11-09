/** The lean rendering candidate: cast ranking, reference slots and subjects without form; pure, no providers. */
import { describe, expect, it } from "vitest";
import { buildLeanRendering, leanNames, rankLeanCast, selectLeanReferences, LEAN_MAX_SHEETS, type LeanCastMember, type LeanInput, type LeanReference } from "../engine/lean";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import { testDepiction } from "../../../tests/fixtures/depiction";

const WORK = "lean-fixture";
const member = (entryId: string, name: string, kind: LeanCastMember["kind"], text: string, extra: Partial<LeanCastMember> = {}): LeanCastMember =>
  ({ entryId, stageId: `${entryId}-s1`, kind, name, aliases: [], text, depiction: "form", version: `v-${entryId}`, ...extra });
const jesus = member("jesus", "Jesus Christ, the Son of God and Lord", "character", "Jesus: a man of about thirty with a short dark beard.");
const simon = member("simon", "Simon of Cyrene", "character", "Simon of Cyrene: a sturdy man in his forties.");
const soldiers = member("soldiers", "The Roman soldiers", "character", "The Roman soldiers: men in red-brown cloaks.");
const golgotha = member("golgotha", "Golgotha", "location", "Golgotha: a bare limestone knoll.");
const god = member("god", "God / Yahweh, the Father", "character", "God the Father: no human face or body.", { aliases: ["Yahweh", "the Lord"], depiction: "effects" });
const ancient = member("ancient", "The Ancient of Days", "character", "The Ancient of Days: brilliant white radiance.", { aliases: ["the Most High"], depiction: "effects" });
const sheet = (m: LeanCastMember): LeanReference => ({ kind: "sheet", entryId: m.entryId, stageId: m.stageId, storageId: `blob-${m.entryId}`, version: "f" });
const styleRef: LeanReference = { kind: "styleReference", styleId: "classical", storageId: "blob-style", version: "f" };

const brief: WorkBrief = {
  schemaVersion: 1, workId: WORK, tone: "Reverent.", depictionRules: [{ text: "God the Father has no human face or body." }],
  eras: [{ id: "era", label: "Roman Judea", people: "Judeans.", dress: "Tunics.", buildingsAndObjects: "Stone.", technology: "Lamps." }],
  styleIds: ["classical"],
};
const input = (text: string, cast: LeanCastMember[], references: LeanReference[] = [], neighbors: LeanInput["neighbors"] = {}): LeanInput => ({
  work: { id: WORK, title: "The Fixture" }, moment: { id: "m1", sectionId: "s1", reference: "Fixture 1:1", text }, neighbors,
  brief, eraId: "era", style: SHARED_STYLES.get("classical")!, cast, references, depiction: testDepiction(WORK), aspectRatio: "16:9",
});

describe("lean cast", () => {
  it("names an entry by its label, its short name and its aliases, with or without a leading article", () => {
    expect(leanNames(jesus)).toEqual(expect.arrayContaining(["Jesus", "Jesus Christ"]));
    expect(leanNames(ancient)).toEqual(expect.arrayContaining(["Ancient of Days", "Most High"]));
  });

  it("offers the whole section cast, named members first, so a pronoun-only verse still reaches its subject", () => {
    const ranked = rankLeanCast([simon, jesus, soldiers, golgotha], "When they had crucified him, they divided his clothing.", { previous: "Jesus would not drink.", next: null });
    expect(ranked.map((m) => m.entryId)).toEqual(["jesus", "simon", "soldiers", "golgotha"]);
    expect(ranked[0].named).toEqual({ here: 0, before: 1, after: 0 });
  });

  it("gives the best character and the best place the first sheet slots, then ranked order, up to the cap", () => {
    const cast = rankLeanCast([simon, golgotha, jesus, soldiers], "Jesus came to Golgotha.");
    const refs = selectLeanReferences(cast, [styleRef, sheet(simon), sheet(golgotha), sheet(jesus), sheet(soldiers)], "classical");
    expect(refs.map((r) => r.kind === "sheet" ? r.entryId : "style")).toEqual(["style", "jesus", "golgotha", "simon", "soldiers"]);
    expect(refs.filter((r) => r.kind === "sheet")).toHaveLength(Math.min(4, LEAN_MAX_SHEETS));
    expect(refs[1].caption).toContain("Jesus's reference sheet");
  });

  it("passes a slot on when the best character has no sheet", () => {
    const refs = selectLeanReferences(rankLeanCast([simon, jesus], "Simon and Jesus."), [sheet(jesus)], "classical");
    expect(refs.map((r) => r.kind === "sheet" && r.entryId)).toEqual(["jesus"]);
  });
});

describe("lean prompt", () => {
  it("splits canon into members the text names and members it may refer to", () => {
    const result = buildLeanRendering(input("When they had crucified him, they divided his clothing.", [jesus, soldiers, golgotha], [], { previous: "Jesus would not drink." }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const named = result.prompt.indexOf("CANON, NAMED HERE"), elsewhere = result.prompt.indexOf("CANON, ELSEWHERE");
    expect(named).toBeGreaterThan(0);
    expect(result.prompt.indexOf("Jesus: a man")).toBeGreaterThan(named);
    expect(result.prompt.indexOf("Jesus: a man")).toBeLessThan(elsewhere);
    expect(result.prompt.indexOf("Golgotha: a bare")).toBeGreaterThan(elsewhere);
    expect(result.prompt).not.toMatch(/scene plan/i);
  });

  it("never lets the text name or embody a subject without form", () => {
    const result = buildLeanRendering(input("One who was ancient of days sat. His clothing was white as snow.", [ancient, god], [sheet(ancient)], { next: "Yahweh spoke." }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).not.toMatch(/ancient of days|Yahweh/i);
    expect(result.prompt).toContain("One who was the presence sat");
    expect(result.prompt).toContain("IMAGERY, NOT FORM");
    expect(result.prompt).toContain("UNSEEN PRESENCE");
    // A subject without form never gets a sheet or canon prose.
    expect(result.references).toHaveLength(0);
    expect(result.prompt).not.toContain("brilliant white radiance");
  });

  it("renames a subject without form inside another entry's canon and sheet caption", () => {
    const temple = member("temple", "Yahweh's house in Jerusalem", "location", "Yahweh's house in Jerusalem: a stone temple where Yahweh is worshipped.");
    const result = buildLeanRendering(input("Smoke filled the house.", [temple, god], [sheet(temple)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).not.toMatch(/Yahweh/);
    expect(result.prompt).toContain("the presence's house in Jerusalem: a stone temple");
    expect(result.references[0].caption).toContain("the presence's house in Jerusalem's reference sheet");
  });

  it("adds no presence wording when the section has no subject without form", () => {
    const result = buildLeanRendering(input("Jesus walked.", [jesus]));
    expect(result.ok && result.prompt).not.toContain("IMAGERY, NOT FORM");
    expect(result.ok && result.prompt).not.toContain("UNSEEN PRESENCE");
  });

  it("refuses a prompt over its cap before any paid call", () => {
    const long = member("long", "Long", "character", `Long: ${"x".repeat(13000)}`);
    expect(buildLeanRendering(input("Long stood.", [long]))).toEqual({ ok: false, error: expect.stringContaining("cap") });
  });
});
