import { afterEach, describe, expect, it } from "vitest";
import {
  buildPublicApiDocsMarkdown,
  getPublicApiDocsBaseUrl,
  getPublicApiDocsPageBaseUrl,
} from "@/lib/public-image-docs";

describe("public image docs helpers", () => {
  const originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalNextPublicAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalNextPublicAppUrl;
    }
  });

  it("uses the current request host for API examples", () => {
    const headersList = new Headers({
      host: "www.visibible.com",
      "x-forwarded-proto": "https",
    });

    expect(getPublicApiDocsBaseUrl(headersList)).toBe("https://www.visibible.com");
  });

  it("uses NEXT_PUBLIC_APP_URL for verse page examples when configured", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://visibible.com";

    const headersList = new Headers({
      host: "www.visibible.com",
      "x-forwarded-proto": "https",
    });

    expect(getPublicApiDocsPageBaseUrl(headersList)).toBe("https://visibible.com");
  });

  it("adds https and trims trailing slashes when NEXT_PUBLIC_APP_URL omits a scheme", () => {
    process.env.NEXT_PUBLIC_APP_URL = "visibible.com/";

    const headersList = new Headers({
      host: "www.visibible.com",
      "x-forwarded-proto": "https",
    });

    expect(getPublicApiDocsPageBaseUrl(headersList)).toBe("https://visibible.com");
  });

  it("renders API and page links with their respective canonical base URLs", () => {
    const markdown = buildPublicApiDocsMarkdown(
      "https://www.visibible.com",
      "https://visibible.com"
    );

    expect(markdown).toContain("Base URL: `https://www.visibible.com/api/public/images`");
    expect(markdown).toContain("\"historyUrl\": \"https://www.visibible.com/api/public/images/verses/genesis/1/1/images\"");
    expect(markdown).toContain("\"pageUrl\": \"https://visibible.com/genesis/1/1\"");
  });

  it("normalizes trailing slashes in markdown base URLs", () => {
    const markdown = buildPublicApiDocsMarkdown(
      " https://www.visibible.com/ ",
      " https://visibible.com/ "
    );

    expect(markdown).toContain("Base URL: `https://www.visibible.com/api/public/images`");
    expect(markdown).toContain("curl \"https://www.visibible.com/api/public/images/books\"");
    expect(markdown).toContain("\"pageUrl\": \"https://visibible.com/genesis/1/1\"");
    expect(markdown).not.toContain("https://www.visibible.com//api/public/images");
    expect(markdown).not.toContain("https://visibible.com//genesis/1/1");
  });
});
