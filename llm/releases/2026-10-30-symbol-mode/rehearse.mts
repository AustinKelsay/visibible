/**
 * Free offline rehearsal of the symbol-mode check: the real assembly over the snapshot in both arms, with a scripted text
 * model that selects each case's entry and no image calls. It proves the arms differ as designed before any money is spent.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { assembleRendering, type AssembleDeps, type ReferenceRecord } from "../../../src/lib/engine/assemble";
import type { AnalysisRecord, PreparationStore } from "../../../src/lib/engine/preparation";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { contentVersion } from "../../../convex/_helpers/contentVersion";
import type { TextModel, TextModelRequest } from "../../../src/lib/reading-pass/model";
import { asSymbol, blobs, hash, json, root, save } from "./common.mjs";

const plan = json("plan.json"), snapshot = json("snapshot.json");
const inputs = await readWorkInputs("bible-web", root);
const symbol = inputs.depiction.modes.symbol!, effects = inputs.depiction.modes.effects!;
assert.ok(symbol && effects);
const rows = [];
for (const arm of plan.arms as Array<{ id: string }>) {
  const records: AnalysisRecord[] = structuredClone(Object.values(snapshot.records as Record<string, AnalysisRecord>));
  if (arm.id === "symbol") for (const id of plan.entries as string[]) {
    const index = records.findIndex((r) => r.kind === "entry" && r.recordId === id);
    const payload = asSymbol(records[index]);
    records[index] = { ...records[index], payload: payload as AnalysisRecord["payload"], version: contentVersion(payload), source: "owner" };
  }
  for (const c of plan.cases as Array<{ id: string; entry: string }>) {
    const requests: TextModelRequest[] = [];
    const model: TextModel = { id: "scripted", complete: async (request) => {
      requests.push(request);
      const value = request.schemaName === "section_look" ? { place: "the place", timeOfDay: "day", weather: "still", light: "clear", clothing: "plain" }
        : request.schemaName === "scene_plan" ? { focusQuote: "the moment", instant: "One instant.", selectedCast: [{ entryId: c.entry, evidence: "named" }],
          primarySubject: "the subject in its place", action: "it waits", setting: "the setting", secondaryElements: "none", mood: "grave", timeOfDay: "day", composition: "wide" }
        : { problems: [] };
      return { content: JSON.stringify(value), model: "scripted", providerRequestId: null, finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 }, elapsedMs: 0 };
    } };
    const store: PreparationStore = {
      getActiveRecord: async (kind, id) => structuredClone(records.find((r) => r.kind === kind && r.recordId === id) ?? null),
      claim: async () => ({ held: true }), release: async () => {}, recordSpend: async () => {},
      putDerivedRecord: async (args) => { const r = { ...structuredClone(args), version: contentVersion(args.payload), source: "generated" } as AnalysisRecord;
        const i = records.findIndex((x) => x.kind === args.kind && x.recordId === args.recordId); if (i < 0) records.push(r); else records[i] = r; return { version: r.version }; },
    };
    for (const style of plan.styles as string[]) {
      const deps: AssembleDeps = { inputs, store, model, listMoments: async () => [],
        getReference: async (kind, recordId) => (snapshot.references[`${kind}:${recordId}`] ?? null) as ReferenceRecord | null,
        loadReference: async (storageId) => new Uint8Array(fs.readFileSync(path.join(blobs, "references", `${storageId}.jpg`))) };
      const assembled = await assembleRendering(deps, { workId: "bible-web", unitId: c.id, styleId: style, variationNumber: null, aspectRatio: plan.image.aspectRatio });
      assert.ok(assembled.ok, `${c.id}/${style}/${arm.id}: ${assembled.ok ? "" : assembled.message}`);
      const entry = assembled.canon.find((x) => x.entryId === c.entry)!;
      const planRequest = requests.find((r) => r.schemaName === "scene_plan")!;
      const row = { key: `${c.id}/${style}/${arm.id}`, depiction: entry.depiction, promptSha256: hash(assembled.prompt), chars: assembled.prompt.length,
        symbolLine: assembled.prompt.includes(symbol.renderBlock), presenceLine: assembled.prompt.includes(effects.renderBlock),
        canonInPrompt: assembled.prompt.includes(entry.text), inRoster: /SELECTED CHARACTERS: [^\n]*/.exec(assembled.prompt)![0].includes(entry.name),
        plannerSymbol: planRequest.system.includes(symbol.planSystem), plannerSeesForm: planRequest.user.includes(`(shown only as its canon form: ${entry.text})`),
        references: assembled.references.map((r) => r.kind === "sheet" ? `sheet:${r.entryId}` : `style:${r.styleId}`) };
      if (arm.id === "symbol") assert.ok(row.depiction === "symbol" && row.symbolLine && row.canonInPrompt && !row.inRoster && row.plannerSymbol && row.plannerSeesForm, `${row.key}: ${JSON.stringify(row)}`);
      else assert.ok(row.depiction === "effects" && !row.symbolLine && !row.canonInPrompt && row.presenceLine && !row.plannerSymbol, `${row.key}: ${JSON.stringify(row)}`);
      rows.push(row);
    }
  }
}
save("offline-rehearsal.json", { at: new Date().toISOString(), samples: rows.length, rows, paidCalls: 0, productionMutations: 0 });
console.log(JSON.stringify({ samples: rows.length, symbol: rows.filter((r) => r.depiction === "symbol").length, effects: rows.filter((r) => r.depiction === "effects").length, maxChars: Math.max(...rows.map((r) => r.chars)) }));
