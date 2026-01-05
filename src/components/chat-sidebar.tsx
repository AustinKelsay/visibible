"use client";

import { X, MessageSquare, MessageCircleHeart } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { Chat } from "./chat";
import { Feedback } from "./feedback";

/**
 * Chat sidebar component with slide animation and tabs.
 * - Desktop (md+): Fixed 384px width on right side
 * - Mobile: Full width overlay with backdrop
 */
export function ChatSidebar() {
  const { isChatOpen, closeChat, chatContext, sidebarTab, setSidebarTab } =
    useNavigation();

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
        aria-label="Sidebar"
        aria-hidden={!isChatOpen}
      >
        {/* Sidebar header with tabs */}
        <header className="shrink-0 border-b border-[var(--divider)]">
          {/* Top row: title + close button */}
          <div className="flex items-center justify-between h-14 px-4">
            <h2 className="text-base font-semibold">
              {sidebarTab === "chat" ? "Chat" : "Feedback"}
            </h2>
            <button
              onClick={closeChat}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Close sidebar"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-t border-[var(--divider)]" role="tablist">
            <button
              onClick={() => setSidebarTab("chat")}
              className={`
                flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium
                transition-colors duration-[var(--motion-fast)]
                ${
                  sidebarTab === "chat"
                    ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }
              `}
              aria-selected={sidebarTab === "chat"}
              role="tab"
            >
              <MessageSquare size={16} strokeWidth={1.5} />
              Chat
            </button>
            <button
              onClick={() => setSidebarTab("feedback")}
              className={`
                flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium
                transition-colors duration-[var(--motion-fast)]
                ${
                  sidebarTab === "feedback"
                    ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }
              `}
              aria-selected={sidebarTab === "feedback"}
              role="tab"
            >
              <MessageCircleHeart size={16} strokeWidth={1.5} />
              Feedback
            </button>
          </div>
        </header>

        {/* Content - fills remaining space */}
        <div className="flex-1 overflow-hidden">
          {sidebarTab === "chat" ? (
            <Chat context={chatContext ?? undefined} variant="sidebar" />
          ) : (
            <Feedback context={chatContext ?? undefined} />
          )}
        </div>
      </aside>
    </>
  );
}
