import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANON_ID_COOKIE_NAME,
  ANON_ID_HEADER_NAME,
  VERSE_VIEW_FLAG_KEY,
} from "@/lib/verse-view";

const vercelAdapterMock = vi.fn(() => ({
  config: { reportValue: true },
  decide: vi.fn(() => "gallery"),
}));

vi.mock("flags/next", () => ({
  dedupe: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  flag: <T>(definition: T) => definition,
}));

vi.mock("@flags-sdk/vercel", () => ({
  vercelAdapter: vercelAdapterMock,
}));

describe("flags", () => {
  const originalFlags = process.env.FLAGS;

  afterEach(() => {
    if (originalFlags === undefined) {
      delete process.env.FLAGS;
    } else {
      process.env.FLAGS = originalFlags;
    }
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("identifyVisitor prefers the anon cookie", async () => {
    delete process.env.FLAGS;
    const { identifyVisitor } = await import("@/lib/flags");

    await expect(identifyVisitor({
      cookies: {
        get: (name: string) => (
          name === ANON_ID_COOKIE_NAME
            ? { value: "cookie-visitor" }
            : undefined
        ),
      },
      headers: new Headers([
        [ANON_ID_HEADER_NAME, "header-visitor"],
      ]),
    })).resolves.toEqual({
      visitor: {
        id: "cookie-visitor",
      },
    });
  });

  it("identifyVisitor falls back to the anon header", async () => {
    delete process.env.FLAGS;
    const { identifyVisitor } = await import("@/lib/flags");

    await expect(identifyVisitor({
      cookies: {
        get: () => undefined,
      },
      headers: new Headers([
        [ANON_ID_HEADER_NAME, "header-visitor"],
      ]),
    })).resolves.toEqual({
      visitor: {
        id: "header-visitor",
      },
    });
  });

  it("identifyVisitor returns an empty object when no visitor id is present", async () => {
    delete process.env.FLAGS;
    const { identifyVisitor } = await import("@/lib/flags");

    await expect(identifyVisitor({
      cookies: {
        get: () => undefined,
      },
      headers: new Headers(),
    })).resolves.toEqual({});
  });

  it("uses the local adapter and reader default when FLAGS is unset", async () => {
    delete process.env.FLAGS;
    const {
      defaultVerseViewFlag,
      getDefaultVerseViewAdapter,
    } = await import("@/lib/flags");

    const adapter = getDefaultVerseViewAdapter();

    expect(adapter.config).toEqual({ reportValue: false });
    expect(adapter.decide({} as never)).toBe("reader");
    expect(defaultVerseViewFlag.key).toBe(VERSE_VIEW_FLAG_KEY);
    expect(defaultVerseViewFlag.defaultValue).toBe("reader");
    expect(vercelAdapterMock).not.toHaveBeenCalled();
  });

  it("uses the Vercel adapter pathway when FLAGS is set", async () => {
    process.env.FLAGS = "1";
    const { getDefaultVerseViewAdapter } = await import("@/lib/flags");

    const adapter = getDefaultVerseViewAdapter();

    expect(vercelAdapterMock).toHaveBeenCalledTimes(2);
    expect(adapter).toBe(vercelAdapterMock.mock.results[1]?.value);
  });
});
