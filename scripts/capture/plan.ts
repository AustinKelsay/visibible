/**
 * The parts of the reader capture command (`npm run capture:reader`) that need no browser: which app it may open,
 * which requests it lets through, how a state's steps are read and where the browser is found. The command itself
 * is capture.mts; the states it shoots are states.ts.
 */

export type CaptureSize = "desktop" | "phone";

/** Desktop is one CSS pixel per pixel; the phone is a touch screen at twice the density. */
export const CAPTURE_SIZES: Record<CaptureSize, { width: number; height: number; phone: boolean }> = {
  desktop: { width: 1440, height: 900, phone: false },
  phone: { width: 390, height: 844, phone: true },
};

/** The reader's appearances (Advanced → Appearance). Every state is shot in each, dark first. */
export type CaptureAppearance = "dark" | "light";
export const CAPTURE_APPEARANCES: CaptureAppearance[] = ["dark", "light"];

/** Where the reader keeps its settings in the browser (`READER_SETTINGS_KEY` in src/lib/advanced-settings.ts). */
export const READER_SETTINGS_KEY = "visibible-reader-settings";

/**
 * The reader's stored settings record (as the browser holds it, or null) with Advanced's appearance set, keeping every
 * other setting. The capture stores it before the page opens, so the reader paints in that appearance from the start.
 */
export function readerSettingsIn(stored: string | null, appearance: CaptureAppearance): string {
  let record: Record<string, unknown> = {};
  try {
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed;
  } catch {
    // An unreadable record is replaced.
  }
  const advanced = record.advanced && typeof record.advanced === "object" ? record.advanced : {};
  return JSON.stringify({ ...record, version: 1, advanced: { ...advanced, appearance } });
}

/**
 * Responses a state may stub, because a local app without an OpenRouter key cannot give them. `priced`: the image
 * catalog answers as an app with a key would (see `pricedCatalog`), so prices show; nothing can be painted with it.
 * `video-priced`: video generation answers as switched on, with `VIDEO_PRICING` (#447); making a video stays refused.
 */
export const CAPTURE_STUBS = ["priced", "video-priced"] as const;
export type CaptureStub = (typeof CAPTURE_STUBS)[number];

/** What each stub fakes, for the label a stubbed state's pictures carry. */
const STUB_LABELS: Record<CaptureStub, string> = { priced: "image prices", "video-priced": "video pricing" };

/** The label a stubbed state's pictures carry, so nobody mistakes a faked price for the real service. */
export function stubLabel(state: CaptureState): string | null {
  if (!state.stubs?.length) return null;
  return `Stubbed: ${state.stubs.map((stub) => STUB_LABELS[stub]).join(", ")}`;
}

/** `GET /api/generate-video` as an app with video generation on answers: a 5- and 10-second clip at two qualities. */
export const VIDEO_PRICING = {
  enabled: true,
  model: "minimax/hailuo-3-max",
  modelName: "Hailuo 3 Max",
  quotes: [
    { duration: 5, resolution: "480p", providerCostUsd: 0.25, credits: 32 },
    { duration: 5, resolution: "768p", providerCostUsd: 0.4, credits: 50 },
    { duration: 10, resolution: "480p", providerCostUsd: 0.5, credits: 63 },
    { duration: 10, resolution: "768p", providerCostUsd: 0.8, credits: 100 },
  ],
};

/** One reader state: the name its pictures carry, the address it opens, the steps that reach it and its stubs. */
export type CaptureState = { name: string; path: string; steps?: string[]; sizes?: CaptureSize[]; stubs?: CaptureStub[] };

type CatalogModel = Record<string, unknown> & { id: string };
type CatalogStyle = Record<string, unknown> & { id: string; available?: boolean; reason?: string };

/**
 * The `/api/image-models` answer with every model available at about 6 credits a picture (at most 9) and every style
 * the app offers open for painting, except the owner-only Byzantine Icon, which stays as the app says.
 */
export function pricedCatalog<T extends { models?: CatalogModel[]; artStyles?: CatalogStyle[] }>(body: T): T {
  return {
    ...body,
    models: body.models?.map((model) => {
      const priced: CatalogModel = { ...model, availability: "available", creditsCost: 6, reservationCreditsCost: 9, estimatedCreditsByResolution: { "1K": 6 }, etaSeconds: 20 };
      delete priced.unavailableReason;
      return priced;
    }),
    artStyles: body.artStyles?.map((style) => {
      if (style.id === "icon") return style;
      const open: CatalogStyle = { ...style, available: true };
      delete open.reason;
      return open;
    }),
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The app's origin, refusing anything not on this machine: a deployed site would spend real credits. */
export function localBase(address: string): URL {
  const url = new URL(address);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`Capture runs only against an app on this machine (localhost), not ${url.host}`);
  }
  return new URL("/", url);
}

/** Routes that spend credits or reach a paid service when posted to. Their quotes stay open: quoting is free. */
const SPENDING_ROUTES = ["/api/chat", "/api/generate-image", "/api/generate-video", "/api/invoice"];

/**
 * Whether the page under capture may make this request (WebSockets included). Everything off this machine is
 * refused (no third parties, no paid provider, no hosted Convex), and so is a post to a spending route on any local
 * address, so no state can paint, ask or buy even by a stray click. A state that needs such a response must stub it,
 * never let it through.
 */
export function allowsRequest(method: string, address: string): boolean {
  const url = new URL(address);
  if (url.protocol === "data:" || url.protocol === "blob:") return true;
  if (!LOOPBACK_HOSTS.has(url.hostname)) return false;
  if (method === "GET" || url.pathname.endsWith("/quote")) return true;
  return !SPENDING_ROUTES.some((route) => url.pathname === route || url.pathname.startsWith(`${route}/`));
}

export type Step =
  | { verb: "click" | "hover" | "waitfor"; kind: string; target: string }
  | { verb: "wait"; ms: number }
  | { verb: "scroll"; pixels: number }
  | { verb: "press"; key: string }
  | { verb: "goto"; path: string };

/**
 * One step towards a state, written `verb:rest`:
 * `click|hover|waitfor:<role>:<accessible name>` (or `css:<selector>`, `text:<visible text>`), `wait:<ms>`,
 * `scroll:<pixels>` (mouse wheel over the pointer), `press:<key>` and `goto:<path>`.
 */
export function parseStep(step: string): Step {
  const [verb, ...restParts] = step.split(":");
  const rest = restParts.join(":");
  const whole = (unit: string) => {
    const value = Number(rest);
    if (!rest || !Number.isInteger(value)) throw new Error(`"${step}": ${verb} takes whole ${unit}`);
    return value;
  };
  switch (verb) {
    case "wait":
      return { verb, ms: whole("milliseconds") };
    case "scroll":
      return { verb, pixels: whole("pixels") };
    case "press":
      return { verb, key: rest };
    case "goto":
      if (!rest.startsWith("/")) throw new Error(`"${step}": the path must start with /`);
      return { verb, path: rest };
    case "click":
    case "hover":
    case "waitfor": {
      const [kind, ...targetParts] = rest.split(":");
      if (!kind || !targetParts.length) throw new Error(`"${step}": write ${verb}:<role>:<name>, ${verb}:css:<selector> or ${verb}:text:<text>`);
      return { verb, kind, target: targetParts.join(":") };
    }
    default:
      throw new Error(`Unknown step "${step}"`);
  }
}

export type Machine = {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  home: string;
  exists: (file: string) => boolean;
  list: (dir: string) => string[];
};

/**
 * The browser to drive: `CAPTURE_BROWSER` when set, else an installed Chrome or Chromium, else the newest Chromium a
 * Playwright install already downloaded. Nothing is ever downloaded here.
 */
export function findBrowser({ env, platform, home, exists, list }: Machine): string {
  if (env.CAPTURE_BROWSER) {
    if (exists(env.CAPTURE_BROWSER)) return env.CAPTURE_BROWSER;
    throw new Error(`CAPTURE_BROWSER is ${env.CAPTURE_BROWSER}, which does not exist`);
  }
  const mac = platform === "darwin";
  const installed = mac
    ? ["/Applications", `${home}/Applications`].flatMap((apps) => [
        `${apps}/Google Chrome.app/Contents/MacOS/Google Chrome`,
        `${apps}/Chromium.app/Contents/MacOS/Chromium`,
      ])
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  const cache = mac ? `${home}/Library/Caches/ms-playwright` : `${home}/.cache/ms-playwright`;
  const builds = list(cache)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  const downloaded = builds.flatMap((build) =>
    mac
      ? ["arm64", "x64"].map(
          (arch) => `${cache}/${build}/chrome-mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        )
      : [`${cache}/${build}/chrome-linux64/chrome`, `${cache}/${build}/chrome-linux/chrome`],
  );
  const found = [...installed, ...downloaded].find(exists);
  if (found) return found;
  throw new Error("No Chrome or Chromium found. Install one, or set CAPTURE_BROWSER to the browser's executable");
}

/** The picture's file name: `<state>-<size>.png` in dark, `<state>-<size>-light.png` in light. */
export function shotFile(state: CaptureState, size: CaptureSize, appearance: CaptureAppearance = "dark"): string {
  return appearance === "dark" ? `${state.name}-${size}.png` : `${state.name}-${size}-${appearance}.png`;
}

/** The states to shoot, in list order: all of them, or only those named. */
export function selectStates(states: CaptureState[], names: string[]): CaptureState[] {
  for (const name of names) {
    if (!states.some((state) => state.name === name)) throw new Error(`No state named ${name}`);
  }
  return names.length ? states.filter((state) => names.includes(state.name)) : states;
}
