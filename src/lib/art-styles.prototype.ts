/**
 * PROTOTYPE, throwaway. Never merge this branch.
 *
 * Question: "Which two art styles join Classical?" (wayfinder ticket #138).
 * Renders the same five verses in Classical plus five candidate art styles,
 * using the production prompt builder and the production image request.
 * Only the style profile changes between columns; each verse uses one scene
 * plan (planned once, with the Classical profile) so style is the only variable.
 *
 * Run from the repo root (needs OPENROUTER_API_KEY in .env.local):
 *   npm run prototype:art-styles
 * Output: src/lib/art-styles.prototype-output/
 * Full-brief variant (no style trimming, same scene plans):
 *   PROTOTYPE_VARIANT=full-brief PROTOTYPE_PROMPT_MAX_CHARS=4000 npm run prototype:art-styles
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  STYLE_PROFILES, buildImagePrompt, buildScenePlannerPrompt,
  extractJsonObject, normalizeScenePlan,
  type ScenePlan, type StyleProfile,
} from "./image-prompts";
import { genesis1Theme } from "../data/genesis-1";

const IMAGE_MODEL = "google/gemini-3.1-flash-lite-image";
const PLANNER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const TRANSLATION = "web";
const BASE_OUT = path.resolve("src/lib/art-styles.prototype-output");
// PROTOTYPE_VARIANT=full-brief raises the prompt budget so no style line is trimmed,
// and reuses the first run's scene plans so only the budget changes.
const VARIANT = process.env.PROTOTYPE_VARIANT;
const OUT = VARIANT ? path.join(BASE_OUT, VARIANT) : BASE_OUT;
const priorPlans = new Map<string, ScenePlan | null>();
if (VARIANT) {
  const prior = JSON.parse(await readFile(path.join(BASE_OUT, "results.json"), "utf8")) as { results: { reference: string; scenePlan: ScenePlan | null }[] };
  for (const r of prior.results) priorPlans.set(r.reference, r.scenePlan);
}
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) throw new Error("OPENROUTER_API_KEY missing");

const VERSES = [
  { book: "GEN", name: "Genesis", chapter: 1, verse: 3 },
  { book: "EXO", name: "Exodus", chapter: 14, verse: 21 },
  { book: "1SA", name: "1 Samuel", chapter: 17, verse: 49 },
  { book: "LUK", name: "Luke", chapter: 2, verse: 7 },
  { book: "ACT", name: "Acts", chapter: 1, verse: 9 },
];

const CANDIDATES: StyleProfile[] = [
  STYLE_PROFILES.classical,
  {
    id: "storybook",
    label: "Illustrated Storybook",
    rendering: "Warm hand-illustrated storybook art in gouache and coloured pencil; gentle, approachable and reverent, suitable for families. Simplified shapes and expressive faces with grounded proportions. The illustration is the depicted world itself, not a printed page.",
    palette: "Soft, warm palette with clear, friendly colour accents; gentle contrast.",
    lighting: "Soft golden light with a gentle glow on key figures.",
    materials: "Visible gouache brushwork and pencil grain; matte finish.",
    composition: "Clear storytelling staging; readable silhouettes; the key moment centred.",
    negative: "Avoid photorealism, 3D render or CGI look. Avoid anime, chibi or exaggerated caricature. Never show a book page, page edges, gutter, white margins, border or vignette. The illustrated world must fill the image edge-to-edge.",
  },
  {
    id: "cinematic",
    label: "Cinematic Film Still",
    rendering: "Photorealistic film still from a large-scale historical epic shot on location; authentic ancient Near Eastern costume, people and architecture; reverent and grounded.",
    palette: "Natural filmic colour grade; earthy tones with restrained amber and teal contrast.",
    lighting: "Motivated natural light (sun, fire, torches); volumetric haze and atmosphere.",
    materials: "Real fabric weave, weathered skin, dust, stone and wood; fine film grain.",
    composition: "Anamorphic widescreen framing; purposeful camera angle; shallow depth of field on the key figure.",
    negative: "Avoid painterly, illustrated or cartoon looks. Avoid glossy CGI, plastic skin, video-game rendering or fantasy armour. No letterbox bars, film borders, cameras, crew or behind-the-scenes elements.",
  },
  {
    id: "stained-glass",
    label: "Stained Glass",
    rendering: "The scene rendered entirely in the visual language of medieval stained glass: jewel-toned glass segments bounded by dark lead lines, stylised reverent figures, luminous and symbolic. The glass treatment is the rendering of the world itself.",
    palette: "Saturated jewel tones: cobalt, ruby, emerald and amber, with dark leading.",
    lighting: "Glowing back-lit radiance, as if light passes through every segment.",
    materials: "Faceted glass with subtle streaks and bubbles; painted grisaille detail on faces and drapery.",
    composition: "Clear iconic staging with bold, readable figure shapes.",
    negative: "Never show a window frame, window arch, church interior, wall or light falling on a floor. No border or surrounding architecture; the glass design fills the image edge-to-edge. Avoid photorealism.",
  },
  {
    id: "icon",
    label: "Byzantine Icon",
    rendering: "Byzantine icon painting: flat, frontal, stylised figures with elongated proportions, solemn timeless expressions, inverse perspective and symbolic rather than naturalistic space.",
    palette: "Burnished gold-leaf sky, deep reds, ultramarine, ochres and earth greens.",
    lighting: "No cast shadows; inner light shown through layered highlights; gold glow.",
    materials: "Egg tempera and gold-leaf texture within the scene.",
    composition: "Hieratic, balanced staging; the key figure largest and central; stylised rocks, buildings and trees.",
    negative: "Never show a wooden panel, panel edges, frame, border, wall or the icon as a physical object. Halos may appear but never with lettering. Avoid photorealism and modern illustration. The gold sky and stylised landscape fill the image edge-to-edge.",
  },
  {
    id: "watercolour",
    label: "Ink & Watercolour",
    rendering: "Loose pen-and-ink drawing with transparent watercolour washes; expressive, airy and contemplative, like a travelling artist's field study of the biblical world.",
    palette: "Transparent washes of ochre, sienna, indigo and sage; luminous lights.",
    lighting: "Bright, airy daylight; shadows as cool layered washes.",
    materials: "Confident ink linework, wet-in-wet blooms, granulating pigment.",
    composition: "Sketch-like economy; detail concentrated on key figures, softer surroundings.",
    negative: "Washes and scenery must reach every edge: no white paper margins, paper edges, sketchbook, tape or border. Avoid photorealism, digital airbrush smoothness and cartoon caricature.",
  },
];

type ChapterVerse = { verse: number; text: string };
async function chapter(book: string, ch: number): Promise<ChapterVerse[]> {
  const res = await fetch(`https://bible-api.com/data/${TRANSLATION}/${book}/${ch}`);
  if (!res.ok) throw new Error(`bible-api ${book} ${ch}: ${res.status}`);
  const data = await res.json() as { verses: ChapterVerse[] };
  return data.verses;
}

async function openrouter(body: unknown) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "visibible-prototype" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function plan(input: Parameters<typeof buildScenePlannerPrompt>[0]): Promise<ScenePlan | null> {
  try {
    const data = await openrouter({
      model: PLANNER_MODEL,
      messages: [{ role: "user", content: buildScenePlannerPrompt(input) }],
      temperature: 0.2, max_tokens: 220, reasoning: { enabled: false },
    });
    const content = data?.choices?.[0]?.message?.content ?? "";
    const json = extractJsonObject(typeof content === "string" ? content : "");
    return json ? normalizeScenePlan(JSON.parse(json)) : null;
  } catch (error) {
    console.warn("planner failed", error);
    return null;
  }
}

const results: Record<string, unknown>[] = [];
await mkdir(OUT, { recursive: true });

const jobs: (() => Promise<void>)[] = [];
for (const v of VERSES) {
  const verses = await chapter(v.book, v.chapter);
  const at = (n: number) => verses.find((x) => x.verse === n);
  const cur = at(v.verse)!;
  const prev = at(v.verse - 1);
  const next = at(v.verse + 1);
  const reference = `${v.name} ${v.chapter}:${v.verse}`;
  const verseText = cur.text.trim();
  const prevVerse = prev ? { number: prev.verse, text: prev.text.trim() } : null;
  const nextVerse = next ? { number: next.verse, text: next.text.trim() } : null;
  const isGen1 = v.book === "GEN" && v.chapter === 1;
  const scenePlan = priorPlans.has(reference) ? priorPlans.get(reference)! : await plan({
    reference, verseText, prevVerse, nextVerse,
    chapterTheme: isGen1 ? genesis1Theme : null, styleProfile: STYLE_PROFILES.classical,
  });
  console.log(reference, scenePlan ? "planned" : "NO PLAN");

  for (const style of CANDIDATES) {
    // The Genesis 1 chapter theme hard-codes "classical religious art"; give non-classical styles their own label.
    const chapterTheme = isGen1
      ? { ...genesis1Theme, style: style.id === "classical" ? genesis1Theme.style : style.label }
      : null;
    jobs.push(async () => {
      const { prompt, promptPacket } = buildImagePrompt({
        verseId: `${v.book}-${v.chapter}-${v.verse}`.toLowerCase(), translationId: TRANSLATION,
        reference, verseText, prevVerse, nextVerse, chapterTheme, styleProfile: style,
        aspectRatio: "16:9", resolution: "1K", generationNumber: null,
        scenePlan, scenePlannerUsed: Boolean(scenePlan), scenePlanFromCache: false,
      });
      const started = Date.now();
      const record: Record<string, unknown> = {
        reference, style: style.id, promptChars: promptPacket.budget.finalChars,
        fullStyleKept: prompt.includes("Materials/Texture:"), scenePlan, prompt,
      };
      try {
        const data = await openrouter({
          model: IMAGE_MODEL,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: "16:9" },
        });
        const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        const match = url?.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) throw new Error("no inline image in response");
        const file = `${v.book.toLowerCase()}-${v.chapter}-${v.verse}--${style.id}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
        await writeFile(path.join(OUT, file), Buffer.from(match[2], "base64"));
        Object.assign(record, { file, costUsd: data?.usage?.cost ?? null, ms: Date.now() - started });
      } catch (error) {
        Object.assign(record, { error: String(error), ms: Date.now() - started });
      }
      console.log(reference, style.id, record.file ?? record.error, record.ms, "ms");
      results.push(record);
    });
  }
}

// Five requests at a time.
const queue = [...jobs];
await Promise.all(Array.from({ length: 5 }, async () => {
  while (queue.length) await queue.shift()!();
}));

await writeFile(path.join(OUT, "results.json"), JSON.stringify({
  model: IMAGE_MODEL, planner: PLANNER_MODEL, translation: TRANSLATION,
  styles: CANDIDATES, verses: VERSES, results,
}, null, 2));
const spend = results.reduce((sum, r) => sum + (typeof r.costUsd === "number" ? r.costUsd : 0), 0);
console.log(`done: ${results.filter((r) => r.file).length}/${results.length} images, $${spend.toFixed(4)}`);
