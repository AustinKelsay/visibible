/** Retained shared-look/presence conflict through real storage and assembly; no model obedience claimed. */
import { withCleanReview } from "../../../tests/fixtures/plan-review";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import schema from "../../../convex/schema";
import { api } from "../../../convex/_generated/api";
import { modules } from "../../../tests/convex/modules";
import { assembleRendering, type AssembleDeps } from "../engine/assemble";
import { createConvexPreparationStore, MOMENT_CAST_PROMPT_VERSION, type AnalysisRecord } from "../engine/preparation";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { withGrounding } from "../../../tests/fixtures/scene-grounding";

const evidence = new URL("../../../llm/releases/2026-10-22-formless-look-evaluation/", import.meta.url);
const snapshot: { records: Array<{ record: AnalysisRecord | null }> } = JSON.parse(readFileSync(new URL("after-10.json", evidence), "utf8"));
const retained = snapshot.records.flatMap(({ record }) => record ? [record] : []);
const SECRET = "m".repeat(40);
const WORK = "bible-web";
const SECTION = "daniel-7-9";
type RecordInput = FunctionArgs<typeof api.analysis.putRecords>["records"][number];

describe("moment cast over shared section context", () => {
  beforeEach(() => { process.env.CONVEX_SERVER_SECRET = SECRET; });

  async function setup(ownerLook = false) {
    const t = convexTest(schema, modules);
    const inputs = await readWorkInputs(WORK);
    const versions = { workVersion: inputs.workVersion, briefVersion: inputs.briefVersion };
    await t.mutation(api.analysis.registerWork, { serverSecret: SECRET, workId: WORK, ...versions });
    const { generation } = await t.mutation(api.analysis.stageGeneration, { serverSecret: SECRET, workId: WORK, ...versions });
    const records = retained.filter((record) => !["look", "plan"].includes(record.kind))
      .map(({ kind, recordId, payload }) => ({ kind, recordId, payload })) as RecordInput[];
    await t.mutation(api.analysis.putRecords, { serverSecret: SECRET, workId: WORK, generation, records });
    await t.mutation(api.analysis.activateGeneration, { serverSecret: SECRET, workId: WORK, generation });
    // Keep the exact historical dependencies: the look is current, but plans lack the new cast contract.
    for (const old of retained.filter((record) => ["look", "plan"].includes(record.kind))) {
      const saved = await t.mutation(api.analysis.putDerivedRecord, { serverSecret: SECRET, workId: WORK,
        kind: old.kind as "look" | "plan", recordId: old.recordId,
        payload: old.payload as FunctionArgs<typeof api.analysis.putDerivedRecord>["payload"], inputs: old.inputs });
      expect(saved.version).toBe(old.version);
    }
    if (ownerLook) {
      await t.mutation(api.analysis.correctRecord, { serverSecret: SECRET, workId: WORK, kind: "look", recordId: SECTION,
        payload: retained.find((record) => record.kind === "look")!.payload as FunctionArgs<typeof api.analysis.correctRecord>["payload"] });
    }
    const client = { query: (ref: unknown, args: unknown) => t.query(ref as never, args as never), mutation: (ref: unknown, args: unknown) => t.mutation(ref as never, args as never) };
    const store = createConvexPreparationStore(client, api.analysis as unknown as Record<string, unknown>, WORK, SECRET);
    const requests: TextModelRequest[] = [];
    const model: TextModel = withCleanReview({ id: "retained-reply", complete: async (request) => {
      requests.push(request);
      if (request.schemaName !== "scene_plan") throw new Error("Current shared look must be reused");
      const old = retained.find((record) => record.kind === "plan" && request.label.startsWith(`plan:${record.recordId}:`));
      if (!old) throw new Error("Unexpected moment");
      const payload = old.payload as unknown as { entries: Array<{ entryId: string }>; plan: Record<string, unknown> };
      // Deliberately overclaimed model assertions expose the limit of exact quote checks.
      const reply = withGrounding({ ...payload.plan, missingCast: [], present: payload.entries.map((entry) => entry.entryId) }, inputs.work.getUnit(old.recordId).text);
      return { content: JSON.stringify(reply),
        model: "retained-reply", providerRequestId: null, finishReason: "stop", elapsedMs: 0,
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 } };
    } });
    const getReference = vi.fn<AssembleDeps["getReference"]>(async (kind, id) => ({
      storageId: `${kind}:${id}`, inputs: [], fingerprint: `ref:${id}`, pinned: true,
    }));
    const render = (unitId = "daniel-7-10", styleId = "classical") => assembleRendering({ inputs, store, model,
      listMoments: async () => [], getReference, loadReference: async () => new Uint8Array([1]) },
    { workId: WORK, unitId, styleId, variationNumber: 1, aspectRatio: "16:9" });
    return { t, requests, render, getReference };
  }

  it.each([false, true])("scopes the retained look to selected characters across styles (owner look: %s)", async (ownerLook) => {
    const { t, requests, render, getReference } = await setup(ownerLook);
    const oldLook = retained.find((record) => record.kind === "look")!;
    const oldPlan = retained.find((record) => record.kind === "plan" && record.recordId === "daniel-7-10")!;
    for (const styleId of ["classical", "watercolor", "icon"]) {
      const result = await render("daniel-7-10", styleId);
      if (!result.ok) throw new Error(result.message);
      expect(result.prepared.calls).toBe(styleId === "classical" ? 2 : 0); // plan and its review, once
      expect(result.packet.lookVersion).toBe(oldLook.version);
      expect(result.packet.planVersion).not.toBe(oldPlan.version); // Same scene prose, new grounding audit.
      expect(result.prepared.look.payload.clothing).toContain("Daniel in his ordinary tunic and cloak");
      expect(result.prompt).toContain(String(oldLook.payload.clothing)); // Never edit or parse away owner prose.
      const selected = result.prompt.split("SELECTED CHARACTERS: ")[1]?.split("\n")[0];
      expect(selected).toBe("The Ancient of Days; Ministering assembly in Daniel's vision");
      expect(selected).not.toContain("Daniel (prophet of Babylon)");
      expect(result.prompt).toContain("The shared look, source narrators and neighbors do not add cast");
      expect(result.prompt).toContain("apply shared clothing only to selected characters");
      expect(result.packet.canon.map((entry) => entry.entryId)).toEqual(["the_ancient_of_days", "ministering_assembly_in_daniels_vision"]);
      for (const entry of result.canon) expect(result.prompt).toContain(entry.text);
      expect(result.references.filter((reference) => reference.kind === "sheet").map((reference) => reference.entryId)).toEqual(["ministering_assembly_in_daniels_vision"]);
      expect(result.packet.budget.finalChars).toBeLessThanOrEqual(8000);
    }
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain("A shared wardrobe, a narrator's viewpoint or a neighboring mention alone does not establish presence");
    expect(requests[0].system).toContain("Neighbors may resolve identity and continuity in the current scene");
    expect(getReference.mock.calls.some(([kind, id]) => kind === "sheet" && id.startsWith("daniel_prophet_of_babylon:"))).toBe(false);
    const look = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "look", recordId: SECTION });
    expect(look).toMatchObject({ source: ownerLook ? "owner" : "generated", payload: oldLook.payload, inputs: oldLook.inputs });
    const plan = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: "daniel-7-10" });
    expect(plan?.inputs).toContainEqual({ kind: "prompt", recordId: "scene_plan_moment_cast", version: MOMENT_CAST_PROMPT_VERSION });
  });

  it("still cannot disprove an incorrectly claimed in-scene interpretation of a real quote", async () => {
    const { t, requests, render } = await setup();
    const result = await render("daniel-7-9");
    if (!result.ok) throw new Error(result.message);
    expect(requests).toHaveLength(1);
    expect(result.prepared.plan.payload.present).toContain("ministering_assembly_in_daniels_vision");
    const old = retained.find((record) => record.kind === "plan" && record.recordId === SECTION)!;
    expect(result.packet.planVersion).not.toBe(old.version);
    const saved = await t.query(api.analysis.getActiveRecord, { workId: WORK, kind: "plan", recordId: SECTION });
    expect(saved?.payload).toMatchObject(old.payload);
    expect(saved?.payload).toHaveProperty("grounding");
    expect(result.context.moment.text).not.toContain("Thousands of thousands");
    expect(result.context.next?.text).toContain("Thousands of thousands");
    await render("daniel-7-9", "icon");
    expect(requests).toHaveLength(1); // No filtering, semantic retry or automatic acceptance decision.
  });
});
