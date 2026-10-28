/**
 * Owner-run step (ADR 0006, amendment 4): approve a brief change that only changes its approved art styles,
 * without rereading the work. Sends the brief at a git ref (the registered one) and the brief file in this
 * checkout; the server checks both hashes and that only `styleIds` differ, then moves the registered and
 * active brief versions together. Run it right after deploying the new brief.
 *
 *   npm run works:amend-brief-styles -- <work-id> --previous <git-ref> [--dry-run]
 *
 * Needs NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET (from the shell or .env.local).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { previous: { type: "string" }, "dry-run": { type: "boolean", default: false } } });
const workId = positionals[0];
if (!workId || !values.previous) throw new Error("Usage: npm run works:amend-brief-styles -- <work-id> --previous <git-ref> [--dry-run]");
const root = fileURLToPath(new URL("../../", import.meta.url));
const briefPath = `works/${workId}/brief.json`;
const previousBrief = execFileSync("git", ["show", `${values.previous}:${briefPath}`], { cwd: root, encoding: "utf8" });
const nextBrief = await readFile(path.join(root, briefPath), "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const styles = (text: string) => (JSON.parse(text) as { styleIds: string[] }).styleIds;

const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) for (const line of (await readFile(envFile, "utf8")).split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_CONVEX_URL, serverSecret = process.env.CONVEX_SERVER_SECRET;
if (!url || !serverSecret) throw new Error("NEXT_PUBLIC_CONVEX_URL and CONVEX_SERVER_SECRET are required");
const client = new ConvexHttpClient(url);
const before = await client.query(api.analysis.getWorkStatus, { workId });
console.log(JSON.stringify({ deployment: new URL(url).host, workId, previous: { ref: values.previous, version: sha(previousBrief), styleIds: styles(previousBrief) },
  next: { version: sha(nextBrief), styleIds: styles(nextBrief) }, before: { ready: before.ready, briefVersion: before.briefVersion, reasons: before.reasons } }, null, 2));
if (values["dry-run"]) process.exit(0);
const result = await client.mutation(api.analysis.amendBriefStyles, { serverSecret, workId, previousBrief, nextBrief });
const after = await client.query(api.analysis.getWorkStatus, { workId });
console.log(JSON.stringify({ result, after: { ready: after.ready, briefVersion: after.briefVersion, reasons: after.reasons } }, null, 2));
