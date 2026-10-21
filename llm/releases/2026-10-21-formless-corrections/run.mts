/** Exact bounded evaluation wrapper. This file is evidence, not authorization for another run. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { extractOpenRouterUsageUsd } from "../../../src/lib/image-response";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const plan = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
const preflight = JSON.parse(fs.readFileSync(path.join(dir, "preflight.json"), "utf8"));
const before = JSON.parse(fs.readFileSync(path.join(dir, "before.json"), "utf8"));
if (!process.argv.includes("--execute")) throw new Error("Execution requires explicit --execute and the owner's existing paid-run authorization");
if (fs.existsSync(path.join(root, "evals/images/runs", plan.run, "state.json"))) throw new Error("Run state exists; automatic replay is forbidden");
if (Date.now() - Date.parse(preflight.at) > 15 * 60_000 || preflight.paidCalls || preflight.actualMutations || preflight.packets.length !== 54 || preflight.failures.length !== 18) throw new Error("Fresh expected actual-packet preflight required");
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
const privateTrace = path.join(os.tmpdir(), "visibible-formless-provider.private.ndjson");
const publicTrace = path.join(os.tmpdir(), "visibible-formless-provider.ndjson");
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
globalThis.fetch = async (input, init) => {
  if (String(input) !== "https://openrouter.ai/api/v1/chat/completions") return nativeFetch(input, init);
  const request = JSON.parse(String(init?.body));
  const isImage = request.modalities?.includes("image");
  const reserve = isImage ? plan.imageReserveUsd : plan.preparationReserveUsd;
  if (uncertainUsd > 0) throw new Error("Further paid calls blocked by uncertain usage");
  if (isImage ? imageCalls >= plan.maximumImageCalls : textCalls >= plan.maximumPreparationCalls) throw new Error("Bounded request count reached");
  if (request.model !== (isImage ? plan.imageModel : plan.textModel)) throw new Error("Unexpected model");
  if (!isImage && (!["section_look", "scene_plan"].includes(request.response_format?.json_schema?.name) || !before.sources.some((s: {quote:string}) => request.messages?.some((m:{content:unknown}) => typeof m.content === "string" && m.content.includes(s.quote))))) throw new Error("Text call outside the two affected moments");
  if (chargedUsd + reserve > plan.subcapUsd) throw new Error("Targeted subcap reached");
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
process.argv = [process.argv[0],path.join(root,"scripts/evals/images.mts"),"--run",plan.run,"--arms","generic","--styles",plan.styles.join(","),"--analysis","convex","--file",path.join(dir,"cases.json"),"--repeats",String(plan.repeats),"--budget",String(plan.subcapUsd)];
try {
  await import(path.join(root,"scripts/evals/images.mts"));
} finally {
  globalThis.fetch = nativeFetch;
  const result = {at:new Date().toISOString(),imageCalls,textCalls,chargedUsd,uncertainUsd,subcapUsd:plan.subcapUsd};
  fs.writeFileSync(path.join(os.tmpdir(),"visibible-formless-execution.json"),JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result));
}
