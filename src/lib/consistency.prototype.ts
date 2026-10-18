/**
 * PROTOTYPE, throwaway. Never merge this branch.
 *
 * Question: "Does the chosen engine hold characters and locations steady across
 * verses and art styles?" (wayfinder ticket #142, map #135).
 *
 * Uses the production `buildImagePrompt` / `buildScenePlannerPrompt` and the
 * production chat-completions image request. Canon text, the section look and
 * canon reference images are added on top, so the condition is the only variable:
 *   A        today: production text prompt, no canon (Lite)
 *   B        + canon text (+ section look for Exodus), no references (Lite)
 *   C        + canon reference images, at most 3 per image (Lite and 3.1 Flash)
 *   D1 / D2  Peter set, Lite, non-Classical styles: per-style Peter sheet, or the
 *            Classical sheet plus a style reference image
 * Each verse is planned once with the free planner and the plan is reused in every
 * condition and style. Every verse is generated on its own: references are fixed
 * canon assets, never another verse's output.
 *
 * Run from the repo root (needs OPENROUTER_API_KEY in .env.local):
 *   npm run prototype:consistency -- section-look   draft the Exodus 14 section look (free model)
 *   npm run prototype:consistency -- refs [ids…]     reference sheets + style references (3.1 Flash)
 *   npm run prototype:consistency -- plans           scene plans (free planner)
 *   npm run prototype:consistency -- verses          all conditions; resumes, skips finished jobs
 *   npm run prototype:consistency -- results         rebuild results.json from the ledger
 * Every billed call is appended to ledger.json; generation stops before the
 * running total of usage.cost would pass the $6.50 cap.
 * Output: src/lib/consistency.prototype-output/
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PROMPT_MAX_CHARS, STYLE_PROFILES, buildImagePrompt, buildScenePlannerPrompt,
  extractJsonObject, normalizeScenePlan,
  type ScenePlan, type StyleProfile,
} from "./image-prompts";

const MODELS = {
  lite: "google/gemini-3.1-flash-lite-image",
  flash: "google/gemini-3.1-flash-image",
} as const;
type ModelKey = keyof typeof MODELS;
const PLANNER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const TRANSLATION = "web";
const CAP_USD = 6.5;
// Conservative per-call estimates used to reserve budget before a call starts.
const ESTIMATE_USD: Record<ModelKey, number> = { lite: 0.037, flash: 0.072 };
const OUT = path.resolve("src/lib/consistency.prototype-output");
const REFS_DIR = path.join(OUT, "refs");
const IMAGES_DIR = path.join(OUT, "images");
const RAW_DIR = "/tmp/visibible-consistency-raw";
const MAGICK = "/opt/homebrew/bin/magick";
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) throw new Error("OPENROUTER_API_KEY missing");
if (PROMPT_MAX_CHARS < 5000) throw new Error("set PROTOTYPE_PROMPT_MAX_CHARS=5000 so the style brief is not trimmed");

// ---------------------------------------------------------------- styles

const CLASSICAL = STYLE_PROFILES.classical;
// From src/lib/art-styles.prototype.ts, with the two negatives #138 asked to strengthen.
const WATERCOLOUR: StyleProfile = {
  id: "watercolour",
  label: "Ink & Watercolor",
  rendering: "Loose pen-and-ink drawing with transparent watercolour washes; expressive, airy and contemplative, like a travelling artist's field study of the biblical world.",
  palette: "Transparent washes of ochre, sienna, indigo and sage; luminous lights.",
  lighting: "Bright, airy daylight; shadows as cool layered washes.",
  materials: "Confident ink linework, wet-in-wet blooms, granulating pigment.",
  composition: "Sketch-like economy; detail concentrated on key figures, softer surroundings.",
  negative: "Paint washes and scenery all the way into every edge and all four corners: no white or unpainted paper margins, no white vignette, no fading out to blank paper at the edges, no paper edges, sketchbook, tape or border. Avoid photorealism, digital airbrush smoothness and cartoon caricature.",
};
const STAINED_GLASS: StyleProfile = {
  id: "stained-glass",
  label: "Stained Glass",
  rendering: "The scene rendered entirely in the visual language of medieval stained glass: jewel-toned glass segments bounded by dark lead lines, stylised reverent figures, luminous and symbolic. The glass treatment is the rendering of the world itself.",
  palette: "Saturated jewel tones: cobalt, ruby, emerald and amber, with dark leading.",
  lighting: "Glowing back-lit radiance, as if light passes through every segment.",
  materials: "Faceted glass with subtle streaks and bubbles; painted grisaille detail on faces and drapery.",
  composition: "Clear iconic staging with bold, readable figure shapes.",
  negative: "Never show a window, window frame or window shape: no arched, pointed or rounded top, no oval or circular outline, no tracery, church interior, wall or light falling on a floor. No dark or black corners, vignette or border: lit glass segments carry the scene into all four corners and every edge of the rectangle. Avoid photorealism.",
};
const STYLES = [CLASSICAL, WATERCOLOUR, STAINED_GLASS];

// ---------------------------------------------------------------- canon

type LifeStage = {
  id: string; ageRange: string; build: string; skin: string; hairAndBeard: string;
  facialNotes: string; garments: string; props: string;
};
type Character = { id: string; name: string; aliases: string[]; lifeStages: LifeStage[] };
type Location = { id: string; name: string; terrain: string; architecture: string; vegetation: string; landmarks: string };
type Canon = { rules: string[]; characters: Character[]; locations: Location[] };
type SectionLook = { section: string; title: string; place: string; timeOfDay: string; weather: string; light: string; clothing: string };

const canon = JSON.parse(await readFile(path.join(OUT, "canon.json"), "utf8")) as Canon;
const character = (id: string) => canon.characters.find((c) => c.id === id)!;
const location = (id: string) => canon.locations.find((l) => l.id === id)!;

function characterText(c: Character): string {
  const s = c.lifeStages[0];
  const props = s.props.startsWith("none") ? "" : `; carries ${s.props}`;
  return `${c.name}: ${s.ageRange}; ${s.build}; ${s.skin}; ${s.hairAndBeard}; ${s.facialNotes}; wears ${s.garments}${props}.`;
}
function locationText(l: Location): string {
  const arch = l.architecture.startsWith("none") ? "no buildings" : l.architecture;
  return `${l.name}: ${l.terrain}; ${arch}; ${l.vegetation}; landmarks: ${l.landmarks}.`;
}
function styleBrief(s: StyleProfile): string {
  return [s.rendering, s.palette, s.lighting, s.materials].filter(Boolean).join(" ");
}
const NO_TEXT = "Absolutely no text of any kind anywhere: no names, labels, captions, titles, letters, numbers, arrows, colour swatches, rulers, frames or panel dividers.";

// ---------------------------------------------------------------- verses

type Verse = {
  id: string; book: string; name: string; chapter: number; verse: number;
  set: "peter" | "exodus"; characters: string[]; locations: string[]; section?: boolean;
};
const VERSES: Verse[] = [
  { id: "luk-5-8", book: "LUK", name: "Luke", chapter: 5, verse: 8, set: "peter", characters: ["peter"], locations: ["sea-of-galilee"] },
  { id: "mat-14-29", book: "MAT", name: "Matthew", chapter: 14, verse: 29, set: "peter", characters: ["peter"], locations: ["sea-of-galilee"] },
  { id: "mat-26-75", book: "MAT", name: "Matthew", chapter: 26, verse: 75, set: "peter", characters: ["peter"], locations: [] },
  { id: "jhn-21-7", book: "JHN", name: "John", chapter: 21, verse: 7, set: "peter", characters: ["peter"], locations: ["sea-of-galilee"] },
  { id: "act-2-14", book: "ACT", name: "Acts", chapter: 2, verse: 14, set: "peter", characters: ["peter"], locations: [] },
  { id: "exo-14-21", book: "EXO", name: "Exodus", chapter: 14, verse: 21, set: "exodus", characters: ["moses"], locations: ["red-sea-crossing"], section: true },
  { id: "exo-14-22", book: "EXO", name: "Exodus", chapter: 14, verse: 22, set: "exodus", characters: ["moses"], locations: ["red-sea-crossing"], section: true },
  { id: "exo-14-27", book: "EXO", name: "Exodus", chapter: 14, verse: 27, set: "exodus", characters: ["moses"], locations: ["red-sea-crossing"], section: true },
];

type ChapterVerse = { verse: number; text: string };
const chapterCache = new Map<string, ChapterVerse[]>();
async function chapter(book: string, ch: number): Promise<ChapterVerse[]> {
  const key = `${book}/${ch}`;
  if (!chapterCache.has(key)) {
    // Disk cache: bible-api.com rate-limits, and every phase rebuilds all prompts.
    const cacheFile = path.join(RAW_DIR, `bible-${TRANSLATION}-${book}-${ch}.json`);
    if (!existsSync(cacheFile)) {
      const res = await fetch(`https://bible-api.com/data/${TRANSLATION}/${book}/${ch}`);
      if (!res.ok) throw new Error(`bible-api ${key}: ${res.status}`);
      await mkdir(RAW_DIR, { recursive: true });
      await writeFile(cacheFile, await res.text());
    }
    chapterCache.set(key, (JSON.parse(await readFile(cacheFile, "utf8")) as { verses: ChapterVerse[] }).verses);
  }
  return chapterCache.get(key)!;
}
async function verseContext(v: Verse) {
  const verses = await chapter(v.book, v.chapter);
  const at = (n: number) => verses.find((x) => x.verse === n);
  const prev = at(v.verse - 1);
  const next = at(v.verse + 1);
  return {
    reference: `${v.name} ${v.chapter}:${v.verse}`,
    verseText: at(v.verse)!.text.trim(),
    prevVerse: prev ? { number: prev.verse, text: prev.text.trim() } : null,
    nextVerse: next ? { number: next.verse, text: next.text.trim() } : null,
  };
}

// ---------------------------------------------------------------- OpenRouter + ledger

type LedgerEntry = {
  id: string; kind: string; model: string; costUsd: number | null; credits: number | null; ms: number;
  promptTokens?: number; completionTokens?: number; provider?: string; refs?: string[]; promptChars?: number;
  file?: string; outputFormat?: string; outputBytes?: number; error?: string; superseded?: boolean; at: string;
};
const LEDGER = path.join(OUT, "ledger.json");
const ledger: LedgerEntry[] = existsSync(LEDGER) ? JSON.parse(await readFile(LEDGER, "utf8")) : [];
let reserved = 0;
const spent = () => ledger.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
async function record(entry: LedgerEntry) {
  ledger.push(entry);
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2));
}
const credits = (usd: number | null) => (typeof usd === "number" ? Math.ceil(usd * 125) : null);

async function openrouter(body: unknown) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "visibible-prototype" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function dataUrl(refId: string): Promise<string> {
  return `data:image/jpeg;base64,${(await readFile(path.join(REFS_DIR, `${refId}.jpg`))).toString("base64")}`;
}

/** One billed image call. Returns the saved JPEG path, or null when skipped or failed. */
async function generateImage(opts: {
  id: string; kind: string; model: ModelKey; text: string; refs: string[]; outFile: string;
}): Promise<LedgerEntry | null> {
  const estimate = ESTIMATE_USD[opts.model];
  if (spent() + reserved + estimate > CAP_USD) {
    console.log(`SKIP ${opts.id}: budget (spent $${spent().toFixed(4)}, reserved $${reserved.toFixed(3)})`);
    return null;
  }
  reserved += estimate;
  try {
    const content = opts.refs.length
      ? [{ type: "text", text: opts.text }, ...await Promise.all(opts.refs.map(async (r) => ({ type: "image_url", image_url: { url: await dataUrl(r) } })))]
      : opts.text;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const started = Date.now();
      const res = await openrouter({
        model: MODELS[opts.model],
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "16:9", ...(opts.model === "flash" ? { image_size: "1K" } : {}) },
      });
      const ms = Date.now() - started;
      const usage = res.json?.usage;
      const costUsd: number | null = typeof usage?.cost === "number" ? usage.cost : null;
      const base: LedgerEntry = {
        id: opts.id, kind: opts.kind, model: MODELS[opts.model], costUsd, credits: credits(costUsd), ms,
        promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
        provider: res.json?.provider, refs: opts.refs, promptChars: opts.text.length, at: new Date().toISOString(),
      };
      const url: string | undefined = res.json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const match = url?.match(/^data:image\/(\w+);base64,(.+)$/s);
      if (!res.ok || !match) {
        const error = `HTTP ${res.status}: ${(res.json ? JSON.stringify(res.json.error ?? res.json) : res.text).slice(0, 240)}`;
        await record({ ...base, error });
        console.warn(`FAIL ${opts.id} attempt ${attempt}: ${error}`);
        if (costUsd || attempt === 3) return null; // billed failures are not retried blindly
        await new Promise((r) => setTimeout(r, 4000 * attempt));
        continue;
      }
      const raw = Buffer.from(match[2], "base64");
      await mkdir(RAW_DIR, { recursive: true });
      const rawFile = path.join(RAW_DIR, `${opts.id}.${match[1]}`);
      await writeFile(rawFile, raw);
      await mkdir(path.dirname(opts.outFile), { recursive: true });
      // 3.1 Flash returns 1.6–2.8 MB PNGs; store everything as JPEG so the branch stays small.
      if (match[1] === "jpeg" || match[1] === "jpg") await writeFile(opts.outFile, raw);
      else execFileSync(MAGICK, [rawFile, "-quality", "90", opts.outFile]);
      const entry = { ...base, file: path.relative(OUT, opts.outFile), outputFormat: match[1], outputBytes: raw.length };
      await record(entry);
      console.log(`OK ${opts.id} ${ms} ms $${costUsd?.toFixed(4)} (total $${spent().toFixed(4)})`);
      return entry;
    }
    return null;
  } finally {
    reserved -= estimate;
  }
}

async function freeChat(content: string, maxTokens: number) {
  const started = Date.now();
  const res = await openrouter({
    model: PLANNER_MODEL, messages: [{ role: "user", content }],
    temperature: 0.2, max_tokens: maxTokens, reasoning: { enabled: false },
  });
  const cost = res.json?.usage?.cost ?? 0;
  if (cost) await record({ id: "free-model", kind: "planner", model: PLANNER_MODEL, costUsd: cost, credits: credits(cost), ms: Date.now() - started, at: new Date().toISOString() });
  if (!res.ok) throw new Error(`planner HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  const text = res.json?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : "";
}

async function runPool<T>(jobs: (() => Promise<T>)[], size: number) {
  const queue = [...jobs];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await queue.shift()!();
  }));
}

// ---------------------------------------------------------------- section look

const SECTION = { id: "exo-14-15-31", title: "Crossing the Red Sea", book: "EXO", chapter: 14, from: 15, to: 31, reference: "Exodus 14:15–31" };
const SECTION_LOOK_FILE = path.join(OUT, "section-look.json");

async function draftSectionLook() {
  const verses = (await chapter(SECTION.book, SECTION.chapter)).filter((v) => v.verse >= SECTION.from && v.verse <= SECTION.to);
  const prompt = `You write a SECTION LOOK for an illustrated Bible: one shared visual description reused by every verse image in a story section, so that independently generated images of the section agree with each other. Return ONLY valid JSON with keys: place, timeOfDay, weather, light, clothing.

Rules:
- Each value is one or two short phrases, at most 220 characters.
- Describe what stays the same across the whole section. Leave out poses, actions and individual moments; a separate scene plan decides those per verse.
- If the section spans a change (for example night into morning), say so once in timeOfDay and light.
- People are historically grounded ancient Near Eastern people (olive-to-brown skin, dark hair).
- God is never a human figure: only light, cloud, fire or wind.
- No text or written elements.

Story section: ${SECTION.reference} (${SECTION.title})
Text (WEB):
${verses.map((v) => `${v.verse} ${v.text.trim().replace(/\s+/g, " ")}`).join("\n")}`;
  const raw = await freeChat(prompt, 600);
  const json = extractJsonObject(raw);
  const draft = json ? JSON.parse(json) : null;
  await writeFile(path.join(OUT, "section-look.draft.json"), JSON.stringify({ model: PLANNER_MODEL, prompt, raw, draft }, null, 2));
  console.log(raw);
}

// ---------------------------------------------------------------- reference sheets

type RefSpec = { id: string; kind: "sheet" | "style-ref"; prompt: string; refs: string[] };
function characterSheet(c: Character, style: StyleProfile, extra = ""): string {
  return `Character reference sheet for an illustrated Bible.
Art style: ${style.label}. ${styleBrief(style)}
Character: ${characterText(c)}
Layout: the same man shown three times side by side, evenly spaced, on one plain, even mid-grey background: (1) full-length standing view facing the viewer; (2) full-length standing view in a three-quarter turn; (3) a large head-and-shoulders close-up portrait in three-quarter view that shows his face clearly. Calm, neutral standing pose and expression, arms relaxed${extra}. Face, hair, beard, build, garments and colours identical in all three views.
${NO_TEXT}
No other people. Not a photograph.`;
}
function restyledSheet(c: Character, style: StyleProfile): string {
  return `The attached image is the character reference sheet for ${c.name}. Repaint this exact sheet in a different art style.
Keep the same man, the same three views, poses and layout, and a plain, even background. Keep his face exactly: ${c.lifeStages[0].facialNotes}; ${c.lifeStages[0].hairAndBeard}. Keep his build, skin tone, garments and garment colours.
New art style: ${style.label}. ${styleBrief(style)}
${NO_TEXT}
No other people. Not a photograph.`;
}

const REF_SPECS: RefSpec[] = [
  { id: "peter--classical", kind: "sheet", refs: [], prompt: characterSheet(character("peter"), CLASSICAL) },
  { id: "moses--classical", kind: "sheet", refs: [], prompt: characterSheet(character("moses"), CLASSICAL, ", holding his staff upright in his right hand in every view") },
  {
    id: "sea-of-galilee--classical", kind: "sheet", refs: [], prompt: `Location reference sheet for an illustrated Bible.
Art style: ${CLASSICAL.label}. ${styleBrief(CLASSICAL)}
Location: ${locationText(location("sea-of-galilee"))}
Layout: two views of this same place side by side, each filling half of the image, separated by a narrow plain mid-grey gap. Left: a wide, high establishing view from the clifftop of Mount Arbel looking east across the whole lake to the steep eastern cliffs and the flat Golan heights, with Mount Hermon's snowy peak faint on the far-left horizon. Right: a ground-level view along the black basalt pebble shore of a small fishing town, with two moored wooden fishing boats and flat-roofed basalt houses. Clear, neutral mid-morning daylight, calm water.
No people, no animals.
${NO_TEXT}`,
  },
  {
    id: "red-sea-crossing--classical", kind: "sheet", refs: [], prompt: `Location reference image for an illustrated Bible.
Art style: ${CLASSICAL.label}. ${styleBrief(CLASSICAL)}
Location: ${locationText(location("red-sea-crossing"))}
Layout: one single wide establishing view from the flat western shore plain, looking east across the sea to the jagged red-brown mountains on the far shore, with the rocky headland at the left. Calm water, clear neutral daylight.
No people, no animals, no chariots, no tents.
${NO_TEXT}`,
  },
  { id: "peter--watercolour", kind: "sheet", refs: ["peter--classical"], prompt: restyledSheet(character("peter"), WATERCOLOUR) },
  { id: "peter--stained-glass", kind: "sheet", refs: ["peter--classical"], prompt: restyledSheet(character("peter"), STAINED_GLASS) },
  ...[WATERCOLOUR, STAINED_GLASS].map((style): RefSpec => ({
    id: `style--${style.id}`, kind: "style-ref", refs: [], prompt: `Style reference image for an illustrated Bible; it exists only to show the art style.
Subject: a quiet hillside in the land of Israel: an old olive tree, a low dry-stone wall, wildflowers and rocks in the foreground, terraced hills fading into the distance under a soft sky. No people, no animals, no buildings, no water.
Art style: ${style.label}. ${styleBrief(style)}
Style negatives: ${style.negative}
One single full-bleed scene, composed as a cropped detail of a larger work: the painted scene runs off all four edges, with colour in every corner. ${NO_TEXT}`,
  })),
];

async function makeRefs(only: string[]) {
  await mkdir(REFS_DIR, { recursive: true });
  // Per-style Peter sheets are derived from the Classical sheet, so they run after it.
  const specs = REF_SPECS.filter((s) => (only.length ? only.includes(s.id) : !existsSync(path.join(REFS_DIR, `${s.id}.jpg`))));
  const ordered = [specs.filter((s) => !s.refs.length), specs.filter((s) => s.refs.length)];
  for (const batch of ordered) {
    await runPool(batch.map((spec) => async () => {
      const file = path.join(REFS_DIR, `${spec.id}.jpg`);
      if (existsSync(file)) {
        // Keep rejected sheets for the record; the ledger entry is marked superseded.
        const n = ledger.filter((e) => e.id === spec.id).length;
        await rename(file, path.join(REFS_DIR, `${spec.id}.rejected-${n}.jpg`));
        for (const e of ledger) if (e.id === spec.id && e.file && !e.superseded) { e.superseded = true; e.file = `refs/${spec.id}.rejected-${n}.jpg`; }
      }
      await generateImage({ id: spec.id, kind: spec.kind, model: "flash", text: spec.prompt, refs: spec.refs, outFile: file });
    }), 4);
  }
}

// ---------------------------------------------------------------- plans

const PLANS_FILE = path.join(OUT, "plans.json");
async function makePlans() {
  const plans: Record<string, ScenePlan | null> = existsSync(PLANS_FILE) ? JSON.parse(await readFile(PLANS_FILE, "utf8")) : {};
  for (const v of VERSES) {
    if (plans[v.id]) continue;
    const ctx = await verseContext(v);
    try {
      const raw = await freeChat(buildScenePlannerPrompt({ ...ctx, chapterTheme: null, styleProfile: CLASSICAL }), 220);
      const json = extractJsonObject(raw);
      plans[v.id] = json ? normalizeScenePlan(JSON.parse(json)) : null;
    } catch (error) {
      console.warn(v.id, "planner failed", error);
      plans[v.id] = null;
    }
    console.log(v.id, plans[v.id] ? JSON.stringify(plans[v.id]) : "NO PLAN");
  }
  await writeFile(PLANS_FILE, JSON.stringify(plans, null, 2));
}

// ---------------------------------------------------------------- verse prompts

type Condition = "A" | "B" | "C" | "D1" | "D2";
type Job = { id: string; verse: Verse; style: StyleProfile; condition: Condition; model: ModelKey; refs: string[]; text: string };

function refLine(refId: string, index: number, style: StyleProfile): string {
  const n = `Image ${index + 1}`;
  if (refId.startsWith("style--")) return `- ${n}: art-style reference. Copy only its rendering technique, palette and texture; ignore its subject, landscape and layout.`;
  const [entity, refStyle] = refId.split("--");
  const sameStyle = refStyle === style.id;
  if (entity === "peter" || entity === "moses") {
    const c = character(entity);
    const cue = entity === "peter"
      ? "his crooked nose, the scar through his left eyebrow, the grey streak in his beard, his build and his rust-orange mantle"
      : "his white hair and beard, his face, his red mantle with ochre border and his crooked staff";
    return `- ${n}: ${c.name}'s character sheet${sameStyle && refStyle !== "classical" ? ` in this art style` : ""} (one man shown in three views). Draw ${c.name} once only, matching ${cue}. Do not copy the sheet's poses, layout or plain grey background.`;
  }
  const l = location(entity);
  return `- ${n}: ${l.name} reference ${entity === "sea-of-galilee" ? "views" : "view"}. Match its terrain, shore, mountains and water, but take the camera angle and framing from the scene plan; do not copy the reference's viewpoint.`;
}

async function versePrompt(v: Verse, style: StyleProfile, condition: Condition, refs: string[], plans: Record<string, ScenePlan | null>, sectionLook: SectionLook): Promise<string> {
  const ctx = await verseContext(v);
  const scenePlan = plans[v.id] ?? null;
  const { prompt } = buildImagePrompt({
    verseId: v.id, translationId: TRANSLATION, ...ctx, chapterTheme: null, styleProfile: style,
    aspectRatio: "16:9", resolution: "1K", generationNumber: null,
    scenePlan, scenePlannerUsed: Boolean(scenePlan), scenePlanFromCache: false,
  });
  if (condition === "A") return prompt;
  const names = v.characters.map((id) => character(id).name);
  const blocks: string[] = [
    [
      "CANON (fixed identity of named people and places; the scene plan decides pose, expression, action and situational details):",
      ...canon.rules.map((r) => `- ${r}`),
      ...v.characters.map((id) => `- ${characterText(character(id))}`),
      ...v.locations.map((id) => `- Location, ${locationText(location(id))}`),
      `- Only ${names.join(" and ")} ${names.length > 1 ? "have" : "has"} this canon look; any other people get clearly different faces, hair and clothing colours.`,
    ].join("\n"),
  ];
  if (v.section) {
    blocks.push([
      `SECTION LOOK (shared by every image of ${sectionLook.section}, ${sectionLook.title}):`,
      `- Place: ${sectionLook.place}`,
      `- Time of day: ${sectionLook.timeOfDay}`,
      `- Weather: ${sectionLook.weather}`,
      `- Light: ${sectionLook.light}`,
      `- Clothing: ${sectionLook.clothing}`,
    ].join("\n"));
  }
  if (refs.length) {
    blocks.push([
      "REFERENCE IMAGES (attached after this text, in this order; use them for identity only, never as the composition):",
      ...refs.map((r, i) => refLine(r, i, style)),
      "Render everything in the STYLE PROFILE below, even where a reference is painted in another style.",
    ].join("\n"));
  }
  const marker = "\n\nSCENE PRESENTATION:";
  if (!prompt.includes(marker)) throw new Error(`no SCENE PRESENTATION block in ${v.id}`);
  return prompt.replace(marker, `\n\n${blocks.join("\n\n")}${marker}`);
}

async function buildJobs(): Promise<Job[]> {
  const plans = JSON.parse(await readFile(PLANS_FILE, "utf8")) as Record<string, ScenePlan | null>;
  const sectionLook = JSON.parse(await readFile(SECTION_LOOK_FILE, "utf8")) as SectionLook;
  const jobs: Job[] = [];
  const add = async (v: Verse, style: StyleProfile, condition: Condition, model: ModelKey, refs: string[]) => {
    jobs.push({ id: `${v.id}--${style.id}--${condition}-${model}`, verse: v, style, condition, model, refs, text: await versePrompt(v, style, condition, refs, plans, sectionLook) });
  };
  const classicalRefs = (v: Verse) => [...v.characters, ...v.locations].map((id) => `${id}--classical`);
  // Order is budget priority: 3.1 Flash runs last, so a budget stop cuts Flash repetitions first.
  for (const condition of ["A", "B", "C"] as const) {
    for (const v of VERSES) for (const style of STYLES) await add(v, style, condition, "lite", condition === "C" ? classicalRefs(v) : []);
  }
  for (const v of VERSES.filter((x) => x.set === "peter")) {
    for (const style of [WATERCOLOUR, STAINED_GLASS]) {
      const locs = v.locations.map((id) => `${id}--classical`);
      await add(v, style, "D1", "lite", [`peter--${style.id}`, ...locs]);
      await add(v, style, "D2", "lite", ["peter--classical", ...locs, `style--${style.id}`]);
    }
  }
  for (const v of VERSES) for (const style of STYLES) await add(v, style, "C", "flash", classicalRefs(v));
  for (const j of jobs) if (j.refs.length > 3) throw new Error(`${j.id} exceeds the 3-reference cap`);
  return jobs;
}

async function runVerses(filter?: string) {
  const jobs = (await buildJobs()).filter((j) => !filter || j.id.includes(filter));
  const done = new Set(ledger.filter((e) => e.kind === "verse" && e.file && !e.superseded).map((e) => e.id));
  const todo = jobs.filter((j) => !done.has(j.id));
  console.log(`${todo.length} of ${jobs.length} jobs to run; spent so far $${spent().toFixed(4)}`);
  await runPool(todo.map((j) => async () => {
    await generateImage({ id: j.id, kind: "verse", model: j.model, text: j.text, refs: j.refs, outFile: path.join(IMAGES_DIR, `${j.id}.jpg`) });
  }), 4);
  await writeResults();
}

async function writeResults() {
  const jobs = await buildJobs();
  const latest = new Map<string, LedgerEntry>();
  for (const e of ledger) if (e.file && !e.superseded) latest.set(e.id, e);
  const images = jobs.map((j) => {
    const e = latest.get(j.id);
    return {
      id: j.id, set: j.verse.set, verse: j.verse.id, reference: `${j.verse.name} ${j.verse.chapter}:${j.verse.verse}`,
      style: j.style.id, condition: j.condition, model: MODELS[j.model], refs: j.refs, promptChars: j.text.length,
      file: e?.file ?? null, costUsd: e?.costUsd ?? null, credits: e?.credits ?? null, ms: e?.ms ?? null,
      promptTokens: e?.promptTokens ?? null, provider: e?.provider ?? null, prompt: j.text,
    };
  });
  const sheets = REF_SPECS.map((s) => ({ ...s, ...(latest.get(s.id) ?? {}), prompt: s.prompt }));
  const billed = ledger.filter((e) => typeof e.costUsd === "number");
  await writeFile(path.join(OUT, "results.json"), JSON.stringify({
    question: "Does the chosen engine hold characters and locations steady across verses and art styles? (#142)",
    models: MODELS, planner: PLANNER_MODEL, translation: TRANSLATION, promptMaxChars: PROMPT_MAX_CHARS, capUsd: CAP_USD,
    spendUsd: Number(spent().toFixed(6)), billedCalls: billed.length,
    spendByKind: Object.fromEntries(["sheet", "style-ref", "verse"].map((k) => [k, Number(billed.filter((e) => e.kind === k).reduce((s, e) => s + (e.costUsd ?? 0), 0).toFixed(6))])),
    styles: STYLES, verses: VERSES, sheets, images,
  }, null, 2));
  console.log(`results.json: ${images.filter((i) => i.file).length}/${images.length} images, spend $${spent().toFixed(4)}`);
}

// ---------------------------------------------------------------- main

const [phase = "verses", ...args] = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
if (phase === "section-look") await draftSectionLook();
else if (phase === "refs") await makeRefs(args);
else if (phase === "plans") await makePlans();
else if (phase === "verses") await runVerses(args[0]);
else if (phase === "results") await writeResults();
else if (phase === "prompt") {
  const job = (await buildJobs()).find((j) => j.id === args[0]);
  console.log(job ? `${job.text}\n\n[refs: ${job.refs.join(", ")}] [${job.text.length} chars]` : "no such job");
} else throw new Error(`unknown phase ${phase}`);
console.log(`spend so far: $${spent().toFixed(4)} of $${CAP_USD}`);
