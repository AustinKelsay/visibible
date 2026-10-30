/**
 * Deterministic replay of reference choice (ADR 0009) on the A/B's own plans: which sheets the old fixed order
 * (first character, first place, second character) and the ranked order would send, given the sheets production holds.
 * No model call or production read.   npx tsx llm/releases/2026-10-29-section-place-check/replay.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectReferences, type AvailableReference, type SelectedCanon } from "../../../src/lib/engine/prompt";

const dir = path.dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, "../2026-10-28-fresco-matrix/snapshot.json"), "utf8"));
const available: AvailableReference[] = Object.entries(snapshot.references as Record<string, { storageId: string; fingerprint: string } | null>).flatMap(([key, record]): AvailableReference[] => {
  if (!record) return [];
  const [kind, id, stageId] = key.split(":");
  return kind === "styleReference" ? [{ kind: "styleReference" as const, styleId: id, storageId: record.storageId, version: record.fingerprint }]
    : [{ kind: "sheet" as const, entryId: id, stageId, storageId: record.storageId, version: record.fingerprint }];
});
const oldOrder = (canon: SelectedCanon[]) => {
  const formed = canon.filter((c) => c.hasForm), characters = formed.filter((c) => c.kind === "character"), locations = formed.filter((c) => c.kind === "location");
  const picked = available.filter((r) => r.kind === "styleReference" && r.styleId === "classical");
  for (const entry of [characters[0], locations[0], characters[1]].filter(Boolean)) {
    const sheet = available.find((r) => r.kind === "sheet" && r.entryId === entry.entryId && r.stageId === entry.stageId);
    if (sheet && picked.length < 3) picked.push(sheet);
  }
  return picked;
};
const id = (r: AvailableReference) => (r.kind === "sheet" ? r.entryId : `style:${r.styleId}`);
const changed: string[] = [];
for (const arm of ["arm-a", "arm-b", "arm-c"]) {
  for (const line of fs.readFileSync(path.join(dir, `results-${arm}.ndjson`), "utf8").trim().split("\n")) {
    const row = JSON.parse(line);
    if (row.outcome !== "image") continue;
    const entries = snapshot.records as Record<string, { payload: { name: string; entryKind: SelectedCanon["kind"]; hasForm?: boolean; stages: Array<{ id: string; text: string }> } }>;
    const canon: SelectedCanon[] = row.prepared.present.map((p: { entryId: string; stageId: string }) => {
      const entry = entries[`entry:${p.entryId}`].payload, stage = entry.stages.find((s) => s.id === p.stageId)!;
      return { entryId: p.entryId, stageId: p.stageId, kind: entry.entryKind, name: entry.name, text: stage.text, hasForm: entry.hasForm !== false, version: "" };
    });
    const before = oldOrder(canon).map(id), after = selectReferences(canon, available, "classical", row.prepared.plan).map((r) => id(r));
    if (before.join() !== after.join()) changed.push(`${row.case} (${arm}): fixed order sends ${before.join(", ")}; ranked order sends ${after.join(", ")}`);
  }
}
console.log(changed.length ? changed.join("\n") : "No plan changes which sheets are sent.");
