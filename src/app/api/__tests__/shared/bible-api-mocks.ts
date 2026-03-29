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

export function mockFetchBibleApi(input: RequestInfo | URL): TestFetchResponse | null {
  const url = normalizeFetchUrl(input);

  if (url.includes("bible-api.com/Genesis%201%3A1?translation=web")) {
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

  if (url.includes("bible-api.com/Genesis%201%3A3?translation=web")) {
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

  if (url.includes("bible-api.com/data/web/GEN/1")) {
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
