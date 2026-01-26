import { MetadataRoute } from "next";
import { BIBLE_BOOKS } from "@/data/bible-structure";

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
