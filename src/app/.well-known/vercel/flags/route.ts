import {
  createFlagsDiscoveryEndpoint,
  getProviderData as getGenericProviderData,
} from "flags/next";
import { getProviderData as getVercelProviderData } from "@flags-sdk/vercel";
import { defaultVerseViewFlag } from "@/lib/flags";

const flagDefinitions = {
  defaultVerseViewFlag,
};

async function getDiscoveryData() {
  if (process.env.FLAGS) {
    return getVercelProviderData(flagDefinitions);
  }

  return getGenericProviderData(flagDefinitions);
}

export const GET = createFlagsDiscoveryEndpoint(async () => getDiscoveryData());
