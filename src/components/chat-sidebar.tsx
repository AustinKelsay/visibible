"use client";

import { X } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { Chat } from "./chat";

/**
 * Chat sidebar component with slide animation.
 * - Desktop (md+): Fixed 384px width on right side
 * - Mobile: Full width overlay with backdrop
 */
export function ChatSidebar() {
  const { isChatOpen, closeChat, chatContext } = useNavigation();

  return (
    <>
      {/* Backdrop - mobile only, click to close */}
      <div
        className={`
          fixed inset-0 bg-black/50 z-40 md:hidden
          transition-opacity duration-[var(--motion-base)]
          ${isChatOpen ? "opacity-100" : "opacity-0 pointer-events-none"}
        `}
        onClick={closeChat}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={`
          fixed top-0 right-0 h-full z-50
          w-full md:w-96
          bg-[var(--background)] border-l border-[var(--divider)]
          flex flex-col
          transition-transform duration-[var(--motion-base)] ease-out
          ${isChatOpen ? "translate-x-0" : "translate-x-full"}
        `}
        aria-label="Chat sidebar"
        aria-hidden={!isChatOpen}
      >
        {/* Sidebar header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-[var(--divider)] shrink-0">
          <h2 className="text-base font-semibold">Chat</h2>
          <button
            onClick={closeChat}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Close chat"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </header>

        {/* Chat content - fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <Chat context={chatContext ?? undefined} variant="sidebar" />
        </div>
      </aside>
    </>
  );
}
