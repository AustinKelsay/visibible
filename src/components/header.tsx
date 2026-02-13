"use client";

import { useEffect, useRef } from "react";
import { BookOpen, MessageCircle, Menu, X } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { TranslationSelector } from "./translation-selector";
import { ImageModelSelector } from "./image-model-selector";
import { CreditsBadge } from "./credits-badge";
import { HeaderSettingsPopover, MobileSettingsRows } from "./header-settings-popover";
import { HeaderGenerateButton } from "./header-generate-button";

function Divider() {
  return <div className="w-px h-6 bg-[var(--divider)] mx-1 sm:mx-2" />;
}

export function Header() {
  const { toggleMenu, toggleChat, isHeaderMenuOpen, openHeaderMenu, closeHeaderMenu } = useNavigation();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isHeaderMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeHeaderMenu();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isHeaderMenuOpen, closeHeaderMenu]);

  return (
    <header
      className="relative z-50 bg-[var(--background)] border-b border-[var(--divider)]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      ref={menuRef}
    >
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand */}
        <h1 className="text-base sm:text-lg font-semibold tracking-tight">Visibible</h1>

        {/* Desktop Actions - hidden on mobile */}
        <nav className="hidden sm:flex items-center">
          {/* Credits - Primary CTA */}
          <CreditsBadge />

          <Divider />

          {/* Settings Group */}
          <div className="flex items-center">
            <TranslationSelector variant="compact" />
            <ImageModelSelector variant="compact" />
            <HeaderSettingsPopover />
          </div>

          <Divider />

          {/* Generate Button */}
          <HeaderGenerateButton />

          <Divider />

          {/* Navigation Group */}
          <div className="flex items-center">
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Toggle chat"
              title="Chat"
              onClick={toggleChat}
            >
              <MessageCircle size={20} strokeWidth={1.5} />
            </button>
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Open book navigation"
              title="Navigate"
              onClick={toggleMenu}
            >
              <BookOpen size={20} strokeWidth={1.5} />
            </button>
          </div>
        </nav>

        {/* Mobile Actions - Credits + Generate + Chat + Books + Hamburger */}
        <nav className="flex sm:hidden items-center gap-0.5">
          <CreditsBadge />
          <HeaderGenerateButton />
          <button
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Toggle chat"
            onClick={toggleChat}
          >
            <MessageCircle size={20} strokeWidth={1.5} />
          </button>
          <button
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Open book navigation"
            onClick={toggleMenu}
          >
            <BookOpen size={20} strokeWidth={1.5} />
          </button>
          <button
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Settings menu"
            onClick={() => isHeaderMenuOpen ? closeHeaderMenu() : openHeaderMenu()}
          >
            {isHeaderMenuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
        </nav>
      </div>

      {/* Mobile Settings Dropdown */}
      {isHeaderMenuOpen && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-[var(--background)] border-b border-[var(--divider)] shadow-lg z-50">
          <div className="px-4 py-3 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground)]">Translation</span>
              <TranslationSelector variant="compact" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground)]">Image Model</span>
              <ImageModelSelector variant="compact" />
            </div>
            <MobileSettingsRows />
          </div>
        </div>
      )}
    </header>
  );
}
