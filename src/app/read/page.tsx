import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { readerPath, viewableProseWorks } from "@/lib/works/reader-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library - Visibible",
  description: "Read the Bible and other classic books, illustrated as you go.",
};

export default async function LibraryPage() {
  const { works } = await viewableProseWorks();
  const card = "block rounded-[var(--radius-lg)] border border-[var(--divider)] p-5 hover:bg-[var(--surface)] transition-colors duration-[var(--motion-fast)]";
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteHeader />
      <main className="flex-1 px-4 md:px-6 py-8 sm:py-12 max-w-2xl w-full mx-auto">
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight mb-6">Library</h1>
        <ul className="space-y-3">
          <li>
            <Link href="/genesis/1/1" className={card}>
              <p className="text-lg font-medium">The Bible</p>
              <p className="text-sm text-[var(--muted)]">World English Bible, and the translation you choose</p>
            </Link>
          </li>
          {works.map((work) => (
            <li key={work.id}>
              <Link href={readerPath(work.id)} className={card}>
                <p className="text-lg font-medium">{work.title}</p>
                <p className="text-sm text-[var(--muted)]">{work.author} · {work.blurb}</p>
                {work.visibility === "owner" ? <p className="mt-2 text-xs text-[var(--muted)]">Owner preview</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </div>
  );
}
