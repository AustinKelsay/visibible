/* @vitest-environment jsdom */

/**
 * A bulk job's items are automatic generation (#60): no guest accepts a quote for each verse, so each request tells
 * the server so, and the server quotes it and requires the whole estimate.
 */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BulkGenerationProvider, useBulkGeneration } from "@/context/bulk-generation-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One mutation stub for every Convex function the job uses: creating the job answers with the job, the rest succeed.
const mutation = vi.fn(async (args: Record<string, unknown>) => "verses" in args
  ? { created: true, status: "active", bulkId: "bulk-1", totalVerses: 2, completedCount: 0, failedCount: 0, skippedCount: 0, totalCreditsUsed: 0 }
  : { updated: true });
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => mutation,
  useQuery: () => undefined,
}));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid: "guest", credits: 100 }) }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));

let start: ReturnType<typeof useBulkGeneration>["startBulkGeneration"];
let status = "";
function Probe() {
  const bulk = useBulkGeneration();
  useEffect(() => { start = bulk.startBulkGeneration; status = bulk.state.status; });
  return null;
}

const sent: Array<Record<string, unknown>> = [];
beforeEach(() => {
  sent.length = 0;
  mutation.mockClear();
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  // The job's cross-tab run lock lives in localStorage.
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ creditsCost: 2, engine: "generic", imageUrl: "https://example.com/i.png" }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

it("submits each bulk item as automatic generation with its stable request id, and completes the job", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  await act(async () => {
    await start({
      scope: { type: "chapter" } as never, scopeLabel: "Genesis 1", estimatedTotalCredits: 4,
      queue: [{ verseId: "genesis-1-1", reference: "Genesis 1:1", order: 0 }, { verseId: "genesis-1-2", reference: "Genesis 1:2", order: 1 }] as never,
      modelId: "test-model", aspectRatio: "16:9", resolution: "1K", translation: "web",
    });
  });
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  await act(async () => { await vi.waitFor(() => expect(status).toBe("completed")); });
  expect(sent).toMatchObject([
    { automatic: true, reference: "Genesis 1:1", requestId: "bulk-bulk-1-0", style: "classical" },
    // The first accepted item binds the job to its engine.
    { automatic: true, reference: "Genesis 1:2", requestId: "bulk-bulk-1-1", engine: "generic" },
  ]);
  for (const request of sent) expect(request).not.toHaveProperty("quoteId");
  await act(async () => root.unmount());
});
