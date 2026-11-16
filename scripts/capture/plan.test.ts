import { describe, expect, it } from "vitest";
import { CAPTURE_STUBS, VIDEO_PRICING, allowsRequest, findBrowser, localBase, ownerPassword, parseStep, pricedCatalog, selectStates, shotFile, stubLabel } from "./plan";
import { READER_STATES } from "./states";

describe("reader capture plan", () => {
  it("captures only an app running on this machine", () => {
    expect(localBase("http://localhost:3101/john/1/1").href).toBe("http://localhost:3101/");
    expect(localBase("http://127.0.0.1:3000").href).toBe("http://127.0.0.1:3000/");
    expect(() => localBase("https://visibible.com")).toThrow(/this machine/);
    expect(() => localBase("http://localhost.example.com:3000")).toThrow(/this machine/);
  });

  it("never lets the page ask for anything that costs money or leaves this machine", () => {
    expect(allowsRequest("GET", "http://localhost:3101/john/1/5")).toBe(true);
    expect(allowsRequest("GET", "http://127.0.0.1:3220/api/storage/abc")).toBe(true);
    expect(allowsRequest("POST", "http://localhost:3101/api/session")).toBe(true);
    expect(allowsRequest("POST", "http://localhost:3101/api/chat/quote")).toBe(true);
    expect(allowsRequest("GET", "data:image/png;base64,AAAA")).toBe(true);
    expect(allowsRequest("POST", "http://localhost:3101/api/chat")).toBe(false);
    expect(allowsRequest("POST", "http://localhost:3101/api/generate-image")).toBe(false);
    expect(allowsRequest("POST", "http://localhost:3101/api/generate-video")).toBe(false);
    expect(allowsRequest("POST", "http://localhost:3101/api/invoice")).toBe(false);
    expect(allowsRequest("POST", "http://127.0.0.1:3101/api/chat")).toBe(false);
    expect(allowsRequest("GET", "ws://127.0.0.1:3220/api/sync")).toBe(true);
    expect(allowsRequest("GET", "wss://example.convex.cloud/api/sync")).toBe(false);
    expect(allowsRequest("GET", "https://openrouter.ai/api/v1/models")).toBe(false);
    expect(allowsRequest("GET", "https://fonts.googleapis.com/css")).toBe(false);
  });

  it("reads a state's steps, keeping colons inside names and selectors", () => {
    expect(parseStep("click:button:John 1:5, Contents")).toEqual({ verb: "click", kind: "button", target: "John 1:5, Contents" });
    expect(parseStep("hover:css:article p:nth-of-type(2)")).toEqual({ verb: "hover", kind: "css", target: "article p:nth-of-type(2)" });
    expect(parseStep("click:text:Not painted yet")).toEqual({ verb: "click", kind: "text", target: "Not painted yet" });
    expect(parseStep("waitfor:dialog:Contents")).toEqual({ verb: "waitfor", kind: "dialog", target: "Contents" });
    expect(parseStep("wait:4200")).toEqual({ verb: "wait", ms: 4200 });
    expect(parseStep("scroll:2000")).toEqual({ verb: "scroll", pixels: 2000 });
    expect(parseStep("press:Escape")).toEqual({ verb: "press", key: "Escape" });
    expect(parseStep("goto:/john/1/6")).toEqual({ verb: "goto", path: "/john/1/6" });
    expect(() => parseStep("tap:button:Next verse")).toThrow(/Unknown step/);
    expect(() => parseStep("wait:soon")).toThrow(/milliseconds/);
    expect(() => parseStep("click:Next verse")).toThrow(/role/);
    expect(() => parseStep("goto:john/1/6")).toThrow(/start with \//);
  });

  describe("finding a browser", () => {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const cached = (n: number) =>
      `/Users/me/Library/Caches/ms-playwright/chromium-${n}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
    const machine = (files: string[]) => ({
      platform: "darwin" as const,
      home: "/Users/me",
      exists: (file: string) => files.includes(file),
      list: (dir: string) =>
        dir === "/Users/me/Library/Caches/ms-playwright" ? ["chromium-1200", "chromium-1248", "chromium_headless_shell-1248", "ffmpeg-1011"] : [],
    });

    it("uses the browser named in CAPTURE_BROWSER first", () => {
      expect(findBrowser({ ...machine(["/opt/brave", chrome]), env: { CAPTURE_BROWSER: "/opt/brave" } })).toBe("/opt/brave");
      expect(() => findBrowser({ ...machine([chrome]), env: { CAPTURE_BROWSER: "/opt/missing" } })).toThrow(/CAPTURE_BROWSER/);
    });

    it("otherwise finds an installed Chrome, then the newest browser Playwright already downloaded", () => {
      expect(findBrowser({ ...machine([chrome, cached(1248)]), env: {} })).toBe(chrome);
      expect(findBrowser({ ...machine([cached(1200), cached(1248)]), env: {} })).toBe(cached(1248));
    });

    it("says how to name one when none is installed, and never downloads one", () => {
      expect(() => findBrowser({ ...machine([]), env: {} })).toThrow(/CAPTURE_BROWSER/);
    });
  });

  it("keeps every reader state a valid one-line entry, starting with reading", () => {
    expect(READER_STATES[0]).toMatchObject({ name: "reading" });
    const names = READER_STATES.map((state) => state.name);
    expect(new Set(names).size).toBe(names.length);
    for (const state of READER_STATES) {
      expect(state.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(state.path).toMatch(/^\//);
      for (const step of state.steps ?? []) expect(() => parseStep(step)).not.toThrow();
      for (const stub of state.stubs ?? []) expect(CAPTURE_STUBS).toContain(stub);
    }
  });

  it("can price the image catalog as an app with a key would, without opening owner-only styles", () => {
    const local = {
      models: [{ id: "m", availability: "unavailable", unavailableReason: "Image generation is not configured", creditsCost: null }],
      artStyles: [
        { id: "classical", available: false, reason: "Temporarily unavailable for generation" },
        { id: "icon", available: false, reason: "Owner only" },
      ],
    };
    expect(pricedCatalog(local)).toEqual({
      models: [{ id: "m", availability: "available", creditsCost: 6, reservationCreditsCost: 9, estimatedCreditsByResolution: { "1K": 6 }, etaSeconds: 20 }],
      artStyles: [
        { id: "classical", available: true },
        { id: "icon", available: false, reason: "Owner only" },
      ],
    });
  });

  it("labels a stubbed state's pictures with what was faked, and fakes video as switched on with the menu's clip priced", () => {
    expect(stubLabel({ name: "make-video", path: "/john/1/5", stubs: ["video-priced"] })).toBe("Stubbed: video pricing");
    expect(stubLabel({ name: "both", path: "/john/1/5", stubs: ["priced", "video-priced"] })).toBe("Stubbed: image prices, video pricing");
    expect(stubLabel({ name: "reading", path: "/john/1/5" })).toBeNull();
    expect(VIDEO_PRICING.enabled).toBe(true);
    expect(VIDEO_PRICING.quotes).toContainEqual(expect.objectContaining({ duration: 5, resolution: "768p" }));
  });

  it("signs an owner-only state in with the password it is given, and says how to give one", () => {
    expect(ownerPassword({ CAPTURE_ADMIN_PASSWORD: "local-secret" })).toBe("local-secret");
    expect(() => ownerPassword({})).toThrow(/CAPTURE_ADMIN_PASSWORD/);
    expect(READER_STATES.filter((state) => state.owner).map((state) => state.name)).toContain("prose");
  });

  it("names each picture after its state and size, and can shoot only some states", () => {
    const states = [{ name: "reading", path: "/john/1/5" }, { name: "marks", path: "/john/1/5" }, { name: "idle-faded", path: "/john/1/5" }];
    expect(shotFile({ name: "idle-faded", path: "/john/1/5" }, "phone")).toBe("idle-faded-phone.png");
    expect(selectStates(states, []).map((state) => state.name)).toEqual(["reading", "marks", "idle-faded"]);
    expect(selectStates(states, ["idle-faded", "reading"]).map((state) => state.name)).toEqual(["reading", "idle-faded"]);
    expect(() => selectStates(states, ["contents"])).toThrow(/No state named contents/);
  });
});
