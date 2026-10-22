/** Retained live failure through ordinary planning; scripted replay is not model-obedience evidence. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import { prepareMoment, type AnalysisRecord, type PreparationStore } from "../engine/preparation";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";
import { responseSchema } from "../reading-pass/prompts";

const evidence = new URL("../../../llm/releases/2026-10-22-daniel-structured-candidate/", import.meta.url);
const input = JSON.parse(readFileSync(new URL("plan-input.json", evidence), "utf8"));
const trace = readFileSync(new URL("text-provider.ndjson", evidence), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const retainedContent: string = trace.find((row) => row.phase === "plan").response.choices[0].message.content;
const retainedPlan = JSON.parse(retainedContent);

async function plan(content = retainedContent) {
  const inputs = await readWorkInputs("bible-web");
  const records: AnalysisRecord[] = structuredClone(input.records);
  const requests: TextModelRequest[] = [];
  const write = vi.fn<PreparationStore["putDerivedRecord"]>(async (args) => {
    const version = contentVersion(args.payload);
    records.push({ ...args, version });
    return { version };
  });
  const spend = vi.fn<PreparationStore["recordSpend"]>(async () => {});
  const store: PreparationStore = {
    getActiveRecord: async (kind, id) => records.find((r) => r.kind === kind && r.recordId === id) ?? null,
    putDerivedRecord: write, claim: async () => ({ held: true }), release: async () => {}, recordSpend: spend,
  };
  const model: TextModel = { id: "scripted", complete: async (request) => {
    requests.push(request);
    return { content, model: "scripted", providerRequestId: null, finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }, elapsedMs: 0 };
  } };
  const result = await prepareMoment({ workId: "bible-web", momentId: "daniel-7-9", store, model,
    brief: inputs.brief, briefVersion: inputs.briefVersion, context: input.context, holder: "canon-separation-test" });
  return { result, requests, write, spend };
}

describe("no-form plan and canon separation", () => {
  it("adds explicit placement-only guidance while preserving the exact canon, owner look and source context", async () => {
    const { result, requests } = await plan();
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.user).toBe(input.request.user);
    expect(result.look.version).toBe(input.overlay.frozenLookVersion);
    expect(request.system).toContain("leave its fixed colour, brightness and texture to canon");
    expect(request.system).toContain("Name only the permitted effect needed for this moment's placement or movement");
    expect(request.system).toContain("radiance spreading above the arch");
    expect(request.system).toContain("Situational illumination and formed characters' clothing still belong in the plan when the moment or look requires them");
    expect(input.request.system).not.toContain("leave its fixed colour, brightness and texture to canon");
    const serialized = responseSchema(request.schema);
    const properties = serialized.properties as Record<string, { description: string }>;
    for (const field of ["primarySubject", "action", "secondaryElements"]) {
      expect(properties[field].description).toContain("fixed colour, brightness or texture");
    }
    expect(properties.timeOfDay.description).toContain("situational illumination");
  });

  it("retains the exact schema-valid live restatement without silent rewriting or a semantic retry", async () => {
    const { result, requests, write, spend } = await plan();
    expect(requests).toHaveLength(1);
    expect(requests[0].schema.safeParse(retainedPlan).success).toBe(true);
    expect(result.plan.payload).toEqual(retainedPlan);
    expect(result.plan.payload.primarySubject).toContain("Brilliant white radiance");
    expect(result.plan.payload.primarySubject).toContain("bright orange fire");
    expect(result.present.map((p) => p.entryId)).toEqual(retainedPlan.present);
    expect(write).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledWith(expect.objectContaining({ outcome: "ok", costUsd: 0 }));
  });

  it("keeps situational colors and lighting and formed characters' clothing without a word filter", async () => {
    const situational = { ...retainedPlan,
      primarySubject: "Radiance spreads above an unoccupied seat; Daniel watches from below.",
      secondaryElements: "Daniel's cloak catches the firelight as he turns toward the seat.",
      timeOfDay: "Night; orange firelight falls across the floor near the seat.",
    };
    const { result, requests } = await plan(JSON.stringify(situational));
    expect(requests).toHaveLength(1);
    expect(result.plan.payload).toEqual(situational);
  });
});
