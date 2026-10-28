/** Engine admission policy (#174): switches, owner proof, readiness gate, rollback and accepted requests. */
import { describe, it, expect } from "vitest";
import { decideEngine, genericEngineMode, legacyEngineRetired, PUBLIC_GENERIC_STYLE_IDS } from "../engine/admission";

const ready = { ready: true, reasons: [], activeGeneration: 3, briefVersion: "bv" };
const unready = { ready: false, reasons: ["no active analysis generation"], activeGeneration: null, briefVersion: "bv" };

describe("engine admission", () => {
  it("is disabled by default and reads only the three known modes", () => {
    expect(genericEngineMode({})).toBe("disabled");
    expect(genericEngineMode({ GENERIC_ENGINE_MODE: "Public " })).toBe("public");
    expect(genericEngineMode({ GENERIC_ENGINE_MODE: "owner" })).toBe("owner");
    expect(genericEngineMode({ GENERIC_ENGINE_MODE: "yes" })).toBe("disabled");
  });

  it("keeps Classical on legacy when disabled and reports other styles unavailable without touching preferences", () => {
    expect(decideEngine({ mode: "disabled", isOwner: true, styleId: null, readiness: ready })).toEqual({ engine: "legacy", reason: "disabled" });
    expect(decideEngine({ mode: "disabled", isOwner: false, styleId: "classical", readiness: ready })).toEqual({ engine: "legacy", reason: "disabled" });
    expect(decideEngine({ mode: "disabled", isOwner: false, styleId: "watercolor", readiness: ready })).toMatchObject({ engine: null, unavailable: "style", retryable: true });
  });

  it("admits only a verified owner in owner mode, and only when the work is ready", () => {
    expect(decideEngine({ mode: "owner", isOwner: true, styleId: "icon", readiness: ready })).toEqual({ engine: "generic", reason: "owner-proof" });
    expect(decideEngine({ mode: "owner", isOwner: true, styleId: "classical", readiness: unready })).toMatchObject({ engine: null, unavailable: "preparing", reason: expect.stringContaining("no active analysis generation") });
    expect(decideEngine({ mode: "owner", isOwner: false, styleId: "classical", readiness: ready })).toEqual({ engine: "legacy", reason: "not-owner" });
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
    // Disabled: Fresco, like Watercolor, has no legacy engine.
    expect(decideEngine({ mode: "disabled", isOwner: false, styleId: "fresco", readiness: ready })).toMatchObject({ engine: null, unavailable: "style" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "watercolor", readiness: ready })).toEqual({ engine: "generic", reason: "public" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "icon", readiness: ready })).toMatchObject({ engine: null, unavailable: "style", reason: "The icon art style is temporarily unavailable", retryable: true });
    expect(decideEngine({ mode: "public", isOwner: true, styleId: "icon", readiness: ready })).toEqual({ engine: "generic", reason: "owner-proof" });
    expect(decideEngine({ mode: "public", isOwner: true, styleId: "classical", readiness: ready })).toEqual({ engine: "generic", reason: "public" });
  });

  it("after the legacy retirement cutoff admits nothing new on legacy, keeps accepted requests, and leaves the generic engine unchanged", () => {
    expect(legacyEngineRetired({})).toBe(false);
    expect(legacyEngineRetired({ LEGACY_ENGINE: " Retired " })).toBe(true);
    expect(legacyEngineRetired({ LEGACY_ENGINE: "yes" })).toBe(false);
    expect(decideEngine({ mode: "disabled", isOwner: false, styleId: "classical", readiness: ready, legacyRetired: true })).toMatchObject({ engine: null, unavailable: "style", retryable: true });
    expect(decideEngine({ mode: "owner", isOwner: false, styleId: null, readiness: ready, legacyRetired: true })).toMatchObject({ engine: null, unavailable: "style" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "classical", readiness: ready, legacyRetired: true })).toEqual({ engine: "generic", reason: "public" });
    expect(decideEngine({ mode: "public", isOwner: false, styleId: "classical", readiness: ready, legacyRetired: true, existingEngine: "legacy" })).toEqual({ engine: "legacy", reason: "accepted" });
  });

  it("never switches an accepted request, whatever the switches say now", () => {
    expect(decideEngine({ mode: "disabled", isOwner: false, styleId: "icon", readiness: null, existingEngine: "generic" })).toEqual({ engine: "generic", reason: "accepted" });
    expect(decideEngine({ mode: "public", isOwner: true, styleId: "classical", readiness: ready, existingEngine: "legacy" })).toEqual({ engine: "legacy", reason: "accepted" });
  });
});
