"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Grid3x2, Menu, MessageCircle, X } from "lucide-react";
import { useNavigation } from "@/context/navigation-context";
import { useOptionalVerseView } from "@/context/verse-view-context";
import { TranslationSelector } from "./translation-selector";
import { ImageModelSelector } from "./image-model-selector";
import { CreditsBadge } from "./credits-badge";
import { HeaderSettingsPopover, MobileSettingsRows } from "./header-settings-popover";
import { HeaderGenerateButton } from "./header-generate-button";

function Divider() {
  return <div className="w-px h-6 bg-[var(--divider)] mx-1 sm:mx-2" />;
}

function GalleryToggleButton({
  galleryOpen,
  onToggle,
}: {
  galleryOpen: boolean;
  onToggle: () => void;
}) {
  const label = galleryOpen ? "Switch to reading view" : "Switch to gallery view";
  const title = galleryOpen ? "Reading view" : "Gallery view";

  return (
    <button
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors duration-[var(--motion-fast)] ${
        galleryOpen
          ? "text-[var(--accent)] bg-[var(--accent)]/12 ring-1 ring-[var(--accent)]/35 rounded-[var(--radius-sm)]"
          : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
      aria-label={label}
      title={title}
      aria-pressed={galleryOpen}
      onClick={onToggle}
    >
      <Grid3x2 size={20} strokeWidth={1.5} />
    </button>
  );
}

export function Header() {
  const pathname = usePathname();
  const verseView = useOptionalVerseView();
  const { toggleMenu, toggleChat, isHeaderMenuOpen, openHeaderMenu, closeHeaderMenu } = useNavigation();
  const menuRef = useRef<HTMLDivElement>(null);
  const isBrandLinkPage = pathname === "/about" || pathname === "/api-docs";
  const isVersePage = /^\/[^/]+\/\d+\/\d+$/.test(pathname) && verseView !== null;
  const galleryOpen = verseView?.isSettled
    ? verseView.effectiveView === "gallery"
    : false;
  const handleGalleryToggle = () => verseView?.setEffectiveView(
    galleryOpen ? "reader" : "gallery",
    "header_gallery_toggle"
  );

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
        <h1 className="text-base sm:text-lg font-semibold tracking-tight">
          {isBrandLinkPage ? (
            <Link
              href="/"
              className="hover:text-[var(--accent)] transition-colors duration-[var(--motion-fast)]"
              aria-label="Go to home page"
              title="Go to home page"
            >
              Visibible
            </Link>
          ) : (
            "Visibible"
          )}
        </h1>

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

          {/* Generate Button - hidden in gallery view */}
          {isVersePage ? (
            <>
              <HeaderGenerateButton />
              <Divider />
            </>
          ) : null}

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

          {isVersePage ? (
            <>
              <Divider />

              {/* Gallery Mode */}
              <div className="flex items-center">
                <GalleryToggleButton
                  galleryOpen={galleryOpen}
                  onToggle={handleGalleryToggle}
                />
              </div>
            </>
          ) : null}
        </nav>

        {/* Mobile Actions - Credits + Generate + Chat + Books + Hamburger */}
        <nav className="flex sm:hidden items-center gap-0.5">
          <CreditsBadge />
          {isVersePage ? <HeaderGenerateButton /> : null}
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
          {isVersePage ? (
            <GalleryToggleButton
              galleryOpen={galleryOpen}
              onToggle={handleGalleryToggle}
            />
          ) : null}
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
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
