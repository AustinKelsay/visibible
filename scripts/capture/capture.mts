/**
 * Screenshot every reader state at desktop and phone size, from an app running on this machine (#436).
 *
 *   npm run capture:reader -- --base http://localhost:3000
 *   npm run capture:reader -- --base http://localhost:3101 --only reading,marks --out output/captures/436
 *
 * Options: `--base` the app's origin (default CAPTURE_BASE_URL, else http://localhost:3000; only localhost is
 * accepted), `--out` the folder (default output/captures, git-ignored), `--only` a comma-separated list of state
 * names, `--sizes desktop|phone|desktop,phone`. The states are listed in states.ts; pictures are written as
 * `<state>-<size>.png`, and a state that fails leaves `<state>-<size>-ERROR.png` and makes the run exit 1.
 *
 * It drives a Chrome or Chromium already on the machine (CAPTURE_BROWSER, else found; see `findBrowser`) and never
 * downloads one. It refuses an app that has an OpenRouter key, and the page it opens can reach nothing off this
 * machine nor post to a route that spends. Not part of the test suite. Guide: llm/workflow/READER_CAPTURE.md.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import {
  CAPTURE_SIZES,
  allowsRequest,
  findBrowser,
  localBase,
  ownerPassword,
  parseStep,
  pricedCatalog,
  selectStates,
  shotFile,
  stubLabel,
  VIDEO_PRICING,
  type CaptureSize,
  type CaptureState,
  type CaptureStub,
  type Step,
} from "./plan";
import { READER_STATES } from "./states";

type Options = { base: URL; out: string; only: string[]; sizes: CaptureSize[] };

function parseArgs(argv: string[]): Options {
  let base = process.env.CAPTURE_BASE_URL || "http://localhost:3000";
  let out = "output/captures";
  let only: string[] = [];
  let sizes: CaptureSize[] = ["desktop", "phone"];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--base") base = value();
    else if (arg === "--out") out = value();
    else if (arg === "--only") only = value().split(",").filter(Boolean);
    else if (arg === "--sizes") {
      sizes = value().split(",") as CaptureSize[];
      for (const size of sizes) if (!(size in CAPTURE_SIZES)) throw new Error(`Unknown size ${size}: use desktop or phone`);
    } else throw new Error(`Unknown option ${arg}`);
  }
  return { base: localBase(base), out, only, sizes };
}

/** The app must be up and unable to pay for a model: its chat models list says when no OpenRouter key is set. */
async function checkApp(base: URL) {
  let body: { error?: string };
  try {
    body = await (await fetch(new URL("/api/chat-models", base), { signal: AbortSignal.timeout(30_000) })).json();
  } catch {
    throw new Error(`No app answering at ${base.origin}. Start it first (llm/workflow/READER_CAPTURE.md)`);
  }
  if (!/not configured/i.test(body.error ?? "")) {
    throw new Error(`The app at ${base.origin} has an OpenRouter key. Run it with OPENROUTER_API_KEY empty`);
  }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** css and text targets as written; a role target by exact accessible name, else a case-insensitive substring. */
async function locate(page: Page, kind: string, target: string) {
  if (kind === "css") return page.locator(target).first();
  if (kind === "text") return page.getByText(target).first();
  const role = kind as Parameters<Page["getByRole"]>[0];
  const exact = page.getByRole(role, { name: target, exact: true });
  return (await exact.count()) ? exact.first() : page.getByRole(role, { name: new RegExp(escape(target), "i") }).first();
}

/**
 * Convex holds a websocket open, so "networkidle" never comes: wait for fonts and the visible pictures instead. A
 * picture still loading after 15 s fails the state rather than leave a blank in the set.
 */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () =>
      document.fonts.status === "loaded" &&
      [...document.images].filter((image) => image.getBoundingClientRect().width > 0).every((image) => image.complete),
    null,
    { timeout: 15_000 },
  );
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(300);
}

async function run(page: Page, base: URL, step: Step) {
  switch (step.verb) {
    case "wait":
      return page.waitForTimeout(step.ms);
    case "scroll":
      return page.mouse.wheel(0, step.pixels);
    case "press":
      return page.keyboard.press(step.key);
    case "goto":
      await page.goto(new URL(step.path, base).href);
      return settle(page);
    default: {
      const target = await locate(page, step.kind, step.target);
      if (step.verb === "click") return target.click({ timeout: 10_000 });
      if (step.verb === "hover") return target.hover({ timeout: 10_000 });
      return target.waitFor({ state: "visible", timeout: 15_000 });
    }
  }
}

async function guard(context: BrowserContext) {
  const refused = new Set<string>();
  const refuse = (method: string, address: string) => {
    const key = `${method} ${address.split("?")[0]}`;
    if (!refused.has(key)) console.warn(`  refused ${key}`);
    refused.add(key);
  };
  await context.route("**/*", (route) => {
    const request = route.request();
    if (allowsRequest(request.method(), request.url())) return route.continue();
    refuse(request.method(), request.url());
    return route.abort("blockedbyclient");
  });
  // Page routes do not see WebSockets; without this a hosted Convex deployment would still be reached.
  await context.routeWebSocket(
    () => true,
    (socket) => {
      if (allowsRequest("GET", socket.url())) return socket.connectToServer();
      refuse("WebSocket", socket.url());
      return socket.close();
    },
  );
}

/** A state's stubs, answered in the page; registered after the guard, so they are asked first. */
async function stub(page: Page, stubs: CaptureStub[]) {
  if (stubs.includes("priced")) {
    await page.route((url) => url.pathname === "/api/image-models", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: pricedCatalog(await response.json()) });
    });
  }
  if (stubs.includes("video-priced")) {
    // Only the price: a post (making a video) falls through to the guard, which refuses it.
    await page.route((url) => url.pathname === "/api/generate-video", (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: VIDEO_PRICING }) : route.fallback());
  }
}

/**
 * Sign the page's guest in as the owner through the local app's own admin sign-in, as the welcome dialog's admin form
 * does. Its next page is rendered for the owner.
 */
async function signInAsOwner(page: Page, base: URL) {
  const password = ownerPassword(process.env);
  await page.goto(new URL("/about", base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // The page makes the guest session (and its CSRF cookie) shortly after it loads; until then the sign-in answers
  // "Session required". Nothing else is retried: the app locks sign-in after repeated wrong passwords.
  let answer = { status: 0, error: "Session required" };
  for (let attempt = 0; attempt < 20 && answer.error === "Session required"; attempt += 1) {
    await page.waitForTimeout(500);
    answer = await page.evaluate(async (secret) => {
      const csrf = document.cookie.split("; ").find((row) => row.startsWith("visibible_csrf="))?.split("=")[1];
      if (!csrf) return { status: 0, error: "Session required" };
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ password: secret }),
      });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, error: response.ok ? "" : String(body.error ?? "") };
    }, password);
  }
  const status = answer.status;
  if (status !== 200) throw new Error(`Owner sign-in failed with ${status}: ${answer.error}`);
}

/** Put a stubbed state's label in the picture's corner. */
async function label(page: Page, state: CaptureState) {
  const text = stubLabel(state);
  if (!text) return;
  await page.evaluate((content) => {
    const tag = document.createElement("div");
    tag.textContent = content;
    tag.setAttribute("style", "position:fixed;right:8px;top:8px;z-index:2147483647;pointer-events:none;padding:2px 6px;border-radius:4px;background:rgba(255,200,0,0.9);color:#000;font:600 11px/1.4 system-ui,sans-serif");
    document.body.appendChild(tag);
  }, text);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const states = selectStates(READER_STATES, options.only);
  await checkApp(options.base);
  const executablePath = findBrowser({
    env: process.env,
    platform: process.platform,
    home: homedir(),
    exists: existsSync,
    list: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  });
  mkdirSync(options.out, { recursive: true });
  console.log(`Capturing ${states.length} state(s) from ${options.base.origin} with ${executablePath}`);

  const browser = await chromium.launch({ executablePath, headless: true });
  let failed = 0;
  // One guest session for the whole run: /api/session allows only 10 new ones a minute. Owner-only states share a
  // second one, signed in as the owner, so the guest's states stay a guest's.
  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
  let ownerState: typeof storageState;
  try {
    for (const size of options.sizes) {
      const { width, height, phone } = CAPTURE_SIZES[size];
      for (const state of states) {
        if (state.sizes && !state.sizes.includes(size)) continue;
        const context = await browser.newContext({
          storageState: state.owner ? ownerState : storageState,
          viewport: { width, height },
          deviceScaleFactor: phone ? 2 : 1,
          isMobile: phone,
          hasTouch: phone,
        });
        await guard(context);
        const page = await context.newPage();
        await stub(page, state.stubs ?? []);
        page.on("pageerror", (error) => console.warn(`  page error in ${state.name}: ${error.message}`));
        const file = path.join(options.out, shotFile(state, size));
        try {
          if (state.owner && !ownerState) await signInAsOwner(page, options.base);
          await page.goto(new URL(state.path, options.base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await settle(page);
          for (const step of state.steps ?? []) {
            await run(page, options.base, parseStep(step));
            await page.waitForTimeout(400);
          }
          await settle(page);
          await label(page, state);
          await page.screenshot({ path: file });
          console.log(`wrote ${file}`);
          if (state.owner) ownerState = await context.storageState();
          else storageState = await context.storageState();
        } catch (error) {
          failed += 1;
          await page.screenshot({ path: file.replace(/\.png$/, "-ERROR.png") }).catch(() => {});
          console.error(`FAILED ${state.name} ${size}: ${(error as Error).message.split("\n")[0]}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exitCode = 1;
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
