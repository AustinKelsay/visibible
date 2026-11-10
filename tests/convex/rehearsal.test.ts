/**
 * Release rehearsal (#182): the readiness matrix the release checks, and the rollback stance of a paused generic job.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { modules } from "./modules";

const SECRET = "server-only";
const issuer = "https://guest.example";
beforeEach(() => { vi.stubEnv("GUEST_AUTH_ISSUER", issuer); vi.stubEnv("CONVEX_SERVER_SECRET", SECRET); });
afterEach(() => vi.unstubAllEnvs());

describe("readiness matrix", () => {
  it("requires registered inputs, a brief and a complete active analysis read against them, while optional references and attention never gate", async () => {
    const t = convexTest(schema, modules);
    const status = () => t.query(api.analysis.getWorkStatus, { workId: "bible-web" });
    expect(await status()).toMatchObject({ exists: false, ready: false });
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv" });
    expect((await status()).reasons).toEqual(["no approved brief registered", "no active analysis generation"]);
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv", briefVersion: "bv" });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv", briefVersion: "bv" });
    // A cast member without a canon stage is structurally incomplete: activation is refused and the work stays not ready.
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: "bible-web", generation, records: [
      { kind: "entry", recordId: "adam", payload: { kind: "entry", name: "Adam", entryKind: "character", stages: [] } },
      { kind: "section", recordId: "genesis-1-1", payload: { kind: "section", title: "Creation", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1", era: "creation", cast: [{ entryId: "adam", stageId: "main" }] } },
      { kind: "moment", recordId: "genesis-1-1", payload: { kind: "moment", sectionId: "genesis-1-1", firstUnit: "genesis-1-1", lastUnit: "genesis-1-1" } },
    ] });
    await expect(t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: "bible-web", generation })).rejects.toThrow();
    expect((await status()).ready).toBe(false);
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: "bible-web", generation, records: [
      { kind: "entry", recordId: "adam", payload: { kind: "entry", name: "Adam", entryKind: "character", hasForm: true, stages: [{ id: "main", text: "Adam: young." }] } },
    ] });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: "bible-web", generation });
    expect((await status()).ready).toBe(true);
    // A failed sheet and an open report are ordinary attention, not gates.
    await t.mutation(api.analysis.noteAttention, { serverSecret: SECRET, workId: "bible-web", reason: "sheet_failed", kind: "sheet", recordId: "adam:main" });
    expect((await status()).ready).toBe(true);
    // Deploying a changed brief without a reread makes the work not ready again; rollback keeps the old analysis serving to replays.
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: "bible-web", workVersion: "wv", briefVersion: "bv2" });
    expect((await status()).reasons).toEqual(["active generation was read against brief bv, deployed is bv2"]);
    expect(await t.query(api.analysis.getActiveRecord, { workId: "bible-web", kind: "moment", recordId: "genesis-1-1" })).not.toBeNull();
  });
});
