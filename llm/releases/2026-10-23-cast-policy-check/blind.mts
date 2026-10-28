/** Blind packet: each sample's final and first plan replies plus 40 baseline calibration replies, shuffled, with no version, outcome or role. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { readWorkInputs, momentContext } from "../../../src/lib/engine/work-inputs";
import { planningNeighbors } from "../../../src/lib/engine/scene-grounding";
import { dir, root, json, base, save, hash, mulberry32 } from "./common.mjs";

const fields = ["primarySubject", "action", "setting", "secondaryElements", "mood", "timeOfDay", "composition"] as const;
const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const set = json("sample-set.json"), samples = lines("samples.ndjson"), traces = lines("provider.ndjson"), inputs = await readWorkInputs("bible-web", root);
assert.ok(json("run-finished.json"));
const planTraces = (sampleId: string) => traces.filter((t) => t.phase === sampleId && t.request.response_format.json_schema.name === "scene_plan");
const parse = (trace: { response: { choices: Array<{ message: { content: string } }> } } | undefined) => {
  try { const reply = JSON.parse(trace!.response.choices[0].message.content); return { present: reply.present as string[], scene: Object.fromEntries(fields.map((f) => [f, reply[f]])) as Record<string, string> }; } catch { return null; }
};
/** The first round's plan reply: the attempt that ended round 1 (ok or refused by evidence), after any malformed retry. */
export function firstRound(sample: { spendOutcomes: string[] }) {
  const attempts = sample.spendOutcomes.filter((o) => o.startsWith("plan:") && !o.startsWith("plan:review"));
  const end = attempts.findIndex((o) => o === "plan:ok" || o === "plan:unavailable");
  return { attemptIndex: end, storedWithoutReview: end >= 0 && attempts[end] === "plan:ok" };
}
const rules = inputs.brief.depictionRules.map((r) => r.text);
const items = new Map<string, { packet: Record<string, unknown>; uses: Array<{ sample: string; role: "final" | "first" }>; calibration: string[] }>();
const add = (sample: { id: string; momentId: string; verse: string }, role: "final" | "first", reply: { present: string[]; scene: Record<string, string> } | null) => {
  if (!reply || reply.scene.primarySubject === undefined || !reply.present) return;
  const s = set.samples.find((x: { momentId: string }) => x.momentId === sample.momentId);
  const moment = set.records[`moment:${s.momentId}`].payload, section = set.records[`section:${s.sectionId}`].payload;
  const context = momentContext(inputs.work, { id: s.momentId, firstUnit: moment.firstUnit, lastUnit: moment.lastUnit }, { firstUnit: section.firstUnit, lastUnit: section.lastUnit });
  const neighbors = planningNeighbors(context);
  const packet = { moment: s.momentId, reference: context.moment.reference, text: context.moment.text, previous: neighbors.previous, next: neighbors.next, sectionTitle: section.title,
    sectionCast: (section.cast as Array<{ entryId: string }>).map(({ entryId }) => ({ id: entryId, name: set.records[`entry:${entryId}`].payload.name, hasForm: set.records[`entry:${entryId}`].payload.hasForm !== false })),
    present: reply.present, scene: reply.scene };
  const key = hash(JSON.stringify(packet));
  const item = items.get(key) ?? { packet, uses: [] as Array<{ sample: string; role: "final" | "first" }>, calibration: [] as string[] };
  item.uses.push({ sample: sample.id, role }); items.set(key, item);
};
for (const sample of samples) {
  const plans = planTraces(sample.id);
  add(sample, "final", sample.stored ? { present: sample.stored.payload.entries.map((e: { entryId: string }) => e.entryId), scene: sample.stored.payload.plan } : parse(plans.at(-1)));
  const { attemptIndex } = firstRound(sample);
  if (attemptIndex >= 0) add(sample, "first", parse(plans[attemptIndex]));
}
// Calibration: 40 baseline replies, drawn with the declared seed, scored again blind to measure drift between rounds.
const baseReplies: Array<{ blindId: string } & Record<string, unknown>> = base("blind-replies.json").replies;
const pick = mulberry32(20261024), chosen = new Set<number>();
while (chosen.size < 40) chosen.add(Math.floor(pick() * baseReplies.length));
for (const i of [...chosen].sort((a, b) => a - b)) {
  const { blindId, ...packet } = baseReplies[i];
  const key = hash(JSON.stringify(packet));
  const item = items.get(key) ?? { packet, uses: [] as Array<{ sample: string; role: "final" | "first" }>, calibration: [] as string[] };
  item.calibration.push(blindId); items.set(key, item);
}
const shuffled = [...items.values()];
for (let i = shuffled.length - 1; i > 0; i--) { const j = randomInt(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
const withIds = shuffled.map((item) => ({ ...item, blindId: randomBytes(4).toString("hex") }));
assert.equal(new Set(withIds.map((r) => r.blindId)).size, withIds.length);
save("blind-replies.json", { at: new Date().toISOString(), rubric: json("plan.json").rubric, depictionRules: rules, replies: withIds.map((r) => ({ blindId: r.blindId, ...r.packet })) });
save("blind-key.json", { at: new Date().toISOString(), key: withIds.map((r) => ({ blindId: r.blindId, uses: r.uses, calibration: r.calibration })) });
console.log(JSON.stringify({ replies: withIds.length, samples: samples.length, uses: withIds.reduce((n, r) => n + r.uses.length, 0), calibration: withIds.reduce((n, r) => n + r.calibration.length, 0) }));
