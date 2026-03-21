import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LayoutWrapper } from "@/components/layout-wrapper";
import { BookMenu } from "@/components/book-menu";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export const metadata: Metadata = {
  title: "API Docs - Visibible",
  description:
    "Simple documentation for the Visibible public image API.",
};

const docsContent = `
## Overview

The public image API gives read-only access to images that have already been generated and saved in Visibible.

- Base URL: \`https://visibible.com/api/public/images\`
- Auth: none
- Access: public, read-only
- CORS: enabled for \`GET\` and \`OPTIONS\`
- Format: JSON

## Endpoints

### API index

\`\`\`bash
GET /api/public/images
\`\`\`

Returns the API version, capability summary, and route templates.

### Books with images

\`\`\`bash
GET /api/public/images/books
\`\`\`

Returns books that currently have at least one saved image.

### Chapters with images for a book

\`\`\`bash
GET /api/public/images/books/{book}/chapters
\`\`\`

Returns chapter numbers that currently have at least one saved image.

### Latest images in a chapter

\`\`\`bash
GET /api/public/images/chapters/{book}/{chapter}
\`\`\`

Returns the latest saved image for each verse in a chapter that currently has art.

### Latest image for a verse

\`\`\`bash
GET /api/public/images/verses/{book}/{chapter}/{verse}
\`\`\`

Returns the latest saved image for one verse.

### Paginated image history for a verse

\`\`\`bash
GET /api/public/images/verses/{book}/{chapter}/{verse}/images?limit=20&cursor=...
\`\`\`

Returns a paginated list of saved images for one verse.

## Example requests

\`\`\`bash
curl https://visibible.com/api/public/images
curl https://visibible.com/api/public/images/books
curl https://visibible.com/api/public/images/books/genesis/chapters
curl https://visibible.com/api/public/images/chapters/genesis/1
curl https://visibible.com/api/public/images/verses/john/3/16
curl "https://visibible.com/api/public/images/verses/genesis/1/1/images?limit=10"
\`\`\`

## Example verse response

\`\`\`json
{
  "data": {
    "verse": {
      "book": "genesis",
      "bookName": "Genesis",
      "chapter": 1,
      "verse": 1,
      "reference": "Genesis 1:1",
      "pageUrl": "https://visibible.com/genesis/1/1",
      "historyUrl": "https://visibible.com/api/public/images/verses/genesis/1/1/images"
    },
    "image": {
      "id": "abc123",
      "imageUrl": "https://actions.visibible.com/image/storage_id",
      "reference": "Genesis 1:1",
      "pageUrl": "https://visibible.com/genesis/1/1",
      "model": "google/gemini-2.5-flash-image",
      "translationId": "web",
      "aspectRatio": "16:9",
      "imageMimeType": "image/png",
      "imageWidth": 1024,
      "imageHeight": 768,
      "createdAt": 1742580000000
    }
  }
}
\`\`\`

## Pagination

Verse history uses cursor pagination.

- Default \`limit\`: \`20\`
- Max \`limit\`: \`50\`
- Response includes:
  - \`pageInfo.nextCursor\`
  - \`pageInfo.hasMore\`

## Rate limits

Public requests are rate limited by IP address.

- Discovery endpoints: \`120/minute\`
- Verse latest: \`60/minute\`
- Verse history: \`30/minute\`
- Chapter latest-per-verse: \`20/minute\`

Rate-limited requests return \`429\` and include a \`Retry-After\` header.

## Public fields only

Public responses intentionally exclude internal generation details like:

- prompts
- prompt inputs
- cost data
- provider request IDs
- session data
- analytics fields
`;

const quickLinks = [
  { label: "API root", href: "/api/public/images" },
  { label: "Books", href: "/api/public/images/books" },
  { label: "Genesis chapters", href: "/api/public/images/books/genesis/chapters" },
  { label: "Genesis 1", href: "/api/public/images/chapters/genesis/1" },
  { label: "John 3:16", href: "/api/public/images/verses/john/3/16" },
];

export default function ApiDocsPage() {
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
                  href="/api/public/images"
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
                {quickLinks.map((link) => (
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
