import { MetadataRoute } from "next";
import { BIBLE_BOOKS } from "@/data/bible-structure";
import { PROSE_WORKS } from "@/lib/works/catalog";

const BASE_URL = "https://visibible.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [];

  // Home page (redirects to Genesis 1:1)
  routes.push({
    url: BASE_URL,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
  });

  routes.push({
    url: `${BASE_URL}/about`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  });

  // The library and each prose work open to readers
  routes.push({ url: `${BASE_URL}/read`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 });
  for (const work of PROSE_WORKS.filter((w) => w.visibility === "public")) {
    routes.push({ url: `${BASE_URL}/read/${work.id}`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 });
  }

  routes.push({
    url: `${BASE_URL}/api-docs`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  });

  // Add all books with their first chapter, first verse
  for (const book of BIBLE_BOOKS) {
    // Book entry page (chapter 1, verse 1)
    routes.push({
      url: `${BASE_URL}/${book.slug}/1/1`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    });

    // Add first verse of each chapter for better coverage (start at 2, chapter 1 already added above)
    for (let chapter = 2; chapter <= book.chapters.length; chapter++) {
      routes.push({
        url: `${BASE_URL}/${book.slug}/${chapter}/1`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return routes;
}
