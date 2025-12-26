import { NextResponse } from "next/server";
import { DEFAULT_IMAGE_MODEL, fetchImageModels } from "@/lib/image-models";

export async function GET() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!openRouterApiKey) {
    // Return fallback with just the default model
    return NextResponse.json({
      models: [
        {
          id: DEFAULT_IMAGE_MODEL,
          name: "Gemini 2.5 Flash (Default)",
          provider: "Google",
        },
      ],
      error: "OpenRouter API key not configured",
    });
  }

  const result = await fetchImageModels(openRouterApiKey);
  return NextResponse.json({
    models: result.models,
    ...(result.error ? { error: result.error } : {}),
  });
}
