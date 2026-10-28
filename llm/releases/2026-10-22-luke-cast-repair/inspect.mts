/** Read-only source/state capture for the bounded Luke correction. Never prints credentials. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { readWorkInputs } from "../../../src/lib/engine/work-inputs";
import { READING_PASS_MODEL } from "../../../src/lib/reading-pass/model";

export const dir = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(dir, "../../..");
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const json = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
export const save = (name: string, data: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
export function environment() {
  assert.ok(process.env.VISIBIBLE_EVAL_ENV_FILE);
  const env = parseEnv(fs.readFileSync(process.env.VISIBIBLE_EVAL_ENV_FILE, "utf8"));
  assert.equal(env.GENERIC_ENGINE_MODE, "disabled");
  assert.ok(!env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256);
  assert.equal(env.NEXT_PUBLIC_CONVEX_URL, "https://api.visibible.com");
  assert.ok(env.CONVEX_SERVER_SECRET && env.OPENROUTER_API_KEY);
  return { url: env.NEXT_PUBLIC_CONVEX_URL, secret: env.CONVEX_SERVER_SECRET, key: env.OPENROUTER_API_KEY };
}
export const ids = ["the_samaritan", "wounded_traveler_in_samaritan_parable", "robbers_in_samaritan_parable", "priest_in_samaritan_parable", "levite_in_samaritan_parable", "innkeeper_in_samaritan_parable", "samaritans_mount_in_parable", "jerusalem_to_jericho_road", "inn_in_samaritan_parable"];
export const scoped: Array<["section" | "entry" | "moment" | "look" | "plan", string]> = [
  ["section", "luke-10-25"], ["look", "luke-10-25"],
  ...ids.map((id) => ["entry", id] as ["entry", string]),
  ...["jesus_christ_the_son_of_god_and_lord", "lawyer_who_tests_jesus_luke_10", "judea_gospel_region_around_jerusalem"].map((id) => ["entry", id] as ["entry", string]),
  ...["luke-10-33", "luke-10-34", "daniel-7-9", "daniel-7-10"].flatMap((id) => [["moment", id], ["plan", id]] as Array<["moment" | "plan", string]>),
  ["section", "daniel-7-9"], ["look", "daniel-7-9"],
  ...["the_ancient_of_days", "ministering_assembly_in_daniels_vision", "daniel_prophet_of_babylon", "one_like_a_son_of_man", "babylon"].map((id) => ["entry", id] as ["entry", string]),
];
export const sourceFiles = ["src/lib/engine/preparation.ts", "src/lib/engine/assemble.ts", "src/lib/engine/corrections.ts", "src/lib/engine/prompt.ts", "src/lib/engine/work-inputs.ts", "src/lib/reading-pass/canon.ts", "src/lib/reading-pass/model.ts", "src/lib/reading-pass/prompts.ts", "convex/analysis.ts", "convex/schema.ts", "works/bible-web/work.json", "works/bible-web/brief.json", "styles/classical.json", "styles/watercolor.json", "styles/icon.json"];
export const sources = () => Object.fromEntries(sourceFiles.map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));

export async function snapshot(phase: string) {
  assert.match(phase, /^[a-z0-9-]+$/);
  const env = environment();
  const client = new ConvexHttpClient(env.url);
  const inputs = await readWorkInputs("bible-web", root);
  const status = await client.query(api.analysis.getWorkStatus, { workId: "bible-web" });
  assert.ok(status.ready && status.activeGeneration === 1);
  assert.equal(status.workVersion, inputs.workVersion);
  assert.equal(status.briefVersion, inputs.briefVersion);
  const records = [];
  for (const [kind, recordId] of scoped) records.push({ kind, recordId, record: await client.query(api.analysis.getActiveRecord, { workId: "bible-web", kind, recordId }) });
  const spend = await client.query(api.analysis.getPreparationSpend, { workId: "bible-web" });
  const catalogResponse = await fetch("https://visibible.com/api/image-models"); assert.ok(catalogResponse.ok);
  const catalog = await catalogResponse.json();
  assert.ok(catalog.artStyles.every((style: { id: string; available: boolean }) => style.id === "classical" || !style.available));
  const pricingResponse = await fetch("https://openrouter.ai/api/v1/models"); assert.ok(pricingResponse.ok);
  const pricing = (await pricingResponse.json()).data.find((model: { id: string }) => model.id === READING_PASS_MODEL);
  assert.ok(pricing && Number(pricing.pricing.prompt) === 0.1e-6 && Number(pricing.pricing.completion) === 0.5e-6);
  const creditsResponse = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.key}` } }); assert.ok(creditsResponse.ok);
  const { data } = await creditsResponse.json();
  const sourceUnits = inputs.work.units.filter((unit) => unit.id.startsWith("luke-10-") && unit.number >= 25 && unit.number <= 37);
  save(`${phase}.json`, { at: new Date().toISOString(), phase, sources: sources(), status, records, spend, catalog, pricing,
    balanceUsd: data.total_credits - data.total_usage, sourceUnits, environment: { mode: "disabled", ownerSessionConfigured: false }, publicActivation: false });
  console.log(JSON.stringify({ phase, records: records.length, entries: records.filter((row) => row.kind === "entry").map((row) => ({ id: row.recordId, exists: row.record !== null })), spend }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await snapshot(process.argv[2] ?? "before");
