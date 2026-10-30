/** Constructed isolates of retained failure classes. These are not historical provider replies. */
import assert from "node:assert/strict";
import type { ReviewInput, PlanReviewProblem } from "../../../src/lib/engine/plan-review";
import { readDepictionProfile } from "../../../src/lib/engine/depiction";
// The Bible's depiction profile reproduces the wording these runs used (ADR 0010).
const depiction = readDepictionProfile("bible-web");

type Required = { kind: PlanReviewProblem["kind"]; entryId?: string; quoteFrom?: string };
type Control = { id: string; basis: string; required: Required[]; input: ReviewInput };
const god = "god", esther = "esther";
function input(text: string): ReviewInput {
  return { depiction, rules: "Never give God a body, face, silhouette or clothing. An established manifestation may use cloud or light.",
    context: { moment: { id: "constructed", reference: "Constructed control, not a Bible quotation", text }, previous: null, next: null },
    sectionTitle: "Isolated content review control", cast: [], present: [],
    fields: { primarySubject: "An unnamed traveler", action: "stands still", setting: "an open plain", secondaryElements: "", mood: "quiet", timeOfDay: "midday", composition: "One view of the traveler." },
    rendering: { look: { place: "an open plain", timeOfDay: "midday", weather: "clear", light: "ordinary sunlight", clothing: "plain linen clothing" }, canon: [] } };
}
function godCast(value: ReviewInput, selected = false) {
  value.cast.push({ entryId: god, name: "God", hasForm: false });
  if (selected) {
    value.present.push(god);
    value.rendering!.canon.push({ entryId: god, stageId: "default", kind: "character", name: "God", hasForm: false, version: "control",
      text: "God has no bodily form. Permitted manifestation: cloud and white light; never a body, face, clothing or figure." });
  }
  return value;
}
function royal() {
  const value = input("Esther sits still in the royal court.");
  value.cast = [{ entryId: esther, name: "Esther", hasForm: true }]; value.present = [esther];
  Object.assign(value.fields, { primarySubject: "Esther in her crimson robe", action: "sits still", setting: "the royal court", composition: "One view of Esther." });
  Object.assign(value.rendering!.look, { place: "the royal court", clothing: "Esther wears her crimson robe" });
  value.rendering!.canon = [{ entryId: esther, stageId: "queen", kind: "character", name: "Esther", hasForm: true, version: "control", text: "Esther wears a crimson robe. She has dark brown hair and brown eyes." }];
  return value;
}
function manifestation() {
  const value = godCast(input("God appears to the travelers as cloud and light on the plain."), true);
  Object.assign(value.fields, { primarySubject: "God represented by cloud and white light", action: "Cloud and light hover above the plain.", secondaryElements: "Unnamed travelers stand nearby.", composition: "One view of cloud, light and travelers." });
  value.rendering!.look.light = "white light around the source-supported divine cloud";
  return value;
}
export const cases: Control[] = [];
function add(id: string, basis: string, value: ReviewInput, required: Required[] = []) { cases.push({ id, basis, input: value, required }); }
let value = input("An unnamed traveler stands still on an open plain at midday.");
value.rendering!.look.place = "The shore of a wide sea, the camp of Israel spread along the water's edge";
add("look-place", "Retained Exodus 14:5: a shared shore look conflicts with a court instant. Constructed isolate uses a plain instead of the court.", value, [{ kind: "look_conflict" }]);
value = input("An unnamed traveler stands still on an open plain at midday."); value.rendering!.look.timeOfDay = "night";
add("look-time", "Retained Numbers 5:24 and Jeremiah 10:14 fixed-time conflicts; constructed isolate.", value, [{ kind: "look_conflict" }]);
value = godCast(input("An unnamed traveler stands still on an open plain at midday.")); value.rendering!.look.light = "God's white-gold radiance fills the sky";
add("look-unselected-effect", "Retained shared looks add divine effects to an instant without that subject; constructed isolate.", value, [{ kind: "look_conflict", entryId: god }]);
value = royal(); value.fields.primarySubject = "Esther in a royal blue robe";
add("canon-robe", "Retained Esther 9:31 blue scene robe against crimson canon; constructed isolate.", value, [{ kind: "canon_conflict", entryId: esther }]);
value = input("God appears as cloud and light on the plain."); Object.assign(value.fields, { primarySubject: "God represented by cloud and light", action: "Cloud and light hover over the plain.", composition: "One view of the divine cloud." });
add("missing-canon", "Retained Psalms 95:3 depicts God without section canon; constructed actual-appearance source isolates the canon gap.", value, [{ kind: "missing_canon", entryId: "" }]);
value = input("The priest shall make the woman drink the water."); value.cast = [{ entryId: "aaron", name: "Aaron", hasForm: true }]; value.present = ["aaron"];
Object.assign(value.fields, { primarySubject: "Aaron", action: "offers the cup of water to the woman", secondaryElements: "An unnamed woman receives the cup.", composition: "One view of Aaron and the woman." });
value.rendering!.canon = [{ entryId: "aaron", stageId: "default", kind: "character", name: "Aaron", hasForm: true, version: "control", text: "Aaron is an elderly man with a grey beard and linen garments." }];
add("unsupported-aaron", "Numbers 5:24 unsupported named identity substituted for a generic priest; source abridged for isolation, no neighbor identity link.", value, [{ kind: "outside_instant", entryId: "aaron" }]);
value = input("You shall keep my Sabbaths, and have reverence for my sanctuary. I am Yahweh."); value.cast = [{ entryId: "moses", name: "Moses", hasForm: true }]; value.present = ["moses"];
Object.assign(value.fields, { primarySubject: "Moses", action: "instructs the assembled people", secondaryElements: "Unnamed listeners face Moses.", composition: "One view of Moses and listeners." });
value.rendering!.canon = [{ entryId: "moses", stageId: "default", kind: "character", name: "Moses", hasForm: true, version: "control", text: "Moses is an elderly bearded man in plain linen garments." }];
add("unsupported-moses", "Retained Leviticus 26:2 framing teacher added without source identity support; bounded source supplied without a separate framing scene.", value, [{ kind: "outside_instant", entryId: "moses" }]);
value = input("The craftsperson examines an idol held above the bench."); Object.assign(value.fields, { primarySubject: "An unnamed craftsperson holding an idol above a bench", action: "examines the idol", secondaryElements: "The same idol rests flat on the bench.", composition: "One view of the craftsperson and the idol." });
add("object-state", "Retained simultaneous hand/bench object-state defect; constructed isolate.", value, [{ kind: "not_one_instant", entryId: "" }]);
value = manifestation(); value.rendering!.look.light = "God is a luminous human figure with a face and white robes";
add("look-embodiment", "Earlier no-form shared looks add forbidden body/clothing; constructed isolate.", value, [{ kind: "look_conflict", entryId: god }]);

add("ordinary-light", "Ordinary sunlight does not imply divine presence, even with God available in section cast.", godCast(input("An unnamed traveler stands still on an open plain at midday.")));
value = input("An unnamed traveler stands still on an open plain at midday."); Object.assign(value.rendering!.look, { place: "open plains and a seashore across this section", timeOfDay: "midday through evening" });
add("section-range", "An explicit range including the moment is compatible; neither shore nor evening must apply to this instant.", value);
add("selected-effects", "Source-supported selected no-form manifestation using permitted effects.", manifestation());
value = royal(); value.fields.action = "sits with her hands resting in her lap";
add("situational-pose", "Fixed canon does not fix pose; source sitting and situational hands are compatible.", value);
value = royal(); value.cast.push({ entryId: "guard", name: "Royal guard", hasForm: true }); value.rendering!.look.clothing = "Esther: crimson robe. Royal guard: bronze helmet and linen tunic.";
add("wardrobe-inventory", "A shared wardrobe inventory does not add an unselected guard to this moment.", value);
value = input("The priest shall make the woman drink the water."); Object.assign(value.fields, { primarySubject: "An unnamed priest", action: "offers the cup to the unnamed woman", secondaryElements: "The woman reaches for the cup.", composition: "One view of the priest and woman." });
add("incidental-roles", "Source-supported generic priest/woman are allowed without recurring canon or Aaron substitution.", value);
value = input("The craftsperson examines an idol resting on a bench."); Object.assign(value.fields, { primarySubject: "An unnamed craftsperson with a hand touching an idol on a bench", action: "examines the idol while it rests on the bench", composition: "One view of the craftsperson and idol." });
add("compatible-object", "Touching an object resting on a bench is one compatible support state.", value);
assert.equal(cases.length, 16); assert.equal(cases.filter((c) => c.required.length).length, 9);
for (const c of cases.filter((c) => c.required.length)) {
  c.required[0].quoteFrom = c.id === "look-place" ? c.input.rendering!.look.place
    : c.id === "look-time" ? c.input.rendering!.look.timeOfDay
    : c.id.startsWith("look-") ? c.input.rendering!.look.light
    : c.id === "object-state" ? c.input.fields.secondaryElements : c.input.fields.primarySubject;
}
const flat = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
export function matchesRequired(problem: { kind: string; entryId: string; planQuote: string }, expected: Required) {
  return problem.kind === expected.kind && (expected.entryId === undefined || problem.entryId === expected.entryId)
    && !!flat(problem.planQuote) && (!expected.quoteFrom || flat(expected.quoteFrom).includes(flat(problem.planQuote)));
}
