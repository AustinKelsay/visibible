/**
 * The exact image requests the request path assembles for a few suite moments of each work, from the committed suite
 * snapshot (ADR 0011, ADR 0012). A change to the prompt, the profiles, a brief or a style shows here, work by work.
 * After an intended change: UPDATE_LEAN_GOLDEN=1 npx vitest run src/lib/__tests__/lean-engine-golden.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleLean, type ReferenceRecord } from "../engine/lean-assemble";
import { readWorkInputs } from "../engine/work-inputs";

const SNAPSHOT = "llm/releases/2026-11-07-suite-v3-text/snapshot.json";
const GOLDEN = "tests/fixtures/lean-engine-golden.json";
const CASES = [
  { work: "bible-web", unitId: "genesis-1-3", style: "classical" },
  { work: "bible-web", unitId: "daniel-7-9", style: "watercolor" },
  { work: "bible-web", unitId: "matthew-27-35", style: "fresco" },
  { work: "holmes-adventures", unitId: "the-red-headed-league-1", style: "classical" },
  { work: "alice-in-wonderland", unitId: "the-queens-croquet-ground-49", style: "watercolor" },
];

type Snapshot = { works: Record<string, { records: Record<string, { recordId: string; kind: string; version: string; payload: Record<string, unknown> & { kind: string } }>; references: Record<string, ReferenceRecord | null> }> };

async function assembleCase(snap: Snapshot, c: (typeof CASES)[number]) {
  const w = snap.works[c.work];
  const result = await assembleLean({
    inputs: await readWorkInputs(c.work),
    getRecord: async (kind, recordId) => w.records[`${kind}:${recordId}`] ?? null,
    listMoments: async () => Object.values(w.records).filter((r) => r.kind === "moment").map((r) => ({ id: r.recordId, firstUnit: String(r.payload.firstUnit), lastUnit: String(r.payload.lastUnit) })),
    getReference: async (kind, recordId) => w.references[`${kind}:${recordId}`] ?? null,
    loadReference: async (storageId) => new TextEncoder().encode(storageId),
  }, { workId: c.work, unitId: c.unitId, styleId: c.style, aspectRatio: "16:9" });
  if (!result.ok) throw new Error(`${c.work}/${c.unitId}: ${result.message}`);
  const { promptVersion, momentId, sectionId, eraId, styleId, canon, references } = result.packet;
  return { promptVersion, momentId, sectionId, eraId, styleId, canon: canon.map((m) => `${m.entryId}:${m.stageId}`), references: references.map((r) => `${r.kind}:${r.id}`), prompt: result.prompt };
}

describe("the lean engine's exact requests", () => {
  it("builds the committed prompt and references for each work's golden moments", async () => {
    const snap = JSON.parse(readFileSync(path.join(process.cwd(), SNAPSHOT), "utf8")) as Snapshot;
    const actual: Record<string, Awaited<ReturnType<typeof assembleCase>>> = {};
    for (const c of CASES) actual[`${c.work}/${c.unitId}/${c.style}`] = await assembleCase(snap, c);
    const file = path.join(process.cwd(), GOLDEN);
    if (process.env.UPDATE_LEAN_GOLDEN === "1") writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    expect(actual).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });
});
