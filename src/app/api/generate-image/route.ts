import { NextResponse } from "next/server";

// Disable Next.js server-side caching - let browser cache handle it
export const dynamic = 'force-dynamic';

const isImageGenerationEnabled = process.env.ENABLE_IMAGE_GENERATION === "true";

// Fallback text if no verse provided
const DEFAULT_TEXT = "In the beginning God created the heaven and the earth.";

export async function GET(request: Request) {
  if (!isImageGenerationEnabled) {
    return NextResponse.json(
      { error: "Image generation disabled" },
      { status: 403 }
    );
  }

  // Validate OpenRouter API key before proceeding
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey || openRouterApiKey.trim() === "") {
    console.error("OPENROUTER_API_KEY is missing or empty");
    return NextResponse.json(
      { error: "Server configuration error: OpenRouter API key is not configured" },
      { status: 500 }
    );
  }

  // Get verse text, theme, and context from query params
  const { searchParams } = new URL(request.url);
  const verseText = searchParams.get("text") || DEFAULT_TEXT;
  const themeParam = searchParams.get("theme");
  const prevVerseParam = searchParams.get("prevVerse");
  const nextVerseParam = searchParams.get("nextVerse");
  const reference = searchParams.get("reference") || "Scripture";

  // Parse prev/next verse context for storyboard continuity
  let prevVerse: { number: number; text: string; reference?: string } | null = null;
  let nextVerse: { number: number; text: string; reference?: string } | null = null;

  try {
    if (prevVerseParam) prevVerse = JSON.parse(prevVerseParam);
    if (nextVerseParam) nextVerse = JSON.parse(nextVerseParam);
  } catch {
    // Ignore parsing errors, continue without context
  }

  // Build prompt with storyboard context for visual continuity
  const aspectRatioInstruction = "Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio (wide, not square).";

  // Build narrative context section
  let narrativeContext = "";
  if (prevVerse || nextVerse) {
    narrativeContext = "\n\nNARRATIVE CONTEXT (for visual continuity - this is a storyboard):";
    if (prevVerse) {
      narrativeContext += `\n- Previous scene (v${prevVerse.number}): "${prevVerse.text}"`;
    }
    narrativeContext += `\n- CURRENT SCENE (the verse to illustrate): "${verseText}"`;
    if (nextVerse) {
      narrativeContext += `\n- Next scene (v${nextVerse.number}): "${nextVerse.text}"`;
    }
    narrativeContext += "\n\nThis is part of a visual storyboard through Scripture. Maintain visual consistency with the flow of the narrative while focusing on THIS verse's moment.";
  }

  let prompt: string;
  if (themeParam) {
    try {
      const theme = JSON.parse(themeParam);
      prompt = `Create a biblical illustration for ${reference}: "${verseText}"${narrativeContext}

Setting: ${theme.setting}
Visual elements: ${theme.elements}
Color palette: ${theme.palette}
Style: ${theme.style}

${aspectRatioInstruction} Generate a beautiful, reverent image that captures the essence of this scripture. Do not include any text, letters, or words in the image.`;
    } catch {
      prompt = `Create a biblical illustration for ${reference}: "${verseText}"${narrativeContext}

Style: classical religious art, ethereal lighting, majestic.

${aspectRatioInstruction} Generate a beautiful, reverent image. Do not include any text, letters, or words in the image.`;
    }
  } else {
    prompt = `Create a biblical illustration for ${reference}: "${verseText}"${narrativeContext}

Style: classical religious art, ethereal lighting, majestic.

${aspectRatioInstruction} Generate a beautiful, reverent image. Do not include any text, letters, or words in the image.`;
  }

  try {
    // Use OpenRouter chat completions with Gemini for image generation
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_TITLE || "visibible",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        // Request image output
        modalities: ["image", "text"],
        // Specify 16:9 widescreen aspect ratio
        image_config: {
          aspect_ratio: "16:9",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // OpenRouter returns images in a separate "images" field
    if (message?.images && Array.isArray(message.images)) {
      for (const image of message.images) {
        if (image.image_url?.url) {
          return NextResponse.json({ imageUrl: image.image_url.url }, {
            headers: { 'Cache-Control': 'private, max-age=3600' },
          });
        }
      }
    }

    // Fallback: check content array (some models use this format)
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          return NextResponse.json({ imageUrl: part.image_url.url }, {
            headers: { 'Cache-Control': 'private, max-age=3600' },
          });
        }
        if (part.inline_data?.data) {
          const mimeType = part.inline_data.mime_type || "image/png";
          return NextResponse.json({
            imageUrl: `data:${mimeType};base64,${part.inline_data.data}`
          }, {
            headers: { 'Cache-Control': 'private, max-age=3600' },
          });
        }
      }
    }

    // If no image found, return error
    console.error("No image in response:", JSON.stringify(data, null, 2));
    return NextResponse.json(
      { error: "No image generated - model may not support image output" },
      { status: 500 }
    );
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
