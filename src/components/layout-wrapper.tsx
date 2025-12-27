"use client";

import { ReactNode } from "react";
import { useNavigation } from "@/context/navigation-context";

interface LayoutWrapperProps {
  children: ReactNode;
}

/**
 * Layout wrapper that handles push/resize behavior when chat sidebar is open.
 * On desktop (md+), content shrinks via margin-right when chat is open.
 * On mobile, content stays full width (sidebar overlays).
 */
export function LayoutWrapper({ children }: LayoutWrapperProps) {
  const { isChatOpen } = useNavigation();

  return (
    <div
      className={`
        min-h-screen flex flex-col bg-[var(--background)]
        transition-[margin-right] duration-[var(--motion-base)] ease-out
        ${isChatOpen ? "md:mr-96" : "mr-0"}
      `}
    >
      {children}
    </div>
  );
}
