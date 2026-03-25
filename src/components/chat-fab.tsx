"use client";

import { MessageCircle } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { useVerseNav } from "@/context/verse-nav-context";

/**
 * Floating action button for opening the chat sidebar.
 * Hidden when chat is already open.
 * Shifts upward when the mobile verse nav bar is visible.
 */
export function ChatFAB() {
  const { isChatOpen, openChat } = useNavigation();
  const verseNav = useVerseNav();

  // Hide FAB when chat is open
  if (isChatOpen) return null;

  // Shift FAB above the sticky verse nav bar when on a verse page
  const bottomClass = verseNav
    ? "bottom-[calc(68px+env(safe-area-inset-bottom,0px))]"
    : "bottom-6";

  return (
    <button
      onClick={openChat}
      style={verseNav ? undefined : { marginBottom: "env(safe-area-inset-bottom)" }}
      className={`
        fixed ${bottomClass} right-4 z-30
        sm:hidden
        min-h-[48px] min-w-[48px]
        flex items-center justify-center
        rounded-full shadow-md
        bg-[var(--accent)] text-[var(--accent-text)]
        hover:bg-[var(--accent-hover)]
        transition-all duration-[var(--motion-fast)]
        active:scale-95
        cursor-pointer
      `}
      aria-label="Open chat"
    >
      <MessageCircle size={20} strokeWidth={1.5} />
    </button>
  );
}
