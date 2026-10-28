/** Builds the blind scoring packet: shuffled samples with no outcome, rounds, review problems or grounding audit. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { dir, json, save, row } from "./inspect.mjs";

const fields = ["primarySubject", "action", "setting", "secondaryElements", "mood", "timeOfDay", "composition"] as const;
const lines = (name: string) => fs.readFileSync(path.join(dir, name), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const samples = lines("samples.ndjson"), traces = lines("provider.ndjson"), snapshot = json("snapshot.json"), dry = json("dry-run.json");
assert.ok(json("run-finished.json"));
const castNames = (sectionId: string) => (row(snapshot, "section", sectionId)!.payload.cast as Array<{ entryId: string }>).map(({ entryId }) => ({ id: entryId, name: String(row(snapshot, "entry", entryId)!.payload.name) }));

const replies = samples.map((sample) => {
  // A stored plan is exactly what rendering would receive; a refused reply is scored from its own last provider reply.
  let scene: Record<string, string> | null = null, present: string[] | null = null;
  if (sample.stored) { scene = sample.stored.payload.plan; present = sample.stored.payload.entries.map((e: { entryId: string }) => e.entryId); }
  else {
    // The last plan reply, not a review reply.
    const last = traces.filter((t) => t.phase === sample.id && t.request.response_format.json_schema.name === "scene_plan").at(-1);
    try { const reply = JSON.parse(last.response.choices[0].message.content); scene = Object.fromEntries(fields.map((f) => [f, reply[f]])); present = reply.present; } catch { /* unparseable reply: nothing to score */ }
  }
  const moment = row(snapshot, "moment", sample.unit)!;
  const user: string = dry.requests[sample.unit].user;
  const neighbor = (label: string) => user.match(new RegExp(`\\n${label}: (.*)`))?.[1] ?? null;
  return { sample, packet: { moment: sample.unit, reference: user.match(/MOMENT \(([^)]+)\)/)?.[1], text: user.match(/MOMENT \([^)]+\): (.*)/)?.[1], previous: neighbor("PREVIOUS"), next: neighbor("NEXT"),
    sectionCast: castNames(String(moment.payload.sectionId)), present, scene } };
});
// Fisher–Yates shuffle with random identifiers; the key is written separately and not read until scoring ends.
for (let i = replies.length - 1; i > 0; i--) { const j = randomInt(i + 1); [replies[i], replies[j]] = [replies[j], replies[i]]; }
const withIds = replies.map((r) => ({ ...r, blindId: randomBytes(4).toString("hex") }));
assert.equal(new Set(withIds.map((r) => r.blindId)).size, withIds.length);
save("blind-replies.json", { at: new Date().toISOString(), rubric: json("plan.json").rubric, replies: withIds.map((r) => ({ blindId: r.blindId, ...r.packet })) });
save("blind-key.json", { at: new Date().toISOString(), key: withIds.map((r) => ({ blindId: r.blindId, sample: r.sample.id, unit: r.sample.unit, outcome: r.sample.outcome, rounds: r.sample.stored?.payload.review?.rounds ?? null })) });
console.log(JSON.stringify({ replies: withIds.length, scorable: withIds.filter((r) => r.packet.scene).length }));
