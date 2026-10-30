/**
 * The regression suite's committed data and its pure parts (ADR 0011): every case resolves against its work, the
 * split and the random draws replay from the seed, scores settle the way the instructions say, and the gate fails on
 * a fault that rises on holdout items.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { caseUnitId, caseWork, loadEvalCases } from "../image-evals/cases";
import { loadConsistencyGroups } from "../image-evals/consistency";
import {
  drawUnits, evaluateSuiteGate, faultsFor, loadFaults, loadSuiteConfig, scoringInstructions, settleScores, splitOf, suiteCases, summarize,
  type JudgedItem, type ScoreFile,
} from "../image-evals/suite";
import { depictionModeOf } from "../engine/depiction";
import { readWorkInputs } from "../engine/work-inputs";
import { createWorkReader } from "../work-input";

const read = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8"));
const config = loadSuiteConfig(read("evals/images/suite.json"));
const faults = loadFaults(read("evals/images/faults.json"));
const cases = loadEvalCases(read("evals/images/cases.json"));

describe("the committed suite", () => {
  it("resolves every case against its imported work and offers each work's image styles", async () => {
    for (const workId of Object.keys(config.works)) {
      const inputs = await readWorkInputs(workId);
      for (const style of config.works[workId].imageStyles) expect(inputs.styles[style], `${workId} ${style}`).toBeDefined();
      for (const c of cases.filter((x) => caseWork(x) === workId)) expect(inputs.work.getUnit(caseUnitId(c)).reference, c.id).toBe(c.reference);
    }
  });

  it("covers three works in both tiers, with images for every consistency verse", () => {
    const text = suiteCases(config, cases, "text"), image = suiteCases(config, cases, "image");
    const count = (list: typeof text, work: string) => list.filter((c) => c.work === work).length;
    expect([count(text, "bible-web"), count(text, "holmes-adventures"), count(text, "alice-in-wonderland")]).toEqual([77, 18, 18]);
    expect([count(image, "bible-web"), count(image, "holmes-adventures"), count(image, "alice-in-wonderland")]).toEqual([48, 15, 16]);
    expect(image.reduce((n, c) => n + c.styles.length, 0)).toBe(206);
    for (const [workId, settings] of Object.entries(config.works)) {
      const units = new Set(image.filter((c) => c.work === workId).map((c) => c.unitId));
      const groups = loadConsistencyGroups(read(settings.consistency));
      for (const group of groups) for (const unit of group.units) expect(units.has(unit), `${workId} ${group.id} ${unit}`).toBe(true);
    }
  });

  it("keeps tuned cases in dev and draws every other split from the seed", () => {
    const text = suiteCases(config, cases, "text");
    for (const c of cases) if (c.tuned) expect(splitOf(config, c)).toBe("dev");
    const holdout = (work: string) => text.filter((c) => c.work === work && c.split === "holdout").length;
    expect([holdout("bible-web"), holdout("holmes-adventures"), holdout("alice-in-wonderland")]).toEqual([9, 4, 7]);
    // The split depends on nothing but the seed and the id.
    expect(splitOf({ ...config, seed: "another seed" }, cases.find((c) => !c.tuned)!)).toBeDefined();
  });

  it("replays each random draw from the seed, so nobody chose its cases", () => {
    for (const draw of config.draws) {
      const work = cases.filter((c) => caseWork(c) === draw.work);
      const drawn = work.filter((c) => c.drawn === draw.label);
      const others = new Set(work.filter((c) => !c.drawn).map(caseUnitId));
      const ids = createWorkReader(read(`works/${draw.work}/work.json`)).units.map((u) => u.id);
      expect(drawn.map(caseUnitId), draw.label).toEqual(drawUnits(config.seed, draw.label, ids, draw.count, others));
      // A drawn case is drawn into the image tier exactly when it is in the holdout.
      expect(drawn.map((c) => (c.tiers ?? ["text", "image"]).includes("image"))).toEqual(drawn.map((c) => splitOf(config, c) === "holdout"));
    }
  });

  it("draws Alice from a committed analysis with no subject marked without form", async () => {
    const fixture = read("evals/images/analyses/alice-in-wonderland.json");
    const inputs = await readWorkInputs("alice-in-wonderland");
    expect([fixture.workVersion, fixture.briefVersion]).toEqual([inputs.workVersion, inputs.briefVersion]);
    const entries = fixture.records.filter((r: { kind: string }) => r.kind === "entry");
    expect(entries.length).toBeGreaterThan(50);
    expect(entries.filter((e: { payload: object }) => depictionModeOf(e.payload) === "effects")).toEqual([]);
    const ids = new Set(entries.map((e: { recordId: string }) => e.recordId));
    for (const group of loadConsistencyGroups(read(config.works["alice-in-wonderland"].consistency))) if (group.entryId) expect(ids.has(group.entryId), group.id).toBe(true);
  });

  it("asks unseen-subject faults only of works that word them, and every fault in the instructions", () => {
    expect(faultsFor(faults, "image", { effects: false }).map((f) => f.id)).not.toContain("effects_figure");
    expect(faultsFor(faults, "image", { effects: true }).map((f) => f.id)).toContain("effects_figure");
    for (const tier of ["text", "image"] as const) {
      const text = scoringInstructions(faults, tier);
      for (const f of faults[tier]) expect(text).toContain(`\`${f.id}\``);
      expect(text).toContain("key.json");
    }
  });
});

const score = (id: string, answers: Record<string, "yes" | "no" | "na">, overall: "acceptable" | "flawed" | "uncertain" = "acceptable") => ({ id, faults: answers, overall, notes: "" });
const file = (scorer: string, scores: ScoreFile["scores"]): ScoreFile => ({ scorer, scoredBeforeUnblinding: true, scores });

describe("settling two scorers", () => {
  const items = [{ id: "i001", faults: ["lettering", "anatomy"] }, { id: "i002", faults: ["lettering", "anatomy"] }];

  it("adopts agreement, treats na and no alike, and leaves disagreements to the operator", () => {
    const a = file("a", [score("i001", { lettering: "no", anatomy: "na" }), score("i002", { lettering: "yes", anatomy: "no" }, "flawed")]);
    const b = file("b", [score("i001", { lettering: "no", anatomy: "no" }), score("i002", { lettering: "no", anatomy: "no" }, "acceptable")]);
    const first = settleScores(items, [a, b]);
    expect(first.settled.i001).toEqual({ faults: { lettering: "no", anatomy: "no" }, overall: "acceptable" });
    expect(first.disputes).toEqual([{ id: "i002", fields: ["lettering", "overall"] }]);
    const ruled = settleScores(items, [a, b], { scorer: "operator", scoredBeforeUnblinding: true, scores: [{ id: "i002", faults: { lettering: "yes" }, overall: "flawed", notes: "glyphs in the corner" }] });
    expect(ruled.disputes).toEqual([]);
    expect(ruled.settled.i002).toEqual({ faults: { lettering: "yes", anatomy: "no" }, overall: "flawed" });
  });

  it("refuses a missing item, an unanswered fault or one scorer twice", () => {
    const full = file("a", [score("i001", { lettering: "no", anatomy: "no" }), score("i002", { lettering: "no", anatomy: "no" })]);
    expect(() => settleScores(items, [full, file("b", [score("i001", { lettering: "no", anatomy: "no" })])])).toThrow(/did not score i002/);
    expect(() => settleScores(items, [full, file("b", [score("i001", { lettering: "no" }), score("i002", { lettering: "no", anatomy: "no" })])])).toThrow(/did not answer anatomy/);
    expect(() => settleScores(items, [full, { ...full }])).toThrow(/must be different/);
  });
});

describe("the per-fault gate", () => {
  const imageFaults = faults.image.filter((f) => ["lettering", "unpainted_edge"].includes(f.id));
  const item = (n: number, split: "dev" | "holdout", lettering: "yes" | "no", options: { style?: string; edge?: "yes" | "no"; refused?: boolean } = {}): JudgedItem => ({
    key: `case-${n}/${options.style ?? "classical"}`, caseId: `case-${n}`, work: "bible-web", style: options.style ?? "classical", split, refused: options.refused ?? false,
    score: options.refused ? null : { faults: { lettering, unpainted_edge: options.edge ?? "no" }, overall: lettering === "yes" || options.edge === "yes" ? "flawed" : "acceptable" },
  });
  const many = (yes: number, total: number, split: "dev" | "holdout" = "holdout") => Array.from({ length: total }, (_, n) => item(n, split, n < yes ? "yes" : "no"));
  const run = (items: JudgedItem[], suiteVersion = config.version) => ({ suiteVersion, items, disputes: 0 });
  // The frozen suite's holdout keys, not either run's survivors.
  const expected = many(0, 40).map((i) => i.key);

  it("passes an unchanged candidate and one within the margin", () => {
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(4, 40)), baseline: run(many(4, 40)) }).pass).toBe(true);
    // Two more items is within max(5% of 40, 2).
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(6, 40)), baseline: run(many(4, 40)) }).pass).toBe(true);
  });

  it("fails a fault that rises past the margin on holdout, and ignores the dev split", () => {
    const gate = evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(9, 40)), baseline: run(many(4, 40)) });
    expect(gate.pass).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/lettering rose from 10% to 23%/);
    const dev = evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run([...many(4, 40), ...many(30, 40, "dev").map((i) => ({ ...i, key: `dev-${i.key}` }))]), baseline: run(many(4, 40)) });
    expect(dev.pass).toBe(true);
  });

  it("does not count a fault in a style that accepts it", () => {
    const edges = (style: string) => Array.from({ length: 20 }, (_, n) => item(n, "holdout", "no", { style, edge: "yes" }));
    expect(summarize(edges("watercolor"), imageFaults).faults.unpainted_edge.rate).toBe(0);
    expect(summarize(edges("classical"), imageFaults).faults.unpainted_edge.rate).toBe(1);
  });

  it("counts refusals and fails closed on a different suite, disputes or missing holdout items", () => {
    const refusals = evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(0, 40).map((i, n) => n < 8 ? { ...i, refused: true, score: null } : i)), baseline: run(many(0, 40)) });
    expect(refusals.reasons.join(" ")).toMatch(/refused rose/);
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(4, 40), "other"), baseline: run(many(4, 40)) }).reasons.join(" ")).toMatch(/Different suites/);
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: { ...run(many(4, 40)), disputes: 1 }, baseline: run(many(4, 40)) }).pass).toBe(false);
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(4, 39)), baseline: run(many(4, 40)) }).reasons.join(" ")).toMatch(/candidate has no result for 1 holdout item/);
    // Two empty runs never pass: completeness is read from the suite, not from the baseline.
    const empty = evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run([]), baseline: run([]) });
    expect(empty.pass).toBe(false);
    expect(empty.reasons.join(" ")).toMatch(/baseline has no result for 40 holdout item/);
    // An unsettled baseline drops items from its rates, so it fails closed too.
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(4, 40)), baseline: { ...run(many(4, 40)), disputes: 2 } }).reasons.join(" ")).toMatch(/2 baseline item\(s\) are still disputed/);
    const unscoredBaseline = many(4, 40).map((i, n) => n === 7 ? { ...i, score: null } : i);
    expect(evaluateSuiteGate({ config, faults: imageFaults, expected, candidate: run(many(4, 40)), baseline: run(unscoredBaseline) }).reasons.join(" ")).toMatch(/1 baseline holdout item\(s\) are unscored/);
  });
});
