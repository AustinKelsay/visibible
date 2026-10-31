import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { ConvexHttpClient } from "convex/browser";
import { spawnSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { api } from "../../convex/_generated/api.js";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
if (!process.env.CONVEX_DEPLOYMENT?.startsWith("local:") || !process.env.NEXT_PUBLIC_CONVEX_URL?.startsWith("http://127.0.0.1:")) {
  throw new Error("This paid smoke test only runs against an isolated local Convex deployment.");
}
const origin = "http://localhost:3000";
const cookieJar = new Map();
async function request(path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "),
      "x-csrf-token": cookieJar.get("visibible_csrf") ?? "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${data.error ?? "request failed"}`);
  return data;
}
const session = await request("/api/session", {});
const credit = spawnSync("npx", ["convex", "run", "sessions:addCreditsInternal", JSON.stringify({ sid: session.sid, amount: 100, reason: "local-video-smoke" })], { encoding: "utf8" });
if (credit.status !== 0) throw new Error("Could not fund isolated test session");
const config = await request("/api/generate-video");
const quote = config.quotes.find((q) => q.duration === 5 && q.resolution === "768p");
if (!config.enabled || !quote || quote.providerCostUsd > 0.40) throw new Error("Expected enabled H3 Max quote at no more than $0.40");
const access = await request("/api/convex-token", {});
const input = { requestId: crypto.randomUUID(), reference: "Psalms 23:2", translation: "web", duration: 5, resolution: "768p", maxCredits: quote.credits };
const started = Date.now();
const accepted = await request("/api/generate-video", input);
const replay = await request("/api/generate-video", input);
if (accepted.id !== replay.id) throw new Error("Idempotent replay produced a different job");
console.log("Accepted one job; duplicate request returned the same job.");
const owner = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
owner.setAuth(access.token);
const publicClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
let job;
let lastStatus;
for (let attempt = 0; attempt < 72; attempt++) {
  const jobs = await owner.query(api.verseVideos.getMyJobs, {});
  job = jobs.find((entry) => entry.id === accepted.id);
  if (job?.status !== lastStatus) { console.log(`Server job: ${job?.status ?? "waiting"}`); lastStatus = job?.status; }
  if (job?.status === "failed") throw new Error(job.error ?? "Video failed");
  if (job?.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!job?.videoUrl || job.status !== "completed") throw new Error("Job did not complete within six minutes");
const publicJobs = await publicClient.query(api.verseVideos.getHistory, { verseId: job.verseId });
if (!publicJobs.some((entry) => entry.id === job.id)) throw new Error("Completed video was not public");
const range = await fetch(job.videoUrl, { headers: { Range: "bytes=0-31" } });
if (range.status !== 206 || !range.headers.get("content-range")) throw new Error("Stored video does not support seeking");
await range.arrayBuffer();
const video = await fetch(job.videoUrl);
if (!video.ok || !video.headers.get("content-type")?.startsWith("video/mp4")) throw new Error("Stored MP4 unavailable");
const balance = await request("/api/session");
if (balance.credits !== 100 - job.actualCredits) throw new Error("Wallet settlement did not match one generation");
const folder = `output/video-smoke/${new Date().toISOString().slice(0, 10)}`;
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/psalms-23-2.mp4`, Buffer.from(await video.arrayBuffer()));
const report = { testedAt: new Date().toISOString(), deployment: "isolated-local", reference: job.reference, model: config.model, duration: job.duration, resolution: job.resolution, elapsedSeconds: (Date.now() - started) / 1000, quotedProviderCostUsd: quote.providerCostUsd, reservedCredits: quote.credits, chargedCredits: job.actualCredits, endingTestBalance: balance.credits, idempotentReplay: true, authenticatedProgress: true, publicHistory: true, permanentStorage: true, rangeStatus: range.status, jobId: job.id, verseId: job.verseId, videoUrl: job.videoUrl };
await writeFile(`${folder}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
