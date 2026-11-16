import Link from "next/link";

/**
 * The plain header of the pages around the reader (About, API documentation, recovery, not-found and an
 * unavailable passage): the name and a way back to reading. These pages follow the system's light or
 * dark setting.
 */
export function SiteHeader() {
  return (
    <header
      className="border-b border-[var(--divider)] bg-[var(--background)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
          Visibible
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--foreground)]"
        >
          Back to reading
        </Link>
      </div>
    </header>
  );
}
