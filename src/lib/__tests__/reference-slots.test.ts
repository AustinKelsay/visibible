/**
 * Reference slots at the assembly seam (ADR 0009): sheets are fetched in the packet's ranked order, a candidate without a
 * current sheet passes its slot to the next one, and no further reference is read once the slots are full.
 */
import { describe, it, expect, vi } from "vitest";
import { withCleanReview } from "../../../tests/fixtures/plan-review";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";
import { assembleRendering, type ReferenceRecord } from "../engine/assemble";
import { createMemoryPreparationStore } from "../engine/memory-store";
import type { WorkInputs } from "../engine/work-inputs";
import { createWorkReader } from "../work-input";
import { SHARED_STYLES, type WorkBrief } from "../work-preparation";
import type { TextModel } from "../reading-pass/model";
import { testDepiction } from "../../../tests/fixtures/depiction";

const work = createWorkReader({
  schemaVersion: 1, id: "camp", title: "The Camp", author: "Fixture", language: "en",
  referenceText: { name: "Fixture edition", source: "https://example.com", credit: "Test", sha256: "0".repeat(64) },
  levels: ["Book", "Chapter", "Verse"], referenceFormats: { Chapter: "{Book} {Chapter}:{Verse}" }, momentMode: "unit",
  divisions: [{ key: "camp", label: "Camp", level: "Book", divisions: [{ key: "1", label: "1", level: "Chapter", units: [{ number: 1, text: "Moses raised his staff over the sea while Aaron watched." }] }] }],
});
const brief: WorkBrief = {
  schemaVersion: 1, workId: "camp", tone: "Plain.", depictionRules: [],
  eras: [{ id: "desert", label: "Desert", people: "Herders.", dress: "Wool.", buildingsAndObjects: "Tents.", technology: "Staffs." }], styleIds: ["classical"],
};
const inputs: WorkInputs = { work, workVersion: "wv", brief, briefVersion: "bv", depiction: testDepiction("camp"), styles: { classical: { style: SHARED_STYLES.get("classical"), version: "sv-classical" } } };
const entry = (recordId: string, name: string, entryKind: "character" | "location", text: string) =>
  ({ kind: "entry", recordId, payload: { kind: "entry", name, entryKind, hasForm: true, stages: [{ id: "main", text }] } });
const records = [
  entry("aaron", "Aaron, brother of Moses", "character", "Aaron: an old priest."),
  entry("moses", "Moses", "character", "Moses: an old prophet with a staff."),
  entry("sea", "The sea", "location", "The sea: a wide grey water."),
  { kind: "section", recordId: "camp-1-1", payload: { kind: "section", title: "At the sea", firstUnit: "camp-1-1", lastUnit: "camp-1-1", era: "desert",
    cast: ["aaron", "moses", "sea"].map((entryId) => ({ entryId, stageId: "main" })) } },
  { kind: "moment", recordId: "camp-1-1", payload: { kind: "moment", sectionId: "camp-1-1", firstUnit: "camp-1-1", lastUnit: "camp-1-1" } },
];
// The planner lists Aaron first, but the primary subject is Moses.
const plan = { present: ["aaron", "moses", "sea"], primarySubject: "Moses raising his staff", action: "Aaron watches from behind", setting: "the shore",
  secondaryElements: "the camp", mood: "tense", timeOfDay: "night", composition: "wide" };
const look = { place: "A shore of a wide sea below desert cliffs", timeOfDay: "night", weather: "wind", light: "moonlight", clothing: "wool cloaks" };

function setup(references: Record<string, ReferenceRecord | null>) {
  const memory = createMemoryPreparationStore(records);
  const model: TextModel = withCleanReview({ id: "scripted", async complete(request) {
    const value = request.schemaName === "section_look" ? look : withGrounding(plan, work.getUnit("camp-1-1").text);
    return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 }, elapsedMs: 0 };
  } });
  const getReference = vi.fn(async (kind: "sheet" | "styleReference", id: string) => references[`${kind}:${id}`] ?? null);
  const loadReference = vi.fn(async (storageId: string) => new TextEncoder().encode(storageId));
  const skipped: string[] = [];
  const render = () => assembleRendering({ inputs, store: memory.store, model, listMoments: memory.listMoments, getReference, loadReference,
    onReferenceSkipped: (kind, id, reason) => skipped.push(`${kind}:${id}:${reason}`) },
  { workId: "camp", unitId: "camp-1-1", styleId: "classical", variationNumber: null, aspectRatio: "16:9" });
  return { render, getReference, loadReference, skipped };
}
const pinned = (storageId: string): ReferenceRecord => ({ storageId, inputs: [], fingerprint: `f-${storageId}`, pinned: true });
const stale = (storageId: string): ReferenceRecord => ({ storageId, inputs: [{ kind: "entry", recordId: "sea", version: "old" }], fingerprint: `f-${storageId}`, pinned: false });

describe("reference slots at assembly", () => {
  it("reads sheets in ranked order and passes a missing or stale candidate's slot to the next", async () => {
    const { render, getReference, loadReference, skipped } = setup({ "styleReference:classical": pinned("st"), "sheet:moses:main": pinned("sh-moses"), "sheet:sea:main": stale("sh-sea") });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    // Moses first (the primary subject names him), then the place, then Aaron, though the plan listed Aaron first.
    expect(getReference.mock.calls.map(([kind, id]) => `${kind}:${id}`)).toEqual(["styleReference:classical", "sheet:moses:main", "sheet:sea:main", "sheet:aaron:main"]);
    expect(skipped).toEqual(["sheet:sea:main:stale", "sheet:aaron:main:missing"]);
    expect(result.packet.references.map((r) => r.id)).toEqual(["classical", "moses:main"]);
    expect(loadReference.mock.calls.map(([id]) => id)).toEqual(["st", "sh-moses"]);
    expect(result.sentReferences.map((r) => r.storageId)).toEqual(["st", "sh-moses"]);
  });

  it("stops reading references once the slots are full", async () => {
    const { render, getReference } = setup({ "styleReference:classical": pinned("st"), "sheet:moses:main": pinned("sh-moses"), "sheet:sea:main": pinned("sh-sea"), "sheet:aaron:main": pinned("sh-aaron") });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(result.packet.references.map((r) => r.id)).toEqual(["classical", "moses:main", "sea:main"]);
    expect(getReference.mock.calls.map(([, id]) => id)).toEqual(["classical", "moses:main", "sea:main"]);
  });

  it("gives a third sheet slot to Aaron when there is no style reference", async () => {
    const { render } = setup({ "sheet:moses:main": pinned("sh-moses"), "sheet:sea:main": pinned("sh-sea"), "sheet:aaron:main": pinned("sh-aaron") });
    const result = await render();
    if (!result.ok) throw new Error(result.message);
    expect(result.packet.references.map((r) => r.id)).toEqual(["moses:main", "sea:main", "aaron:main"]);
  });
});
