/** `npm run seed:images`: the list, the flags, and a run against a stand-in for the site's routes. No request leaves the process. */
import { describe, expect, it } from "vitest";
import { BOOK_BY_SLUG } from "@/data/bible-structure";
import { SEED_CHAPTERS, type SeedChapterEntry } from "../seed/chapters";
import { CEILING_USD_PER_IMAGE, GENERATE_REQUESTS_PER_MINUTE, expandSeedList, parseSeedOptions, runSeed, type LedgerRow, type RunSummary, type SeedOptions } from "../seed/images";
import { RATE_LIMITS } from "../../../convex/rateLimit";

const SITE = "https://seed.test";
const PASSWORD = "s3cret-Owner-Pass";
const JONAH_2: SeedChapterEntry[] = [{ book: "jonah", chapter: 2, verses: 10 }];
const IMAGE_USD = 0.04;

type Call = { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | undefined; at: number };
type Generate = (body: Record<string, unknown>, nth: number) => Response | Promise<Response>;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const rendered = (body: Record<string, unknown>, nth: number) => json(200, {
  requestId: body.requestId, engine: "generic", imageUrl: "data:image/png;base64,AAAA", savedImageId: `img-${nth}`, creditsCost: 6, costUsd: 0.05,
  openRouterUsageUsd: IMAGE_USD, durationMs: 9000, provenance: { workId: "bible-web" },
});

/** The routes a run touches, with the checks the real ones make: origin, the CSRF cookie echoed as a header, a session, and an admin tier. */
function fakeSite(config: { saved?: Record<string, number[]>; chapterAnswer?: (path: string, nth: number) => Response | null; generate?: Generate; loginUpgrades?: boolean; now?: () => number } = {}) {
  const calls: Call[] = [];
  const site = { calls, admin: false, inFlight: 0, maxInFlight: 0, generates: [] as Call[], chapterReads: 0 };
  const cookie = (headers: Record<string, string>, name: string) => (headers.Cookie ?? "").split("; ").find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const guarded = (headers: Record<string, string>) => headers.Origin === SITE && cookie(headers, "visibible_session") === "session-1"
    && cookie(headers, "visibible_csrf") === "csrf-1" && headers["x-csrf-token"] === "csrf-1";
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const target = new URL(url);
    const headers = init.headers as Record<string, string>;
    const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    const call: Call = { method: String(init.method), path: target.pathname + target.search, headers, body, at: config.now?.() ?? 0 };
    calls.push(call);
    if (target.origin !== SITE) return json(404, { error: "Not found" });
    const chapter = target.pathname.match(/^\/api\/public\/images\/chapters\/([a-z0-9-]+)\/(\d+)$/);
    if (call.method === "GET" && chapter) {
      const override = config.chapterAnswer?.(call.path, ++site.chapterReads);
      if (override) return override;
      return json(200, { data: { book: chapter[1], chapter: Number(chapter[2]), artStyle: target.searchParams.get("style"),
        verses: (config.saved?.[`${chapter[1]}/${chapter[2]}`] ?? []).map((verse) => ({ verse })) } });
    }
    const verse = target.pathname.match(/^\/api\/public\/images\/verses\/([a-z0-9-]+)\/(\d+)\/(\d+)$/);
    if (call.method === "GET" && verse) return config.saved?.[`${verse[1]}/${verse[2]}/${verse[3]}`] ? json(200, { data: { image: {} } }) : json(404, { error: "Not found" });
    if (target.pathname === "/api/session" && call.method === "POST") {
      if (headers.Origin !== SITE) return json(403, { error: "Forbidden" });
      const response = json(200, { sid: "sid-1", tier: "paid", credits: 0 });
      response.headers.append("set-cookie", "visibible_session=session-1; Path=/; HttpOnly; Max-Age=604800");
      response.headers.append("set-cookie", "visibible_csrf=csrf-1; Path=/; Max-Age=3600");
      return response;
    }
    if (target.pathname === "/api/session" && call.method === "GET") return json(200, { sid: "sid-1", tier: site.admin ? "admin" : "paid", credits: 0 });
    if (target.pathname === "/api/admin-login" && call.method === "POST") {
      if (!guarded(headers)) return json(403, { error: "Invalid request" });
      if (body?.password !== PASSWORD) return json(401, { error: "Invalid credentials" });
      site.admin = config.loginUpgrades ?? true;
      return json(200, { success: true });
    }
    if (target.pathname === "/api/generate-image" && call.method === "POST") {
      if (!guarded(headers)) return json(403, { error: "Invalid request" });
      if (!site.admin) return json(402, { error: "Insufficient credits" });
      site.generates.push(call);
      site.maxInFlight = Math.max(site.maxInFlight, ++site.inFlight);
      try { return await (config.generate ?? rendered)(body ?? {}, site.generates.length); } finally { site.inFlight--; }
    }
    return json(404, { error: "Not found" });
  };
  return { ...site, site, fetch };
}

function harness(config: Parameters<typeof fakeSite>[0] = {}, start: { ledger?: LedgerRow[]; password?: string | undefined } = {}) {
  let clock = 1_800_000_000_000; let ids = 0;
  const logs: string[] = []; const sleeps: number[] = []; const rows: LedgerRow[] = [...(start.ledger ?? [])]; let held = false;
  const site = fakeSite({ ...config, now: () => clock });
  const deps = {
    fetch: site.fetch, sleep: async (ms: number) => { sleeps.push(ms); clock += ms; }, now: () => clock, uuid: () => `request-${++ids}`,
    log: (line: string) => { logs.push(line); }, password: "password" in start ? start.password : PASSWORD, stopRequested: () => false,
    ledger: {
      read: (): unknown[] => [...rows], append: (row: LedgerRow) => { rows.push(row); },
      lock: () => { if (held) throw new Error("Another seed run holds the ledger"); held = true; return () => { held = false; }; },
    },
  };
  return { site: site.site, deps, logs, sleeps, rows, references: () => site.site.generates.map((call) => call.body?.reference) };
}
const options = (overrides: Partial<SeedOptions> = {}): SeedOptions => ({ ...parseSeedOptions(["--base-url", SITE, "--budget-usd", "5", "--concurrency", "1"]), ...overrides });
const run = async (h: ReturnType<typeof harness>, overrides: Partial<SeedOptions> = {}, list = JONAH_2) => await runSeed(options(overrides), h.deps, list) as RunSummary;
const row = (reference: string, extra: Partial<LedgerRow> = {}): LedgerRow => ({ at: "2026-11-13T00:00:00.000Z", event: "result", baseUrl: SITE, reference, style: "classical", translation: "web",
  requestId: `earlier-${reference}`, attempt: 1, outcome: "rendered", status: 200, usd: IMAGE_USD, usdSource: "provider", imageId: "img", ...extra });

describe("the seed list", () => {
  it("is the agreed chapters in priority order, each with the Bible's own verse count", () => {
    const agreed = "Genesis 1; John 1; Psalm 23; Luke 2; Matthew 5; Matthew 6; Matthew 7; Genesis 2; Genesis 3; John 3; Exodus 14; 1 Samuel 17; Daniel 6; Daniel 3; Jonah 1; Jonah 2; Jonah 3; Jonah 4; Luke 15; Exodus 3; Exodus 20; Genesis 22; Matthew 28; John 20; John 11; Psalm 1; Psalm 91; Psalm 121; Psalm 139; Psalm 51; Isaiah 53; Isaiah 40; 1 Corinthians 13; Romans 8; Luke 1; Acts 2; Revelation 21; Revelation 22; Psalm 8; Psalm 19; Psalm 27; Psalm 46; Psalm 103; Isaiah 6; Joshua 1; Proverbs 3; Ecclesiastes 3; John 14; Romans 12; Ephesians 6; Philippians 4; Hebrews 11; James 1";
    const chapters = expandSeedList();
    expect(chapters.map((chapter) => chapter.label.replace(/^Psalms /, "Psalm "))).toEqual(agreed.split("; "));
    for (const entry of SEED_CHAPTERS) {
      const book = BOOK_BY_SLUG[entry.book];
      expect(book, entry.book).toBeDefined();
      expect(entry.verses, `${entry.book} ${entry.chapter}`).toBe(book.chapters[entry.chapter - 1]);
    }
    expect(chapters.flatMap((chapter) => chapter.verses)).toHaveLength(1410);
    expect(chapters[2].verses.map((verse) => verse.reference)).toEqual(["Psalms 23:1", "Psalms 23:2", "Psalms 23:3", "Psalms 23:4", "Psalms 23:5", "Psalms 23:6"]);
  });

  it("refuses an entry that is not a chapter of the Bible as the Bible has it", () => {
    expect(() => expandSeedList([{ book: "holmes-adventures", chapter: 1, verses: 10 }])).toThrow(/not a book of the Bible/);
    expect(() => expandSeedList([{ book: "constructor", chapter: 1, verses: 10 }])).toThrow(/not a book of the Bible/);
    expect(() => expandSeedList([{ book: "jonah", chapter: 5, verses: 10 }])).toThrow(/Jonah 5 does not exist/);
    expect(() => expandSeedList([{ book: "jonah", chapter: 2, verses: 11 }])).toThrow(/Jonah 2 has 10 verses, not 11/);
    expect(() => expandSeedList([...JONAH_2, ...JONAH_2])).toThrow(/listed twice/);
  });
});

describe("the command's flags", () => {
  it("names no site and no budget by default, and takes no password", () => {
    expect(() => parseSeedOptions(["--dry-run"])).toThrow(/--base-url is required/);
    expect(() => parseSeedOptions(["--base-url", SITE])).toThrow(/--budget-usd is required/);
    expect(() => parseSeedOptions(["--base-url", SITE, "--dry-run", "--password", PASSWORD])).toThrow(/password/);
    expect(parseSeedOptions(["--base-url", `${SITE}/`, "--dry-run"])).toEqual({
      baseUrl: SITE, workId: "bible-web", style: "classical", translation: "web", budgetUsd: null, limit: null, concurrency: 2, dryRun: true, maxFailures: 5, redrawUnresolved: false,
    });
    expect(parseSeedOptions(["--base-url", SITE, "--budget-usd", "1", "--redraw-unresolved"]).redrawUnresolved).toBe(true);
    expect(parseSeedOptions(["--base-url", SITE, "--budget-usd", "12.5", "--limit", "40", "--concurrency", "4", "--style", "watercolor"]))
      .toMatchObject({ budgetUsd: 12.5, limit: 40, concurrency: 4, style: "watercolor", dryRun: false });
  });

  it("refuses values the site would not accept", () => {
    const bad = (...flags: string[]) => () => parseSeedOptions(["--base-url", SITE, "--dry-run", ...flags]);
    expect(bad("--concurrency", "5")).toThrow(/--concurrency/);
    expect(bad("--concurrency", "0")).toThrow(/--concurrency/);
    expect(bad("--budget-usd", "0")).toThrow(/--budget-usd/);
    expect(bad("--budget-usd", "ten")).toThrow(/--budget-usd/);
    expect(bad("--limit", "1.5")).toThrow(/--limit/);
    expect(bad("--style", "cubist")).toThrow(/--style/);
    expect(bad("--translation", "klingon")).toThrow(/--translation/);
    expect(() => parseSeedOptions(["--base-url", "http://visibible.com", "--dry-run"])).toThrow(/https/);
    expect(() => parseSeedOptions(["--base-url", `${SITE}/genesis/1/1`, "--dry-run"])).toThrow(/origin only/);
    expect(parseSeedOptions(["--base-url", "http://localhost:3000", "--dry-run"]).baseUrl).toBe("http://localhost:3000");
  });

  it("refuses any work but the Bible, as a flag and as an option", async () => {
    expect(() => parseSeedOptions(["--base-url", SITE, "--dry-run", "--work", "holmes-adventures"])).toThrow(/Only the Bible/);
    expect(parseSeedOptions(["--base-url", SITE, "--dry-run", "--work", "bible-web"]).workId).toBe("bible-web");
    const h = harness();
    await expect(run(h, { workId: "holmes-adventures" })).rejects.toThrow(/Only the Bible/);
    await expect(run(h, { workId: "alice-in-wonderland", dryRun: true })).rejects.toThrow(/Only the Bible/);
    expect(h.site.calls).toEqual([]);
  });
});

describe("a dry run", () => {
  it("reports what is missing per chapter without a login, a password or a request that changes anything", async () => {
    const h = harness({ saved: { "jonah/2": [1, 2, 3], "jonah/3": [10] } }, { password: undefined, ledger: [row("Jonah 3:1")] });
    const summary = await runSeed(options({ dryRun: true, budgetUsd: null }), h.deps, [...JONAH_2, { book: "jonah", chapter: 3, verses: 10 }]);
    expect(summary).toEqual({ kind: "dry-run", listed: 20, present: 5, missing: 15, projectedUsd: 0.675, chapters: [
      { label: "Jonah 2", verses: 10, present: 3, missing: 7, projectedUsd: 0.315 },
      { label: "Jonah 3", verses: 10, present: 2, missing: 8, projectedUsd: 0.36 },
    ] });
    expect(h.site.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /api/public/images/chapters/jonah/2?style=classical", "GET /api/public/images/chapters/jonah/3?style=classical"]);
    expect(h.site.calls.every((call) => call.headers.Cookie === undefined)).toBe(true);
    expect(h.rows).toHaveLength(1);
    expect(h.logs.join("\n")).toMatch(/20 verses listed, 5 already present, 15 missing; projected \$0\.68 at \$0\.045 per image/);
  });

  it("waits out the public API's rate limit and stops on any other answer", async () => {
    const limited = harness({ chapterAnswer: (_path, nth) => nth === 1 ? json(429, { error: "Rate limit exceeded" }, { "Retry-After": "21" }) : null });
    await expect(runSeed(options({ dryRun: true }), limited.deps, JONAH_2)).resolves.toMatchObject({ missing: 10 });
    expect(limited.sleeps).toEqual([21_000]);
    const down = harness({ chapterAnswer: () => json(503, { error: "Service unavailable" }) });
    await expect(runSeed(options({ dryRun: true }), down.deps, JONAH_2)).rejects.toThrow(/Could not read the saved images for Jonah 2 \(HTTP 503\)/);
    const odd = harness({ chapterAnswer: () => json(200, { data: { book: "jonah", chapter: 3, verses: [] } }) });
    await expect(runSeed(options({ dryRun: true }), odd.deps, JONAH_2)).rejects.toThrow(/unexpected shape/);
  });
});

describe("a paid run", () => {
  it("signs in as the owner and draws only the verses without an image, in order, as Bible verses", async () => {
    const h = harness({ saved: { "jonah/2": [1, 2, 3] } });
    const summary = await run(h);
    expect(h.site.calls.slice(0, 3).map((call) => `${call.method} ${call.path}`)).toEqual(["POST /api/session", "POST /api/admin-login", "GET /api/session"]);
    expect(h.references()).toEqual([4, 5, 6, 7, 8, 9, 10].map((verse) => `Jonah 2:${verse}`));
    for (const call of h.site.generates) {
      expect(call.body).toEqual({ reference: call.body?.reference, translation: "web", style: "classical", requestId: call.body?.requestId, aspectRatio: "16:9", resolution: "1K", workId: "bible-web" });
    }
    expect(new Set(h.site.generates.map((call) => call.body?.requestId)).size).toBe(7);
    // The owner's session goes only to the routes that need it, never to the public image reads.
    const reads = h.site.calls.filter((call) => call.path.startsWith("/api/public/"));
    expect(reads.map((call) => [call.path, call.headers.Cookie])).toEqual([["/api/public/images/chapters/jonah/2?style=classical", undefined]]);
    expect(summary).toMatchObject({ kind: "run", stop: "complete", rendered: 7, skipped: 3, declined: 0, failed: { total: 0 }, measuredUsd: 0.28, unconfirmedUsd: 0, ledgerUsd: 0.28, budgetUsd: 5, remainingUsd: 4.72 });
    expect(h.rows.filter((entry) => entry.event === "result")).toHaveLength(7);
    expect(h.rows.at(-1)).toMatchObject({ event: "result", baseUrl: SITE, reference: "Jonah 2:10", style: "classical", requestId: "request-7", attempt: 1, outcome: "rendered", status: 200, credits: 6, usd: IMAGE_USD, usdSource: "provider", durationMs: 9000, imageId: "img-7" });
    expect(JSON.stringify(h.rows)).not.toContain("data:image");
    expect(h.logs.at(-2)).toBe("Rendered 7, skipped (already present) 3, declined 0, failed 0 (402: 0, 429: 0, 5xx: 0, other: 0).");
    expect(h.logs.at(-1)).toBe("Measured spend this run $0.28. Ledger total $0.28 of $5.00; remaining budget $4.72.");
  });

  it("needs the password from the environment and an admin session before it asks for anything", async () => {
    const none = harness({}, { password: undefined });
    await expect(run(none)).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    expect(none.site.calls).toEqual([]);
    const wrong = harness({}, { password: "not-the-password" });
    await expect(run(wrong)).rejects.toThrow(/admin login was refused \(HTTP 401: Invalid credentials\)/);
    expect(wrong.site.calls.map((call) => call.path)).toEqual(["/api/session", "/api/admin-login"]);
    expect(wrong.rows).toEqual([]);
    const stillGuest = harness({ loginUpgrades: false });
    await expect(run(stillGuest)).rejects.toThrow(/not an admin session/);
    expect(stillGuest.site.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /api/session", "POST /api/admin-login", "GET /api/session"]);
  });

  it("stops before the request that could pass the budget", async () => {
    const h = harness();
    const summary = await run(h, { budgetUsd: 0.25 });
    // Four images at $0.04 leave $0.09: less than one more at the $0.10 ceiling.
    expect(h.references()).toEqual(["Jonah 2:1", "Jonah 2:2", "Jonah 2:3", "Jonah 2:4"]);
    expect(summary).toMatchObject({ stop: "budget", rendered: 4, measuredUsd: 0.16, remainingUsd: 0.09 });
  });

  it("counts every request in flight at the ceiling when several run at once", async () => {
    let settledUsd = 0; let worst = 0;
    const h = harness({ generate: async (body, nth) => {
      worst = Math.max(worst, settledUsd + h.site.inFlight * CEILING_USD_PER_IMAGE);
      await new Promise((resolve) => setTimeout(resolve, 5));
      settledUsd += IMAGE_USD;
      return rendered(body, nth);
    } });
    const summary = await run(h, { budgetUsd: 0.25, concurrency: 3 });
    // A third request would hold $0.30 against $0.25, so two run at once; the budget still buys the same four images.
    expect(h.site.maxInFlight).toBe(2);
    expect(worst).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(summary).toMatchObject({ stop: "budget", rendered: 4, measuredUsd: 0.16 });
  });

  it("stops cleanly when a later chapter's saved images cannot be read", async () => {
    const h = harness({ chapterAnswer: (path) => path.includes("/jonah/3") ? json(503, { error: "Service unavailable" }) : null });
    const summary = await run(h, {}, [...JONAH_2, { book: "jonah", chapter: 3, verses: 10 }]);
    expect(summary).toMatchObject({ stop: "site-unreadable", rendered: 10 });
    expect(h.references().some((reference) => String(reference).startsWith("Jonah 3"))).toBe(false);
    expect(h.logs.join("\n")).toMatch(/Could not read the saved images for Jonah 3 \(HTTP 503\)/);
  });

  it("stops at --limit verses", async () => {
    const h = harness();
    expect(await run(h, { limit: 3 })).toMatchObject({ stop: "limit", rendered: 3 });
    expect(h.references()).toEqual(["Jonah 2:1", "Jonah 2:2", "Jonah 2:3"]);
  });

  it("continues from the ledger: rendered verses are skipped, its spend counts, and a verse whose request was never answered is left alone", async () => {
    const ledger: LedgerRow[] = [
      row("Jonah 2:1"), row("Jonah 2:2"),
      row("Jonah 2:3", { style: "watercolor" }),
      row("Jonah 2:5", { baseUrl: "https://elsewhere.test", usd: 100 }),
      row("Jonah 2:6", { outcome: "failed", status: 400, usd: 0, usdSource: "none", imageId: null }),
      row("Jonah 2:4", { event: "start", requestId: "killed-mid-request", outcome: undefined, status: undefined, usd: undefined, usdSource: undefined, imageId: undefined }),
    ];
    // The site shows no image for Jonah 2:4. That is not proof: the killed run's request may still finish, and the answer may be cached.
    const h = harness({}, { ledger });
    const summary = await run(h, { budgetUsd: 0.4 });
    // $0.12 rendered and $0.10 held for the unanswered request leave room for three images at the ceiling.
    expect(h.references()).toEqual(["Jonah 2:3", "Jonah 2:5", "Jonah 2:6"]);
    expect(h.site.calls.some((call) => call.path.startsWith("/api/public/images/verses/"))).toBe(false);
    expect(summary).toMatchObject({ stop: "budget", rendered: 3, skipped: 2, leftAlone: ["Jonah 2:4"], measuredUsd: 0.12, ledgerUsd: 0.34, remainingUsd: 0.06 });
    expect(h.logs.join("\n")).toMatch(/Left alone, because an earlier request never got a definite answer: Jonah 2:4\..*--redraw-unresolved/);
    // The same holds for a request the earlier run recorded as unresolved, until the operator says to draw it again.
    const settledLater = [row("Jonah 2:1", { outcome: "unresolved", status: 500, usd: 0.1, usdSource: "ceiling", imageId: null })];
    const careful = harness({}, { ledger: settledLater });
    expect(await run(careful, { limit: 1 })).toMatchObject({ leftAlone: ["Jonah 2:1"] });
    expect(careful.references()).toEqual(["Jonah 2:2"]);
    const told = harness({}, { ledger: settledLater });
    await run(told, { limit: 1, redrawUnresolved: true });
    expect(told.references()).toEqual(["Jonah 2:1"]);
    // And it ends when the site shows the image after all.
    const appeared = harness({ saved: { "jonah/2": [1] } }, { ledger: settledLater });
    expect(await run(appeared, { limit: 1 })).toMatchObject({ leftAlone: [], skipped: 1 });
    const spent = harness({}, { ledger: [row("Jonah 2:1", { usd: 0.95 })] });
    expect(await run(spent, { budgetUsd: 1 })).toMatchObject({ stop: "budget", rendered: 0, ledgerUsd: 0.95 });
    expect(spent.site.calls).toEqual([]);
  });

  it("stops on a ledger line it cannot read, before any request", async () => {
    const lines: unknown[] = [
      { ...row("Jonah 2:1"), usd: undefined },
      { ...row("Jonah 2:1"), usd: "0.04" },
      { ...row("Jonah 2:1"), outcome: "done" },
      { ...row("Jonah 2:1"), requestId: undefined },
      "not a row",
    ];
    for (const line of lines) {
      const h = harness({}, { ledger: [row("Jonah 2:2"), line as LedgerRow] });
      await expect(run(h)).rejects.toThrow(/Ledger line 2 cannot be read/);
      expect(h.site.calls).toEqual([]);
    }
  });

  it("refuses a second paid run while one holds the ledger, and gives it back afterwards", async () => {
    const h = harness({ generate: async (body, nth) => { await new Promise((resolve) => setTimeout(resolve, 5)); return rendered(body, nth); } });
    const first = run(h, { limit: 2 });
    await expect(run(h, { limit: 2 })).rejects.toThrow(/Another seed run holds the ledger/);
    expect(await first).toMatchObject({ rendered: 2 });
    expect(h.references()).toEqual(["Jonah 2:1", "Jonah 2:2"]);
    // Released after a normal end and after a failure, and never taken by a dry run.
    expect(await run(h, { limit: 1 })).toMatchObject({ rendered: 1 });
    h.rows.push("broken" as unknown as LedgerRow);
    await expect(run(h)).rejects.toThrow(/Ledger line/);
    h.rows.pop();
    h.deps.ledger.lock();
    expect((await runSeed(options({ dryRun: true }), h.deps, JONAH_2)).kind).toBe("dry-run");
  });

  it("stops sending when the ledger cannot be written, lets the requests in flight finish, and keeps their cost", async () => {
    const h = harness({ generate: async (body, nth) => { await new Promise((resolve) => setTimeout(resolve, nth === 1 ? 5 : 20)); return rendered(body, nth); } });
    const append = h.deps.ledger.append;
    let results = 0;
    h.deps.ledger.append = (entry) => { if (entry.event === "result" && ++results === 1) throw new Error("disk full"); append(entry); };
    await expect(run(h, { concurrency: 2, budgetUsd: 1 })).rejects.toThrow(/The ledger could not be written \(disk full\)/);
    // Two were in flight when the first result could not be written; the second finished and nothing else was sent.
    expect(h.references()).toEqual(["Jonah 2:1", "Jonah 2:2"]);
    expect(h.rows.map((entry) => `${entry.event} ${entry.reference}`)).toEqual(["start Jonah 2:1", "start Jonah 2:2", "result Jonah 2:2"]);
    expect(h.logs.join("\n")).toMatch(/Stopped: ledger-error\./);
    // The next run counts the request whose result was lost at the ceiling and leaves its verse alone.
    const after = harness({}, { ledger: h.rows });
    expect(await run(after, { limit: 1 })).toMatchObject({ leftAlone: ["Jonah 2:1"], ledgerUsd: 0.18 });
    // A request that is waiting its turn when the ledger fails is not sent, and one waiting to be sent again is not re-sent.
    let finishFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => { finishFirst = resolve; });
    const waiting = harness({ generate: async (body, nth) => {
      if (body.reference === "Jonah 2:1") { await firstMayFinish; return rendered(body, nth); }
      return json(429, { error: "Too many requests", retryAfter: 1 });
    } });
    const write = waiting.deps.ledger.append;
    waiting.deps.ledger.append = (entry) => { if (entry.event === "result") throw new Error("disk full"); write(entry); };
    // Jonah 2:2 is told to wait; while it waits, Jonah 2:1 finishes and its result cannot be written.
    const pass = waiting.deps.sleep;
    waiting.deps.sleep = async (ms) => { finishFirst(); await new Promise((resolve) => setTimeout(resolve, 20)); await pass(ms); };
    await expect(run(waiting, { concurrency: 2, limit: 2, budgetUsd: 1 })).rejects.toThrow(/The ledger could not be written/);
    expect(waiting.references()).toEqual(["Jonah 2:1", "Jonah 2:2"]);
    const cannotStart = harness();
    cannotStart.deps.ledger.append = () => { throw new Error("read-only"); };
    await expect(run(cannotStart)).rejects.toThrow(/The ledger could not be written/);
    expect(cannotStart.site.generates).toHaveLength(0);
  });

  it("tries a verse once more only when the site refused it before admitting anything", async () => {
    const h = harness({ generate: (body, nth) => {
      if (body.reference === "Jonah 2:2") return json(503, { error: "Reference lookup unavailable" });
      if (body.reference === "Jonah 2:3") return json(500, { error: "Failed to generate image", message: "OpenRouter API error: 500", requestId: body.requestId });
      return rendered(body, nth);
    } });
    const summary = await run(h);
    const refused = h.site.generates.filter((call) => call.body?.reference === "Jonah 2:2");
    expect(refused).toHaveLength(2);
    expect(refused[0].body?.requestId).not.toBe(refused[1].body?.requestId);
    // A failure after admission may have been paid for and may have saved an image: one request, held at the ceiling, no second id.
    expect(h.site.generates.filter((call) => call.body?.reference === "Jonah 2:3")).toHaveLength(1);
    expect(h.rows.filter((entry) => entry.event === "result" && entry.outcome !== "rendered").map((entry) => [entry.reference, entry.attempt, entry.outcome, entry.status, entry.usd, entry.usdSource])).toEqual([
      ["Jonah 2:2", 1, "failed", 503, 0, "none"], ["Jonah 2:2", 2, "failed", 503, 0, "none"], ["Jonah 2:3", 1, "unresolved", 500, 0.1, "ceiling"],
    ]);
    expect(summary).toMatchObject({ stop: "complete", rendered: 8, unresolved: 1, failed: { total: 1, http5xx: 1 }, measuredUsd: 0.32, unconfirmedUsd: 0.1 });
  });

  it("counts an image at the ceiling unless the provider reported its cost, and stops when one costs more than the ceiling", async () => {
    // The billed amount is the engine's quote when the provider reports nothing, so it cannot stand in for what was spent.
    const quoted = harness({ generate: (body, nth) => json(200, { requestId: body.requestId, imageUrl: "data:image/png;base64,AAAA", savedImageId: `img-${nth}`, creditsCost: 6, costUsd: 0.06 }) });
    const summary = await run(quoted, { budgetUsd: 0.25 });
    expect(quoted.references()).toEqual(["Jonah 2:1", "Jonah 2:2"]);
    expect(summary).toMatchObject({ stop: "budget", rendered: 2, measuredUsd: 0, unconfirmedUsd: 0.2 });
    expect(quoted.rows.at(-1)).toMatchObject({ outcome: "rendered", usd: 0.1, usdSource: "ceiling" });
    const dear = harness({ generate: (body, nth) => json(200, { requestId: body.requestId, imageUrl: "data:image/png;base64,AAAA", savedImageId: `img-${nth}`, openRouterUsageUsd: nth === 2 ? 0.11 : IMAGE_USD }) });
    expect(await run(dear)).toMatchObject({ stop: "cost-above-ceiling", rendered: 2, measuredUsd: 0.15 });
    expect(dear.references()).toEqual(["Jonah 2:1", "Jonah 2:2"]);
  });

  it("stops after the given number of failures in a row, and a success starts the count again", async () => {
    const failing = harness({ generate: (body) => json(500, { error: "Failed to generate image", requestId: body.requestId }) });
    const stopped = await run(failing);
    expect(failing.references()).toEqual(["Jonah 2:1", "Jonah 2:2", "Jonah 2:3", "Jonah 2:4", "Jonah 2:5"]);
    expect(stopped).toMatchObject({ stop: "consecutive-failures", rendered: 0, unresolved: 5, failed: { total: 0 }, unconfirmedUsd: 0.5 });
    const alternating = harness({ generate: (body, nth) => nth % 2 ? json(400, { error: "Invalid or unavailable reference" }) : rendered(body, nth) });
    expect(await run(alternating, { maxFailures: 2 })).toMatchObject({ stop: "complete", rendered: 5, failed: { total: 5, other: 5 } });
  });

  it("waits out a rate limit by its Retry-After and sends the same request again", async () => {
    const h = harness({ generate: (body, nth) => nth === 1 ? json(429, { error: "Rate limit exceeded", retryAfter: 7 }, { "Retry-After": "7" }) : rendered(body, nth) });
    const summary = await run(h, { limit: 1 });
    expect(h.sleeps).toEqual([7000]);
    expect(h.site.generates.map((call) => call.body?.requestId)).toEqual(["request-1", "request-1"]);
    expect(h.site.generates[1].at - h.site.generates[0].at).toBe(7000);
    expect(h.rows.map((entry) => entry.event)).toEqual(["start", "result"]);
    expect(summary).toMatchObject({ stop: "limit", rendered: 1, failed: { total: 0 } });
  });

  it("gives up on a rate limit that never lifts, and stops at once on the daily limit", async () => {
    const stuck = harness({ generate: () => json(429, { error: "Rate limit exceeded" }, { "Retry-After": "30" }) });
    expect(await run(stuck)).toMatchObject({ stop: "rate-limited", rendered: 0, failed: { total: 1, http429: 1 }, unconfirmedUsd: 0 });
    expect(stuck.site.generates).toHaveLength(6);
    const daily = harness({ generate: () => json(429, { error: "Daily spending limit exceeded", dailyLimit: 5, dailySpent: 5, remaining: 0 }) });
    expect(await run(daily)).toMatchObject({ stop: "daily-limit", rendered: 0, failed: { total: 1, http429: 1 } });
    expect(daily.site.generates).toHaveLength(1);
    expect(daily.sleeps).toEqual([]);
  });

  it("starts no more requests in a minute than the site admits", async () => {
    expect(GENERATE_REQUESTS_PER_MINUTE).toBe(RATE_LIMITS["generate-image"].maxRequests);
    expect(RATE_LIMITS["generate-image"].windowMs).toBe(60_000);
    const h = harness();
    expect(await run(h, { concurrency: 4 })).toMatchObject({ rendered: 10 });
    const at = h.site.generates.map((call) => call.at);
    for (let i = 0; i + GENERATE_REQUESTS_PER_MINUTE < at.length; i++) expect(at[i + GENERATE_REQUESTS_PER_MINUTE] - at[i]).toBeGreaterThan(60_000);
  });

  it("tells declined scenes, 402, 429 and 5xx apart in its summary", async () => {
    const answers: Record<string, (body: Record<string, unknown>) => Response> = {
      "Jonah 2:1": () => json(503, { error: "Scene unavailable", message: "This scene cannot be rendered within the image price envelope.", retryable: false }),
      "Jonah 2:2": () => json(503, { error: "Preparing scene", message: "The work's analysis could not be read.", retryable: true }),
      "Jonah 2:3": (body) => json(504, { error: "Image generation timed out", requestId: body.requestId }),
      "Jonah 2:4": () => json(400, { error: "Invalid or unavailable reference" }),
      "Jonah 2:5": (body) => json(200, { requestId: body.requestId, imageUrl: "data:image/png;base64,AAAA", creditsCost: 6, costUsd: 0.05, openRouterUsageUsd: IMAGE_USD }),
      "Jonah 2:6": () => json(503, { error: "Reference lookup unavailable" }),
    };
    const h = harness({ generate: (body, nth) => answers[String(body.reference)]?.(body) ?? rendered(body, nth) });
    const summary = await run(h, { maxFailures: 100 });
    expect(h.references().filter((reference) => reference === "Jonah 2:1")).toHaveLength(1);
    expect(h.references().filter((reference) => reference === "Jonah 2:2")).toHaveLength(2);
    expect(h.references().filter((reference) => reference === "Jonah 2:5")).toHaveLength(1);
    // The 504 came after admission, so it is one unresolved request at the ceiling; the plain 503 came before it and is tried twice.
    expect(h.references().filter((reference) => reference === "Jonah 2:3")).toHaveLength(1);
    expect(h.references().filter((reference) => reference === "Jonah 2:6")).toHaveLength(2);
    expect(summary).toMatchObject({ stop: "complete", rendered: 4, declined: 2, unresolved: 1, failed: { total: 3, http402: 0, http429: 0, http5xx: 1, other: 2 }, measuredUsd: 0.2, unconfirmedUsd: 0.1 });
    expect(h.rows.find((entry) => entry.reference === "Jonah 2:5" && entry.event === "result")).toMatchObject({ outcome: "failed", usd: IMAGE_USD, usdSource: "provider", imageId: null, error: "The image was made but not saved" });
    expect(h.logs).toContain("Rendered 4, skipped (already present) 0, declined 2, failed 3 (402: 0, 429: 0, 5xx: 1, other: 2).");
    expect(h.logs).toContain("1 request got no definite answer and may have made an image; its verse is left alone by later runs.");
    const broke = harness({ generate: () => json(402, { error: "Insufficient credits", required: 6, available: 0 }) });
    expect(await run(broke)).toMatchObject({ stop: "insufficient-credits", failed: { total: 1, http402: 1 } });
    expect(broke.site.generates).toHaveLength(1);
  });

  it("asks again under the same request id when an answer never arrives, so nothing is paid for twice", async () => {
    const h = harness({ generate: (body, nth) => {
      if (nth === 1) throw new Error("fetch failed");
      if (nth === 2) return json(202, { requestId: body.requestId, status: "generating", reused: true });
      return json(200, { requestId: body.requestId, status: "succeeded", reused: true, savedImageId: "img-replayed", imageUrl: "https://images.test/1", creditsCost: 6 });
    } });
    const summary = await run(h, { limit: 1 });
    expect(h.site.generates.map((call) => call.body?.requestId)).toEqual(["request-1", "request-1", "request-1"]);
    expect(h.sleeps).toEqual([15_000, 15_000]);
    // A replay reports what was billed, not what the provider charged, so the image is held at the ceiling.
    expect(summary).toMatchObject({ rendered: 1, measuredUsd: 0, unconfirmedUsd: 0.1, unresolved: 0, failed: { total: 0 } });
    expect(h.rows.at(-1)).toMatchObject({ outcome: "rendered", imageId: "img-replayed", usdSource: "ceiling" });
    const silent = harness({ generate: () => new Response("<html>gateway timeout</html>", { status: 504 }) });
    expect(await run(silent, { limit: 1 })).toMatchObject({ rendered: 0, unresolved: 1, failed: { total: 0 }, unconfirmedUsd: 0.1 });
    expect(new Set(silent.site.generates.map((call) => call.body?.requestId))).toEqual(new Set(["request-1"]));
  });

  it("never replaces a request whose answer went missing, whatever the site says next", async () => {
    // The first request was admitted and its answer lost. Each of these later answers is given before the route looks the request up.
    const laterAnswers: Array<(body: Record<string, unknown>) => Response> = [
      () => json(503, { error: "Unable to safely check image generation" }),
      () => json(503, { error: "Preparing scene", message: "The work's analysis is not registered.", retryable: true }),
      () => json(400, { error: "Invalid or unavailable reference" }),
      () => new Response('{"requestId":"request-1","imageUrl":"data:image/png;base6', { status: 200 }),
    ];
    for (const later of laterAnswers) {
      const h = harness({ generate: (body, nth) => { if (nth === 1) throw new Error("socket hang up"); return later(body); } });
      const summary = await run(h, { limit: 1 });
      expect(h.site.generates.map((call) => call.body?.requestId)).toEqual(["request-1", "request-1"]);
      expect(summary).toMatchObject({ rendered: 0, unresolved: 1, declined: 0, failed: { total: 0 }, unconfirmedUsd: 0.1 });
      expect(h.rows.at(-1)).toMatchObject({ outcome: "unresolved", usd: 0.1, usdSource: "ceiling" });
      // The next run does not draw the verse again.
      const again = harness({}, { ledger: h.rows });
      expect(await run(again, { limit: 1 })).toMatchObject({ leftAlone: ["Jonah 2:1"] });
      expect(again.references()).toEqual(["Jonah 2:2"]);
    }
    // A success that was cut short on the first answer is not a free failure either.
    const cut = harness({ generate: () => new Response('{"requestId":"request-1","imageUrl":"data:image/png;base6', { status: 200 }) });
    expect(await run(cut, { limit: 1 })).toMatchObject({ rendered: 0, unresolved: 1, unconfirmedUsd: 0.1 });
    expect(cut.site.generates).toHaveLength(1);
    // The route's own word that the admitted request ended without an image does settle it: no image exists, its cost is held.
    const ended = harness({ generate: (body, nth) => { if (nth === 1) throw new Error("socket hang up"); return json(409, { requestId: body.requestId, status: "failed", error: "The original operation ended without an available saved image", reused: true }); } });
    expect(await run(ended, { limit: 1 })).toMatchObject({ rendered: 0, unresolved: 0, failed: { total: 1 }, unconfirmedUsd: 0.1 });
    expect(ended.site.generates.map((call) => call.body?.requestId)).toEqual(["request-1", "request-1"]);
  });

  it("stops when asked, after the request in flight", async () => {
    const h = harness();
    h.deps.stopRequested = () => h.site.generates.length >= 2;
    expect(await run(h)).toMatchObject({ stop: "interrupted", rendered: 2 });
    // Asked while the run waits for the next minute's allowance: the request it was waiting to send is never sent.
    const waiting = harness();
    waiting.deps.stopRequested = () => waiting.sleeps.length > 0;
    expect(await run(waiting)).toMatchObject({ stop: "interrupted", rendered: 5 });
    expect(waiting.rows.filter((entry) => entry.event === "start")).toHaveLength(5);
  });

  it("sends the password to the admin login alone and keeps it out of every log line and ledger row", async () => {
    const h = harness({ generate: (body, nth) => {
      if (nth === 1) throw new Error(`connect failed for ${PASSWORD}`);
      if (nth === 2) return json(500, { error: "Failed to generate image", message: `upstream echoed ${PASSWORD}`, requestId: body.requestId });
      if (nth === 3) return json(503, { error: "Preparing scene", message: `still ${PASSWORD}`, retryable: false });
      return rendered(body, nth);
    } });
    await run(h, { limit: 3 });
    expect(h.site.calls.filter((call) => JSON.stringify([call.path, call.headers, call.body]).includes(PASSWORD)).map((call) => call.path)).toEqual(["/api/admin-login"]);
    expect(h.logs.join("\n")).toContain("[redacted]");
    expect(JSON.stringify(h.rows)).toContain("[redacted]");
    expect(h.logs.join("\n")).not.toContain(PASSWORD);
    expect(JSON.stringify(h.rows)).not.toContain(PASSWORD);
    const thrown = harness();
    thrown.deps.fetch = async () => { throw new Error(`socket closed after ${PASSWORD}`); };
    expect(await run(thrown).catch((error: Error) => error.message)).toBe("socket closed after [redacted]");
  });
});
