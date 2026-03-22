import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { BookMenu } from "@/components/book-menu";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  buildPublicApiDocsMarkdown,
  getPublicApiDocsBaseUrl,
  getPublicApiDocsPageBaseUrl,
  PUBLIC_IMAGE_API_BASE_PATH,
  PUBLIC_IMAGE_API_QUICK_LINKS,
} from "@/lib/public-image-docs";

export const metadata: Metadata = {
  title: "API Docs - Visibible",
  description:
    "Simple documentation for the Visibible public image API.",
};

export default async function ApiDocsPage() {
  const headerList = await headers();
  const apiBaseUrl = getPublicApiDocsBaseUrl(headerList);
  const pageBaseUrl = getPublicApiDocsPageBaseUrl(headerList);
  const docsContent = buildPublicApiDocsMarkdown(apiBaseUrl, pageBaseUrl);

  return (
    <LayoutWrapper>
      <Header />

      <main className="flex-1">
        <section className="border-b border-[var(--divider)]">
          <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-[0.14em] uppercase text-[var(--accent)]">
                API Docs
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--foreground)]">
                Public image library API
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-8 text-[var(--muted)]">
                A simple read-only API for fetching already-generated Scripture images.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={PUBLIC_IMAGE_API_BASE_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--divider)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
                >
                  Open API root
                </Link>
                <Link
                  href="https://github.com/AustinKelsay/visibible"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--divider)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
                >
                  View source
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 py-10 sm:py-14">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-24 h-fit rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--surface)] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Quick Links
              </h2>
              <div className="mt-4 grid gap-2">
                {PUBLIC_IMAGE_API_QUICK_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    target={link.href.startsWith("/api/") ? "_blank" : undefined}
                    rel={link.href.startsWith("/api/") ? "noopener noreferrer" : undefined}
                    className="rounded-[var(--radius-md)] border border-[var(--divider)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </aside>

            <article className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--surface)] p-5 sm:p-7">
              <MarkdownRenderer content={docsContent} />
            </article>
          </div>
        </section>
      </main>

      <Footer />
      <BookMenu />
    </LayoutWrapper>
  );
}
