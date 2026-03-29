export type TestFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export function normalizeFetchUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

let mockFetchBibleApiBypass:
  | ((url: URL) => boolean)
  | null = null;

export function setMockFetchBibleApiBypass(
  bypass: ((url: URL) => boolean) | null
) {
  mockFetchBibleApiBypass = bypass;
}

function matchesExactBibleApiReference(
  url: URL,
  reference: string,
  translation: string
) {
  return (
    url.origin === "https://bible-api.com" &&
    decodeURIComponent(url.pathname.slice(1)) === reference &&
    url.searchParams.get("translation") === translation
  );
}

export function mockFetchBibleApi(input: RequestInfo | URL): TestFetchResponse | null {
  const url = new URL(normalizeFetchUrl(input));

  if (mockFetchBibleApiBypass?.(url)) {
    return null;
  }

  if (matchesExactBibleApiReference(url, "Genesis 1:1", "web")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        reference: "Genesis 1:1",
        verses: [
          {
            book_id: "GEN",
            book_name: "Genesis",
            chapter: 1,
            verse: 1,
            text: "In the beginning God created the heavens and the earth.",
          },
        ],
      }),
    };
  }

  if (matchesExactBibleApiReference(url, "Genesis 1:3", "web")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        reference: "Genesis 1:3",
        verses: [
          {
            book_id: "GEN",
            book_name: "Genesis",
            chapter: 1,
            verse: 3,
            text: "God said, Let there be light; and there was light.",
          },
        ],
      }),
    };
  }

  if (url.origin === "https://bible-api.com" && url.pathname === "/data/web/GEN/1") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        translation_id: "web",
        translation_name: "World English Bible",
        verses: [
          {
            book_id: "GEN",
            book_name: "Genesis",
            chapter: 1,
            verse: 1,
            text: "In the beginning God created the heavens and the earth.",
          },
          {
            book_id: "GEN",
            book_name: "Genesis",
            chapter: 1,
            verse: 2,
            text: "The earth was formless and empty.",
          },
          {
            book_id: "GEN",
            book_name: "Genesis",
            chapter: 1,
            verse: 3,
            text: "God said, Let there be light; and there was light.",
          },
        ],
      }),
    };
  }

  return null;
}
