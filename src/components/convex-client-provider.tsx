"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ReactNode, createContext, useContext } from "react";

import { useGuestAuth } from "@/lib/use-guest-auth";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const normalizedConvexUrl = convexUrl?.trim();
const placeholderConvexUrl = "https://placeholder.convex.invalid";
const convexClientUrl = normalizedConvexUrl || placeholderConvexUrl;
const convex = new ConvexReactClient(convexClientUrl, {
  skipConvexDeploymentUrlCheck: convexClientUrl === placeholderConvexUrl,
  // A guest token never outlives the session cookie, so in the cookie's last seconds each new token is as short as the
  // time left. The client asks for another as soon as a token is within this leeway of expiring: at the newer default
  // of 10 seconds it would ask again and again until /api/convex-token's rate limit signed the guest out early.
  authRefreshTokenLeewaySeconds: 2,
});
const ConvexAvailabilityContext = createContext(false);

export function useConvexEnabled() {
  return useContext(ConvexAvailabilityContext);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const isConvexEnabled = Boolean(normalizedConvexUrl);

  return (
    <ConvexAvailabilityContext.Provider value={isConvexEnabled}>
      <ConvexProviderWithAuth client={convex} useAuth={useGuestAuth}>{children}</ConvexProviderWithAuth>
    </ConvexAvailabilityContext.Provider>
  );
}
