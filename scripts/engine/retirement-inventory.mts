/**
 * Retirement dry run (#182): classify every engine's outstanding work on a deployment without
 * changing anything. Accepted obligations (admitted requests not yet ended, bulk items with an
 * accepted request) must finish or be reconciled before legacy execution is retired; unstarted
 * legacy bulk items are the cancellation candidates a later retirement would close, each
 * recreatable by the reader under a fresh quote. An in-flight request is never "unstarted".
 *
 *   npm run engine:retirement-inventory                                  (development: .env.local)
 *   npm run engine:retirement-inventory -- --env-file .env.convex.prod    (production: the named file only)
 *
 * The target is explicit: with --env-file only that file supplies NEXT_PUBLIC_CONVEX_URL and
 * CONVEX_SERVER_SECRET; without it they come from the shell or .env.local. The deployment host is
 * printed with the result so the evidence names where it came from.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { classifyForRetirement } from "@/lib/engine/retirement";

const { values } = parseArgs({ options: { "env-file": { type: "string" } } });
const root = fileURLToPath(new URL("../../", import.meta.url));
async function readEnvFile(file: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  if (!existsSync(file)) return env;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
let url: string | undefined;
let secret: string | undefined;
if (values["env-file"]) {
  const file = path.resolve(values["env-file"]);
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  const env = await readEnvFile(file);
  url = env.NEXT_PUBLIC_CONVEX_URL; secret = env.CONVEX_SERVER_SECRET;
  if (!url || !secret) throw new Error(`${values["env-file"]} must define NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET`);
} else {
  const local = await readEnvFile(path.join(root, ".env.local"));
  url = process.env.NEXT_PUBLIC_CONVEX_URL ?? local.NEXT_PUBLIC_CONVEX_URL; secret = process.env.CONVEX_SERVER_SECRET ?? local.CONVEX_SERVER_SECRET;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET are needed (shell or .env.local), or pass --env-file");
}
const client = new ConvexHttpClient(url);
const requests = await client.query(api.verseImages.countRequestsByEngine, { serverSecret: secret });
const bulk = await client.query(api.bulkGenerations.countItems, { serverSecret: secret });
const inventory = classifyForRetirement(requests, bulk);
console.log(`Deployment ${new URL(url).hostname} (dry run, nothing changed)\n`);
console.log(JSON.stringify({ requests, bulk, inventory }, null, 2));
console.log(inventory.readyToRetire.legacy ? "\nLegacy has no accepted obligations; retirement can close the listed unstarted items (readers may recreate them under a fresh quote)." : `\nNot ready to retire legacy: ${inventory.readyToRetire.reasons.join("; ")}.`);
