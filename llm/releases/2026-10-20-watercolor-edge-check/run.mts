/** Replay a fixed reference-check calibration. Default is offline; --live makes paid vision calls. */
import { readFile, writeFile, appendFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { createOpenRouterVisionChecker } from "../../../src/lib/engine/reference-adapters";
import { CHECK_MODEL_ID, STYLE_CHECK_QUESTION, styleCheckSchema } from "../../../src/lib/engine/references";

const { values } = parseArgs({ options: { live: { type: "boolean", default: false }, plan: { type: "string", default: "plan.json" } } });
const dir = fileURLToPath(new URL("./", import.meta.url));
if (!["plan.json", "followup-plan.json"].includes(values.plan)) throw new Error("Use one of the two recorded calibration plans");
const prefix = values.plan === "plan.json" ? "" : "followup-";
const plan = JSON.parse(await readFile(path.join(dir, values.plan), "utf8")) as {
  model: string; repeats: number; maximumCalls: number; capUsd: number; reservePerCheckUsd: number;
  evaluationAuthorizedTotalUsd: number; evaluationPreviouslyMeasuredUsd: number; evaluationUncertaintyUsd: number;
  fixtures: Array<{ file: string; sha256: string; expected: "pass" | "fail" }>;
};
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
if (plan.model !== CHECK_MODEL_ID || plan.maximumCalls !== plan.fixtures.length * plan.repeats) throw new Error("Invalid fixed calibration plan");
if (plan.maximumCalls * plan.reservePerCheckUsd > plan.capUsd || plan.evaluationPreviouslyMeasuredUsd + plan.evaluationUncertaintyUsd + plan.capUsd > plan.evaluationAuthorizedTotalUsd) throw new Error("Plan exceeds its evaluation allowance");
for (const fixture of plan.fixtures) {
  if (hash(await readFile(path.join(dir, fixture.file))) !== fixture.sha256) throw new Error(`Fixture hash changed: ${fixture.file}`);
}
const manifest = { model: plan.model, question: STYLE_CHECK_QUESTION, questionSha256: hash(STYLE_CHECK_QUESTION), planSha256: hash(await readFile(path.join(dir, values.plan))), maximumCalls: plan.maximumCalls, capUsd: plan.capUsd };
if (!values.live) {
  console.log(JSON.stringify({ ...manifest, paidCalls: 0, note: "Fixture hashes and budget checked; use --live only under the separately authorized evaluation allowance." }, null, 2));
  process.exit(0);
}
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for --live");
// Refuse to overwrite or repeat a paid prefix, even after an interrupted run.
const tracePath = path.join(dir, `${prefix}attempts.ndjson`);
let exists = true;
try { await access(tracePath); } catch { exists = false; }
if (exists) throw new Error("Paid attempts already exist; inspect them and plan a new bounded run instead of repeating them");
await writeFile(tracePath, "", { flag: "wx" });
await writeFile(path.join(dir, `${prefix}manifest.json`), JSON.stringify({ ...manifest, startedAt: new Date().toISOString() }, null, 2) + "\n");
let rawResponse: unknown;
const checker = createOpenRouterVisionChecker({ apiKey, fetch: async (url, init) => {
  const response = await fetch(url, init);
  rawResponse = await response.clone().json();
  if (rawResponse && typeof rawResponse === "object" && "user_id" in rawResponse) delete rawResponse.user_id;
  return response;
} });
let spentUsd = 0;
let reservedUncertainUsd = 0;
const rows = [];
for (const fixture of plan.fixtures) {
  const bytes = new Uint8Array(await readFile(path.join(dir, fixture.file)));
  const mimeType = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  for (let repeat = 1; repeat <= plan.repeats; repeat++) {
    if (spentUsd + reservedUncertainUsd + plan.reservePerCheckUsd > plan.capUsd) throw new Error("Calibration budget exhausted");
    rawResponse = null;
    const startedAt = new Date().toISOString();
    try {
      const result = await checker.check({ label: `${fixture.file}:${repeat}`, question: STYLE_CHECK_QUESTION, schema: styleCheckSchema, image: { bytes, mimeType } });
      if (result.costUsd === null) reservedUncertainUsd += plan.reservePerCheckUsd;
      else spentUsd += result.costUsd;
      const row = { file: fixture.file, imageSha256: fixture.sha256, repeat, expected: fixture.expected, startedAt, result, rawResponse };
      rows.push(row);
      await appendFile(tracePath, JSON.stringify(row) + "\n");
      console.log(`${fixture.file} ${repeat}: ${result.value.verdict}, expected ${fixture.expected}, $${(result.costUsd ?? plan.reservePerCheckUsd).toFixed(8)}`);
    } catch (error) {
      reservedUncertainUsd += plan.reservePerCheckUsd;
      await appendFile(tracePath, JSON.stringify({ file: fixture.file, imageSha256: fixture.sha256, repeat, expected: fixture.expected, startedAt, error: error instanceof Error ? error.message : String(error), rawResponse, reservedUncertainUsd }) + "\n");
      throw error;
    }
  }
}
await writeFile(path.join(dir, `${prefix}report.json`), JSON.stringify({
  at: new Date().toISOString(), ...manifest, completed: rows.length, spentUsd, reservedUncertainUsd,
  evaluationTotalMeasuredUsd: plan.evaluationPreviouslyMeasuredUsd + spentUsd,
  evaluationRemainingAfterUncertaintyUsd: plan.evaluationAuthorizedTotalUsd - plan.evaluationPreviouslyMeasuredUsd - spentUsd - plan.evaluationUncertaintyUsd - reservedUncertainUsd,
  disagreements: rows.filter((r) => r.result.value.verdict !== r.expected).map((r) => ({ file: r.file, repeat: r.repeat, expected: r.expected, actual: r.result.value.verdict })),
  note: "Vision-check calibration only; no image generated or production reference changed. The fixture labels are an agent assessment, not human release acceptance.",
}, null, 2) + "\n");
