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

export const GET = createFlagsDiscoveryEndpoint(
  async () => getDiscoveryData(),
  {
    secret: getFlagsSecret(),
  }
);
