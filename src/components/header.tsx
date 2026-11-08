"use client";

import { useEffect, useRef, useState } from "react";
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
import { bookAbbreviation } from "@/data/book-abbreviations";

function passageFromPath(pathname: string): { full: string; short: string } | null {
  const [slug, chapter, verse] = pathname.split("/").filter(Boolean);
  // Own keys only, so a path like /constructor/1/1 is not read as a book
  const book = slug && Object.hasOwn(BOOK_BY_SLUG, slug) ? BOOK_BY_SLUG[slug] : undefined;
  if (!book || !chapter || !verse) return null;
  return {
    full: `${book.name} ${chapter}:${verse}`,
    short: `${bookAbbreviation(book.id, book.name)} ${chapter}:${verse}`,
  };
}

function Divider() {
  return <div className="w-px h-6 bg-[var(--divider)] mx-1 sm:mx-2" />;
}

export function Header() {
  const pathname = usePathname();
  const verseView = useOptionalVerseView();
  const { toggleMenu, toggleChat, isHeaderMenuOpen, openHeaderMenu, closeHeaderMenu } = useNavigation();
  const menuRef = useRef<HTMLDivElement>(null);
  // Phone passage pill: shown only when its full label fits beside the other header controls,
  // otherwise the book icon stands in (a long passage plus a paid balance and Generate can crowd it).
  const headerRowRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLHeadingElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const passageButtonRef = useRef<HTMLButtonElement>(null);
  const pillMeasureRef = useRef<HTMLSpanElement>(null);
  const [pillFits, setPillFits] = useState(true);
  const { tier, credits, buyCredits, accessStatus } = useSession();
  const isBrandLinkPage = pathname === "/about" || pathname === "/api-docs";
  const isVersePage = /^\/[^/]+\/\d+\/\d+$/.test(pathname) && verseView !== null;
  const videoOpen = verseView?.effectiveView === "video";
  // Generate and image settings register only while the reader's image is mounted.
  const readerOpen = verseView?.effectiveView === "reader";
  const passage = isVersePage ? passageFromPath(pathname) : null;
  const passageLabel = passage?.full ?? null;
  const passageShort = passage?.short ?? null;

  useEffect(() => {
    const row = headerRowRef.current;
    const nav = mobileNavRef.current;
    if (!row || !nav || !passageShort || typeof ResizeObserver === "undefined") return;
    const check = () => {
      const brand = brandRef.current;
      const button = passageButtonRef.current;
      const measure = pillMeasureRef.current;
      if (!brand || !button || !measure) return;
      const rowStyle = getComputedStyle(row);
      const rowContent = row.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
      // Space the passage button may use: the row minus the brand and every other nav item (with gaps)
      const others = Array.from(nav.children).filter(
        (child) => child !== button && child !== measure && (child as HTMLElement).offsetWidth > 0,
      );
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const othersWidth = others.reduce((width, child) => width + (child as HTMLElement).offsetWidth, 0) + gap * others.length;
      // Keep a small gap after the brand
      const available = rowContent - brand.offsetWidth - othersWidth - 4;
      setPillFits(measure.offsetWidth + 8 <= available);
    };
    const observer = new ResizeObserver(check);
    observer.observe(row);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [passageShort]);

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
      <div ref={headerRowRef} className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <h1 ref={brandRef} className="shrink-0 text-base sm:text-lg font-semibold tracking-tight">
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
          {/* The passage is the main way to navigate, so it leads the controls and, on wide screens,
              reads as a button */}
          <button
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] ${
              passageLabel
                ? "lg:min-h-[36px] lg:gap-1.5 lg:px-3 lg:rounded-full lg:border lg:border-[var(--divider)] lg:text-[var(--foreground)] lg:hover:bg-[var(--surface)]"
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

          <Divider />

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
          </div>
        </nav>

        {/* Mobile Actions - Credits + Generate + Chat + Books + Hamburger */}
        {/* min-w-0 lets the passage pill give way on narrow phones instead of pushing the menu off-screen */}
        <nav ref={mobileNavRef} className="relative flex sm:hidden min-w-0 items-center gap-0.5">
          <CreditsBadge />
          {isVersePage && !videoOpen ? <HeaderGenerateButton /> : null}
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            aria-label="Toggle chat"
            onClick={toggleChat}
          >
            <MessageCircle size={20} strokeWidth={1.5} />
          </button>
          {/* Phones show where you are ("Gen 1:1") when the full label fits; otherwise, and on the
              narrowest phones, the book icon. The pill can also shrink with an ellipsis, so it never
              pushes the menu button out of view. */}
          {passage ? (
            <span
              ref={pillMeasureRef}
              aria-hidden="true"
              className="invisible absolute left-0 top-0 -z-10 inline-flex h-8 items-center gap-0.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap"
            >
              {passage.short}
              <ChevronDown size={12} strokeWidth={1.75} />
            </span>
          ) : null}
          <button
            ref={passageButtonRef}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] ${
              passage && pillFits ? "min-[375px]:min-w-0 min-[375px]:px-1" : ""
            }`}
            aria-label={passage ? `Open book navigation, ${passage.full}` : "Open book navigation"}
            onClick={toggleMenu}
          >
            <BookOpen size={20} strokeWidth={1.5} className={passage && pillFits ? "min-[375px]:hidden" : ""} />
            {passage && pillFits ? (
              <span className="hidden min-[375px]:inline-flex min-w-0 max-w-full h-8 items-center gap-0.5 rounded-full border border-[var(--divider)] px-3 text-sm font-medium text-[var(--foreground)]">
                <span className="min-w-0 truncate">{passage.short}</span>
                <ChevronDown size={12} strokeWidth={1.75} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
              </span>
            ) : null}
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
