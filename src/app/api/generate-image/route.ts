import { NextResponse } from "next/server";
import { handleImageRequest } from "@/app/api/generate-image/handler";

// Disable Next.js server-side caching - let browser cache handle it
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed",
      message: "Use POST /api/generate-image for generation requests.",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    }
  );
}

export async function POST(request: Request) {
  return handleImageRequest(request, "generate");
}
