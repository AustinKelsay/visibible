import type { NextRequest } from "next/server";
import {
  createFlagsDiscoveryEndpoint,
  getProviderData as getGenericProviderData,
} from "flags/next";
import { getProviderData as getVercelProviderData } from "@flags-sdk/vercel";
import { getFlagsSecret } from "@/lib/flags-secret";
import * as flags from "@/lib/flags";

async function getDiscoveryData() {
  if (process.env.FLAGS) {
    return getVercelProviderData(flags);
  }

  return getGenericProviderData(flags);
}

export async function GET(request: NextRequest) {
  const handler = createFlagsDiscoveryEndpoint(
    async () => getDiscoveryData(),
    {
      secret: getFlagsSecret(),
    }
  );

  return handler(request);
}
