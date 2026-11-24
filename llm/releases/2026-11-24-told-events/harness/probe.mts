/**
 * Text-only preview of what the image model would paint for each prompt, scored against the case label.
 *   npx tsx evals/images/runs/told/probe.mts <prompts.json> <variant.json|base> <out.json> [--model=id] [--only=a,b] [--cap=usd]
 * Every call's cost is appended to ledger.ndjson; the run stops before a call once the ledger total reaches the cap.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const [promptsFile, variantFile, out] = process.argv.slice(2);
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const model = arg("model") ?? "google/gemini-3.1-flash-lite";
const only = arg("only")?.split(",");
const cap = Number(arg("cap") ?? "0.20");
const key = readFileSync(path.join(process.env.HOME!, ".config/fragment/secrets/openrouter-dev-key"), "utf8").trim();
const ledgerFile = path.join(here, "ledger.ndjson");
const spent = () => existsSync(ledgerFile) ? readFileSync(ledgerFile, "utf8").trim().split("\n").filter(Boolean).reduce((s, l) => s + (JSON.parse(l).cost ?? 0), 0) : 0;

export function applyVariant(prompt: string, v: { howToRead?: string; rule3?: string }) {
  let p = prompt;
  if (v.howToRead) p = p.replace(/^HOW TO READ IT:.*$/m, () => v.howToRead!);
  if (v.rule3) p = p.replace(/^3\) .*$/m, () => `3) ${v.rule3}`);
  return p;
}

const SYSTEM = `You are previewing an illustration before painting it. Do not paint. Read the brief and decide exactly what single picture you would paint, then reply with only this JSON:
{"description": "two or three sentences: who and what is visible, where and when",
 "speaker": "the person in the story who is saying or writing the MOMENT's words (for example the one giving the speech, prayer or story they belong to), or null if the MOMENT is plain narration",
 "speakerVisible": true or false (is that speaker visible in your picture),
 "listenersVisible": true or false (are people listening to that speaker visible),
 "showsToldEvent": true or false (does your picture show events, people or places the words tell about, from another time or place than where the words are spoken),
 "insetOrBubble": true or false (does the picture contain a second scene, inset, bubble, vision cloud or panel)}`;

const variant = variantFile === "base" ? {} : JSON.parse(readFileSync(variantFile, "utf8"));
const cases = (JSON.parse(readFileSync(promptsFile, "utf8")) as Array<{ unit: string; label: string; prompt?: string }>).filter((c) => c.prompt && (!only || only.includes(c.unit)));
const labels = new Map(cases.map((c) => [c.unit, c.label]));
const results: Array<Record<string, unknown>> = (existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) as Array<Record<string, unknown>> : [])
  .map((r) => ({ ...r, label: labels.get(String(r.unit)) ?? r.label })).map((r) => ({ ...r, pass: grade(String(r.label), r) }));
const done = new Set(results.map((r) => r.unit));

function grade(label: string, a: Record<string, unknown>) {
  if (a.insetOrBubble) return false;
  // Nobody listening and no teller means the picture shows what is told; a teller who is in their own story may appear.
  if (label === "told") return a.speakerVisible === false && a.listenersVisible === false;
  if (label === "told-self") return a.listenersVisible === false;
  if (label === "present") return a.speakerVisible === true;
  return null; // controls are read by hand
}

async function one(c: { unit: string; label: string; prompt?: string }) {
  if (spent() >= cap) throw new Error(`cap ${cap} reached (${spent().toFixed(4)})`);
  const prompt = applyVariant(c.prompt!, variant);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, modalities: ["text"], usage: { include: true }, temperature: 0.2, ...(model.includes("nano-banana") ? { reasoning: { effort: "low" } } : { reasoning: { enabled: false } }),
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], max_tokens: 500 }),
  });
  const body = await res.json() as { choices?: Array<{ message: { content: string } }>; usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number }; error?: unknown };
  appendFileSync(ledgerFile, JSON.stringify({ at: new Date().toISOString(), model, unit: c.unit, variant: variantFile, cost: body.usage?.cost ?? 0.02, usage: body.usage, status: res.status }) + "\n");
  const text = body.choices?.[0]?.message?.content ?? "";
  let answer: Record<string, unknown> = {};
  try { answer = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { answer = { raw: text || JSON.stringify(body.error) }; }
  return { unit: c.unit, label: c.label, pass: grade(c.label, answer), ...answer };
}

const todo = cases.filter((c) => !done.has(c.unit));
for (let i = 0; i < todo.length; i += 6) {
  const batch = await Promise.all(todo.slice(i, i + 6).map(one));
  results.push(...batch);
  writeFileSync(out, JSON.stringify(results, null, 1));
}
const graded = results.filter((r) => r.pass !== null);
const by = (l: string) => { const g = graded.filter((r) => String(r.label).startsWith(l)); return `${g.filter((r) => r.pass).length}/${g.length}`; };
console.log(`told ${by("told")}  present ${by("present")}  spent $${spent().toFixed(4)}`);
for (const r of results) console.log(`${r.pass === null ? "·" : r.pass ? "✓" : "✗"} ${r.label.toString().padEnd(7)} ${r.unit.toString().padEnd(14)} spk=${r.speakerVisible} lst=${r.listenersVisible} told=${r.showsToldEvent} inset=${r.insetOrBubble} | ${String(r.description ?? r.raw).slice(0, 150)}`);
