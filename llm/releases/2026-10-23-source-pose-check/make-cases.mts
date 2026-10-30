/** Freeze exact defective packets, minimal repairs and explicitly labelled synthetic controls. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fixture } from "../2026-10-23-formless-selection-check/scenarios.mjs";
import type { ReviewInput } from "../../../src/lib/engine/plan-review";
import { dir, json, save } from "./common.mjs";
import { readDepictionProfile } from "../../../src/lib/engine/depiction";
// The Bible's depiction profile reproduces the wording these runs used (ADR 0010).
const depiction = readDepictionProfile("bible-web");

const prior = path.resolve(dir, "../2026-10-23-formless-selection-check");
const rows = fs.readFileSync(path.join(prior, "results.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const calls = fs.readFileSync(path.join(prior, "provider.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const god = "god_yahweh_the_father_and_god_of_israel";
const cases: Array<{ id: string; provenance: string; targets: Array<{ kind: string; entryId: string }>; input: ReviewInput }> = [];
for (const [id, sample, kind, entryId] of [["pipeline-s001-1", "s001", "outside_instant", god], ["pipeline-s067-3", "s067", "outside_instant", god], ["pipeline-s074-2", "s074", "not_one_instant", ""]]) {
  const row = rows.find((r) => r.id === id), stored = row.result.stored.payload;
  const lastReview = calls.filter((c) => c.phase === id && c.request.response_format.json_schema.name === "plan_review").at(-1)!;
  assert.equal(fs.readFileSync(path.join(dir, "baseline-review-system.txt"), "utf8"), lastReview.request.messages[0].content);
  assert.deepEqual(JSON.parse(lastReview.response.choices[0].message.content), { problems: [] });
  const input = { ...fixture(sample).review, present: stored.entries.map((e: { entryId: string }) => e.entryId), fields: stored.plan };
  cases.push({ id, provenance: `Exact stored defect from previous focused check, ${id}; old final review falsely clean.`, targets: [{ kind, entryId }, ...(sample === "s067" ? [{ kind: "outside_instant", entryId: "moses" }] : [])], input });
}
for (const defect of [...cases]) {
  const input = structuredClone(defect.input);
  if (defect.id === "pipeline-s001-1") {
    input.present = input.present.filter((id) => id !== god);
    input.fields.primarySubject = "Moses and Aaron standing before the Levite families, Moses holding a counting tally.";
    input.fields.secondaryElements = "Levite men in woven tunics and cloaks in family groups; tent cloth and wooden tabernacle furnishings.";
    input.fields.composition = "Wide view from the east looking toward the tabernacle; Moses and Aaron in the foreground before the Levite rows, tabernacle centered behind them.";
  } else if (defect.id === "pipeline-s067-3") {
    input.present = input.present.filter((id) => ![god, "moses"].includes(id));
    input.fields.primarySubject = "Aaron holding a clay vessel of water to the woman's lips.";
    input.fields.action = "Aaron tilts the vessel for the woman to drink; the woman lifts her chin and drinks.";
    input.fields.secondaryElements = "A clay vessel of water in Aaron's hands; dust-colored sand outside the tabernacle courtyard.";
    input.fields.composition = "Medium shot from the courtyard edge; Aaron and the woman centered in the foreground, the tabernacle behind.";
  } else {
    input.fields.action = "The goldsmith holds the idol still in both hands above the bench, shoulders bowed as he stares at its lifeless surface.";
  }
  cases.push({ id: `${defect.id}-repaired`, provenance: `Operator's minimal scene-field repair of ${defect.id}; source, cast and other fields unchanged.`, targets: [], input });
}
const base: ReviewInput = { depiction, rules: "The Presence has no physical body; represent an established presence through radiance around an unoccupied seat.", sectionTitle: "Synthetic vision control",
  context: { moment: { id: "vision", reference: "Synthetic vision 1", text: "In the vision, the Presence appeared above the throne while a witness watched from the doorway." }, previous: null, next: null },
  cast: [{ entryId: "presence", name: "The Presence", hasForm: false }, { entryId: "witness", name: "Witness", hasForm: true }], present: ["presence", "witness"],
  fields: { primarySubject: "Radiance above an unoccupied throne; the witness stands in the doorway", action: "The radiance glows as the witness watches", setting: "A quiet hall", secondaryElements: "An unoccupied throne", mood: "Quiet wonder", timeOfDay: "Daylight", composition: "Wide view from inside the hall toward the throne and doorway" } };
cases.push({ id: "synthetic-visible-presence", provenance: "Synthetic positive control: an explicit appearance, not a population sample.", targets: [], input: base });
cases.push({ id: "synthetic-compatible-contact", provenance: "Synthetic positive control: touching an object supported by a bench is simultaneous, not the retained holding/putting-down sequence.", targets: [], input: {
  depiction, rules: "- none", sectionTitle: "Synthetic workshop control", context: { moment: { id: "contact", reference: "Synthetic workshop 1", text: "The artisan rested one hand on the idol on the bench and looked at its dull surface." }, previous: null, next: null },
  cast: [], present: [], fields: { primarySubject: "An artisan with one hand resting on an idol on the bench", action: "The artisan looks at the idol's dull surface while touching it with one hand", setting: "A workshop", secondaryElements: "The bench supports the idol; tools lie beside it", mood: "Disappointment", timeOfDay: "Daylight", composition: "Medium view of the artisan, idol and bench" },
} });
assert.equal(cases.length, 8);
assert.equal(json("plan.json").cases.reviewRepeats, 2);
save("review-cases.json", cases);
