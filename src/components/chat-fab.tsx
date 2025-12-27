"use client";

import { MessageCircle } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";

/**
 * Floating action button for opening the chat sidebar.
 * Hidden when chat is already open.
 */
export function ChatFAB() {
  const { isChatOpen, openChat } = useNavigation();

  // Hide FAB when chat is open
  if (isChatOpen) return null;

  return (
    <button
      onClick={openChat}
      className="
        fixed bottom-6 right-6 z-30
        min-h-[56px] min-w-[56px]
        flex items-center justify-center
        rounded-full shadow-md
        bg-[var(--accent)] text-[var(--accent-text)]
        hover:bg-[var(--accent-hover)]
        transition-all duration-[var(--motion-fast)]
        active:scale-[0.98]
      "
      aria-label="Open chat"
    >
      <MessageCircle size={24} strokeWidth={1.5} />
    </button>
  );
}
