import { BOOK_BY_SLUG } from "@/data/bible-structure";

export function getExpandedTestamentForPathname(pathname: string): "old" | "new" {
  const [bookSlug] = pathname.split("/").filter(Boolean);

  if (!bookSlug) {
    return "old";
  }

  return BOOK_BY_SLUG[bookSlug.toLowerCase()]?.testament ?? "old";
}
