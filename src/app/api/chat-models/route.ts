import { NextResponse } from "next/server";
import { DEFAULT_CHAT_MODEL, fetchChatModels } from "@/lib/chat-models";
import { getSessionFromCookies } from "@/lib/session";

export async function GET() {
  // Require valid session for model listing
  const sid = await getSessionFromCookies();
  if (!sid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          isFree: true,
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
