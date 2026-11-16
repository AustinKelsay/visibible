import Link from "next/link";
import { TrackedApiDocsLink } from "@/components/api-docs-analytics";
import { SocialLinks } from "@/components/site-links";

export function Footer() {
  return (
    <footer
      className="border-t border-[var(--divider)] mt-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex flex-col items-center justify-center gap-2 sm:gap-3 text-center">
          {/* Tagline and links share one line, so the footer stays short after a verse on phones */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs sm:text-sm text-[var(--muted)]">
            <p>Free &amp; open source software.</p>
            <Link
              href="/about"
              className="hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            >
              About
            </Link>
            <TrackedApiDocsLink
              href="/api-docs"
              source="footer"
              className="hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
            >
              API Docs
            </TrackedApiDocsLink>
          </div>
          <div className="flex items-center justify-center gap-2">
            <SocialLinks className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]" />
          </div>
        </div>
      </div>
    </footer>
  );
}
