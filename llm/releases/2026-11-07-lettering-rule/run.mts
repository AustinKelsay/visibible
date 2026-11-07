/**
 * Paired diagnostic for a reworded no-text rule. For 12 writing-prone cases of the v3 suite image run, it re-renders the
 * stored prompt twice, once unchanged (arm "current") and once with only rule 1 replaced (arm "candidate"), with the same
 * reference images and one attempt each, no scene check. Images go to the ignored evals/images/runs/<run>/; hashes, costs
 * and the blind key go to this folder.
 *
 *   npx tsx llm/releases/2026-11-07-lettering-rule/run.mts plan
 *   OPENROUTER_API_KEY=… npx tsx llm/releases/2026-11-07-lettering-rule/run.mts execute   (needs funding.json)
 *   npx tsx llm/releases/2026-11-07-lettering-rule/run.mts blind
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createOpenRouterEvalImageProvider } from "../../../src/lib/image-evals/adapters";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const run = path.basename(dir);
const out = path.join(root, "evals/images/runs", run);
const source = path.join(root, "llm/releases/2026-11-07-suite-v3-image/results.ndjson");
const SITE = "https://unique-impala-244.convex.site/image/";
const READER_RESERVE_USD = 5;
const CALL_CEILING_USD = 0.06;

const CASES = [
  "alice-croquet-game/watercolor", "alices-evidence-38/classical", "alice-drink-me/watercolor",
  "alice-cat-head-talks/classical", "alice-refuses-to-leave/watercolor", "alice-hatter-witness/watercolor",
  "daniel-5-17/classical", "daniel-5-17/fresco", "matthew-27-35-crucified/fresco",
  "matthew-1-1-genealogy/classical", "1-corinthians-13-12/fresco", "proverbs-8-21/classical",
];

type Row = { key: string; work: string; style: string; prompt: string; references: Array<{ storageId: string }>; outcome: string };
type Plan = { run: string; capUsd: number; cases: Array<{ key: string; work: string; style: string; references: string[] }>; currentRules: Record<string, string>; candidateRules: Record<string, string>; promptSha256: Record<string, { current: string; candidate: string }> };

const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as T;
const writeJson = (file: string, value: unknown) => fs.writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
const RULE_ONE = /^1\) No text or symbols anywhere:.*$/m;

/** The work's writing surfaces, as its depiction profile names them for rule 1. */
function surfaces(work: string): string {
  return (JSON.parse(fs.readFileSync(path.join(root, "works", work, "depiction.json"), "utf8")) as { writingSurfaces: string }).writingSurfaces;
}

/** The candidate rule 1: name every surface that could carry writing and say what to show instead of marks. */
export function candidateRule(writingSurfaces: string): string {
  return `1) No text or symbols anywhere. Keep every surface that could carry writing plain and unmarked: ${writingSurfaces}, papers, cards, walls, plaques, stones and clock faces show no letters, numerals, glyphs or pseudo-script. Where the moment involves writing, show the act, the glow or the blank surface, never marks. No signage, logos, or artist's signature or initials in a corner.`;
}

/** The v3 image run's successful results, by case key. */
function rows(): Map<string, Row> {
  const all = fs.readFileSync(source, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Row);
  return new Map(all.filter((r) => r.outcome === "image").map((r) => [r.key, r]));
}

/** The stored prompt and the same prompt with only rule 1 replaced. */
function prompts(row: Row) {
  const current = row.prompt;
  const match = current.match(RULE_ONE);
  assert.ok(match, `${row.key}: rule 1 not found`);
  return { current, candidate: current.replace(RULE_ONE, candidateRule(surfaces(row.work))), currentRule: match[0] };
}

/** Freeze the cases, both rules and each arm's prompt hash in plan.json. */
function plan() {
  const byKey = rows();
  const cases = CASES.map((key) => { const r = byKey.get(key); assert.ok(r, key); return { key, work: r.work, style: r.style, references: r.references.map((x) => x.storageId) }; });
  const promptSha256: Plan["promptSha256"] = {};
  const currentRules: Record<string, string> = {}, candidateRules: Record<string, string> = {};
  for (const c of cases) { const p = prompts(byKey.get(c.key)!); promptSha256[c.key] = { current: sha(p.current), candidate: sha(p.candidate) }; currentRules[c.work] ??= p.currentRule; candidateRules[c.work] ??= candidateRule(surfaces(c.work)); }
  writeJson("plan.json", { run, capUsd: 0.95, cases, currentRules, candidateRules, promptSha256, arms: ["current", "candidate"], attempts: 1, sceneCheck: false } satisfies Plan & Record<string, unknown>);
  console.log(`${cases.length} cases, ${cases.length * 2} images planned`);
}

/** The OpenRouter account balance the reader reserve is checked against. */
async function balanceUsd(apiKey: string): Promise<number> {
  const res = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${apiKey}` } });
  const data = (await res.json()) as { data: { total_credits: number; total_usage: number } };
  return data.data.total_credits - data.data.total_usage;
}

/** One image per case and arm, checking the cap and the reader reserve before every call. */
async function execute() {
  assert.ok(fs.existsSync(path.join(dir, "funding.json")), "Owner funding is required");
  const apiKey = process.env.OPENROUTER_API_KEY; assert.ok(apiKey, "OPENROUTER_API_KEY");
  const p = readJson<Plan>("plan.json"); const byKey = rows();
  fs.mkdirSync(out, { recursive: true });
  const provider = createOpenRouterEvalImageProvider({ apiKey });
  const refCache = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const ledger = path.join(dir, "ledger.ndjson");
  let spent = 0;
  for (const c of p.cases) {
    const row = byKey.get(c.key)!; const pr = prompts(row);
    for (const arm of ["current", "candidate"] as const) {
      const prompt = pr[arm];
      assert.equal(sha(prompt), p.promptSha256[c.key][arm], `${c.key} ${arm}: prompt changed since plan`);
      assert.ok(spent + CALL_CEILING_USD <= p.capUsd, "cap reached");
      const balance = await balanceUsd(apiKey);
      assert.ok(balance - CALL_CEILING_USD >= READER_RESERVE_USD, `balance ${balance} would breach the reader reserve`);
      const references = [];
      for (const id of c.references) {
        if (!refCache.has(id)) {
          const res = await fetch(SITE + id); assert.ok(res.ok, `reference ${id}: ${res.status}`);
          refCache.set(id, { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "image/jpeg" });
        }
        references.push(refCache.get(id)!);
      }
      const name = `${c.key.replace("/", "__")}__${arm}.jpg`;
      try {
        const image = await provider.generate({ model: "google/gemini-3.1-flash-lite-image", prompt, references, aspectRatio: "16:9", resolution: "1K" } as Parameters<typeof provider.generate>[0]);
        fs.writeFileSync(path.join(out, name), image.bytes);
        spent += image.costUsd ?? CALL_CEILING_USD;
        fs.appendFileSync(ledger, `${JSON.stringify({ key: c.key, arm, file: name, sha256: sha(image.bytes), costUsd: image.costUsd, elapsedMs: image.elapsedMs, providerRequestId: image.providerRequestId, at: new Date().toISOString() })}\n`);
        console.log(c.key, arm, image.costUsd);
      } catch (error) {
        spent += CALL_CEILING_USD;
        fs.appendFileSync(ledger, `${JSON.stringify({ key: c.key, arm, error: String(error), at: new Date().toISOString() })}\n`);
        console.log(c.key, arm, "failed", String(error));
      }
    }
  }
  writeJson("run-finished.json", { at: new Date().toISOString(), measuredOrCeilingUsd: spent });
}

/** Shuffle the images into blind copies with a fixed seed; the key maps them back. */
function blind() {
  const entries = fs.readFileSync(path.join(dir, "ledger.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { key: string; arm: string; file?: string; sha256?: string }).filter((e) => e.file);
  const order = entries.map((e) => ({ e, rank: sha(`lettering-2026-11-07:${e.key}:${e.arm}`) })).sort((a, b) => a.rank.localeCompare(b.rank));
  const blindDir = path.join(out, "blind"); fs.mkdirSync(blindDir, { recursive: true });
  const byKey = rows(); const key: unknown[] = []; const items: unknown[] = [];
  order.forEach(({ e }, i) => {
    const id = `b${String(i + 1).padStart(2, "0")}`;
    const bytes = fs.readFileSync(path.join(out, e.file!)); assert.equal(sha(bytes), e.sha256);
    fs.copyFileSync(path.join(out, e.file!), path.join(blindDir, `${id}.jpg`));
    const plan = byKey.get(e.key)!.prompt.split("SCENE PLAN", 2)[1]?.split("ART STYLE", 1)[0]?.trim() ?? "";
    items.push({ id, file: path.relative(root, path.join(blindDir, `${id}.jpg`)), scenePlan: plan });
    key.push({ id, key: e.key, arm: e.arm, sha256: e.sha256 });
  });
  writeJson("blind-items.json", { items }); writeJson("blind-key.json", { items: key });
  console.log(`${items.length} blind items`);
}

const command = process.argv[2];
if (command === "plan") plan();
else if (command === "execute") await execute();
else if (command === "blind") blind();
else throw new Error("plan | execute | blind");
