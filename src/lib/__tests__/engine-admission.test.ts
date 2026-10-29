/** Engine admission policy (#174): switches, owner proof, readiness gate and rollback; new work is only ever generic (#184). */
import { describe, it, expect } from "vitest";
import { decideEngine, genericEngineMode, PUBLIC_GENERIC_STYLE_IDS } from "../engine/admission";

const ready = { ready: true, reasons: [], activeGeneration: 3, briefVersion: "bv" };
const unready = { ready: false, reasons: ["no active analysis generation"], activeGeneration: null, briefVersion: "bv" };

describe("engine admission", () => {
  it("is disabled by default and reads only the three known modes", () => {
    expect(genericEngineMode({})).toBe("disabled");
    expect(genericEngineMode({ GENERIC_ENGINE_MODE: "Public " })).toBe("public");
    expect(genericEngineMode({ GENERIC_ENGINE_MODE: "owner" })).toBe("owner");
    expect(genericEngineMode({ GENERIC_ENGINE_MODE: "yes" })).toBe("disabled");
  });

  it("admits nothing new in any style when disabled, Classical included, without touching preferences", () => {
    for (const styleId of [null, "classical", "watercolor", "fresco"]) {
      for (const isOwner of [false, true]) {
        expect(decideEngine({ mode: "disabled", isOwner, styleId, readiness: ready })).toEqual({ engine: null, unavailable: "style", reason: `The ${styleId ?? "classical"} art style is temporarily unavailable`, retryable: true });
      }
    }
  });

  it("admits only a verified owner in owner mode, and only when the work is ready", () => {
    expect(decideEngine({ mode: "owner", isOwner: true, styleId: "icon", readiness: ready })).toEqual({ engine: "generic", reason: "owner-proof" });
    expect(decideEngine({ mode: "owner", isOwner: true, styleId: "classical", readiness: unready })).toMatchObject({ engine: null, unavailable: "preparing", reason: expect.stringContaining("no active analysis generation") });
    expect(decideEngine({ mode: "owner", isOwner: false, styleId: "classical", readiness: ready })).toMatchObject({ engine: null, unavailable: "style" });
    expect(decideEngine({ mode: "owner", isOwner: false, styleId: "icon", readiness: ready })).toMatchObject({ engine: null, unavailable: "style" });
  });

  it("sends every new public request to the generic engine when ready and never falls back to legacy when not", () => {
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "classical", readiness: ready })).toEqual({ engine: "generic", reason: "public" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "classical", readiness: unready })).toMatchObject({ engine: null, unavailable: "preparing", retryable: true });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "classical", readiness: null })).toMatchObject({ engine: null, unavailable: "preparing", reason: expect.stringContaining("not registered") });
  });

  it("releases Classical, Watercolor and Fresco to readers in public mode, and keeps Icon for the owner", () => {
    expect(PUBLIC_GENERIC_STYLE_IDS).toEqual(["classical", "watercolor", "fresco"]);
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "fresco", readiness: ready })).toEqual({ engine: "generic", reason: "public" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "watercolor", readiness: ready })).toEqual({ engine: "generic", reason: "public" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "icon", readiness: ready })).toMatchObject({ engine: null, unavailable: "style", reason: "The icon art style is temporarily unavailable", retryable: true });
    expect(decideEngine({ mode: "public", isOwner: true, styleId: "icon", readiness: ready })).toEqual({ engine: "generic", reason: "owner-proof" });
    expect(decideEngine({ mode: "public", isOwner: true, styleId: "classical", readiness: ready })).toEqual({ engine: "generic", reason: "public" });
  });
});
