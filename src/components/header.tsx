"use client";

import { Search, Menu } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { TranslationSelector } from "./translation-selector";
import { ImageModelSelector } from "./image-model-selector";

export function Header() {
  const { toggleMenu } = useNavigation();

  return (
    <header className="z-50 bg-[var(--background)] border-b border-[var(--divider)]">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Visibible</h1>
        <nav className="flex items-center gap-1">
          <TranslationSelector variant="compact" />
          <ImageModelSelector variant="compact" />
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Search"
          >
            <Search size={20} strokeWidth={1.5} />
          </button>
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Open navigation menu"
            onClick={toggleMenu}
          >
            <Menu size={20} strokeWidth={1.5} />
          </button>
        </nav>
      </div>
    </header>
  );
}
