/**
 * Seed the most-read chapters with saved images, through the site's own request path as the owner
 * (llm/workflow/SEED_IMAGES.md). The chapters are listed in src/lib/seed/chapters.ts, highest priority first.
 *
 *   npm run seed:images -- --base-url <origin> --dry-run
 *   SEED_ADMIN_PASSWORD=… npm run seed:images -- --base-url <origin> --budget-usd <usd> [--limit <verses>] [--concurrency 2]
 *     [--style classical] [--translation web] [--max-consecutive-failures 5] [--redraw-unresolved]
 *
 * `--dry-run` reads which listed verses already have an image, prints what is missing and its projected cost per
 * chapter, and makes no login and no image. A paid run needs `--budget-usd` and the admin password in
 * SEED_ADMIN_PASSWORD; there is no password flag and no default site. It stops before a request that, counted at the
 * price ceiling, would take the ledger past the budget, and on Ctrl-C after the requests in flight. Every attempt is appended to
 * output/seed-images/<site>/ledger.ndjson (ignored by git), which a later run reads to continue: the budget counts
 * what the ledger already records.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseSeedOptions, runSeed } from "@/lib/seed/images";

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
      // An unreadable line could hide a paid request, so it stops the run rather than being skipped (readLedger checks each one).
      read: () => existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line, index): unknown => {
        try { return JSON.parse(line); } catch { throw new Error(`Ledger line ${index + 1} of ${file} is not JSON. Nothing is drawn until it is repaired.`); }
      }) : [],
      append: (row) => { mkdirSync(dir, { recursive: true }); appendFileSync(file, `${JSON.stringify(row)}\n`); },
      // One paid run per site at a time: two would each count the same remaining budget and draw the same verses.
      lock: () => {
        mkdirSync(dir, { recursive: true });
        const lockFile = path.join(dir, "ledger.lock");
        let handle: number;
        try {
          handle = openSync(lockFile, "wx");
        } catch {
          const owner = existsSync(lockFile) ? readFileSync(lockFile, "utf8").trim() : "";
          throw new Error(`Another seed run holds ${lockFile}${owner ? ` (${owner})` : ""}. If none is running, delete that file and run again.`);
        }
        writeSync(handle, `pid ${process.pid}, started ${new Date().toISOString()}`);
        closeSync(handle);
        const release = () => { try { unlinkSync(lockFile); } catch { /* already gone */ } };
        process.on("exit", release);
        return release;
      },
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
