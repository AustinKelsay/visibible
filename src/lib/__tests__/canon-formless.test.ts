import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonOutputSchema, checkCanon, draftCanonEntry, CANON_PROMPT_VERSION } from "../reading-pass/canon";
import { responseSchema } from "../reading-pass/prompts";
import { readWorkInputs } from "../engine/work-inputs";
import type { TextModel, TextModelRequest } from "../reading-pass/model";

// The exact failed provider output, not a cleaned-up approximation of its stage paragraph.
const evidence = new URL("../../../llm/releases/2026-10-22-daniel-context-candidate/", import.meta.url);
const input = JSON.parse(readFileSync(new URL("draft-input.json", evidence), "utf8"));
const trace = JSON.parse(readFileSync(new URL("text-provider.ndjson", evidence), "utf8").trim());
const rejected = JSON.parse(trace.response.choices[0].message.content);
const showing = [{ effect: "radiance", colour: "white", brightness: "brilliant" },
  { effect: "fire", colour: "unspecified", brightness: "bright" }];
const candidate = () => {
  const output = structuredClone(rejected);
  delete output.stages[0].text;
  output.stages[0].showing = structuredClone(showing);
  return output;
};
function modelFor(answers: unknown[]): TextModel & { calls: TextModelRequest[] } {
  const calls: TextModelRequest[] = [];
  return { id: "controlled", calls, async complete(request) {
    calls.push(request);
    const answer = answers[calls.length - 1];
    if (!answer) throw new Error("Unexpected additional attempt");
    return { content: JSON.stringify(answer), model: "controlled", providerRequestId: null, finishReason: "stop",
      usage: { costUsd: 0, promptTokens: 0, completionTokens: 0 }, elapsedMs: 0 };
  } };
}

describe("structured no-form canon", () => {
  it("rejects the retained free-prose failure and compiles positive effects after the normal structural retry", async () => {
    const inputs = await readWorkInputs("bible-web");
    const before = JSON.stringify({ source: inputs.work.work, brief: inputs.brief, rejected });
    expect(canonOutputSchema.safeParse(rejected).success).toBe(false);
    expect(() => checkCanon(inputs.work, input.entry, rejected, input.request.sectionIds)).toThrow(/structured showing/);
    const model = modelFor([rejected, candidate()]);
    const result = await draftCanonEntry({ ...input, work: inputs.work, brief: inputs.brief, model });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].user).toContain("previous answer was not valid JSON for the schema");
    expect(model.calls[1].user).toContain("has_form false requires structured showing");
    expect(result).toMatchObject({ hasForm: false, promptVersion: CANON_PROMPT_VERSION, attempts: 2, problems: [],
      appearanceFromText: rejected.appearance_from_text, sectionStages: { "daniel-7-9": rejected.stages[0].id } });
    expect(result.stages[0].text).toBe("The Ancient of Days: brilliant white radiance; bright fire.");
    expect(result.stages[0].showing).toEqual(showing);
    expect(result.stages[0].quotes).toEqual(rejected.stages[0].quotes);
    expect(result.stages[0].quotes[0].quote).toContain("clothing was white as snow");
    expect(JSON.stringify({ source: inputs.work.work, brief: inputs.brief, rejected })).toBe(before);
  });

  it("fails after two invalid representations rather than falling back to a legacy no-form paragraph", async () => {
    const inputs = await readWorkInputs("bible-web");
    const model = modelFor([rejected, rejected]);
    await expect(draftCanonEntry({ ...input, work: inputs.work, brief: inputs.brief, model })).rejects.toThrow("could not be drafted");
    expect(model.calls).toHaveLength(2);
  });

  it("rejects free text, unknown effects/qualities, empty or excessive selections and mismatched form representations", () => {
    const mutations = [
      (s: ReturnType<typeof candidate>) => { s.stages[0].text = rejected.stages[0].text; },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing[0].effect = "enthroned"; },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing[0].colour = "white as snow and wool"; },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing[0].brightness = "no human face or body"; },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing[0].text = "white clothing"; },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing = []; },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing = Array(6).fill(showing[0]); },
      (s: ReturnType<typeof candidate>) => { s.has_form = true; },
      (s: ReturnType<typeof candidate>) => { s.stages.push(structuredClone(rejected.stages[0])); },
      (s: ReturnType<typeof candidate>) => { s.stages[0].showing = [{ effect: "voice", colour: "white", brightness: "bright" }]; },
    ];
    for (const mutate of mutations) {
      const output = candidate();
      mutate(output);
      expect(canonOutputSchema.safeParse(output).success).toBe(false);
    }
  });

  it("supports visual and unseen effects for other works, leaving formed descriptions as prose", async () => {
    const inputs = await readWorkInputs("bible-web");
    const output = candidate();
    output.stages[0].showing = [{ effect: "voice" }, { effect: "wind" }, { effect: "unseen presence" },
      { effect: "mist", colour: "blue", brightness: "soft" }, { effect: "light", colour: "unspecified", brightness: "unspecified" }];
    const entry = { ...input.entry, id: "echo", name: "Echo", readingKind: "other" };
    const result = checkCanon(inputs.work, entry, output, []);
    expect(result.stages[0].text).toBe("Echo: voice; wind; unseen presence; soft blue mist; light.");
    const formed = structuredClone(rejected);
    formed.has_form = true;
    formed.stages[0].text = "The King: wool robes, white hair and a gold crown.";
    expect(checkCanon(inputs.work, entry, formed, []).stages[0].text).toBe(formed.stages[0].text);
  });

  it("emits a strict object provider schema with closed effects and no prose in the no-form stage alternative", () => {
    const schema = responseSchema(canonOutputSchema);
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    const properties = schema.properties as Record<string, { items: { anyOf: Array<{ properties: Record<string, unknown>; additionalProperties: boolean }> } }>;
    const alternatives = properties.stages.items.anyOf;
    expect(alternatives).toHaveLength(2);
    expect(alternatives.every((s) => s.additionalProperties === false)).toBe(true);
    const noForm = alternatives.find((s) => "showing" in s.properties)!;
    expect(noForm.properties).not.toHaveProperty("text");
    expect(noForm.properties.showing).toMatchObject({ minItems: 1, maxItems: 5 });
    expect(JSON.stringify(noForm)).toContain('"enum":["light","radiance","cloud","mist","fire"]');
  });
});
