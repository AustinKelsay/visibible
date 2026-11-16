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
  parseStep,
  selectStates,
  shotFile,
  type CaptureSize,
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
  // One guest session for the whole run: /api/session allows only 10 new ones a minute.
  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
  try {
    for (const size of options.sizes) {
      const { width, height, phone } = CAPTURE_SIZES[size];
      for (const state of states) {
        if (state.sizes && !state.sizes.includes(size)) continue;
        const context = await browser.newContext({
          storageState,
          viewport: { width, height },
          deviceScaleFactor: phone ? 2 : 1,
          isMobile: phone,
          hasTouch: phone,
        });
        await guard(context);
        const page = await context.newPage();
        page.on("pageerror", (error) => console.warn(`  page error in ${state.name}: ${error.message}`));
        const file = path.join(options.out, shotFile(state, size));
        try {
          await page.goto(new URL(state.path, options.base).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await settle(page);
          for (const step of state.steps ?? []) {
            await run(page, options.base, parseStep(step));
            await page.waitForTimeout(400);
          }
          await settle(page);
          await page.screenshot({ path: file });
          console.log(`wrote ${file}`);
          storageState = await context.storageState();
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
