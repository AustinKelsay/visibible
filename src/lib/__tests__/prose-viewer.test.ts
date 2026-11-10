import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { value: undefined as string | undefined };
const getSession = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }) }));
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => ({ query: getSession }),
  getConvexServerSecret: () => "test-server-secret",
}));

describe("the prose owner check", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "a".repeat(32));
    vi.stubEnv("IP_HASH_SECRET", "b".repeat(32));
    vi.stubEnv("CONVEX_SERVER_SECRET", "test-server-secret");
    cookieStore.value = undefined;
    getSession.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("admits only a verified cookie whose current session is an admin, and never writes", async () => {
    const { isOwnerViewer } = await import("@/lib/works/viewer");
    const { createSessionToken } = await import("@/lib/session");

    expect(await isOwnerViewer()).toBe(false);
    cookieStore.value = "forged.token.value";
    expect(await isOwnerViewer()).toBe(false);
    expect(getSession).not.toHaveBeenCalled();

    cookieStore.value = await createSessionToken("owner-sid", "ip");
    getSession.mockResolvedValue({ sid: "owner-sid", tier: "admin" });
    expect(await isOwnerViewer()).toBe(true);
    expect(getSession).toHaveBeenLastCalledWith(expect.anything(), { sid: "owner-sid", serverSecret: "test-server-secret" });

    getSession.mockResolvedValue({ sid: "owner-sid", tier: "paid" });
    expect(await isOwnerViewer()).toBe(false);
    // A revoked or missing session reads as null; a failing lookup is not the owner either.
    getSession.mockResolvedValue(null);
    expect(await isOwnerViewer()).toBe(false);
    getSession.mockRejectedValue(new Error("down"));
    expect(await isOwnerViewer()).toBe(false);
  });
});
