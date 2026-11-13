/**
 * Seed the most-read chapters with saved images, through the site's own request path as the owner
 * (llm/workflow/SEED_IMAGES.md). The chapters are listed in src/lib/seed/chapters.ts, highest priority first.
 *
 *   npm run seed:images -- --base-url <origin> --dry-run
 *   SEED_ADMIN_PASSWORD=… npm run seed:images -- --base-url <origin> --budget-usd <usd> [--limit <verses>] [--concurrency 2]
 *     [--style classical] [--translation web] [--max-consecutive-failures 5]
 *
 * `--dry-run` reads which listed verses already have an image, prints what is missing and its projected cost per
 * chapter, and makes no login and no image. A paid run needs `--budget-usd` and the admin password in
 * SEED_ADMIN_PASSWORD; there is no password flag and no default site. It stops before a request that could take
 * spend past the budget, and on Ctrl-C after the requests in flight. Every attempt is appended to
 * output/seed-images/<site>/ledger.ndjson (ignored by git), which a later run reads to continue: the budget counts
 * what the ledger already records.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseSeedOptions, runSeed, type LedgerRow } from "@/lib/seed/images";

const root = fileURLToPath(new URL("../../", import.meta.url));
// The password leaves the environment at once, so nothing started from here can inherit it.
const password = process.env.SEED_ADMIN_PASSWORD;
delete process.env.SEED_ADMIN_PASSWORD;

try {
  const options = parseSeedOptions(process.argv.slice(2));
  const dir = path.join(root, "output/seed-images", new URL(options.baseUrl).host.replace(/[^a-z0-9.-]/gi, "_"));
  const file = path.join(dir, "ledger.ndjson");
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error("\nStopping once the requests in flight have answered. Press Ctrl-C again to quit at once; the ledger keeps what was sent.");
  });
  const summary = await runSeed(options, {
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    uuid: randomUUID,
    log: (line) => console.log(line),
    password,
    stopRequested: () => interrupted,
    ledger: {
      // An unreadable line could hide a paid request, so it stops the run rather than being skipped.
      read: () => existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as LedgerRow) : [],
      append: (row) => { mkdirSync(dir, { recursive: true }); appendFileSync(file, `${JSON.stringify(row)}\n`); },
    },
  });
  if (summary.kind === "run") {
    console.log(`Ledger: ${file}`);
    if (!["complete", "budget", "limit", "interrupted"].includes(summary.stop)) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
