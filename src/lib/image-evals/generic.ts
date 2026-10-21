/**
 * The generic-engine arm of the evaluation harness (#181): one sample rendered through the same
 * assembly the request engine uses (assembleRendering), with the owner-funded look and plan spend
 * recorded separately from the image, the exact packet and prompt retained, the quote the route
 * would make compared with the provider's reported usage, and prepared (look and plan already
 * present) told apart from cold samples.
 */
import type { ImageBilling } from "../image-catalog";
import type { TextModel } from "../reading-pass/model";
import { assembleRendering, type AssembleDeps, type AssembleFailure, type AssembleSuccess } from "../engine/assemble";
import type { PreparationStore } from "../engine/preparation";
import { quoteGenericImage, type GenericImageQuote } from "../engine/quote";
import type { ArtStyle } from "../work-preparation";
import type { WorkInputs } from "../engine/work-inputs";

export type GenericEvalContext = {
  inputs: WorkInputs;
  store: PreparationStore;
  listMoments: AssembleDeps["listMoments"];
  getReference: AssembleDeps["getReference"];
  loadReference: AssembleDeps["loadReference"];
};

export interface GenericEvalProvider {
  /** The work's inputs and analysis, per work id. */
  context(workId: string): Promise<GenericEvalContext>;
  /** The text model for looks and plans; its spend is owner preparation spend. */
  model: TextModel;
  /** The image model's billing for the quote the route would make; undefined leaves the quote unpriced. */
  billing(modelId: string): ImageBilling | undefined;
  /** Owner-authored style trials by id, used instead of the library style of the same id. */
  styleTrials?: Record<string, { style: ArtStyle; version: string }>;
}

export const genericArm = (styleId: string) => `generic:${styleId}`;
export const isGenericArm = (arm: string) => arm.startsWith("generic:");
export const genericStyleOf = (arm: string) => (isGenericArm(arm) ? arm.slice("generic:".length) : null);

export type GenericAssembly = {
  result: AssembleSuccess | AssembleFailure;
  preparationCalls: number;
  preparationCostUsd: number;
  /** Provider usage was missing for at least one preparation call; the estimate was charged. */
  preparationUsageMissing: boolean;
  quote: GenericImageQuote | null;
};

/** Assemble one moment for one style, counting the preparation calls this sample caused. */
export async function assembleForEval(provider: GenericEvalProvider, ctx: GenericEvalContext, input: { workId: string; unitId: string; styleId: string; variationNumber: number | null; aspectRatio: "16:9" | "21:9" | "3:2"; modelId: string; resolution: "1K" | "2K" | "4K"; preparationEstimateUsd: number; omitStyleReference?: boolean; now?: () => number }): Promise<GenericAssembly> {
  let preparationCalls = 0;
  let preparationCostUsd = 0;
  let preparationUsageMissing = false;
  // Spend is recorded through the store; wrapping it attributes this sample's calls without touching the shared ledger's shape.
  const store: PreparationStore = {
    ...ctx.store,
    getActiveRecord: (kind, recordId) => ctx.store.getActiveRecord(kind, recordId),
    putDerivedRecord: (args) => ctx.store.putDerivedRecord(args),
    claim: (kind, recordId, holder, ttlMs) => ctx.store.claim(kind, recordId, holder, ttlMs),
    release: (kind, recordId, holder) => ctx.store.release(kind, recordId, holder),
    recordSpend: async (entry) => {
      preparationCalls++;
      if (entry.costUsd === null) { preparationUsageMissing = true; preparationCostUsd += input.preparationEstimateUsd; } else preparationCostUsd += entry.costUsd;
      await ctx.store.recordSpend(entry);
    },
  };
  const result = await assembleRendering({
    inputs: ctx.inputs, store, listMoments: ctx.listMoments, getReference: ctx.getReference, loadReference: ctx.loadReference, model: provider.model, now: input.now,
    styleOverride: provider.styleTrials?.[input.styleId],
    omitStyleReference: input.omitStyleReference,
  }, { workId: input.workId, unitId: input.unitId, styleId: input.styleId, variationNumber: input.variationNumber, aspectRatio: input.aspectRatio });
  const quote = result.ok ? quoteGenericImage({ modelId: input.modelId, billing: provider.billing(input.modelId), resolution: input.resolution, promptChars: result.prompt.length, referenceImages: result.sentReferences.length }) : null;
  return { result, preparationCalls, preparationCostUsd, preparationUsageMissing, quote };
}
