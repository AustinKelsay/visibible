import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const markdownPath = join(dir, "visibible-market-research-search-terms.md");
const outputPath = join(dir, "visibible-market-research-search-terms.json");

const markdown = readFileSync(markdownPath, "utf8");
const lines = markdown.split(/\r?\n/);
const minRecordCount = Number.parseInt(process.env.MIN_SEARCH_TERM_RECORDS ?? "100", 10);
const minDistinctCategoryCount = Number.parseInt(process.env.MIN_SEARCH_TERM_CATEGORIES ?? "10", 10);

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

const validRecords = records.filter((record) => record.term.length > 0);
if (validRecords.length === 0) {
  throw new Error("Parse produced zero records; refusing to write JSON output.");
}
const termFrequency = new Map();
for (const record of validRecords) {
  const normalizedTerm = record.term.trim().toLowerCase();
  if (!normalizedTerm) continue;
  termFrequency.set(normalizedTerm, (termFrequency.get(normalizedTerm) ?? 0) + 1);
}
const duplicateTerms = [...termFrequency.entries()]
  .filter(([, count]) => count > 1)
  .sort((a, b) => b[1] - a[1]);
if (duplicateTerms.length > 0) {
  const preview = duplicateTerms
    .slice(0, 5)
    .map(([term, count]) => `"${term}" (${count}x)`)
    .join(", ");
  throw new Error(
    `Duplicate search terms detected (${duplicateTerms.length} unique duplicates). Examples: ${preview}`
  );
}
if (!Number.isFinite(minRecordCount) || minRecordCount < 1) {
  throw new Error(`Invalid MIN_SEARCH_TERM_RECORDS: ${process.env.MIN_SEARCH_TERM_RECORDS ?? "<unset>"}`);
}
if (validRecords.length < minRecordCount) {
  throw new Error(
    `Parsed ${validRecords.length} records, below required minimum ${minRecordCount}.`
  );
}
if (!Number.isFinite(minDistinctCategoryCount) || minDistinctCategoryCount < 1) {
  throw new Error(
    `Invalid MIN_SEARCH_TERM_CATEGORIES: ${process.env.MIN_SEARCH_TERM_CATEGORIES ?? "<unset>"}`
  );
}
const distinctCategories = new Set(
  validRecords.map((record) => `${record.category}::${record.intent}`)
);
if (distinctCategories.size < minDistinctCategoryCount) {
  throw new Error(
    `Parsed ${distinctCategories.size} distinct categories, below required minimum ${minDistinctCategoryCount}.`
  );
}

const document = {
  metadata: {
    version: 1,
    date: new Date().toISOString().slice(0, 10),
    source: "visibible-market-research-search-terms.md",
    recordCount: validRecords.length,
  },
  records: validRecords,
};

writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
