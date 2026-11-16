/**
 * Give saved pictures that have no thumbnail one (#444). Run once per deployment by the owner: against development
 * first, against production at cutover, before the new reader ships.
 *
 *   CONVEX_SERVER_SECRET=… npm run thumbnails:backfill -- --convex-url <deployment URL> --dry-run
 *   CONVEX_SERVER_SECRET=… npm run thumbnails:backfill -- --convex-url <deployment URL> [--limit <pictures>]
 *
 * `--dry-run` lists the pictures that would get a thumbnail and changes nothing. A run reads each picture from its
 * storage address, makes the thumbnail here with sharp, and attaches it. It is resumable and safe to repeat: every run
 * reads only pictures still without a thumbnail, and a picture that already has one keeps it. Ctrl-C stops after the
 * picture in hand. There is no default deployment, and the secret is read only from the environment.
 */
import { ConvexHttpClient } from "convex/browser";
import { runThumbnailBackfill } from "@/lib/thumbnails";

const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

function parseArgs(argv: string[]) {
  let convexUrl: string | undefined;
  let dryRun = false;
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--convex-url") convexUrl = argv[++i];
    else if (arg === "--limit") {
      limit = Number(argv[++i]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit takes a whole number of pictures");
    } else throw new Error(`Unknown option ${arg}`);
  }
  if (!convexUrl) throw new Error("--convex-url is required: the deployment to backfill (there is no default)");
  return { convexUrl: new URL(convexUrl).toString().replace(/\/$/, ""), dryRun, limit };
}

async function fetchPicture(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  // Count while reading, so an oversized remote picture is refused without buffering all of it.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_PICTURE_BYTES) {
      await reader.cancel();
      throw new Error(`Picture larger than ${MAX_PICTURE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  if (size === 0) throw new Error("Empty picture");
  return Buffer.concat(chunks);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const serverSecret = process.env.CONVEX_SERVER_SECRET;
  delete process.env.CONVEX_SERVER_SECRET;
  if (!serverSecret) throw new Error("Set CONVEX_SERVER_SECRET for the deployment in the environment");
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error("\nStopping after the picture in hand. Press Ctrl-C again to quit at once; a later run continues.");
  });
  console.log(`${options.dryRun ? "Dry run against" : "Backfilling"} ${options.convexUrl}`);
  const report = await runThumbnailBackfill(
    { dryRun: options.dryRun, limit: options.limit, stopRequested: () => interrupted },
    { client: new ConvexHttpClient(options.convexUrl), serverSecret, fetchPicture, log: (line) => console.log(line) },
  );
  console.log(JSON.stringify({ deployment: options.convexUrl, ...report }, null, 2));
  if (report.failed.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
