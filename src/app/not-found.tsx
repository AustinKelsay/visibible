import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";

// The plain site header and footer, so a wrong link still leaves the name and a way back to reading
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteHeader />

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
    </div>
  );
}
