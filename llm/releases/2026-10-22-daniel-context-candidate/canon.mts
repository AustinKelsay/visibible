/** One isolated canon draft, with only the drafter's normal bounded structural retry. No live writes. */
import assert from "node:assert/strict";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { CANON_SYSTEM, canonUserPrompt, draftCanonEntry } from "../../../src/lib/reading-pass/canon";
import { environment, root, json, save, textModel, requireSnapshot, hash } from "./experiment.mjs";
import fs from "node:fs";

const { env, nativeFetch } = environment();
requireSnapshot();
const input = json("draft-input.json");
const inputs = await readWorkInputs("bible-web", root);
assert.deepEqual(canonUserPrompt({ work: inputs.work, entry: input.entry, brief: inputs.brief, sections: input.sections, sectionEras: input.sectionEras, hints: input.hints }), input.request);
assert.ok(input.request.user.includes("[daniel-7-9]"));
const bounded = textModel("canon", env.OPENROUTER_API_KEY, nativeFetch, (request) => {
  assert.equal(request.messages[0].content, CANON_SYSTEM);
  assert.ok(request.messages[1].content.startsWith(input.request.user));
  assert.equal(request.max_tokens, 4000);
});
let status = "failed";
try {
  const result = await draftCanonEntry({ work: inputs.work, entry: input.entry, brief: inputs.brief, sections: input.sections, sectionEras: input.sectionEras, hints: input.hints, model: bounded.model });
  save("canon.json", { at: new Date().toISOString(), result, scriptSha256: hash(fs.readFileSync(new URL(import.meta.url))), instructionsSha256: hash(CANON_SYSTEM), productionMutations: 0 });
  status = "completed";
  console.log(JSON.stringify(result, null, 2));
} finally { bounded.finish(status); }
