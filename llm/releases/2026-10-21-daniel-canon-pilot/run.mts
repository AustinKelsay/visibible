/** Two-stage bounded pilot: inspect the one refreshed plan before enabling any images. Not replay authorization. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { assemblePacket, packetProvider, requirePresence, save, hash } from "./packets.mjs";
import { createOpenRouterTextModel } from "../../../src/lib/reading-pass/model";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const plan = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
const phase = process.argv.includes("--images") ? "images" : "preparation";
const prior = phase === "images" ? JSON.parse(fs.readFileSync(path.join(dir, "preparation-execution.json"), "utf8")) : null;
if (prior && (prior.uncertainUsd !== 0 || prior.imageCalls !== 0 || prior.textCalls < 1 || prior.textCalls > plan.maximumPreparationCalls)) throw new Error("Measured preparation-only evidence required");
if (fs.existsSync(path.join(dir, `${phase}-execution.json`))) throw new Error("Phase already executed; no replay");
const before = JSON.parse(fs.readFileSync(path.join(dir, "before.json"), "utf8"));
if (!process.argv.includes("--execute")) throw new Error("Execution requires explicit --execute and the owner's existing paid-run authorization");
if (fs.existsSync(path.join(root, "evals/images/runs", plan.run, "state.json"))) throw new Error("Run state exists; automatic replay is forbidden");
if (Date.now() - Date.parse(before.at) > 15 * 60_000 || before.paidCalls || before.mutations || before.publicCatalog.artStyles.some((s: {id:string;available:boolean}) => s.id !== "classical" && s.available)) throw new Error("Fresh disabled snapshot required");
if (plan.evaluationMeasuredBeforeUsd + plan.evaluationUncertaintyBeforeUsd + plan.subcapUsd > plan.evaluationAuthorizedUsd || before.balanceUsd < plan.subcapUsd) throw new Error("Insufficient task or account allowance");
for (const [file, hash] of Object.entries(plan.sourceFiles)) {
  if (createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") !== hash) throw new Error(`Source changed since plan: ${file}`);
}
const envFile = process.env.VISIBIBLE_EVAL_ENV_FILE;
if (!envFile) throw new Error("VISIBIBLE_EVAL_ENV_FILE must identify the private production environment file");
const env = parseEnv(fs.readFileSync(envFile, "utf8"));
if (env.GENERIC_ENGINE_MODE !== "disabled" || env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256) throw new Error("Disabled production required");
for (const key of ["OPENROUTER_API_KEY", "NEXT_PUBLIC_CONVEX_URL", "CONVEX_SERVER_SECRET"]) {
  if (!env[key]) throw new Error(`Missing ${key}`);
  process.env[key] = env[key];
}
const liveEnv = { NEXT_PUBLIC_CONVEX_URL: env.NEXT_PUBLIC_CONVEX_URL!, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY!, CONVEX_SERVER_SECRET: env.CONVEX_SERVER_SECRET! };
const privateTrace = path.join(os.tmpdir(), `visibible-daniel-canon-${phase}-provider.private.ndjson`);
const publicTrace = path.join(os.tmpdir(), `visibible-daniel-canon-${phase}-provider.ndjson`);
for (const file of [privateTrace, publicTrace]) fs.writeFileSync(file, "", {flag:"wx", mode:0o600});
const clean = (value: unknown): unknown => {
  if (typeof value === "string" && value.startsWith("data:image/")) {
    const match = value.match(/^data:([^;]+);base64,([\s\S]*)$/);
    if (!match) throw new Error("Unexpected image data URI");
    const bytes = Buffer.from(match[2], "base64");
    return {omittedImageData:true,mimeType:match[1],bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "user_id").map(([key, child]) => [key,
      row.type === "reasoning.encrypted" && key === "data" && typeof child === "string"
        ? {omittedEncryptedData:true,bytes:Buffer.byteLength(child),sha256:createHash("sha256").update(child).digest("hex")}
        : clean(child)]));
  }
  return value;
};
const nativeFetch = globalThis.fetch;
let imageCalls = 0, textCalls = 0, chargedUsd = 0, uncertainUsd = 0;
let imagesAllowed = false;
const allowedPrompts = new Map<string, Array<{sha256:string}>>();
const sentPrompts = new Set<string>();
globalThis.fetch = async (input, init) => {
  if (String(input) !== "https://openrouter.ai/api/v1/chat/completions") return nativeFetch(input, init);
  const request = JSON.parse(String(init?.body));
  const isImage = request.modalities?.includes("image");
  const reserve = isImage ? plan.imageReserveUsd : plan.preparationReserveUsd;
  if (uncertainUsd > 0) throw new Error("Further paid calls blocked by uncertain usage");
  if (isImage ? imageCalls >= plan.maximumImageCalls : phase === "images" || textCalls >= plan.maximumPreparationCalls) throw new Error("Bounded request count reached");
  if (request.model !== (isImage ? plan.imageModel : plan.textModel)) throw new Error("Unexpected model");
  if (!isImage && (imagesAllowed || request.response_format?.json_schema?.name !== "scene_plan" || !request.messages?.some((m: {content:unknown}) => typeof m.content === "string" && m.content.includes("MOMENT (Daniel 7:9):") && m.content.includes("the_ancient_of_days: The Ancient of Days (hasForm: false)") && m.content.includes("NO-FORM CANON CONSTRAINTS")))) throw new Error("Only Daniel scene planning is permitted");
  if (isImage) {
    const content = request.messages?.[0]?.content;
    const prompt = typeof content === "string" ? content : content?.find((p: {type:string}) => p.type === "text")?.text;
    const expected = typeof prompt === "string" ? allowedPrompts.get(hash(prompt)) : undefined;
    const images = Array.isArray(content) ? content.filter((p: {type:string}) => p.type === "image_url") : [];
    if (!imagesAllowed || !expected || sentPrompts.has(hash(prompt)) || (request.image_config?.image_size ?? "1K") !== "1K" || request.image_config?.aspect_ratio !== "16:9" || images.length !== expected.length || images.some((p: {image_url:{url:string}}, i: number) => hash(Buffer.from(p.image_url.url.split(",")[1], "base64")) !== expected[i].sha256)) throw new Error("Image outside prevalidated Daniel packets");
    sentPrompts.add(hash(prompt));
  }
  if ((prior?.chargedUsd ?? 0) + chargedUsd + reserve > plan.subcapUsd) throw new Error("Targeted subcap reached");
  if (isImage) imageCalls++; else textCalls++;
  const startedAt = new Date().toISOString();
  let logged = false;
  try {
    const response = await nativeFetch(input, init);
    const payload = await response.clone().json();
    const cost = extractOpenRouterUsageUsd(payload);
    if (cost !== null) chargedUsd += cost; else uncertainUsd += reserve;
    const row = {kind:isImage ? "image" : "preparation",startedAt,completedAt:new Date().toISOString(),status:response.status,request,response:payload,measuredUsageUsd:cost};
    fs.appendFileSync(privateTrace,JSON.stringify(row)+"\n");
    fs.appendFileSync(publicTrace,JSON.stringify(clean(row))+"\n");
    logged = true;
    return response;
  } catch (error) {
    if (!logged) {
      uncertainUsd += reserve;
      const row = {kind:isImage ? "image" : "preparation",startedAt,completedAt:new Date().toISOString(),error:error instanceof Error ? error.message : String(error),uncertainUsage:true};
      fs.appendFileSync(privateTrace,JSON.stringify(row)+"\n"); fs.appendFileSync(publicTrace,JSON.stringify(row)+"\n");
    }
    throw error;
  }
};
process.argv = [process.argv[0],path.join(root,"scripts/evals/images.mts"),"--run",plan.run,"--arms","generic","--styles",plan.styles.join(","),"--analysis","convex","--file",path.join(dir,"cases.json"),"--repeats",String(plan.repeats),"--budget",String(plan.subcapUsd - (prior?.chargedUsd ?? 0))];
try {
  if (phase === "preparation") {
    // Normal lazy refresh only; a schema-valid contradictory result is retained, never retried.
    const prepared = await assemblePacket(await packetProvider(liveEnv, createOpenRouterTextModel({ apiKey: liveEnv.OPENROUTER_API_KEY }), true), "classical", 1);
    save("preparation.json", { at: new Date().toISOString(), packet: prepared });
    requirePresence(prepared);
  } else {
    const prepared = JSON.parse(fs.readFileSync(path.join(dir, "preparation.json"), "utf8"));
    const review = JSON.parse(fs.readFileSync(path.join(dir, "plan-review.json"), "utf8"));
    if (!review.acceptedForPilot || review.planVersion !== prepared.packet.packet.planVersion || review.preparedPlanSha256 !== hash(JSON.stringify(prepared.packet.prepared.plan))) throw new Error("Exact retained plan needs a positive review before images");
  }
  const readOnlyModel = { id: "forbidden", complete: async () => { throw new Error("Read-only validation forbids model calls"); } };
  const provider = await packetProvider(liveEnv, readOnlyModel);
  const packets = [];
  for (const style of plan.styles) {
    for (let n = 1; n <= plan.repeats; n++) {
      const packet = await assemblePacket(provider, style, n);
      requirePresence(packet);
      if (packet.preparationCalls) throw new Error("Unexpected preparation during validation");
      packets.push(packet);
      allowedPrompts.set(packet.promptSha256, packet.references);
    }
  }
  if (packets.length !== plan.maximumImageCalls || allowedPrompts.size !== packets.length) throw new Error("Incomplete or duplicate packet set");
  if (phase === "preparation") {
    save("preflight.json", { at: new Date().toISOString(), paidCalls: 0, mutations: 0, packets });
  } else {
    const validated = JSON.parse(fs.readFileSync(path.join(dir, "preflight.json"), "utf8"));
    if (JSON.stringify(validated.packets) !== JSON.stringify(packets)) throw new Error("Packets changed since plan review");
    save("image-preflight.json", { at: new Date().toISOString(), paidCalls: 0, mutations: 0, packets });
    imagesAllowed = true;
    await import(path.join(root,"scripts/evals/images.mts"));
  }
} finally {
  globalThis.fetch = nativeFetch;
  const result = {at:new Date().toISOString(),phase,imageCalls,textCalls,chargedUsd,uncertainUsd,priorMeasuredUsd:prior?.chargedUsd ?? 0,subcapUsd:plan.subcapUsd,imagesAllowed};
  save(`${phase}-execution.json`, result);
  console.log(JSON.stringify(result));
}
