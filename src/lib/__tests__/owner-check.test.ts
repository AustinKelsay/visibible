import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasOwnerEngineAccess } from "../engine/owner-check";
import { decideEngine } from "../engine/admission";

const session = { sid: "owner-controlled-paid-session", tier: "paid" };
const digest = createHash("sha256").update(session.sid).digest("hex");

describe("owner production check admission", () => {
  it("admits admins and only the exact configured existing session", () => {
    expect(hasOwnerEngineAccess({ ...session, tier: "admin" }, {})).toBe(true);
    expect(hasOwnerEngineAccess(session, {})).toBe(false);
    expect(hasOwnerEngineAccess(session, { GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256: digest })).toBe(true);
    expect(hasOwnerEngineAccess({ ...session, sid: "another-session" }, { GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256: digest })).toBe(false);
    expect(hasOwnerEngineAccess(null, { GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256: digest })).toBe(false);
  });

  it("fails closed for malformed hashes and cannot override disabled mode or readiness", () => {
    for (const hash of ["", session.sid, digest.slice(1), `${digest},${digest}`, "g".repeat(64)]) {
      expect(hasOwnerEngineAccess(session, { GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256: hash })).toBe(false);
    }
    const isOwner = hasOwnerEngineAccess(session, { GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256: digest });
    expect(decideEngine({ mode: "disabled", isOwner, styleId: "watercolor", readiness: null }).engine).toBeNull();
    expect(decideEngine({ mode: "owner", isOwner, styleId: "watercolor", readiness: null })).toMatchObject({ engine: null, unavailable: "preparing" });
    expect(session.tier).toBe("paid");
  });
});
