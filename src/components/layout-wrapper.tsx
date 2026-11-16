"use client";

import { ReactNode } from "react";
import { useNavigation } from "@/context/navigation-context";
import { ChatSidebar } from "@/components/chat-sidebar";
import { FeedbackPrompt } from "@/components/feedback-prompt";

interface LayoutWrapperProps {
  children: ReactNode;
}

/**
 * The old page shell, kept by pages the spread has not replaced yet (About, API docs, recovery,
 * the prose reader, not-found). It carries the chat sidebar and the feedback prompt, which verse
 * pages no longer show, and handles push/resize behavior when the chat sidebar is open.
 * On desktop (md+), content shrinks via margin-right when chat is open.
 * On mobile, content stays full width (sidebar overlays).
 */
export function LayoutWrapper({ children }: LayoutWrapperProps) {
  const { isChatOpen } = useNavigation();

  return (
    <>
      <div
        className={`
          min-h-screen flex flex-col bg-[var(--background)]
          transition-[margin-right] duration-[var(--motion-base)] ease-out
          ${isChatOpen ? "md:mr-96" : "mr-0"}
        `}
      >
        {children}
      </div>
      <ChatSidebar />
      <FeedbackPrompt />
    </>
  );
}
