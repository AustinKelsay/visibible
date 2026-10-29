/**
 * The consistency evaluation (ADR 0008): the committed groups, shown images read from launch-matrix results with
 * their canon stages, blind pairs that keep a stage change apart, two scorers settled by an operator, the summary
 * and the gate that pools the released styles.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_BY_SLUG, isValidLocation } from "@/data/bible-structure";
import {
  CONSISTENCY_BAR, blindPairs, buildConsistencyPairs, evaluateConsistencyGate, loadConsistencyGroups, settleVerdicts,
  shownImagesFromResults, stagesFromSnapshot, summarizeConsistency, versesNotRun, type ConsistencyGroup, type PairScoreFile, type ShownImage,
} from "../image-evals/consistency";

const groupsFile = JSON.parse(readFileSync(path.join(__dirname, "../../../evals/images/consistency.json"), "utf8"));

const image = (unitId: string, style: string, present: string[], stages: Record<string, string> = {}): ShownImage =>
  ({ unitId, style, file: `images/${unitId}__${style}.jpg`, sha256: `${unitId}-${style}`, present, stages, scene: `scene of ${unitId}` });
const moses: ConsistencyGroup = { id: "moses", kind: "character", subject: "Moses", entryId: "moses", units: ["exodus-14-21", "exodus-14-22", "leviticus-11-7"] };
const sea: ConsistencyGroup = { id: "red-sea", kind: "setting", subject: "the Red Sea path", units: ["exodus-14-21", "exodus-14-22"] };
const elder = { moses: "moses-elder" };
const scores = (scorer: string, verdicts: Record<string, "same" | "different" | "unclear">): PairScoreFile =>
  ({ scorer, scoredBeforeUnblinding: true, scores: Object.entries(verdicts).map(([id, verdict]) => ({ id, verdict, notes: "" })) });

describe("consistency groups", () => {
  it("loads the committed groups, every unit a real verse", () => {
    const groups = loadConsistencyGroups(groupsFile);
    expect(groups.filter((g) => g.kind === "character").length).toBeGreaterThanOrEqual(5);
    expect(groups.filter((g) => g.kind === "setting").length).toBeGreaterThanOrEqual(5);
    for (const unit of groups.flatMap((g) => g.units)) {
      const match = unit.match(/^(.+)-(\d+)-(\d+)$/);
      const book = match ? BOOK_BY_SLUG[match[1]] : undefined;
      expect(book && isValidLocation(book, Number(match![2]), Number(match![3])), unit).toBe(true);
    }
  });

  it("refuses repeated groups or units and a character without its canon entry", () => {
    const file = (groups: unknown[]) => ({ schemaVersion: 1, workId: "bible-web", groups });
    expect(() => loadConsistencyGroups(file([moses, moses]))).toThrow("Duplicate consistency group: moses");
    expect(() => loadConsistencyGroups(file([{ ...moses, units: ["exodus-14-21", "exodus-14-21"] }]))).toThrow("repeats a unit");
    expect(() => loadConsistencyGroups(file([{ ...moses, entryId: undefined }]))).toThrow("names its canon entry");
    expect(() => loadConsistencyGroups(file([{ ...sea, units: ["exodus-14-21"] }]))).toThrow();
  });
});

describe("shown images from launch-matrix results", () => {
  const plan = { primarySubject: "Moses with his staff raised", secondaryElements: "the people behind him", present: ["moses", "red_sea"] };
  const attempt = (n: number) => ({ n, file: `images/exodus-14-21__a${n}.jpg`, sha256: `sha-${n}` });
  const stages = stagesFromSnapshot({ cases: [{ id: "exodus-14-21", sectionId: "exodus-14-21", cast: ["moses:moses-elder", "red_sea:red_sea"] }] });

  it("takes the shown attempt and the case's plan, which is recorded on one style's row", () => {
    const rows = [
      { case: "exodus-14-21", style: "classical", outcome: "image", chosen: 2, prepared: { look: {}, plan }, attempts: [attempt(1), attempt(2)] },
      { case: "exodus-14-21", style: "watercolor", outcome: "image", chosen: 1, attempts: [attempt(1)] },
      { case: "daniel-7-9", style: "classical", outcome: "refused" },
      { key: "isaiah-6-2/*", case: "isaiah-6-2", outcome: "error", message: "provider failed" },
    ];
    const images = shownImagesFromResults(rows, stages);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ unitId: "exodus-14-21", style: "classical", file: "images/exodus-14-21__a2.jpg", sha256: "sha-2", present: ["moses", "red_sea"], stages: { moses: "moses-elder" } });
    expect(images[0].scene).toBe("Moses with his staff raised; the people behind him");
    expect(images[1]).toMatchObject({ style: "watercolor", file: "images/exodus-14-21__a1.jpg", present: ["moses", "red_sea"] });
  });

  it("refuses an image without a plan or without the case's canon stages", () => {
    expect(() => shownImagesFromResults([{ case: "exodus-14-21", style: "icon", outcome: "image", chosen: 1, attempts: [attempt(1)] }], stages)).toThrow("no shown attempt or plan");
    expect(() => shownImagesFromResults([{ case: "exodus-14-22", style: "icon", outcome: "image", chosen: 1, prepared: { plan }, attempts: [attempt(1)] }], stages)).toThrow("no canon stages for exodus-14-22");
    expect(() => shownImagesFromResults([{ case: "exodus-14-21", outcome: "image", chosen: 1, prepared: { plan }, attempts: [attempt(1)] }], stages)).toThrow("has an image but no style");
    expect(() => stagesFromSnapshot({ cases: [{ id: "x", cast: ["moses"] }] })).toThrow("without a stage");
  });

  it("lists the group verses no results row names, so a run cannot skip them", () => {
    expect(versesNotRun([moses, sea], new Set(["exodus-14-21", "leviticus-11-7"]))).toEqual({ character: ["exodus-14-22"], setting: ["exodus-14-22"] });
    expect(versesNotRun([moses, sea], new Set(["exodus-14-21", "exodus-14-22", "leviticus-11-7"]))).toEqual({ character: [], setting: [] });
  });
});

describe("blind pairs", () => {
  const images = [
    image("exodus-14-21", "classical", ["moses"], elder), image("exodus-14-22", "classical", ["moses"], elder),
    image("leviticus-11-7", "classical", ["aaron"], elder), image("exodus-14-21", "icon", ["moses"], elder),
    image("exodus-14-22", "icon", ["moses"], { moses: "moses-adult" }),
  ];

  it("pairs eligible images within a style and keeps a stage change apart", () => {
    const { pairs, coverage } = buildConsistencyPairs([moses, sea], images, "seed");
    expect(pairs.map((p) => `${p.groupId}/${p.style}`).sort()).toEqual(["moses/classical", "red-sea/classical", "red-sea/icon"]);
    expect(coverage.find((c) => c.groupId === "moses" && c.style === "classical")).toEqual({ groupId: "moses", style: "classical", units: 3, imaged: 3, eligible: ["exodus-14-21", "exodus-14-22"], pairs: 1, otherStage: 0 });
    expect(coverage.find((c) => c.groupId === "moses" && c.style === "icon")).toMatchObject({ eligible: ["exodus-14-21", "exodus-14-22"], pairs: 0, otherStage: 1 });
    expect(pairs.map((p) => p.id)).toEqual(["pair001", "pair002", "pair003"]);
  });

  it("gives the same order and sides for the same seed", () => {
    const first = buildConsistencyPairs([moses, sea], images, "seed").pairs;
    expect(buildConsistencyPairs([moses, sea], images, "seed").pairs).toEqual(first);
    const seeds = ["a", "b", "c", "d", "e", "f"].map((seed) => buildConsistencyPairs([moses, sea], images, seed).pairs.map((p) => `${p.groupId}/${p.style}/${p.left.unitId}`).join());
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("refuses two shown images for one unit and style", () => {
    expect(() => buildConsistencyPairs([moses], [...images, image("exodus-14-21", "classical", ["moses"], elder)])).toThrow("Two shown images for exodus-14-21 in classical");
  });

  it("shows scorers the question and scenes, never the group, style, units or source files", () => {
    const { pairs } = buildConsistencyPairs([moses], images, "seed");
    const [blind] = blindPairs(pairs, (id) => `composites/${id}.jpg`);
    expect(blind).toEqual({ id: "pair001", file: "composites/pair001.jpg", kind: "character", subject: "Moses", question: "Is Moses the same person in the left and right images?", left: pairs[0].left.scene, right: pairs[0].right.scene });
    expect(blindPairs([{ ...pairs[0], kind: "setting", subject: "the Red Sea path" }], (id) => id)[0].question).toBe("Do the left and right images show the same place (the Red Sea path)?");
  });
});

describe("settling verdicts", () => {
  const ids = ["pair001", "pair002", "pair003"];
  const a = scores("a", { pair001: "same", pair002: "different", pair003: "unclear" });

  it("keeps unanimous verdicts and lets the operator settle only disputes", () => {
    const b = scores("b", { pair001: "same", pair002: "same", pair003: "unclear" });
    expect(settleVerdicts(ids, [a, b])).toEqual({ verdicts: { pair001: "same", pair002: "disputed", pair003: "unclear" }, disputed: ["pair002"], unanimous: 2 });
    expect(settleVerdicts(ids, [a, b], scores("operator", { pair002: "different" })).verdicts.pair002).toBe("different");
    expect(() => settleVerdicts(ids, [a, b], scores("operator", { pair001: "different" }))).toThrow("only disputed pairs, not pair001");
  });

  it("needs two distinct scorers who each judge every pair once", () => {
    expect(() => settleVerdicts(ids, [a])).toThrow("at least two distinct scorers");
    expect(() => settleVerdicts(ids, [a, a])).toThrow("at least two distinct scorers, not a, a");
    expect(() => settleVerdicts(ids, [a, scores("b", { pair001: "same" })])).toThrow("b did not score pair002, pair003");
    expect(() => settleVerdicts(ids, [a, scores("b", { pair009: "same" })])).toThrow("b scored an unknown pair: pair009");
    const twice: PairScoreFile = { ...a, scorer: "c", scores: [...a.scores, a.scores[0]] };
    expect(() => settleVerdicts(ids, [a, twice])).toThrow("c scored pair001 twice");
  });
});

describe("summary and gate", () => {
  const pair = (id: string, kind: "character" | "setting", style: string, groupId = kind === "character" ? "moses" : "red-sea") =>
    ({ id, groupId, kind, subject: "s", style, left: { unitId: "a", file: "a", sha256: "a", scene: "" }, right: { unitId: "b", file: "b", sha256: "b", scene: "" } });
  const many = (prefix: string, kind: "character" | "setting", style: string, n: number) => Array.from({ length: n }, (_, i) => pair(`${prefix}${i}`, kind, style));
  const verdictsFor = (pairs: Array<{ id: string }>, verdict: (i: number) => "same" | "different" | "unclear" | "disputed") => Object.fromEntries(pairs.map((p, i) => [p.id, verdict(i)]));

  it("rates same among pairs judged same or different, by kind, style and group", () => {
    const pairs = [pair("p1", "character", "classical"), pair("p2", "character", "classical"), pair("p3", "character", "icon"), pair("p4", "setting", "icon")];
    const summary = summarizeConsistency(pairs, { p1: "same", p2: "different", p3: "unclear", p4: "same" });
    expect(summary.character.overall).toEqual({ pairs: 3, same: 1, different: 1, unclear: 1, disputed: 0, rate: 0.5 });
    expect(summary.character.byStyle.icon.rate).toBeNull();
    expect(summary.character.byGroup.moses.classical.pairs).toBe(2);
    expect(summary.setting.overall.rate).toBe(1);
    expect(() => summarizeConsistency(pairs, { p1: "same" })).toThrow("No verdict for p2");
  });

  it("passes when both measures clear the bar on the pooled released styles", () => {
    const pairs = [...many("c", "character", "classical", 20), ...many("w", "character", "watercolor", 20), ...many("s", "setting", "classical", 25), ...many("i", "character", "icon", 10)];
    const verdicts = verdictsFor(pairs, (i) => (i % 10 === 0 ? "different" : "same"));
    for (const p of pairs.filter((p) => p.style === "icon")) verdicts[p.id] = "different";
    const gate = evaluateConsistencyGate(pairs, verdicts, ["classical", "watercolor"]);
    expect(gate).toMatchObject({ pass: true, styles: ["classical", "watercolor"], barVersion: CONSISTENCY_BAR.version });
    expect(gate.checks.map((c) => [c.kind, c.tally.pairs, c.pass])).toEqual([["character", 40, true], ["setting", 25, true]]);
  });

  it("fails closed on unrun verses, disputes, too few pairs, too many unclear, a low rate or a drop from the baseline", () => {
    const pairs = [...many("c", "character", "classical", 40), ...many("s", "setting", "classical", 10)];
    const check = (verdict: (i: number) => "same" | "different" | "unclear" | "disputed", context = {}) =>
      evaluateConsistencyGate(pairs, verdictsFor(pairs, verdict), ["classical"], context).checks.map((c) => c.reasons);
    expect(check(() => "same", { notRun: { character: ["daniel-5-17", "daniel-6-22"] } })[0]).toEqual(["2 group verses never ran: daniel-5-17, daniel-6-22"]);
    expect(check((i) => (i === 0 ? "disputed" : "same"))[0]).toEqual(["1 pairs still disputed"]);
    expect(check(() => "same")[1]).toEqual(["only 10 pairs judged same or different; needs 20"]);
    expect(check((i) => (i < 20 ? "unclear" : "same"))[0]).toEqual(["only 20 pairs judged same or different; needs 30", "20 of 40 pairs unclear"]);
    expect(check((i) => (i < 12 ? "different" : "same"))[0]).toEqual(["70% judged the same; bar 75%"]);
    expect(check((i) => (i < 8 ? "different" : "same"), { baseline: { character: 0.95 } })[0]).toEqual(["fell from 95% to 80%"]);
    expect(check((i) => (i < 8 ? "different" : "same"), { baseline: { character: 0.85 } })[0]).toEqual([]);
  });
});
