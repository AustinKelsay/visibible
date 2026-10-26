/** Public catalog only; no credentials, paid request or production access. Capture once before freeze. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";
import { dir, save } from "./common.mjs";
assert.ok(!fs.existsSync(path.join(dir, "run-started.json")));
const response = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(response.ok);
const pricing = (await response.json()).data.find((m: { id: string }) => m.id === READING_PASS_MODEL);
assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
save("pricing.json", { at: new Date().toISOString(), catalogUrl: "https://openrouter.ai/api/v1/models", pricing, paidCalls: 0, productionQueries: 0, productionMutations: 0 });
console.log(JSON.stringify({ model: READING_PASS_MODEL, prompt: pricing.pricing.prompt, completion: pricing.pricing.completion, paidCalls: 0, productionQueries: 0 }));
