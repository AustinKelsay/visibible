/* @vitest-environment jsdom */

/**
 * A chapter job meeting an image outage (#546): it pauses with the verse back in the queue, resumes under that verse's
 * next request id while every other verse keeps its own, and a job stopped while the request was out stays stopped.
 */
import { act, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { getFunctionName } from "convex/server";
import { expect, it, vi } from "vitest";
import { BulkGenerationProvider, useBulkGeneration } from "@/context/bulk-generation-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { store } = vi.hoisted(() => ({
  store: {
    job: undefined as Record<string, unknown> | undefined,
    verses: [] as Array<Record<string, unknown>>,
    listeners: new Set<() => void>(),
  },
}));
const jobId = "bulk-1";
const queue = [
  { verseId: "genesis-1-1", reference: "Genesis 1:1", order: 0 },
  { verseId: "genesis-1-2", reference: "Genesis 1:2", order: 1 },
];
const getJob = () => store.job;
const getActiveJob = () => store.job?.status === "cancelled" ? null : store.job;
const subscribe = (listener: () => void) => {
  store.listeners.add(listener);
  return () => { store.listeners.delete(listener); };
};
function patchJob(patch: Record<string, unknown>) {
  store.job = { ...store.job, ...patch };
  for (const listener of store.listeners) listener();
}

const convex = { query: async () => store.verses.map((row) => ({ ...row })) };
type ConvexReference = Parameters<typeof getFunctionName>[0];
function mutate(ref: ConvexReference) {
  return async (args: Record<string, unknown>) => {
    switch (getFunctionName(ref)) {
      case "bulkGenerations:create": {
        store.verses = queue.map((row) => ({ ...row, status: "queued" }));
        const counters = { totalVerses: 2, completedCount: 0, failedCount: 0, skippedCount: 0, totalCreditsUsed: 0 };
        patchJob({ ...args, ...counters, _id: jobId, status: "active" });
        return { ...counters, bulkId: jobId, status: "active", created: true };
      }
      case "bulkGenerations:updateVerseStatus": {
        const verse = store.verses.find((row) => row.verseId === args.verseId)!;
        if (verse.status !== args.expectedCurrentStatus) return { updated: false };
        if (args.status === "generating" && store.job?.status !== "active") return { updated: false };
        verse.status = args.status;
        if (args.spentRequest) verse.attempt = Number(verse.attempt ?? 0) + 1;
        return { updated: true };
      }
      case "bulkGenerations:cancel":
        patchJob({ status: "cancelled" });
        return { updated: true };
      case "bulkGenerations:pause":
        if (store.job?.status !== "active") return { updated: false };
        patchJob({ status: "paused", pausedReason: args.reason });
        return { updated: true };
      case "bulkGenerations:resume":
        if (store.job?.status !== "paused") return { updated: false };
        patchJob({ status: "active", pausedReason: undefined });
        return { updated: true };
      case "bulkGenerations:updateProgress":
        patchJob({
          ...args,
          ...(Number(args.completedCount) + Number(args.failedCount) >= 2 ? { status: "completed" } : {}),
        });
        return { updated: true };
      default: return { updated: true };
    }
  };
}
const mutations = new Map<string, ReturnType<typeof mutate>>();
vi.mock("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: (ref: ConvexReference) => {
    const name = getFunctionName(ref);
    if (!mutations.has(name)) mutations.set(name, mutate(ref));
    return mutations.get(name);
  },
  useQuery: (ref: ConvexReference, args: unknown) => useSyncExternalStore(
    subscribe,
    args === "skip" ? () => undefined : getFunctionName(ref) === "bulkGenerations:getActive" ? getActiveJob : getJob,
  ),
}));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid: "guest", credits: 100 }) }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));

let controls: ReturnType<typeof useBulkGeneration>;
function Probe() {
  const bulk = useBulkGeneration();
  useEffect(() => { controls = bulk; }, [bulk]);
  return null;
}

async function runFixture(check: (sent: string[], outage: () => void) => Promise<void>) {
  store.job = undefined;
  store.verses = [];
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  const sent: string[] = [];
  let resolveFirst!: (value: Response) => void;
  const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).requestId);
    if (sent.length === 1) return first;
    return new Response(JSON.stringify({ creditsCost: 2 }), { status: 200 });
  }));
  const outage = () => resolveFirst(new Response(JSON.stringify({
    error: "Images are temporarily unavailable", message: "No credits were used. Please try again later.", retryable: false,
  }), { status: 503 }));
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
    await act(async () => controls.startBulkGeneration({
      scope: { type: "chapters", count: 1 }, scopeLabel: "Genesis 1", estimatedTotalCredits: 4,
      queue, modelId: "test-model", aspectRatio: "16:9", resolution: "1K", translation: "web",
    }));
    expect(sent).toEqual(["bulk-bulk-1-0"]);
    await check(sent, outage);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
}

it("stays stopped when a request out at Stop comes back as an outage", async () => {
  await runFixture(async (sent, outage) => {
    await act(async () => controls.cancelBulkGeneration());
    expect(controls.state.status).toBe("cancelled");
    await act(async () => outage());
    expect(store.job?.status).toBe("cancelled");
    expect(sent).toEqual(["bulk-bulk-1-0"]);
    expect(controls.state.status).toBe("cancelled");
  });
});

it("pauses on an outage and resumes under the verse's next id, keeping the next verse's own", async () => {
  await runFixture(async (sent, outage) => {
    await act(async () => outage());
    expect(store.job?.status).toBe("paused");
    expect(sent).toEqual(["bulk-bulk-1-0"]);
    await act(async () => controls.resumeBulkGeneration());
    expect(sent).toEqual(["bulk-bulk-1-0", "bulk-bulk-1-0-a1", "bulk-bulk-1-1"]);
  });
});
