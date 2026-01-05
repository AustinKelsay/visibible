# Image Prompt Specification

Complete specification of how image generation prompts are constructed in Visibible.

**Source:** `src/app/api/generate-image/route.ts`
**Prompt Version:** `2026-01-05-2`

---

## Table of Contents

1. [Overview](#overview)
2. [Input Security & Sanitization](#input-security--sanitization)
3. [Prompt Components](#prompt-components)
4. [Complete Prompt Templates](#complete-prompt-templates)
5. [Annotated Example](#annotated-example)
6. [Prompt Metadata](#prompt-metadata)
7. [OpenRouter API Configuration](#openrouter-api-configuration)
8. [Design Rationale](#design-rationale)

---

## Overview

Image prompts are constructed server-side to generate biblically-accurate, visually consistent illustrations for Scripture verses. Each prompt is:

- **Versioned** - A `PROMPT_VERSION` string (e.g., `"2026-01-05"`) is recorded with every generated image for reproducibility
- **Sanitized** - All user-provided text is sanitized to prevent prompt injection
- **Context-aware** - Includes previous/next verse text for storyboard continuity
- **Theme-enhanced** - Optionally includes chapter-level visual themes
- **Style-profiled** - Uses allowlisted style profiles (default: classical) for scalable look/feel switching
- **Scene-planned** - Optionally inserts a concise scene plan to anchor subject/action/setting
- **Diversity-enabled** - Adds variation instructions for non-first generations

---

## Input Security & Sanitization

All user-provided input passes through sanitization functions before inclusion in prompts.

### Reference Sanitization

```typescript
// src/app/api/generate-image/route.ts:24-28
function sanitizeReference(ref: string): string {
  // Only allow alphanumeric, spaces, colons, hyphens, and basic punctuation
  const sanitized = ref.replace(/[^\w\s:,\-.'()]/g, "").slice(0, 50);
  return sanitized || "Scripture";
}
```

**Rules:**
- Strips all characters except: alphanumeric, whitespace, `:`, `,`, `-`, `.`, `'`, `(`, `)`
- Truncates to 50 characters maximum
- Falls back to `"Scripture"` if result is empty

### Verse Text Sanitization

```typescript
// src/app/api/generate-image/route.ts:31-41
function sanitizeVerseText(text: string): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control chars
    .replace(
      /\b(ignore|disregard|forget|override|system|prompt|instruction)/gi,
      ""
    )
    .slice(0, 1200);
}
```

**Rules:**
- Removes all control characters (0x00-0x1F, 0x7F)
- Strips prompt injection keywords (case-insensitive, word-boundary matched):
  - `ignore`
  - `disregard`
  - `forget`
  - `override`
  - `system`
  - `prompt`
  - `instruction`
- Truncates to 1200 characters maximum (sufficient for any reasonable verse)

### Style Profile Selection

Style selection is **allowlisted**; only predefined profiles can be used.

**Rules:**
- `style` query param is matched against `STYLE_PROFILES`.
- Unknown styles return a 400 error.
- Default style is `classical` when `style` is omitted.

### Scene Planner (Optional)

A lightweight scene planner can run before prompt construction to produce a concise, structured scene plan.

**Controls:**
- `ENABLE_SCENE_PLANNER` (default: enabled unless set to `"false"`)
- `OPENROUTER_SCENE_PLANNER_MODEL` (default: `DEFAULT_CHAT_MODEL` = `openai/gpt-oss-120b`)

**Behavior:**
- Planner failures are non-fatal; prompt construction proceeds without a scene plan.
- Output is normalized and clipped to avoid overly long fields.

**Credit Metering:**
- The scene planner makes a separate OpenRouter chat completion call.
- The scene planner model is **paid** by default, so additional credits are charged.
- If a **paid** model is configured, credits are calculated using `computeChatCreditsCost()` with `SCENE_PLANNER_ESTIMATED_TOKENS = 450`.
- Credits are reserved upfront (alongside image credits) and refunded if the scene planner fails.
- Partial refunds use 3 retries with exponential backoff (100ms → 200ms → 400ms).

---

## Prompt Components

Prompts are assembled from discrete components in a specific order. Each component serves a distinct purpose.

### 1. Priority Rules (No Text + Full-Bleed + Single Scene)

**Purpose:** Enforce non-negotiable constraints that prevent the most common generation errors.

**Location:** Lines 540-543

```
PRIORITY RULES (must follow):
1) ABSOLUTE: ZERO text of any kind. No letters, words, numbers, punctuation, symbols, runes, glyphs, sigils, logos, watermarks, captions, subtitles, labels, signage, banners, or inscriptions. Do not render the verse text or any readable/unreadable text-like marks. If a surface would normally contain writing (scrolls, tablets, signs), leave it blank or use abstract texture.
2) FULL-BLEED IMMERSIVE SCENE: edge-to-edge cinematic composition. No borders, frames, mattes, canvas edges, stretcher bars, wall-hung paintings, posters, prints, photographs, gallery/museum settings, mockups, or letterboxing. Do not depict the scene as artwork on a wall or in a frame; the image itself is the scene. No white wall or studio backdrop. Do not leave blank margins. Avoid solid white or empty backgrounds; fill negative space with atmospheric darkness, clouds, or textured sky/land. The viewer is IN the scene.
3) SINGLE SCENE ONLY: no split panels, diptychs, triptychs, insets, collages, or multiple scenes in one frame.
```

**Rationale:** This block prevents text leakage, framed-art outputs, and collage/panel layouts that reduce narrative clarity.

### 2. Scene Directive

**Purpose:** Direct the model to render the specific verse as a single cohesive biblical-era scene.

**Format:**
```
SCENE:
Render a single, cohesive biblical-era scene for {reference}: "{verseText}"
```

**Example:**
```
SCENE:
Render a single, cohesive biblical-era scene for Genesis 1:3: "And God said, Let there be light: and there was light."
```

### 3. Scene Plan (Optional)

**Purpose:** Anchor composition by explicitly stating subject, action, and setting.

**Condition:** Only included when the scene planner returns a valid plan.

**Location:** Inserted immediately after the `SCENE` line when a plan exists (via `formatScenePlan`).

**Placement:** The scene plan appears **before** narrative context and the generation diversity note.

**Structure:**
```
SCENE PLAN (optional; supporting; do not override priority rules):
Primary subject: {scenePlan.primarySubject}
Action: {scenePlan.action}
Setting: {scenePlan.setting}
Secondary elements: {scenePlan.secondaryElements}   // optional
Mood: {scenePlan.mood}                               // optional
Time of day: {scenePlan.timeOfDay}                   // optional
Composition: {scenePlan.composition}                 // optional
```

### 4. Narrative Context Section

**Purpose:** Provide surrounding verse context for visual storyboard continuity.

**Condition:** Only included when `prevVerse` or `nextVerse` exists.

**Location:** Lines 439-450

**Structure:**
```
NARRATIVE CONTEXT (for visual continuity - this is a storyboard):
- Previous scene (v{N}): "{text}"
- CURRENT SCENE (the verse to illustrate): "{verseText}"
- Next scene (v{N}): "{text}"

This is part of a visual storyboard through Scripture. Maintain visual consistency with the flow of the narrative while focusing on THIS verse's moment.
```

**Notes:**
- Previous/next scenes are only included if they exist (same-chapter only)
- The "CURRENT SCENE" line is always included when this section appears
- Emphasizes that THIS verse is the focus, not the surrounding context

### 5. Generation Diversity Note

**Purpose:** Encourage visual variety when generating multiple images for the same verse.

**Condition:** Only included when `generationNumber > 1`

**Location:** Lines 433-436

**Format:**
```
NOTE: This is the {N}{ordinal} generation of this image. Create a fresh, diverse interpretation while maintaining the core biblical scene.
```

**Ordinal Suffix Logic:**
```typescript
function getOrdinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}
```

**Examples:**
- 2nd generation: "This is the 2nd generation..."
- 3rd generation: "This is the 3rd generation..."
- 11th generation: "This is the 11th generation..." (not "11st")
- 21st generation: "This is the 21st generation..."

### 6. Chapter Theme Section (Optional)

**Purpose:** Apply consistent visual styling across an entire chapter.

**Condition:** Only included when `chapterTheme` is provided.

**Location:** Lines 559-563

**Structure:**
```
CHAPTER THEME:
Setting: {chapterTheme.setting}
Visual elements: {chapterTheme.elements}
Color palette: {chapterTheme.palette}
Style: {chapterTheme.style}
```

**ChapterTheme Interface:**
```typescript
interface ChapterTheme {
  setting: string;   // Description of the chapter's setting/context
  palette: string;   // Color palette guidance
  elements: string;  // Recurring visual elements
  style: string;     // Artistic style direction
}
```

**Example (Genesis 1):**
```typescript
// src/data/genesis-1.ts
export const genesis1Theme = {
  setting: "Creation of the cosmos",
  palette: "deep cosmic blues, radiant golds, ethereal whites",
  elements: "primordial void, divine light rays, swirling waters, emerging forms",
  style: "classical religious art, Baroque lighting, majestic and reverent",
};
```

### 7. Style Profile Section

**Purpose:** Provide a swap-friendly style block that can be changed without touching core rules.

**Location:** Lines 565-570 (with theme) or 584-589 (without theme)

**Structure:**
```
STYLE PROFILE: {styleProfile.label}
Rendering: {styleProfile.rendering}
Palette: {styleProfile.palette}          // optional
Lighting: {styleProfile.lighting}        // optional
Materials/Texture: {styleProfile.materials}  // optional
Composition: {styleProfile.composition}  // optional
```

**Current profile:** `classical` (default)

### 8. Style Negatives

**Purpose:** Style-specific “avoid” constraints that change with the selected profile.

**Location:** Lines 572-573 (with theme) or 591-592 (without theme)

**Structure:**
```
STYLE NEGATIVES:
{styleProfile.negative}
```

### 9. Global Negatives

**Purpose:** Hard “avoid” rules that apply to all styles.

**Location:** Lines 545-548

**Content:**
```
GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electrical lighting, contemporary architecture, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).
```

### 10. Aspect Ratio Instruction

**Purpose:** Ensure consistent 16:9 widescreen output.

**Location:** Line 418

**Content:**
```
Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio (wide, not square).
```

**Notes:**
- Explicitly states "wide, not square" to prevent misinterpretation
- This is also enforced via `image_config` in the API call

---

## Complete Prompt Templates

### Template WITH Chapter Theme

```
PRIORITY RULES (must follow):
1) ABSOLUTE: ZERO text of any kind. No letters, words, numbers, punctuation, symbols, runes, glyphs, sigils, logos, watermarks, captions, subtitles, labels, signage, banners, or inscriptions. Do not render the verse text or any readable/unreadable text-like marks. If a surface would normally contain writing (scrolls, tablets, signs), leave it blank or use abstract texture.
2) FULL-BLEED IMMERSIVE SCENE: edge-to-edge cinematic composition. No borders, frames, mattes, canvas edges, stretcher bars, wall-hung paintings, posters, prints, photographs, gallery/museum settings, mockups, or letterboxing. Do not depict the scene as artwork on a wall or in a frame; the image itself is the scene. No white wall or studio backdrop. Do not leave blank margins. Avoid solid white or empty backgrounds; fill negative space with atmospheric darkness, clouds, or textured sky/land. The viewer is IN the scene.
3) SINGLE SCENE ONLY: no split panels, diptychs, triptychs, insets, collages, or multiple scenes in one frame.

SCENE:
Render a single, cohesive biblical-era scene for {reference}: "{verseText}"

SCENE PLAN (optional; supporting; do not override priority rules):
Primary subject: {scenePlan.primarySubject}
Action: {scenePlan.action}
Setting: {scenePlan.setting}
Secondary elements: {scenePlan.secondaryElements}
Mood: {scenePlan.mood}
Time of day: {scenePlan.timeOfDay}
Composition: {scenePlan.composition}

NARRATIVE CONTEXT (optional; for visual continuity - this is a storyboard):
- Previous scene (v{N}): "{prevVerse.text}"
- CURRENT SCENE (the verse to illustrate): "{verseText}"
- Next scene (v{N}): "{nextVerse.text}"

NOTE (optional; only when generationNumber > 1):
This is the {N}{ordinal} generation of this image. Create a fresh, diverse interpretation while maintaining the core biblical scene.

CHAPTER THEME:
Setting: {chapterTheme.setting}
Visual elements: {chapterTheme.elements}
Color palette: {chapterTheme.palette}
Style: {chapterTheme.style}

STYLE PROFILE: {styleProfile.label}
Rendering: {styleProfile.rendering}
Palette: {styleProfile.palette}
Lighting: {styleProfile.lighting}
Materials/Texture: {styleProfile.materials}
Composition: {styleProfile.composition}

STYLE NEGATIVES:
{styleProfile.negative}

GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electrical lighting, contemporary architecture, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).

Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio (wide, not square).
```

### Template WITHOUT Chapter Theme

```
PRIORITY RULES (must follow):
1) ABSOLUTE: ZERO text of any kind. No letters, words, numbers, punctuation, symbols, runes, glyphs, sigils, logos, watermarks, captions, subtitles, labels, signage, banners, or inscriptions. Do not render the verse text or any readable/unreadable text-like marks. If a surface would normally contain writing (scrolls, tablets, signs), leave it blank or use abstract texture.
2) FULL-BLEED IMMERSIVE SCENE: edge-to-edge cinematic composition. No borders, frames, mattes, canvas edges, stretcher bars, wall-hung paintings, posters, prints, photographs, gallery/museum settings, mockups, or letterboxing. Do not depict the scene as artwork on a wall or in a frame; the image itself is the scene. No white wall or studio backdrop. Do not leave blank margins. Avoid solid white or empty backgrounds; fill negative space with atmospheric darkness, clouds, or textured sky/land. The viewer is IN the scene.
3) SINGLE SCENE ONLY: no split panels, diptychs, triptychs, insets, collages, or multiple scenes in one frame.

SCENE:
Render a single, cohesive biblical-era scene for {reference}: "{verseText}"

SCENE PLAN (optional; supporting; do not override priority rules):
Primary subject: {scenePlan.primarySubject}
Action: {scenePlan.action}
Setting: {scenePlan.setting}
Secondary elements: {scenePlan.secondaryElements}
Mood: {scenePlan.mood}
Time of day: {scenePlan.timeOfDay}
Composition: {scenePlan.composition}

NARRATIVE CONTEXT (optional; for visual continuity - this is a storyboard):
- Previous scene (v{N}): "{prevVerse.text}"
- CURRENT SCENE (the verse to illustrate): "{verseText}"
- Next scene (v{N}): "{nextVerse.text}"

NOTE (optional; only when generationNumber > 1):
This is the {N}{ordinal} generation of this image. Create a fresh, diverse interpretation while maintaining the core biblical scene.

STYLE PROFILE: {styleProfile.label}
Rendering: {styleProfile.rendering}
Palette: {styleProfile.palette}
Lighting: {styleProfile.lighting}
Materials/Texture: {styleProfile.materials}
Composition: {styleProfile.composition}

STYLE NEGATIVES:
{styleProfile.negative}

GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electrical lighting, contemporary architecture, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).

Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio (wide, not square).
```

---

## Annotated Example

**Scenario:** Generating the 2nd image for Genesis 1:3 with chapter theme and surrounding verses.

### Inputs

| Input | Value |
|-------|-------|
| `reference` | `"Genesis 1:3"` |
| `verseText` | `"And God said, Let there be light: and there was light."` |
| `prevVerse` | `{ number: 2, text: "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters." }` |
| `nextVerse` | `{ number: 4, text: "And God saw the light, that it was good: and God divided the light from the darkness." }` |
| `generationNumber` | `2` |
| `chapterTheme` | Genesis 1 theme (see above) |
| `styleProfileId` | `"classical"` |
| `scenePlan` | `{ primarySubject: "divine light breaking through darkness", action: "light bursts forth over the waters", setting: "primordial void above the deep", secondaryElements: "swirling waters, rays of light", mood: "awe and reverence", timeOfDay: "timeless", composition: "wide shot, low horizon" }` |

### Generated Prompt

```
PRIORITY RULES (must follow):
1) ABSOLUTE: ZERO text of any kind. No letters, words, numbers, punctuation, symbols, runes, glyphs, sigils, logos, watermarks, captions, subtitles, labels, signage, banners, or inscriptions. Do not render the verse text or any readable/unreadable text-like marks. If a surface would normally contain writing (scrolls, tablets, signs), leave it blank or use abstract texture.
2) FULL-BLEED IMMERSIVE SCENE: edge-to-edge cinematic composition. No borders, frames, mattes, canvas edges, stretcher bars, wall-hung paintings, posters, prints, photographs, gallery/museum settings, mockups, or letterboxing. Do not depict the scene as artwork on a wall or in a frame; the image itself is the scene. No white wall or studio backdrop. Do not leave blank margins. Avoid solid white or empty backgrounds; fill negative space with atmospheric darkness, clouds, or textured sky/land. The viewer is IN the scene.
3) SINGLE SCENE ONLY: no split panels, diptychs, triptychs, insets, collages, or multiple scenes in one frame.

SCENE:
Render a single, cohesive biblical-era scene for Genesis 1:3: "And God said, Let there be light: and there was light."

SCENE PLAN (supporting; do not override priority rules):
Primary subject: divine light breaking through darkness
Action: light bursts forth over the waters
Setting: primordial void above the deep
Secondary elements: swirling waters, rays of light
Mood: awe and reverence
Time of day: timeless
Composition: wide shot, low horizon

NARRATIVE CONTEXT (for visual continuity - this is a storyboard):
- Previous scene (v2): "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters."
- CURRENT SCENE (the verse to illustrate): "And God said, Let there be light: and there was light."
- Next scene (v4): "And God saw the light, that it was good: and God divided the light from the darkness."

This is part of a visual storyboard through Scripture. Maintain visual consistency with the flow of the narrative while focusing on THIS verse's moment.

NOTE: This is the 2nd generation of this image. Create a fresh, diverse interpretation while maintaining the core biblical scene.

CHAPTER THEME:
Setting: Creation of the cosmos
Visual elements: primordial void, divine light rays, swirling waters, emerging forms
Color palette: deep cosmic blues, radiant golds, ethereal whites
Style: classical religious art, Baroque lighting, majestic and reverent

STYLE PROFILE: Classical Painterly
Rendering: Stylized, painterly, biblical-era, mysterious, expansive; epic scale and reverent tone.
Palette: Mature, grounded color; rich but restrained contrast.
Lighting: Luminous, dramatic lighting.
Materials/Texture: Gritty, raw texture; avoid polished digital smoothness.
Composition: Cinematic, immersive viewpoint; heroic but grounded.

STYLE NEGATIVES:
Avoid photorealism or a photographic look. Avoid childish/cartoonish styling.

GLOBAL NEGATIVES:
- No modern artifacts or technology (vehicles, screens, guns, electrical lighting, contemporary architecture, modern clothing).
- No anachronistic materials (plastic, neon, LEDs).
- No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces).

Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio (wide, not square).
```

---

## Prompt Metadata

Every generated image records metadata for reproducibility and debugging.

### promptVersion

A date-based string stamped on every generation:

```typescript
const PROMPT_VERSION = "2026-01-05-2";
```

This version is updated whenever the prompt template changes materially, allowing:
- Reproduction of historical generations
- A/B testing of prompt variations
- Debugging prompt-related issues

### promptInputs

Structured metadata recorded with each generation:

```typescript
const promptInputs = {
  reference,           // e.g., "Genesis 1:3"
  aspectRatio,         // e.g., "16:9"
  styleProfileId,      // e.g., "classical"
  scenePlan,           // Optional scene plan object
  ...(generationNumber ? { generationNumber } : {}),  // e.g., 2
  ...(prevVerse ? { prevVerse } : {}),                // Previous verse object
  ...(nextVerse ? { nextVerse } : {}),                // Next verse object
};
```

**scenePlan shape (optional):**
```
{
  primarySubject: string,
  action: string,
  setting: string,
  secondaryElements?: string,
  mood?: string,
  timeOfDay?: string,
  composition?: string
}
```

**Note:** The full `prompt` string is also stored, along with `promptVersion` and `promptInputs`, enabling complete reproducibility.

---

## OpenRouter API Configuration

The prompt is sent to OpenRouter's chat completions endpoint with specific configuration.

### Endpoint

```
POST https://openrouter.ai/api/v1/chat/completions
```

### Headers

```typescript
{
  "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
  "X-Title": process.env.OPENROUTER_TITLE || "visibible",
}
```

### Request Body

```typescript
{
  model: modelId,  // e.g., "google/gemini-2.5-flash-image"
  messages: [
    {
      role: "user",
      content: prompt,  // The constructed prompt
    },
  ],
  modalities: ["image", "text"],  // Request image output
  image_config: {
    aspect_ratio: "16:9",  // Enforce widescreen
  },
}
```

### Scene Planner Request (Optional)

When enabled, the scene planner makes a **separate** OpenRouter call before prompt assembly.

```typescript
{
  model: OPENROUTER_SCENE_PLANNER_MODEL || DEFAULT_CHAT_MODEL,
  messages: [{ role: "user", content: scenePlannerPrompt }],
  temperature: 0.2,
  max_tokens: 220,
}
```

Planner failures are non-fatal; prompt generation continues without a scene plan.

### Response Extraction

Images are extracted from the response in priority order:

1. `message.images[].image_url.url` - Primary format
2. `message.content[].image_url.url` - Alternative format
3. `message.content[].inline_data.data` - Base64 fallback

---

## Design Rationale

### Why the No-Text rule is so comprehensive

Image generation models have a strong tendency to render text when given textual input. They often:
- Render the verse text directly in the image
- Add labels or captions
- Include decorative text elements
- Generate rune-like or symbolic text

The comprehensive instruction addresses each category explicitly, leaving no ambiguity about what constitutes "text."

### Why the Full-Bleed and Single-Scene rules are explicit

Without explicit framing guidance, models frequently generate:
- Images framed as paintings on gallery walls
- Poster-style compositions with borders
- Mockup presentations
- Letterboxed cinematography

Without a single-scene rule, models also generate:
- Collages or split panels
- Inset frames or multi-scene montages

These rules ensure the output is an immersive, full-bleed scene rather than a depiction of artwork or a collage.

### Why Style Profiles are separated

Separating style into allowlisted profiles makes it easy to add new looks (e.g., realistic cinematic) without changing core safety and quality rules. It also keeps prompt structure stable for reproducibility.

### Why Storyboard Context matters

Including previous and next verse context enables:
- Visual consistency across sequential verses
- Narrative flow (e.g., establishing shots before close-ups)
- Thematic continuity in character/setting depiction

### Why Scene Planning exists

Even with good prompts, models often diffuse attention across too many elements. A short scene plan explicitly anchors:
- **Primary subject** (what the image should focus on)
- **Action** (what is happening right now)
- **Setting** (where it takes place)

This improves composition consistency while keeping the prompt scalable for multiple styles.

### Why Generation Diversity exists

When users generate multiple images for the same verse:
- The first image establishes an interpretation
- Subsequent images should offer variety
- Without explicit instruction, models may produce near-duplicates

The diversity note encourages fresh interpretations while maintaining biblical accuracy.

### Why Chapter Themes are optional

Not all chapters have defined themes because:
- Theme creation requires careful curation
- Generic prompts work well for most verses
- Themes are most valuable for chapters with consistent visual motifs (e.g., Creation narrative)

---

## Related Documentation

- `llm/context/IMAGE-GENERATION.md` - High-level context
- `llm/implementation/IMAGE_GENERATION_IMPLEMENTATION.md` - Full implementation guide
- `llm/implementation/IMAGE_PERSISTENCE_IMPLEMENTATION.md` - Convex persistence details
- `llm/context/THEME.md` - Chapter theme system context
- `llm/implementation/THEME_IMPLEMENTATION.md` - Theme implementation details
