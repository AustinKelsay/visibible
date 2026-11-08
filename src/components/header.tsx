"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, Menu, MessageCircle, X, Zap } from "lucide-react";
import { useSession } from "@/context/session-context";
import { DEFAULT_IMAGE_ESTIMATED_CREDITS_COST } from "@/lib/image-models";
import { useNavigation } from "@/context/navigation-context";
import { useOptionalVerseView } from "@/context/verse-view-context";
import { TranslationSelector } from "./translation-selector";
import { ImageModelSelector } from "./image-model-selector";
import { ArtStyleSelector } from "@/components/art-style-selector";
import { CreditsBadge } from "./credits-badge";
import { HeaderSettingsPopover, MobileSettingsRows } from "./header-settings-popover";
import { HeaderGenerateButton } from "./header-generate-button";
import { BOOK_BY_SLUG } from "@/data/bible-structure";

function passageLabelFromPath(pathname: string): string | null {
  const [slug, chapter, verse] = pathname.split("/").filter(Boolean);
  const book = slug ? BOOK_BY_SLUG[slug] : undefined;
  return book && chapter && verse ? `${book.name} ${chapter}:${verse}` : null;
}

function Divider() {
  return <div className="w-px h-6 bg-[var(--divider)] mx-1 sm:mx-2" />;
}

export function Header() {
  const pathname = usePathname();
  const verseView = useOptionalVerseView();
  const { toggleMenu, toggleChat, isHeaderMenuOpen, openHeaderMenu, closeHeaderMenu } = useNavigation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { tier, credits, buyCredits, accessStatus } = useSession();
  const isBrandLinkPage = pathname === "/about" || pathname === "/api-docs";
  const isVersePage = /^\/[^/]+\/\d+\/\d+$/.test(pathname) && verseView !== null;
  const videoOpen = verseView?.effectiveView === "video";
  // Generate and image settings register only while the reader's image is mounted.
  const readerOpen = verseView?.effectiveView === "reader";
  const passageLabel = isVersePage ? passageLabelFromPath(pathname) : null;

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
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
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
            {/* Same controls on every tab. Art style is a saved preference, so it stays usable in Video;
                image settings need the image stage and are read-only there. */}
            <div className="flex items-center" title={videoOpen ? "Art style applies to images, not videos" : undefined}>
              <ArtStyleSelector variant="compact" />
            </div>
            <div
              className="flex items-center"
              inert={videoOpen}
              title={videoOpen ? "Image settings apply on the Images tab" : undefined}
            >
              <HeaderSettingsPopover />
            </div>
          </div>

          <Divider />

          {/* Generate Button - hidden in gallery view */}
          {isVersePage && readerOpen ? (
            <>
              <HeaderGenerateButton />
              <Divider />
            </>
          ) : isVersePage && accessStatus === "ready" && tier !== "admin" && credits < DEFAULT_IMAGE_ESTIMATED_CREDITS_COST ? (
            <>
              <button
                type="button"
                onClick={buyCredits}
                className="inline-flex min-h-[36px] px-3 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] text-xs font-medium"
              >
                <Zap size={14} strokeWidth={2} />
                <span>Get Credits</span>
              </button>
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
            {/* The passage is the main way to navigate, so on wide screens it reads as a button */}
            <button
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] ${
                passageLabel
                  ? "lg:ml-1 lg:min-h-[36px] lg:gap-1.5 lg:px-3 lg:rounded-full lg:border lg:border-[var(--divider)] lg:text-[var(--foreground)] lg:hover:bg-[var(--surface)]"
                  : ""
              }`}
              aria-label="Open book navigation"
              title="Navigate"
              onClick={toggleMenu}
            >
              <BookOpen size={passageLabel ? 18 : 20} strokeWidth={1.5} />
              {passageLabel ? (
                <>
                  <span className="hidden lg:inline text-sm font-medium">{passageLabel}</span>
                  <ChevronDown size={14} strokeWidth={1.75} className="hidden lg:block text-[var(--muted)]" aria-hidden="true" />
                </>
              ) : null}
            </button>
          </div>
        </nav>

        {/* Mobile Actions - Credits + Generate + Chat + Books + Hamburger */}
        <nav className="flex sm:hidden items-center gap-0.5">
          <CreditsBadge />
          {isVersePage && !videoOpen ? <HeaderGenerateButton /> : null}
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
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Settings menu"
            onClick={() => isHeaderMenuOpen ? closeHeaderMenu() : openHeaderMenu()}
          >
            {isHeaderMenuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
        </nav>
      </div>

      {/* Mobile settings backdrop: dims the page below the header and closes on tap */}
      {isHeaderMenuOpen && (
        <div
          className="sm:hidden fixed inset-x-0 bottom-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-40 bg-black/40"
          onClick={closeHeaderMenu}
          aria-hidden="true"
        />
      )}

      {/* Mobile Settings Dropdown */}
      {isHeaderMenuOpen && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-[var(--background)] border-b border-[var(--divider)] shadow-lg z-50">
          <div className="px-4 py-3 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--foreground)]">Translation</span>
              <TranslationSelector variant="compact" />
            </div>
            {!videoOpen && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--foreground)]">Image Model</span>
                  <ImageModelSelector variant="compact" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--foreground)]">Art Style</span>
                  <ArtStyleSelector variant="compact" source="mobile_header_menu" />
                </div>
              </>
            )}
            {!videoOpen && <MobileSettingsRows />}
          </div>
        </div>
      )}
    </header>
  );
}
