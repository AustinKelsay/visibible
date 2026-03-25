"use client";

import { MessageCircle } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { useVerseNav } from "@/context/verse-nav-context";
import { MOBILE_VERSE_NAV_OFFSET } from "@/lib/mobile-verse-nav";

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
  return (
    <button
      onClick={openChat}
      style={verseNav
        ? { bottom: MOBILE_VERSE_NAV_OFFSET }
        : { marginBottom: "env(safe-area-inset-bottom)" }}
      className={`
        fixed right-4 bottom-6 z-30
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
