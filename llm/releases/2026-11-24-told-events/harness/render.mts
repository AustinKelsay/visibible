/** Renders v7 prompts on Nano Banana 2.1 like production (16:9, 1K, references as JPEG). Stops if the next call could pass the cap. */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { createOpenRouterEvalImageProvider } from "@/lib/image-evals/adapters";

const here = path.dirname(new URL(import.meta.url).pathname);
const units = process.argv[2].split(",");
const CAP = 0.50, PER_IMAGE_CEILING = 0.06;
const ledgerFile = path.join(here, "ledger.ndjson");
const spent = () => readFileSync(ledgerFile, "utf8").trim().split("\n").reduce((s, l) => s + (JSON.parse(l).cost ?? 0), 0);
const key = readFileSync(path.join(process.env.HOME!, ".config/fragment/secrets/openrouter-dev-key"), "utf8").trim();
const provider = createOpenRouterEvalImageProvider({ apiKey: key });
const cases = JSON.parse(readFileSync(path.join(here, "prompts-v7-refs.json"), "utf8")) as Array<{ unit: string; prompt: string; refs: string[] }>;
for (const unit of units) {
  if (spent() + PER_IMAGE_CEILING > CAP) { console.log(`stop before ${unit}: spent $${spent().toFixed(4)}`); break; }
  const c = cases.find((x) => x.unit === unit)!;
  const r = await provider.generate({
    model: "google/gemini-nano-banana-2.1", prompt: c.prompt, aspectRatio: "16:9", resolution: "1K",
    references: c.refs.map((id) => ({ mimeType: "image/jpeg", bytes: new Uint8Array(readFileSync(path.join(here, "refs", `${id}.bin`))) })),
  } as never);
  writeFileSync(path.join(here, `after-${unit}.jpg`), r.bytes);
  appendFileSync(ledgerFile, JSON.stringify({ at: new Date().toISOString(), model: "google/gemini-nano-banana-2.1", unit, variant: "v7-image", cost: r.costUsd ?? PER_IMAGE_CEILING }) + "\n");
  console.log(unit, r.costUsd, `total $${spent().toFixed(4)}`);
}
