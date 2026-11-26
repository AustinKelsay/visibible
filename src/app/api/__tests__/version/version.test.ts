/* @vitest-environment node */
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../../version/route";

afterEach(() => vi.unstubAllEnvs());

it("answers with the deployment this server runs, never cached", async () => {
  vi.stubEnv("NEXT_DEPLOYMENT_ID", "dpl_new");
  const response = GET();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ version: "dpl_new" });
});

it("answers null without a deployment ID, as in local development", async () => {
  vi.stubEnv("NEXT_DEPLOYMENT_ID", "");
  vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
  expect(await GET().json()).toEqual({ version: null });
});
