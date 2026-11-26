import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/version
 * The deployment this server runs. An open page compares it with the one built into its code to offer a refresh
 * after a release (src/components/update-available.tsx). Null without a deployment ID, as in local development.
 */
export function GET(): NextResponse {
  const version = process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || null;
  return NextResponse.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
