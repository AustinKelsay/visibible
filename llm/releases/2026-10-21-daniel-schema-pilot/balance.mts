/** Read-only account reconciliation; response usage remains the task-spend authority. */
import fs from "node:fs";
import { parseEnv } from "node:util";
import { save } from "./packets.mjs";

const file = process.env.VISIBIBLE_EVAL_ENV_FILE;
if (!file) throw new Error("Private environment path required");
const env = parseEnv(fs.readFileSync(file, "utf8"));
if (env.GENERIC_ENGINE_MODE !== "disabled" || env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256 || !env.OPENROUTER_API_KEY) throw new Error("Disabled private configuration required");
const response = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
if (!response.ok) throw new Error(`Balance HTTP ${response.status}`);
const { data } = await response.json();
const result = { at: new Date().toISOString(), balanceUsd: data.total_credits - data.total_usage, paidCalls: 0, mutations: 0 };
save("balance.final.json", result);
console.log(JSON.stringify(result));
