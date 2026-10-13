import type { NextRequest } from "next/server";
import {
  createFlagsDiscoveryEndpoint,
  getProviderData as getGenericProviderData,
} from "flags/next";
import { getProviderData as getVercelProviderData } from "@flags-sdk/vercel";
import { getFlagsSecret } from "@/lib/flags-secret";
import { defaultVerseViewFlag } from "@/lib/flags";

// Only flag definitions belong in discovery data; @/lib/flags also exports helpers.
const flags = { defaultVerseViewFlag };

async function getDiscoveryData() {
  if (process.env.FLAGS) {
    return getVercelProviderData(flags);
  }

  return getGenericProviderData(flags);
}

// Resolve the secret per request so a missing FLAGS_SECRET fails this endpoint, not the build.
export async function GET(request: NextRequest) {
  const handler = createFlagsDiscoveryEndpoint(
    async () => getDiscoveryData(),
    {
      secret: getFlagsSecret(),
    }
  );

  return handler(request);
}
