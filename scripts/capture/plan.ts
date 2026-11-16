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

/**
 * A canned answer the browser gets instead of the app's, for a state that needs a price or a job a local app without
 * an OpenRouter key cannot give. It answers in the browser, so a stubbed post never reaches the app. `method` defaults
 * to GET; `path` must match exactly.
 */
export type CaptureStub = { method?: "GET" | "POST"; path: string; status?: number; json: unknown };

/**
 * One reader state: the name its pictures carry, the address it opens and the steps that reach it, with any `stubs`
 * it needs. A stubbed state's pictures say so in a corner label.
 */
export type CaptureState = { name: string; path: string; steps?: string[]; sizes?: CaptureSize[]; stubs?: CaptureStub[] };

/** The state's stub for this request, if any. */
export function stubFor(state: CaptureState, method: string, address: string): CaptureStub | undefined {
  const { pathname } = new URL(address);
  return state.stubs?.find((stub) => (stub.method ?? "GET") === method && stub.path === pathname);
}

/** The label a stubbed state's pictures carry, so nobody mistakes a faked price or job for the real service. */
export function stubLabel(state: CaptureState): string | null {
  if (!state.stubs?.length) return null;
  return `Stubbed: ${state.stubs.map((stub) => `${stub.method ?? "GET"} ${stub.path}`).join(", ")}`;
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

/** The picture's file name: `<state>-<size>.png`. */
export function shotFile(state: CaptureState, size: CaptureSize): string {
  return `${state.name}-${size}.png`;
}

/** The states to shoot, in list order: all of them, or only those named. */
export function selectStates(states: CaptureState[], names: string[]): CaptureState[] {
  for (const name of names) {
    if (!states.some((state) => state.name === name)) throw new Error(`No state named ${name}`);
  }
  return names.length ? states.filter((state) => names.includes(state.name)) : states;
}
