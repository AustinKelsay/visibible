/** Replay the exact proposed correction over real Convex mutations, with no network or model. */
import { it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { createCorrections } from "../../../src/lib/engine/corrections";
import { candidate, row } from "./correction.mjs";
import { json, root } from "./inspect.mjs";

it.skipIf(process.env.LUKE_CAST_REPAIR_REPLAY !== "1")("applies the nine source-checked identities with version preconditions, retaining original frame cast and histories", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("Offline correction replay forbids network"));
  const secret = "luke-offline-fixture-".repeat(3);
  vi.stubEnv("CONVEX_SERVER_SECRET", secret);
  try {
    const before = json("preflight.json"), proposed = await candidate();
    expect(proposed).toEqual(json("candidate.json"));
    const inputs = await readWorkInputs("bible-web", root), t = convexTest(schema, modules);
    const auth = { workId: "bible-web", serverSecret: secret };
    await t.mutation(api.analysis.registerWork, { ...auth, workVersion: inputs.workVersion, briefVersion: inputs.briefVersion });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { ...auth, workVersion: inputs.workVersion, briefVersion: inputs.briefVersion });
    await t.mutation(api.analysis.putRecords, { ...auth, generation, records: before.records.flatMap((r: { record: { kind: string; recordId: string; payload: unknown; inputs: unknown[] } | null }) => r.record ? [{ kind: r.record.kind, recordId: r.record.recordId, payload: r.record.payload, inputs: r.record.inputs }] : []) as never });
    await t.mutation(api.analysis.activateGeneration, { ...auth, generation });
    const active = (kind: "entry" | "section", recordId: string) => t.query(api.analysis.getActiveRecord, { workId: auth.workId, kind, recordId });
    const client = { query: (ref: never, args: never) => t.query(ref, args), mutation: (ref: never, args: never) => t.mutation(ref, args) };
    const corrections = createCorrections(client as never, api.analysis as never, auth.workId, secret, "https://offline.test");
    const first = proposed.additions[0];
    await expect(corrections.addCastEntry({ ...first, expectedSectionVersion: "stale" }, inputs)).rejects.toThrow(/Stale edit/);
    await expect(corrections.addCastEntry({ ...first, entry: { ...first.entry, stages: [{ ...first.entry.stages[0], quotes: [{ unit: "luke-10-30", quote: "not in the source" }] }] } }, inputs)).rejects.toThrow(/does not match/);
    expect(await active("entry", first.entryId)).toBeNull();
    expect((await active("section", "luke-10-25"))?.version).toBe(row(before, "section", "luke-10-25")!.version);
    const samaritan = proposed.entries[0];
    await t.mutation(api.analysis.correctRecord, { ...auth, kind: "entry", recordId: samaritan.id, expectedVersion: proposed.samaritanExpectedVersion, payload: samaritan.payload });
    for (const addition of proposed.additions) await corrections.addCastEntry(addition, inputs);
    await t.mutation(api.analysis.correctRecord, { ...auth, kind: "section", recordId: "luke-10-25", expectedVersion: proposed.finalSectionExpectedVersion, payload: proposed.finalSection as never });
    const section = await active("section", "luke-10-25");
    expect(section?.payload).toEqual(proposed.finalSection); expect(section?.version).toBe(proposed.finalSectionVersion);
    expect(proposed.finalSection.cast).toEqual(expect.arrayContaining(row(before, "section", "luke-10-25")!.payload.cast as unknown[]));
    for (const entry of proposed.entries) expect((await active("entry", entry.id))?.payload).toEqual(entry.payload);
    const history = await t.query(api.analysis.listRecordHistory, { workId: auth.workId, kind: "section", recordId: "luke-10-25" });
    expect(history).toHaveLength(10);
    expect(history).toContainEqual(expect.objectContaining({ version: row(before, "section", "luke-10-25")!.version, status: "superseded" }));
    expect((await t.query(api.analysis.getWorkStatus, { workId: auth.workId })).ready).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); vi.unstubAllEnvs(); }
});
