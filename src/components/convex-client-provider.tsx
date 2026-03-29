"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, createContext, useContext } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const normalizedConvexUrl = convexUrl?.trim();
const convex = new ConvexReactClient(
  normalizedConvexUrl || "https://placeholder.convex.invalid"
);
const ConvexAvailabilityContext = createContext(false);

export function useConvexEnabled() {
  return useContext(ConvexAvailabilityContext);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const isConvexEnabled = Boolean(normalizedConvexUrl);

  return (
    <ConvexAvailabilityContext.Provider value={isConvexEnabled}>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </ConvexAvailabilityContext.Provider>
  );
}
