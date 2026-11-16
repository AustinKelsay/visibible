import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AboutPage from "../about/page";
import ApiDocsPage from "../api-docs/page";
import NotFound from "../not-found";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "visibible.test" }) }));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ tier: "paid", credits: 0, isLoading: false }) }));

describe("the pages around the reader", () => {
  it.each([
    ["About", async () => AboutPage()],
    ["API documentation", async () => ApiDocsPage()],
    ["not-found", async () => NotFound()],
  ])("%s shows the plain site header with a way back to reading", async (_name, render) => {
    const html = renderToStaticMarkup(await render());
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).toContain(">Visibible</a>");
    expect(header).toMatch(/<a [^>]*href="\/"[^>]*>Back to reading<\/a>/);
    // None of the old header's reader controls.
    expect(header).not.toMatch(/Toggle chat|Open book navigation|Settings menu|credits/i);
    // These pages follow the system setting; only the reader is always dark.
    expect(html).not.toContain("color-scheme");
  });
});
