/** Explicit read-only evidence capture; never invokes a model or a mutation. */
import fs from "node:fs";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { dir, hash, root, save } from "./packets.mjs";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw new Error("Pass before or after");
const envFile = process.env.VISIBIBLE_EVAL_ENV_FILE;
if (!envFile) throw new Error("Private environment path required");
const env = parseEnv(fs.readFileSync(envFile, "utf8"));
if (env.GENERIC_ENGINE_MODE !== "disabled" || env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256) throw new Error("Disabled configuration required");
if (!env.NEXT_PUBLIC_CONVEX_URL || !env.OPENROUTER_API_KEY || !env.CONVEX_SERVER_SECRET) throw new Error("Missing private configuration");
const c = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const status = await c.query(api.analysis.getWorkStatus, { workId: "bible-web" });
if (!status.ready || status.activeGeneration !== 1) throw new Error("Unexpected generation");
const records = [];
for (const [kind, recordId] of [["moment", "daniel-7-9"], ["section", "daniel-7-9"], ["look", "daniel-7-9"], ["plan", "daniel-7-9"], ["entry", "the_ancient_of_days"], ["entry", "daniel_prophet_of_babylon"], ["entry", "one_like_a_son_of_man"], ["entry", "babylon"], ["entry", "elisha_son_of_shaphat"]] as const) {
  records.push(await c.query(api.analysis.getActiveRecord, { workId: "bible-web", kind, recordId }));
}
const response = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
if (!response.ok) throw new Error(`Balance HTTP ${response.status}`);
const { data } = await response.json();
const catalogResponse = await fetch("https://visibible.com/api/image-models");
if (!catalogResponse.ok) throw new Error(`Public catalog HTTP ${catalogResponse.status}`);
const publicCatalog = await catalogResponse.json();
const planHistory = await c.query(api.analysis.listRecordHistory, { workId: "bible-web", kind: "plan", recordId: "daniel-7-9" });
const sourceFiles = Object.fromEntries(["src/lib/engine/preparation.ts", "src/lib/engine/prompt.ts", "src/lib/engine/assemble.ts", "src/lib/reading-pass/model.ts", "src/lib/image-evals/runner.ts", "src/lib/image-evals/adapters.ts", "scripts/evals/images.mts", "styles/classical.json", "styles/watercolor.json", "styles/icon.json", "works/bible-web/work.json", "works/bible-web/brief.json"].map((file) => [file, hash(fs.readFileSync(`${root}/${file}`))]));
const snapshot = { at: new Date().toISOString(), phase, publicMode: "disabled", status, balanceUsd: data.total_credits - data.total_usage, records, planHistory, publicCatalog, sourceFiles, paidCalls: 0, mutations: 0 };
save(`${phase}.json`, snapshot);
console.log(JSON.stringify({ phase, at: snapshot.at, balanceUsd: snapshot.balanceUsd, records: records.map((r) => ({ kind: r?.kind, id: r?.recordId, version: r?.version })), publicCatalog, directory: dir }));
