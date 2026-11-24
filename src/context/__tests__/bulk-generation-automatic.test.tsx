/* @vitest-environment jsdom */

/**
 * A bulk job's items are automatic generation (#60): no guest accepts a quote for each verse, so each request tells
 * the server so, and the server quotes it and requires the whole estimate.
 */

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BulkGenerationProvider, useBulkGeneration } from "@/context/bulk-generation-context";
import { offerAdvancedSettings, resetAdvancedSettingsForTests, setAdvancedSetting } from "@/lib/advanced-settings";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-models";

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

it("paints with the reader's Advanced image settings when the caller names none", async () => {
  resetAdvancedSettingsForTests();
  offerAdvancedSettings("aspectRatio");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  await act(async () => { setAdvancedSetting("aspectRatio", "21:9"); });
  await act(async () => {
    await start({
      scope: { type: "chapters", count: 1 }, scopeLabel: "Unpainted verses of Genesis 1", estimatedTotalCredits: 4,
      queue: [{ verseId: "genesis-1-1", reference: "Genesis 1:1", order: 0 }, { verseId: "genesis-1-2", reference: "Genesis 1:2", order: 1 }],
      translation: "web",
    });
  });
  expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ modelId: DEFAULT_IMAGE_MODEL, aspectRatio: "21:9", resolution: "1K" }));
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[0]).toMatchObject({ model: DEFAULT_IMAGE_MODEL, aspectRatio: "21:9", resolution: "1K" });
  await act(async () => root.unmount());
});

// #530: a chapter is painted four verses at a time, through rate limits and the provider's pushback.
const queueOf = (count: number) => Array.from({ length: count }, (_, order) => ({ verseId: `genesis-1-${order + 1}`, reference: `Genesis 1:${order + 1}`, order }));
const reply = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const painted = () => reply(200, { creditsCost: 2, engine: "generic", imageUrl: "https://example.com/i.png" });
// Each poll flushes React with an empty act, so the job's state is seen as soon as it changes.
const settlesTo = (expected: string) => vi.waitFor(async () => {
  await act(async () => {});
  expect(status).toBe(expected);
});
async function paint(count: number) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  await act(async () => {
    await start({
      scope: { type: "chapters", count: 1 }, scopeLabel: "Unpainted verses of Genesis 1", estimatedTotalCredits: count * 2,
      queue: queueOf(count), modelId: "test-model", aspectRatio: "16:9", resolution: "1K", translation: "web",
    });
  });
  return root;
}

it("paints four verses at once and sends each verse once", async () => {
  let active = 0;
  let peak = 0;
  const waiting: Array<() => void> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => waiting.push(resolve));
    active--;
    return painted();
  }));
  const root = await paint(6);
  // The first verse goes alone and binds the job's engine; then four go at once, bound to it.
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  waiting.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(sent).toHaveLength(5));
  expect(peak).toBe(4);
  expect(sent.slice(1).every((request) => request.engine === "generic")).toBe(true);
  await vi.waitFor(() => {
    waiting.splice(0).forEach((resolve) => resolve());
    expect(sent).toHaveLength(6);
  });
  waiting.splice(0).forEach((resolve) => resolve());
  await settlesTo("completed");
  expect(peak).toBe(4);
  expect(sent.map((request) => request.requestId).sort()).toEqual([0, 1, 2, 3, 4, 5].map((order) => `bulk-bulk-1-${order}`).sort());
  await act(async () => root.unmount());
});

const pauseReasons = () => mutation.mock.calls.map(([args]) => args.reason).filter(Boolean);

it("waits out the site's rate limit and sends the same request again, without pausing", async () => {
  const answers = [reply(429, { error: "Rate limit exceeded", retryAfter: 0.01 }), painted()];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return answers.shift() ?? painted();
  }));
  const root = await paint(1);
  await settlesTo("completed");
  expect(sent.map((request) => request.requestId)).toEqual(["bulk-bulk-1-0", "bulk-bulk-1-0"]);
  expect(pauseReasons()).toEqual([]);
  await act(async () => root.unmount());
});

it("pauses for the daily spending limit with its own reason, not as a rate limit", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return reply(429, { error: "Daily spending limit exceeded", dailyLimit: 5 });
  }));
  const root = await paint(3);
  await settlesTo("blocked");
  expect(sent).toHaveLength(1);
  expect(pauseReasons()).toEqual(["daily_limit"]);
  await act(async () => root.unmount());
});

it("pauses rather than failing every verse when pictures can't be made at all", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return reply(503, { error: "Image service unavailable", message: "Pictures can't be made right now. Please try again later.", retryable: false });
  }));
  const root = await paint(3);
  await settlesTo("blocked");
  expect(sent).toHaveLength(1);
  expect(pauseReasons()).toEqual(["provider_unavailable"]);
  expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ verseId: "genesis-1-1", status: "failed", error: "Image service unavailable" }));
  await act(async () => root.unmount());
});

it("tries a verse refused for credits again once the others' holds settle, and pauses only when it is alone", async () => {
  let refusedOnce = false;
  let releaseThird: (() => void) | null = null;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    sent.push(request);
    if (request.reference === "Genesis 1:2" && !refusedOnce) {
      refusedOnce = true;
      return reply(402, { error: "Insufficient credits" });
    }
    if (request.reference === "Genesis 1:3") await new Promise<void>((resolve) => { releaseThird = resolve; });
    return painted();
  }));
  const root = await paint(3);
  // Genesis 1:2 is refused while Genesis 1:3 still holds credits; it waits for that verse rather than pausing the job.
  await vi.waitFor(() => expect(refusedOnce && releaseThird).toBeTruthy());
  expect(sent.filter((request) => request.reference === "Genesis 1:2")).toHaveLength(1);
  releaseThird!();
  await settlesTo("completed");
  expect(sent.map((request) => request.reference)).toEqual(["Genesis 1:1", "Genesis 1:2", "Genesis 1:3", "Genesis 1:2"]);
  expect(pauseReasons()).toEqual([]);
  await act(async () => root.unmount());
});

it("pauses for credits when a verse painting alone is refused", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return reply(402, { error: "Insufficient credits" });
  }));
  const root = await paint(3);
  await settlesTo("paused");
  expect(sent).toHaveLength(1);
  expect(pauseReasons()).toEqual(["credits"]);
  await act(async () => root.unmount());
});
