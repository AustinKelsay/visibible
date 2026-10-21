/** Live packet evidence helper. Only run.mts may supply the normal writable preparation store. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { loadWorkInputs } from "../../../src/lib/engine/work-inputs";
import { assembleForEval, type GenericEvalProvider } from "../../../src/lib/image-evals/generic";
import { createConvexPreparationStore } from "../../../src/lib/engine/preparation";
import { fetchImageModels } from "../../../src/lib/image-models";
import type { TextModel } from "../../../src/lib/reading-pass/model";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export type LiveEnv = { NEXT_PUBLIC_CONVEX_URL: string; OPENROUTER_API_KEY: string; CONVEX_SERVER_SECRET: string };

export async function packetProvider(env: LiveEnv, model: TextModel, writable = false): Promise<GenericEvalProvider> {
  const workId = "bible-web";
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const inputs = await loadWorkInputs(workId, root);
  const status = await client.query(api.analysis.getWorkStatus, { workId });
  if (!status.ready || status.activeGeneration !== 1 || status.workVersion !== inputs.workVersion || status.briefVersion !== inputs.briefVersion) throw new Error("Unexpected work generation or input versions");
  const catalog = await fetchImageModels(env.OPENROUTER_API_KEY);
  const store = createConvexPreparationStore({ query: (ref, args) => client.query(ref as never, args as never), mutation: (ref, args) => client.mutation(ref as never, args as never) }, api.analysis, workId, env.CONVEX_SERVER_SECRET);
  const refuse = async () => { throw new Error("Read-only packet assembly forbids preparation"); };
  const context = {
    inputs,
    store: writable ? store : { ...store, putDerivedRecord: refuse, claim: refuse, release: refuse, recordSpend: refuse },
    listMoments: async () => { throw new Error("Daniel uses fixed verse moments"); },
    getReference: (kind: "sheet" | "styleReference", recordId: string) => client.query(api.analysis.getReference, { workId, kind, recordId }),
    loadReference: async (storageId: string) => {
      const located = await client.query(api.analysis.getReferenceBlobUrl, { serverSecret: env.CONVEX_SERVER_SECRET, storageId: storageId as never });
      if (!located?.url) throw new Error("Reference blob missing");
      const response = await fetch(located.url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Reference HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return new Uint8Array(located.contentType === "image/jpeg" ? bytes : await sharp(bytes).jpeg({ quality: 88 }).toBuffer());
    },
  };
  return { context: async (id) => { if (id !== workId) throw new Error("Daniel-only scope"); return context; }, model, billing: (id) => catalog.models.find((m) => m.id === id)?.billing };
}

export async function assemblePacket(provider: GenericEvalProvider, styleId: string, n: number) {
  const result = await assembleForEval(provider, await provider.context("bible-web"), { workId: "bible-web", unitId: "daniel-7-9", styleId, variationNumber: n > 1 ? n : null, modelId: "google/gemini-3.1-flash-lite-image", aspectRatio: "16:9", resolution: "1K", preparationEstimateUsd: 0.005 });
  if (!result.result.ok) throw new Error(`Assembly rejected: ${result.result.reason}: ${result.result.message}`);
  const a = result.result;
  return { styleId, n, preparationCalls: result.preparationCalls, preparationCostUsd: result.preparationCostUsd, preparationUsageMissing: result.preparationUsageMissing, quote: result.quote, prompt: a.prompt, promptSha256: hash(a.prompt), packet: a.packet, context: a.context, prepared: a.prepared, canon: a.canon, references: a.sentReferences.map((r) => ({ storageId: r.storageId, bytes: r.bytes.length, sha256: hash(r.bytes) })) };
}

export function requirePresence(packet: Awaited<ReturnType<typeof assemblePacket>>) {
  if (!packet.prepared.present.some((p) => p.entryId === "the_ancient_of_days") || !packet.canon.some((c) => c.entryId === "the_ancient_of_days" && c.hasForm === false) || !packet.prompt.includes("FORMLESS SUBJECTS (binding depiction constraints") || !packet.quote || packet.preparationUsageMissing || packet.prompt.length > 8000 || packet.packet.lookVersion !== "1469b2542a3afbf77ed9921c8f727f20" || packet.packet.references.some((r) => r.id.startsWith("the_ancient_of_days:"))) throw new Error("Presence/constraint/owner-look/quote/reference gate failed; no images permitted");
}

export function save(name: string, value: unknown) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
