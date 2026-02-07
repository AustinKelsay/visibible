import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="text-center px-4">
        <h1 className="text-6xl font-bold text-[var(--foreground)] mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">
          Page not found
        </h2>
        <p className="text-[var(--muted)] mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
        >
          Go to Genesis 1:1
        </Link>
      </div>
    </div>
  );
}
