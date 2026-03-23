import { createFlagsDiscoveryEndpoint } from "flags/next";
import { getProviderData } from "@flags-sdk/vercel";
import { getFlagsSecret } from "@/lib/flags-secret";
import * as flags from "@/lib/flags";

export const GET = createFlagsDiscoveryEndpoint(
  async () => getProviderData(flags),
  {
    secret: getFlagsSecret(),
  }
);
