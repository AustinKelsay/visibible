/** Explicit read-only packet read-back; never invokes a model or mutation. */
import fs from "node:fs";
import { parseEnv } from "node:util";
import { assemblePacket, packetProvider, requirePresence, save } from "./packets.mjs";

const envFile = process.env.VISIBIBLE_EVAL_ENV_FILE;
if (!envFile) throw new Error("Private environment path required");
const env = parseEnv(fs.readFileSync(envFile, "utf8"));
if (!env.NEXT_PUBLIC_CONVEX_URL || !env.OPENROUTER_API_KEY || !env.CONVEX_SERVER_SECRET) throw new Error("Missing private configuration");
const provider = await packetProvider({ NEXT_PUBLIC_CONVEX_URL: env.NEXT_PUBLIC_CONVEX_URL, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, CONVEX_SERVER_SECRET: env.CONVEX_SERVER_SECRET }, { id: "forbidden", complete: async () => { throw new Error("Read-only model"); } });
const packets = [];
for (const style of ["classical", "watercolor", "icon"]) {
  for (let n = 1; n <= 3; n++) {
    const packet = await assemblePacket(provider, style, n);
    requirePresence(packet);
    if (packet.preparationCalls) throw new Error("Unexpected preparation");
    packets.push(packet);
  }
}
save("postflight.json", { at: new Date().toISOString(), paidCalls: 0, mutations: 0, packets });
console.log(JSON.stringify({ packets: packets.length, paidCalls: 0, mutations: 0 }));
