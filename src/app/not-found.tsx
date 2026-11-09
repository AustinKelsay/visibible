import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { BookMenu } from "@/components/book-menu";

// Same header and footer as the rest of the site, so a wrong link still leaves the brand,
// the book menu and a way back
export default function NotFound() {
  return (
    <LayoutWrapper>
      <Header isNotFound />

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-[var(--foreground)] mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">
            Page not found
          </h2>
          <p className="text-[var(--muted)] mb-8 max-w-md">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center px-6 bg-[var(--accent)] text-[var(--accent-text)] rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)] transition-colors duration-[var(--motion-fast)] focus-ring"
          >
            Go to Genesis 1:1
          </Link>
        </div>
      </main>

      <Footer />
      <BookMenu />
    </LayoutWrapper>
  );
}
