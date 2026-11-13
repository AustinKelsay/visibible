/**
 * Seeding saved images for the most-read chapters (`npm run seed:images`, llm/workflow/SEED_IMAGES.md). Each image is
 * made through the site's own request path as the owner: a guest session, the admin login, then one
 * POST /api/generate-image per verse. The run reads which verses already have an image from the public image API and
 * never asks for those; it counts every request in flight, and every request whose cost or outcome it could not
 * establish, at a price ceiling, and stops before the ledger's total could pass the budget; and it writes each attempt
 * to an append-only ledger before and after the request, so a second run continues the first.
 *
 * The ceiling is above every measured image and above any quote the engine admits, but the provider call itself has no
 * cost cap, so the budget is this tool's own accounting and not a guarantee. The hard cap is the provider key's limit.
 *
 * Only the Bible is ever targeted: every request names `bible-web` and no unit, and the list is checked against the
 * Bible's own structure. The admin password is sent to /api/admin-login and nowhere else.
 */
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { BOOK_BY_SLUG } from "@/data/bible-structure";
import { ART_STYLE_IDS, DEFAULT_ART_STYLE } from "@/lib/art-styles";
import { DEFAULT_TRANSLATION, TRANSLATIONS } from "@/lib/bible-api";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";
import { scrubForLog } from "@/lib/image-evals/suite-run";
import { BIBLE_WORK_ID } from "../../../convex/lib/proseWorks";
import { SEED_CHAPTERS, type SeedChapterEntry } from "./chapters";

/** What the dry run projects per image: the provider's measured price for one image is about $0.043 (ADR 0012). */
export const ESTIMATE_USD_PER_IMAGE = 0.045;
/** What a request in flight, or one whose cost the provider did not report, is counted at: above any quote the engine admits (ten credits). An image reported above it stops the run. */
export const CEILING_USD_PER_IMAGE = 0.1;
/** The site admits this many image requests a minute for one session (convex/rateLimit.ts); the run paces itself to it. */
export const GENERATE_REQUESTS_PER_MINUTE = 5;
/** A second longer than the site's minute, so a request held back for the window does not arrive just before it turns. */
const PACE_WINDOW_MS = 61_000;
const REQUEST_TIMEOUT_MS = 120_000;
/** How often one request waits out a rate limit before it is given up. */
const MAX_RATE_LIMIT_WAITS = 5;
/** How often a request with no definite answer is sent again under the same id, and the pause before each. */
const MAX_RESENDS = 4;
const RESEND_DELAY_MS = 15_000;
const MAX_RETRY_AFTER_SECONDS = 120;

export type SeedOptions = {
  baseUrl: string; workId: string; style: string; translation: string;
  budgetUsd: number | null; limit: number | null; concurrency: number; dryRun: boolean; maxFailures: number;
  /** Draw verses again whose earlier request never got a definite answer. The operator has checked they have no image. */
  redrawUnresolved: boolean;
};
export type SeedVerse = { book: string; chapter: number; verse: number; reference: string };
export type SeedChapter = { book: string; chapter: number; label: string; verses: SeedVerse[] };
type UsdSource = "provider" | "ceiling" | "none";
type Outcome = "rendered" | "declined" | "failed" | "unresolved";
/** One ledger line: `start` before a request is sent, `result` when its answer is known. */
export type LedgerRow = {
  at: string; event: "start" | "result"; baseUrl: string; reference: string; style: string; translation: string; requestId: string; attempt: number;
  /** `unresolved`: the request may have made an image, and nothing the site said settled it. Its verse is not drawn again unasked. */
  outcome?: Outcome; status?: number | null; credits?: number | null;
  /** What the attempt is counted at, and where the figure came from: the provider's reported usage, or the ceiling when the provider's cost is not known. */
  usd?: number; usdSource?: UsdSource;
  durationMs?: number | null; elapsedMs?: number; imageId?: string | null; error?: string;
};
export type SeedDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  uuid: () => string;
  log: (line: string) => void;
  /** The admin password, from SEED_ADMIN_PASSWORD. Only a paid run reads it. */
  password: string | undefined;
  stopRequested: () => boolean;
  ledger: {
    /** Every line of the ledger, parsed but not yet checked. */
    read: () => unknown[];
    append: (row: LedgerRow) => void;
    /** Take the ledger for one paid run and answer how to give it back. Throws while another run holds it. */
    lock: () => () => void;
  };
};
export type StopReason = "complete" | "budget" | "limit" | "interrupted" | "daily-limit" | "consecutive-failures" | "rate-limited" | "not-authorized" | "insufficient-credits" | "site-unreadable" | "cost-above-ceiling" | "ledger-error";
export type DryRunSummary = { kind: "dry-run"; chapters: Array<{ label: string; verses: number; present: number; missing: number; projectedUsd: number }>; listed: number; present: number; missing: number; projectedUsd: number };
export type RunSummary = {
  kind: "run"; stop: StopReason; rendered: number; skipped: number; declined: number;
  /** Requests this run could not settle, and verses left alone because an earlier request for them was never settled. */
  unresolved: number; leftAlone: string[];
  failed: { total: number; http402: number; http429: number; http5xx: number; other: number };
  /** This run's spend as the site reported it; what was held at the ceiling for unreported costs; and the ledger's total against the budget. */
  measuredUsd: number; unconfirmedUsd: number; ledgerUsd: number; budgetUsd: number; remainingUsd: number;
};
export type SeedSummary = DryRunSummary | RunSummary;

type AttemptResult = {
  outcome: Outcome; status: number | null; retryable: boolean; stop?: StopReason;
  usd: number; usdSource: UsdSource; credits: number | null; imageId: string | null; durationMs: number | null; error?: string;
};
type Json = Record<string, unknown>;
type Reply = { status: number; json: Json | null; retryAfterMs: number };

const USAGE = "Usage: npm run seed:images -- --base-url <origin> [--dry-run] [--budget-usd <usd>] [--style classical] [--translation web] [--limit <verses>] [--concurrency 2] [--max-consecutive-failures 5] [--redraw-unresolved]";
const round = (usd: number) => Math.round(usd * 1e6) / 1e6;
const dollars = (usd: number, digits = 2) => `$${usd.toFixed(digits)}`;
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const verseKey = (style: string, reference: string) => `${style}|${reference}`;

/** The command's flags. There is no default base URL and no password flag: the operator names the site, and the password comes from the environment. */
export function parseSeedOptions(argv: string[]): SeedOptions {
  const { values } = parseArgs({ args: argv, options: {
    "base-url": { type: "string" }, work: { type: "string", default: BIBLE_WORK_ID }, style: { type: "string", default: DEFAULT_ART_STYLE },
    translation: { type: "string", default: DEFAULT_TRANSLATION }, "budget-usd": { type: "string" }, limit: { type: "string" },
    concurrency: { type: "string", default: "2" }, "max-consecutive-failures": { type: "string", default: "5" }, "dry-run": { type: "boolean", default: false }, "redraw-unresolved": { type: "boolean", default: false },
  } });
  const fail = (message: string): never => { throw new Error(`${message}\n${USAGE}`); };
  const whole = (flag: string, value: string, min: number, max: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fail(`--${flag} must be a whole number from ${min} to ${max}`);
  };
  if (values.work !== BIBLE_WORK_ID) fail(`Only the Bible (${BIBLE_WORK_ID}) is seeded; "${values.work}" is refused`);
  if (!values["base-url"]) fail("--base-url is required, for example --base-url https://visibible.com");
  let url: URL;
  try { url = new URL(values["base-url"]!); } catch { return fail("--base-url must be a full origin such as https://visibible.com"); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) fail("--base-url must use https");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) fail("--base-url must be an origin only, without a path, query or credentials");
  if (!ART_STYLE_IDS.includes(values.style)) fail(`--style must be one of ${ART_STYLE_IDS.join(", ")}`);
  if (!Object.prototype.hasOwnProperty.call(TRANSLATIONS, values.translation)) fail(`--translation must be one of ${Object.keys(TRANSLATIONS).join(", ")}`);
  const dryRun = values["dry-run"];
  const budget = values["budget-usd"] === undefined ? null : Number(values["budget-usd"]);
  if (budget !== null && !(Number.isFinite(budget) && budget > 0)) fail("--budget-usd must be a positive number of dollars");
  if (!dryRun && budget === null) fail("--budget-usd is required unless --dry-run is given");
  return {
    baseUrl: url.origin, workId: values.work, style: values.style, translation: values.translation, budgetUsd: budget, dryRun, redrawUnresolved: values["redraw-unresolved"],
    limit: values.limit === undefined ? null : whole("limit", values.limit, 1, 100_000),
    concurrency: whole("concurrency", values.concurrency, 1, 4), maxFailures: whole("max-consecutive-failures", values["max-consecutive-failures"], 1, 1000),
  };
}

/** The list as verses, in order. Throws unless every entry is a chapter of the Bible with the verse count it states, listed once. */
export function expandSeedList(list: readonly SeedChapterEntry[] = SEED_CHAPTERS): SeedChapter[] {
  const seen = new Set<string>();
  return list.map((entry) => {
    const book = Object.prototype.hasOwnProperty.call(BOOK_BY_SLUG, entry.book) ? BOOK_BY_SLUG[entry.book] : undefined;
    if (!book) throw new Error(`Seed list: "${entry.book}" is not a book of the Bible`);
    const count = Number.isInteger(entry.chapter) ? book.chapters[entry.chapter - 1] : undefined;
    const label = `${book.name} ${entry.chapter}`;
    if (count === undefined) throw new Error(`Seed list: ${label} does not exist`);
    if (count !== entry.verses) throw new Error(`Seed list: ${label} has ${count} verses, not ${entry.verses}`);
    if (seen.has(label)) throw new Error(`Seed list: ${label} is listed twice`);
    seen.add(label);
    return { book: book.slug, chapter: entry.chapter, label,
      verses: Array.from({ length: count }, (_, i) => ({ book: book.slug, chapter: entry.chapter, verse: i + 1, reference: `${label}:${i + 1}` })) };
  });
}

const OUTCOMES: readonly string[] = ["rendered", "declined", "failed", "unresolved"];
/**
 * What earlier runs against this site left in the ledger: verses rendered, verses whose request was never settled, and
 * the spend so far. A line that cannot be read stops the run: skipping it could hide a paid request.
 */
export function readLedger(rows: readonly unknown[], baseUrl: string) {
  const done = new Set<string>(); const open = new Map<string, string>(); const unsettled = new Set<string>(); let spentUsd = 0;
  rows.forEach((value, index) => {
    const row = value as Partial<LedgerRow> | null;
    const unreadable = (why: string): never => { throw new Error(`Ledger line ${index + 1} cannot be read (${why}). Nothing is drawn until it is repaired.`); };
    if (!row || typeof row !== "object" || (row.event !== "start" && row.event !== "result")) return unreadable("it is not a start or a result");
    for (const field of ["baseUrl", "reference", "style", "requestId"] as const) if (typeof row[field] !== "string" || !row[field]) return unreadable(`it has no ${field}`);
    if (row.baseUrl !== baseUrl) return;
    const key = verseKey(row.style!, row.reference!);
    if (row.event === "start") { open.set(row.requestId!, key); return; }
    if (!OUTCOMES.includes(row.outcome as string)) return unreadable("its outcome is not known");
    if (amount(row.usd) === null) return unreadable("it has no amount");
    open.delete(row.requestId!);
    spentUsd += row.usd!;
    if (row.outcome === "rendered") done.add(key);
    if (row.outcome === "unresolved") unsettled.add(key);
  });
  // A request that was sent and never answered (the run was killed) may have been paid for, and may have made an image.
  const unresolved = new Set([...open.values(), ...unsettled].filter((key) => !done.has(key)));
  return { done, unresolved, spentUsd: round(spentUsd + open.size * CEILING_USD_PER_IMAGE) };
}

/**
 * What one answer from POST /api/generate-image means for the run (see the route and src/lib/engine/generation.ts).
 * Only answers the route gives before it admits a request cost nothing. Everything else is counted at the ceiling
 * unless the provider's own usage is reported.
 */
export function classifyGenerateResponse(status: number, json: Json | null): AttemptResult {
  const body = json ?? {};
  const error = [body.error, body.message].filter((part) => typeof part === "string").join(": ").slice(0, 300) || `HTTP ${status}`;
  const none = { usd: 0, usdSource: "none" as const, credits: null, imageId: null, durationMs: null };
  const held = { usd: CEILING_USD_PER_IMAGE, usdSource: "ceiling" as const };
  const failed = (extra: Partial<AttemptResult> = {}): AttemptResult => ({ outcome: "failed", status, retryable: false, ...none, error, ...extra });
  // The request may have reached the provider and may have saved an image.
  const unresolved = (): AttemptResult => ({ outcome: "unresolved", status, retryable: false, ...none, ...held, error });
  if (status === 200 && typeof body.imageUrl === "string") {
    // The billed amount is the engine's own quote when the provider reported no usage, so only the provider's figure counts as measured.
    const provider = amount(body.openRouterUsageUsd);
    const paid = { ...(provider !== null ? { usd: provider, usdSource: "provider" as const } : held), credits: amount(body.creditsCost), durationMs: amount(body.durationMs) };
    // The route answers 200 even when the save failed; an image nobody can see is not a seeded verse.
    if (typeof body.savedImageId !== "string") return failed({ ...paid, error: "The image was made but not saved" });
    return { outcome: "rendered", status, retryable: false, ...paid, imageId: body.savedImageId };
  }
  // A success that is not the route's own (cut short, or rewritten on the way) says nothing about what happened.
  if (status >= 200 && status < 300) return unresolved();
  if (status === 401 || status === 403) return failed({ stop: "not-authorized" });
  if (status === 402) return failed({ stop: "insufficient-credits" });
  if (status === 429) return failed({ stop: body.error === "Daily spending limit exceeded" ? "daily-limit" : "rate-limited" });
  // A replay of a request that was admitted and ended without a saved image: no image exists, and its cost is unknown.
  if (status === 409 && body.reused === true) return failed(held);
  // The engine or admission declined the scene before any request record or charge.
  if (status === 503 && typeof body.retryable === "boolean") return { outcome: "declined", status, retryable: body.retryable, ...none, error };
  // Any other 502 or 503 is answered before admission: a Scripture lookup or a service that is down.
  if (status === 502 || status === 503) return failed({ retryable: true });
  if (status >= 500) return unresolved();
  return failed();
}

/** Cookies and the headers the site's state-changing routes require: its own Origin and the CSRF cookie echoed as a header. */
function createClient(origin: string, deps: SeedDeps) {
  const cookies = new Map<string, string>();
  const send = async (method: "GET" | "POST", path: string, body: unknown, withSession: boolean): Promise<Reply> => {
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "visibible-seed-images" };
    if (withSession && cookies.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (method === "POST") {
      headers.Origin = origin;
      headers["Content-Type"] = "application/json";
      const csrf = cookies.get(CSRF_COOKIE_NAME);
      if (csrf) headers[CSRF_HEADER_NAME] = decodeURIComponent(csrf);
    }
    const response = await deps.fetch(`${origin}${path}`, { method, headers, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}) });
    if (withSession) for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const at = pair.indexOf("=");
      if (at < 1) continue;
      const [name, value] = [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
      if (!value || attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute))) cookies.delete(name); else cookies.set(name, value);
    }
    if (response.status >= 300 && response.status < 400) throw new Error(`${path} answered with a redirect (HTTP ${response.status}); pass the site's own origin as --base-url`);
    let json: Json | null = null;
    try { const parsed: unknown = JSON.parse(await response.text()); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Json; } catch { /* not JSON: the status alone is the answer */ }
    const seconds = Number(response.headers.get("retry-after") ?? json?.retryAfter);
    return { status: response.status, json, retryAfterMs: Math.min(MAX_RETRY_AFTER_SECONDS, Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60) * 1000 };
  };
  return {
    /** A read of the public image API: no cookies, so the session never leaves the routes that need it. */
    publicGet: (path: string) => send("GET", path, undefined, false),
    get: (path: string) => send("GET", path, undefined, true),
    post: (path: string, body?: unknown) => send("POST", path, body, true),
  };
}

export async function runSeed(options: SeedOptions, deps: SeedDeps, list: readonly SeedChapterEntry[] = SEED_CHAPTERS): Promise<SeedSummary> {
  const password = deps.password ?? "";
  // Nothing the server or the network says is logged or kept before the password is taken out of it.
  const scrub = <T>(value: T): T => scrubForLog(value, password, sha256) as T;
  const log = (line: string) => deps.log(scrub(line));
  try {
    return await seed(options, { ...deps, log, ledger: { ...deps.ledger, append: (row) => deps.ledger.append(scrub(row)) } }, list);
  } catch (error) {
    throw new Error(scrub(error instanceof Error ? error.message : String(error)));
  }
}

async function seed(options: SeedOptions, deps: SeedDeps, list: readonly SeedChapterEntry[]): Promise<SeedSummary> {
  if (options.workId !== BIBLE_WORK_ID) throw new Error(`Only the Bible (${BIBLE_WORK_ID}) is seeded; "${options.workId}" is refused`);
  const chapters = expandSeedList(list);
  const client = createClient(options.baseUrl, deps);
  // A paid run holds the ledger from before it is read until every request has settled, so two runs cannot spend the same budget.
  const release = options.dryRun ? () => {} : deps.ledger.lock();
  try {
    return await seedLocked(options, deps, chapters, client);
  } finally {
    release();
  }
}

async function seedLocked(options: SeedOptions, deps: SeedDeps, chapters: SeedChapter[], client: ReturnType<typeof createClient>): Promise<SeedSummary> {
  const { baseUrl, style, translation } = options;
  const prior = readLedger(deps.ledger.read(), baseUrl);
  const styleQuery = `?style=${encodeURIComponent(style)}`;

  /** A public read, waiting out its rate limit. Any other answer than the expected ones stops the run: nothing is rendered on a guess. */
  const publicRead = async (path: string, what: string, accept: number[]): Promise<Reply> => {
    for (let waits = 0; ; waits++) {
      const reply = await client.publicGet(path);
      if (accept.includes(reply.status)) return reply;
      if (reply.status !== 429 || waits >= MAX_RATE_LIMIT_WAITS) throw new Error(`Could not read the saved images for ${what} (HTTP ${reply.status}); nothing is rendered without that answer`);
      deps.log(`Reading saved images is rate limited; waiting ${reply.retryAfterMs / 1000}s`);
      await deps.sleep(reply.retryAfterMs);
    }
  };
  /** The verses of a chapter that already have a saved image in this style, from the public image API. */
  const savedVerses = async (chapter: SeedChapter): Promise<Set<number>> => {
    const { json } = await publicRead(`/api/public/images/chapters/${chapter.book}/${chapter.chapter}${styleQuery}`, chapter.label, [200]);
    const data = json?.data as { book?: unknown; chapter?: unknown; verses?: unknown } | undefined;
    if (!data || data.book !== chapter.book || data.chapter !== chapter.chapter || !Array.isArray(data.verses)) throw new Error(`The saved images for ${chapter.label} came back in an unexpected shape; nothing is rendered without that answer`);
    return new Set(data.verses.map((entry: { verse?: unknown }) => Number(entry?.verse)));
  };

  if (options.dryRun) {
    deps.log(`Seed plan for ${baseUrl} (style ${style}, translation ${translation}); nothing is rendered and no login is made.`);
    const rows: DryRunSummary["chapters"] = [];
    for (const chapter of chapters) {
      const saved = await savedVerses(chapter);
      const missing = chapter.verses.filter((verse) => !saved.has(verse.verse) && !prior.done.has(verseKey(style, verse.reference))).length;
      rows.push({ label: chapter.label, verses: chapter.verses.length, present: chapter.verses.length - missing, missing, projectedUsd: round(missing * ESTIMATE_USD_PER_IMAGE) });
    }
    const total = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
    const summary = { kind: "dry-run" as const, chapters: rows, listed: total((r) => r.verses), present: total((r) => r.present), missing: total((r) => r.missing), projectedUsd: round(total((r) => r.missing) * ESTIMATE_USD_PER_IMAGE) };
    deps.log(`${"Chapter".padEnd(20)}${"Verses".padStart(8)}${"Present".padStart(9)}${"Missing".padStart(9)}${"Projected".padStart(11)}`);
    for (const row of rows) deps.log(`${row.label.padEnd(20)}${String(row.verses).padStart(8)}${String(row.present).padStart(9)}${String(row.missing).padStart(9)}${dollars(row.projectedUsd).padStart(11)}`);
    deps.log(`Total: ${rows.length} chapters, ${summary.listed} verses listed, ${summary.present} already present, ${summary.missing} missing; projected ${dollars(summary.projectedUsd)} at ${dollars(ESTIMATE_USD_PER_IMAGE, 3)} per image.`);
    if (prior.spentUsd > 0) deps.log(`The ledger for this site already records ${dollars(prior.spentUsd)}; --budget-usd counts it.`);
    if (options.budgetUsd !== null) deps.log(`A budget of ${dollars(options.budgetUsd)} covers ${Math.max(0, Math.floor((options.budgetUsd - prior.spentUsd) / CEILING_USD_PER_IMAGE + 1e-9))} more images if each is counted at the ${dollars(CEILING_USD_PER_IMAGE, 3)} ceiling, and about ${Math.max(0, Math.floor((options.budgetUsd - prior.spentUsd) / ESTIMATE_USD_PER_IMAGE + 1e-9))} at the estimate.`);
    return summary;
  }

  const budgetUsd = options.budgetUsd;
  if (budgetUsd === null) throw new Error("--budget-usd is required unless --dry-run is given");
  if (!deps.password) throw new Error("Set SEED_ADMIN_PASSWORD in the environment for a paid run; it is never read from a flag");
  const state = { rendered: 0, skipped: 0, declined: 0, unresolved: 0, leftAlone: [] as string[], failed: { total: 0, http402: 0, http429: 0, http5xx: 0, other: 0 },
    ledgerError: null as unknown, measuredUsd: 0, unconfirmedUsd: 0, inFlight: 0, consecutiveFailures: 0, verses: 0, stop: null as StopReason | null };
  /** Everything the budget must already cover: the ledger, this run, and each request in flight at the ceiling. */
  const committedUsd = () => prior.spentUsd + state.measuredUsd + state.unconfirmedUsd + state.inFlight * CEILING_USD_PER_IMAGE;
  const summarize = (stop: StopReason): RunSummary => {
    const ledgerUsd = round(prior.spentUsd + state.measuredUsd + state.unconfirmedUsd);
    return { kind: "run", stop, rendered: state.rendered, skipped: state.skipped, declined: state.declined, unresolved: state.unresolved, leftAlone: state.leftAlone, failed: state.failed,
      measuredUsd: round(state.measuredUsd), unconfirmedUsd: round(state.unconfirmedUsd), ledgerUsd, budgetUsd, remainingUsd: round(budgetUsd - ledgerUsd) };
  };
  const report = (summary: RunSummary) => {
    const f = summary.failed;
    deps.log(`Stopped: ${summary.stop}.`);
    deps.log(`Rendered ${summary.rendered}, skipped (already present) ${summary.skipped}, declined ${summary.declined}, failed ${f.total} (402: ${f.http402}, 429: ${f.http429}, 5xx: ${f.http5xx}, other: ${f.other}).`);
    if (summary.unresolved > 0) deps.log(`${summary.unresolved} request${summary.unresolved === 1 ? "" : "s"} got no definite answer and may have made an image; ${summary.unresolved === 1 ? "its verse is" : "their verses are"} left alone by later runs.`);
    if (summary.leftAlone.length) deps.log(`Left alone, because an earlier request never got a definite answer: ${summary.leftAlone.slice(0, 20).join(", ")}${summary.leftAlone.length > 20 ? ` and ${summary.leftAlone.length - 20} more` : ""}. Look at them in the reader; any still without an image after ten minutes can be drawn with --redraw-unresolved.`);
    deps.log(`Measured spend this run ${dollars(summary.measuredUsd)}${summary.unconfirmedUsd > 0 ? `, plus ${dollars(summary.unconfirmedUsd)} held at the ceiling for requests whose cost the provider did not report` : ""}. Ledger total ${dollars(summary.ledgerUsd)} of ${dollars(budgetUsd)}; remaining budget ${dollars(summary.remainingUsd)}.`);
    return summary;
  };
  if (committedUsd() + CEILING_USD_PER_IMAGE > budgetUsd + 1e-9) {
    deps.log(`The ledger for this site already records ${dollars(prior.spentUsd)} of the ${dollars(budgetUsd)} budget, which leaves no room for one more image at the ${dollars(CEILING_USD_PER_IMAGE, 3)} ceiling. Raise --budget-usd to continue.`);
    return report(summarize("budget"));
  }

  // The owner's session: a guest session, upgraded by the admin login. The login is tried once, since failures lock the address out.
  const session = await client.post("/api/session");
  if (session.status !== 200 || typeof session.json?.sid !== "string") throw new Error(`Could not create a session (HTTP ${session.status})`);
  const login = await client.post("/api/admin-login", { password: deps.password });
  if (login.status !== 200 || login.json?.success !== true) throw new Error(`The admin login was refused (HTTP ${login.status}: ${String(login.json?.error ?? "no reason given")}). It is not tried again: repeated failures lock this address out for an hour or longer.`);
  const upgraded = await client.get("/api/session");
  if (upgraded.json?.tier !== "admin") throw new Error("The session is not an admin session after the login; nothing was rendered");
  deps.log(`Signed in to ${baseUrl} as the owner. Budget ${dollars(budgetUsd)}, of which the ledger already records ${dollars(prior.spentUsd)}; style ${style}; up to ${options.concurrency} at once.`);

  /** The verses still to draw, in list order. A chapter's saved images are read just before its first verse is drawn. */
  async function* missingVerses(): AsyncGenerator<SeedVerse> {
    for (const chapter of chapters) {
      let saved: Set<number> | null = null;
      for (const verse of chapter.verses) {
        const key = verseKey(style, verse.reference);
        if (!prior.done.has(key)) {
          saved ??= await savedVerses(chapter);
          if (!saved.has(verse.verse)) {
            // Its earlier request may still finish, and the public answer may be a cached one: no image seen is not proof of none.
            if (prior.unresolved.has(key) && !options.redrawUnresolved) { state.leftAlone.push(verse.reference); continue; }
            yield verse; continue;
          }
        }
        state.skipped++;
      }
    }
  }

  // Pacing: no more request starts in any minute than the site admits, and none while a rate limit is being waited out.
  const starts: number[] = [];
  let pausedUntil = 0;
  /** Wait until a request may start, and with `claim` count it as started. Answers whether it had to wait. */
  const slot = async (claim: boolean): Promise<boolean> => {
    for (let waited = false; ; waited = true) {
      const now = deps.now();
      if (now < pausedUntil) { await deps.sleep(pausedUntil - now); continue; }
      while (starts.length && now - starts[0] >= PACE_WINDOW_MS) starts.shift();
      if (starts.length < GENERATE_REQUESTS_PER_MINUTE) { if (claim) starts.push(now); return waited; }
      await deps.sleep(starts[0] + PACE_WINDOW_MS - now);
    }
  };

  type Task = { verse: SeedVerse; attempt: number; last?: AttemptResult };
  const source = missingVerses();
  const retries: Task[] = [];
  let exhausted = false;
  /**
   * The next request to send, or null when this worker should stop. Taking one reserves the ceiling for it, and one
   * worker takes at a time, so the check and the reservation cannot interleave. A worker that finds no room while
   * others are still in flight just leaves: their real costs decide whether the last of them may go on.
   */
  const take = async (): Promise<Task | null> => {
    const leave = (reason: StopReason) => { if (state.inFlight === 0) state.stop ??= reason; return null; };
    for (;;) {
      if (state.stop) return null;
      if (deps.stopRequested()) { state.stop = "interrupted"; return null; }
      if (committedUsd() + CEILING_USD_PER_IMAGE > budgetUsd + 1e-9) return leave("budget");
      if (!retries.length && exhausted) return leave("complete");
      if (!retries.length && options.limit !== null && state.verses >= options.limit) return leave("limit");
      // The wait for the site's rate limit comes before a request is taken, so a stop asked for meanwhile sends nothing more.
      if (!(await slot(false))) break;
    }
    let task = retries.shift();
    if (!task) {
      let next: IteratorResult<SeedVerse>;
      try {
        next = await source.next();
      } catch (error) {
        // The next chapter's saved images could not be read: the requests in flight finish and nothing more is sent.
        deps.log(error instanceof Error ? error.message : String(error));
        state.stop ??= "site-unreadable";
        return null;
      }
      if (next.done) { exhausted = true; return leave("complete"); }
      if (state.stop) return null;
      state.verses++;
      task = { verse: next.value, attempt: 1 };
    }
    state.inFlight++;
    return task;
  };
  let turn: Promise<unknown> = Promise.resolve();
  const next = () => { const mine = turn.then(take); turn = mine.catch(() => undefined); return mine; };

  /** One request, sent until its answer is definite. A re-send keeps its request id, which the site replays rather than paying twice. */
  const send = async (verse: SeedVerse, requestId: string): Promise<AttemptResult> => {
    // Only the Bible: the request names its work and never a unit, so it cannot be read as a prose passage.
    const body = { reference: verse.reference, translation, style, requestId, aspectRatio: "16:9", resolution: "1K", workId: BIBLE_WORK_ID };
    // Once an answer went missing, the request may have been admitted: only its own image settles it after that.
    let admissionUnknown = false;
    const unsettled = (status: number | null, what: string): AttemptResult => ({ outcome: "unresolved", status, retryable: false, usd: CEILING_USD_PER_IMAGE, usdSource: "ceiling", credits: null, imageId: null, durationMs: null, error: what.slice(0, 300) });
    for (let waits = 0, resends = 0; ;) {
      await slot(true);
      // The ledger failed while this request waited its turn: nothing more is sent, not even a re-send.
      if (state.ledgerError) {
        return admissionUnknown
          ? unsettled(null, "Not asked again: the ledger could not be written")
          : { outcome: "failed", status: null, retryable: false, usd: 0, usdSource: "none", credits: null, imageId: null, durationMs: null, error: "Not sent: the ledger could not be written" };
      }
      let reply: Reply | null = null; let thrown = "";
      try { reply = await client.post("/api/generate-image", body); } catch (error) { thrown = error instanceof Error ? error.message : String(error); }
      if (reply?.status === 429 && reply.json?.error !== "Daily spending limit exceeded" && ++waits <= MAX_RATE_LIMIT_WAITS) {
        pausedUntil = Math.max(pausedUntil, deps.now() + reply.retryAfterMs);
        deps.log(`[rate limited] ${verse.reference}: waiting ${reply.retryAfterMs / 1000}s`);
        continue;
      }
      // No answer, an answer that is not the route's own, or "still running": the request may yet be paid for and saved.
      if (!reply || reply.status === 202 || (reply.status >= 500 && !reply.json)) {
        const what = reply ? `HTTP ${reply.status}` : thrown;
        admissionUnknown = true;
        if (++resends > MAX_RESENDS) return unsettled(reply?.status ?? null, `No definite answer (${what}); the request may still finish`);
        deps.log(`[no answer] ${verse.reference}: ${what}; asking again under the same request id in ${RESEND_DELAY_MS / 1000}s`);
        await deps.sleep(RESEND_DELAY_MS);
        continue;
      }
      const result = classifyGenerateResponse(reply.status, reply.json);
      // An answer the route gives before looking the request up (a failed lookup, a refusal) says nothing about the first attempt.
      if (admissionUnknown && result.outcome !== "rendered" && !(reply.status === 409 && reply.json?.reused === true)) {
        return unsettled(reply.status, `After an unanswered request the site said: ${result.error ?? `HTTP ${reply.status}`}`);
      }
      return result;
    }
  };

  const count = (result: AttemptResult) => {
    if (result.outcome === "declined") { state.declined++; return; }
    if (result.outcome === "unresolved") { state.unresolved++; return; }
    state.failed.total++;
    if (result.status === 402) state.failed.http402++; else if (result.status === 429) state.failed.http429++;
    else if (result.status !== null && result.status >= 500) state.failed.http5xx++; else state.failed.other++;
  };
  /** The ledger could not be written: nothing more is sent, the requests in flight settle, and the error is raised at the end. */
  const ledgerFailed = (error: unknown) => { state.ledgerError ??= error; state.stop ??= "ledger-error"; };
  const worker = async () => {
    for (let task = await next(); task; task = await next()) {
      const { verse, attempt } = task;
      const row = { baseUrl, reference: verse.reference, style, translation, requestId: deps.uuid(), attempt };
      const startedAt = deps.now();
      try {
        deps.ledger.append({ at: new Date(startedAt).toISOString(), event: "start", ...row });
      } catch (error) {
        // Nothing was sent for this verse.
        state.inFlight--; ledgerFailed(error);
        return;
      }
      const result = await send(verse, row.requestId);
      try {
        deps.ledger.append({ at: new Date(deps.now()).toISOString(), event: "result", ...row, outcome: result.outcome, status: result.status, credits: result.credits,
          usd: result.usd, usdSource: result.usdSource, durationMs: result.durationMs, elapsedMs: deps.now() - startedAt, imageId: result.imageId, ...(result.error ? { error: result.error } : {}) });
      } catch (error) {
        // The ledger holds this request's start without its result, which a later run counts at the ceiling; so does this one.
        state.inFlight--; state.unconfirmedUsd += CEILING_USD_PER_IMAGE; ledgerFailed(error);
        return;
      }
      state.inFlight--;
      if (result.usdSource === "ceiling") state.unconfirmedUsd += result.usd; else state.measuredUsd += result.usd;
      // The ceiling is what every reservation assumed. One image above it means the assumption no longer holds.
      if (result.usdSource === "provider" && result.usd > CEILING_USD_PER_IMAGE) state.stop ??= "cost-above-ceiling";
      const spent = `${dollars(round(prior.spentUsd + state.measuredUsd + state.unconfirmedUsd))} of ${dollars(budgetUsd)}`;
      if (result.outcome === "rendered") {
        state.rendered++; state.consecutiveFailures = 0;
        deps.log(`[rendered] ${verse.reference} ${dollars(result.usd, 4)}${result.usdSource === "ceiling" ? " (held at the ceiling: no provider cost reported)" : ""}${result.credits === null ? "" : ` (${result.credits} credits)`} in ${((result.durationMs ?? deps.now() - startedAt) / 1000).toFixed(1)}s, image ${result.imageId}; ${spent}`);
        continue;
      }
      state.consecutiveFailures++;
      if (result.stop) state.stop ??= result.stop;
      else if (state.consecutiveFailures >= options.maxFailures) state.stop ??= "consecutive-failures";
      // A verse the site refused before admitting anything is tried once more in the same run, under a new request id.
      const again = result.retryable && result.usdSource === "none" && attempt === 1 && !state.stop;
      if (again) retries.push({ verse, attempt: 2, last: result }); else count(result);
      deps.log(`[${result.outcome}${result.status === null ? "" : ` ${result.status}`}] ${verse.reference}: ${result.error ?? "no reason given"}${again ? "; one more try" : ""}; ${spent}`);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  // A verse whose second try never ran is still a verse that failed.
  for (const task of retries) if (task.last) count(task.last);
  const summary = report(summarize(state.stop ?? "complete"));
  if (state.ledgerError) throw new Error(`The ledger could not be written (${state.ledgerError instanceof Error ? state.ledgerError.message : String(state.ledgerError)}). Requests already sent were allowed to finish; repair the ledger before running again.`);
  return summary;
}
