"use client";

import { BookOpen, MessageCircle } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { TranslationSelector } from "./translation-selector";
import { ImageModelSelector } from "./image-model-selector";
import { ChatModelSelector } from "./chat-model-selector";
import { CreditsBadge } from "./credits-badge";

function Divider() {
  return <div className="w-px h-6 bg-[var(--divider)] mx-1 sm:mx-2" />;
}

export function Header() {
  const { toggleMenu, toggleChat } = useNavigation();

  return (
    <header className="z-50 bg-[var(--background)] border-b border-[var(--divider)]">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <h1 className="text-lg font-semibold tracking-tight">Vibible</h1>

        {/* Actions */}
        <nav className="flex items-center">
          {/* Credits - Primary CTA */}
          <CreditsBadge />

          <Divider />

          {/* Settings Group */}
          <div className="flex items-center">
            <TranslationSelector variant="compact" />
            <ImageModelSelector variant="compact" />
            <ChatModelSelector variant="compact" />
          </div>

          <Divider />

          {/* Navigation Group */}
          <div className="flex items-center">
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Toggle chat"
              onClick={toggleChat}
            >
              <MessageCircle size={20} strokeWidth={1.5} />
            </button>
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Open book navigation"
              onClick={toggleMenu}
            >
              <BookOpen size={20} strokeWidth={1.5} />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
