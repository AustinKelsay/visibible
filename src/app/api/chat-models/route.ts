import { NextResponse } from "next/server";
import {
  DEFAULT_CHAT_MODEL,
  EMERGENCY_CHAT_MODEL_PRICING,
  fetchChatModels,
} from "@/lib/chat-models";

export async function GET() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!openRouterApiKey) {
    // Return fallback with just the default model
    return NextResponse.json({
      models: [
        {
          id: DEFAULT_CHAT_MODEL,
          name: "GPT-OSS 120B (Default)",
          provider: "Openai",
          contextLength: 131072,
          pricing: EMERGENCY_CHAT_MODEL_PRICING[DEFAULT_CHAT_MODEL],
          isFree: false,
        },
      ],
      error: "OpenRouter API key not configured",
    });
  }

  const result = await fetchChatModels(openRouterApiKey);
  return NextResponse.json({
    models: result.models,
    ...(result.error ? { error: result.error } : {}),
  }, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
