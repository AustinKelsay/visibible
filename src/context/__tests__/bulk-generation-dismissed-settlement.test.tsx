/* @vitest-environment jsdom */

/**
 * A chapter dismissed with Done while its settlement of interrupted verses is still out (#552): the settlement's late
 * reply starts no sync for the next chapter, so that chapter's failed progress write keeps its 5 s wait and its limit.
 */
import { getFunctionName } from "convex/server";
import { act, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BulkGenerationProvider, useBulkGeneration } from "@/context/bulk-generation-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const io = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
vi.mock("convex/react", () => {
  const client = { query: io.query };
  const mutations = new Map();
  return {
    useConvex: () => client,
    useConvexAuth: () => ({ isAuthenticated: true }),
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: "skip" | { id?: string }) => {
      const name = getFunctionName(ref).split(":").at(-1);
      return useSyncExternalStore(subscribe, () => {
        if (args === "skip") return undefined;
        if (name === "get") return jobs.get(args.id!);
        return Array.from(jobs.values()).find(({ status }) => status === "active" || status === "paused");
      });
    },
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref).split(":").at(-1);
      if (!mutations.has(name)) mutations.set(name, (args: unknown) => io.mutate(name, args));
      return mutations.get(name);
    },
  };
});
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid: "guest", credits: 100, tier: "paid" }) }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));

const listeners = new Set<() => void>();
const jobs = new Map<string, ReturnType<typeof makeJob>>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function makeJob(_id: string, status: string, pausedReason?: string) {
  return {
    _id, status, pausedReason, modelId: "test", aspectRatio: "16:9", resolution: "1K",
    translation: "web", artStyleId: "classical", engine: "generic", totalVerses: 1, completedCount: 0,
    failedCount: 0, skippedCount: 0, totalCreditsUsed: 0,
  };
}
function publish(id: string, status: string, pausedReason?: string) {
  jobs.set(id, makeJob(id, status, pausedReason));
  listeners.forEach((listener) => listener());
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { resolve, promise };
}

it("a dismissed chapter's late settlement preserves the next chapter's progress retry delay and limit", async () => {
  const oldSettlement = deferred();
  const retiredFollowUp = deferred();
  const firstProgress = deferred();
  const oldRow = { verseId: "old-verse", reference: "Genesis 1:1", order: 0, status: "generating", claim: 1 };
  const newRow = { verseId: "new-verse", reference: "Genesis 2:1", order: 0, status: "completed", claim: 1, creditsCost: 2 };
  let oldReads = 0;
  io.query.mockImplementation(async (_ref: unknown, { bulkGenerationId }: { bulkGenerationId: string }) => {
    if (bulkGenerationId === "old") {
      if (++oldReads > 1) await retiredFollowUp.promise;
      return [{ ...oldRow }];
    }
    return [{ ...newRow }];
  });
  let progressWrites = 0;
  io.mutate.mockImplementation(async (name: string, { id, reason }: { id: string; reason: string }) => {
    if (name === "reconcileInterrupted" && id === "old") {
      await oldSettlement.promise;
      oldRow.status = "queued";
      return { requeued: 1 };
    }
    if (name === "updateProgress" && id === "new") {
      progressWrites++;
      await firstProgress.promise;
      throw new Error("could not save counters");
    }
    if (name === "pause" && id === "new") {
      publish("new", "paused", reason);
      return { updated: true };
    }
    throw new Error("unexpected mutation " + name);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  const retries = new Map<number, () => void>();
  let timerId = 100_000;
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay !== 5000) return nativeSetTimeout(handler, delay, ...args);
    retries.set(++timerId, handler as () => void);
    return timerId;
  }) as typeof window.setTimeout);
  vi.spyOn(window, "clearTimeout").mockImplementation(((id?: number) => {
    if (!retries.delete(Number(id))) nativeClearTimeout(id);
  }) as typeof window.clearTimeout);
  let bulk!: ReturnType<typeof useBulkGeneration>;
  function Probe() {
    const value = useBulkGeneration();
    useEffect(() => { bulk = value; });
    return null;
  }
  const root = createRoot(document.createElement("div"));

  try {
    await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
    await act(async () => publish("old", "active"));
    expect(io.mutate).toHaveBeenCalledWith("reconcileInterrupted", { sid: "guest", id: "old" });
    // A second client stops Old and paints New, but New's final counters fail to save.
    // This client keeps displaying Old through the explicit by-ID subscription.
    await act(async () => publish("old", "cancelled"));
    await act(async () => publish("new", "active"));
    expect(bulk.state.bulkId).toBe("old");
    expect(bulk.state.status).toBe("cancelled");
    await act(async () => bulk.dismissBulkGeneration());
    expect(bulk.state.bulkId).toBe("new");
    expect(progressWrites).toBe(1);

    // The old mutation returns before the successor's mutation fails, respecting Convex's per-client order.
    await act(async () => oldSettlement.resolve());
    await act(async () => firstProgress.resolve());
    const writesBeforeRetry = progressWrites;
    await act(async () => retiredFollowUp.resolve());

    for (let i = 0; i < 4 && retries.size > 0; i++) {
      const [id, callback] = retries.entries().next().value!;
      retries.delete(id);
      await act(async () => callback());
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bulk.state.status).toBe("blocked");
    expect({ writesBeforeRetry, totalProgressWrites: progressWrites }).toEqual({
      writesBeforeRetry: 1,
      totalProgressWrites: 4,
    });
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
