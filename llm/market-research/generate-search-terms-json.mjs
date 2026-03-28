import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const markdownPath = join(dir, "visibible-market-research-search-terms.md");
const outputPath = join(dir, "visibible-market-research-search-terms.json");

const markdown = readFileSync(markdownPath, "utf8");
const lines = markdown.split(/\r?\n/);

let currentCategory = "";
let currentIntent = "";
const records = [];

for (const line of lines) {
  const categoryMatch = line.match(/^###\s+(Category\s+\d+:\s+.+)$/);
  if (categoryMatch) {
    currentCategory = categoryMatch[1].trim();
    const intentMatch = currentCategory.match(/\(([^)]+)\)\s*$/);
    currentIntent = (intentMatch ? intentMatch[1] : currentCategory)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    continue;
  }

  const termMatch = line.match(/^\d+\.\s+(.+)$/);
  if (!termMatch || !currentCategory) continue;
  records.push({
    term: termMatch[1].trim(),
    category: currentCategory,
    intent: currentIntent,
  });
}

const document = {
  metadata: {
    version: 1,
    date: "2026-03-28",
    source: "visibible-market-research-search-terms.md",
    recordCount: records.length,
  },
  records,
};

writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
