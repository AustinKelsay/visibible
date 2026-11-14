import { expect, it, vi } from "vitest";

const constructed: Array<{ url: string; options: Record<string, unknown> }> = [];
vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: () => null,
  ConvexReactClient: class {
    constructor(url: string, options: Record<string, unknown>) { constructed.push({ url, options }); }
  },
}));
vi.mock("@/lib/use-guest-auth", () => ({ useGuestAuth: () => ({}) }));

// The package's default leeway (10 seconds since convex 1.32) makes the client ask for a new guest token over and over
// in the session cookie's last seconds, where every token is as short as the time left.
it("keeps the guest token refresh leeway at two seconds", async () => {
  await import("@/components/convex-client-provider");
  expect(constructed).toHaveLength(1);
  expect(constructed[0].options.authRefreshTokenLeewaySeconds).toBe(2);
});
