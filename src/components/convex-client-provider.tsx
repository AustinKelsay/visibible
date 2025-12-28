"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, createContext, useContext } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
const ConvexAvailabilityContext = createContext(false);

export function useConvexEnabled() {
  return useContext(ConvexAvailabilityContext);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const isConvexEnabled = Boolean(convex);

  if (!convex) {
    return (
      <ConvexAvailabilityContext.Provider value={isConvexEnabled}>
        {children}
      </ConvexAvailabilityContext.Provider>
    );
  }

  return (
    <ConvexAvailabilityContext.Provider value={isConvexEnabled}>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </ConvexAvailabilityContext.Provider>
  );
}
