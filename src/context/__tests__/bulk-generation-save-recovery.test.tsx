/* @vitest-environment jsdom */

/**
 * Recovering from failed saves and refused stale writes (#552), driven through the real coordinator with Convex stubbed
 * by function name. The rows stand in for bulkGenerationVerses, claim fence included.
 */
import { getFunctionName } from "convex/server";
import { act, useEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BulkGenerationProvider, useBulkGeneration } from "@/context/bulk-generation-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), query: vi.fn() }));
vi.mock("convex/react", () => {
  const client = { query: mocks.query };
  const mutations = new Map();
  return {
    useConvex: () => client,
    useConvexAuth: () => ({ isAuthenticated: true }),
    useQuery: () => useSyncExternalStore(subscribe, getSnapshot),
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref).split(":").at(-1);
      if (!mutations.has(name)) mutations.set(name, (args: Record<string, unknown>) => mocks.mutation(name, args));
      return mutations.get(name);
    },
  };
});
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid: "guest", credits: 100, tier: "paid" }) }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));

const subscribers = new Set<() => void>();
type Job = ReturnType<typeof makeJob>;
let job: Job | undefined;
function makeJob(totalVerses: number) {
  return {
    _id: "bulk-1", status: "active", modelId: "test", aspectRatio: "16:9", resolution: "1K",
    translation: "web", artStyleId: "classical", engine: "generic", totalVerses, completedCount: 0, failedCount: 0,
    skippedCount: 0, totalCreditsUsed: 0, updatedAt: 0, pausedReason: undefined as string | undefined,
  };
}
function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function getSnapshot() { return job; }
function publish(patch: Partial<Job> = {}) {
  job = { ...makeJob(rows.length), ...job, ...patch };
  subscribers.forEach((listener) => listener());
}

let bulk: ReturnType<typeof useBulkGeneration>;
function Probe() {
  const value = useBulkGeneration();
  useEffect(() => { bulk = value; });
  return null;
}
type Row = { verseId: string; reference: string; order: number; status: string; claim: number };
let rows: Row[];
let root: Root;
let retries: Array<() => void>;
let beforeWrite: (name: string, args: Record<string, unknown>) => void;
let completeImage: (response: Response) => void;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  rows = [{ verseId: "verse-0", reference: "Genesis 1:1", order: 0, status: "queued", claim: 0 }];
  job = undefined;
  retries = [];
  beforeWrite = () => {};
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const timeout = window.setTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation(((handler: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 5000) {
      retries.push(() => handler());
      return 0;
    }
    return timeout(handler, delay, ...args);
  }) as typeof window.setTimeout);
  const image = new Promise<Response>((resolve) => { completeImage = resolve; });
  fetchSpy = vi.fn(() => image);
  vi.stubGlobal("fetch", fetchSpy);
  mocks.query.mockReset().mockImplementation(async () => rows.map((row) => ({ ...row })));
  mocks.mutation.mockReset().mockImplementation(async (name, args) => {
    beforeWrite(name, args);
    switch (name) {
      case "updateVerseStatus": {
        const row = rows.find((candidate) => candidate.verseId === args.verseId)!;
        if (row.status !== args.expectedCurrentStatus || (args.claim !== undefined && row.claim !== args.claim)) {
          return { updated: false };
        }
        row.status = args.status;
        if (args.status === "generating") return { updated: true, claim: ++row.claim };
        return { updated: true };
      }
      case "reconcileInterrupted":
        for (const row of rows) {
          if (row.status === "generating") row.status = "queued";
        }
        return { requeued: 1 };
      case "pause":
        return { updated: true };
      default:
        return { updated: true };
    }
  });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const success = () => Response.json({ creditsCost: 2, engine: "generic" });
const writes = (name: string) => mocks.mutation.mock.calls.filter(([called]) => called === name).map(([, args]) => args);

it("outcome write failure stops the run instead of recording a failure for a painted verse", async () => {
  beforeWrite = (name, args) => {
    if (name === "updateVerseStatus" && args.status === "completed") throw new Error("write unavailable");
  };
  await act(async () => publish());
  expect(fetchSpy).toHaveBeenCalledOnce();
  await act(async () => completeImage(success()));

  expect({
    verse: rows[0].status,
    counts: writes("updateProgress").map(({ completedCount, failedCount }) => [completedCount, failedCount]),
    retries: retries.length,
  }).toEqual({ verse: "generating", counts: [], retries: 1 });
});

it("recovers parent progress when the final verse save succeeded and only progress failed", async () => {
  let fail = true;
  beforeWrite = (name) => {
    if (name === "updateProgress" && fail) {
      fail = false;
      throw new Error("write unavailable");
    }
  };
  await act(async () => publish());
  await act(async () => completeImage(success()));
  expect(rows[0].status).toBe("completed");
  expect(retries).toHaveLength(1);
  await act(async () => retries.shift()!());
  expect(fetchSpy).toHaveBeenCalledOnce();
  expect(writes("updateProgress")).toHaveLength(2);
});

it("honors the five-second delay even if a job subscription emits a fresh snapshot", async () => {
  let firstClaim = true;
  beforeWrite = (name, args) => {
    if (name === "updateVerseStatus" && args.status === "generating" && firstClaim) {
      firstClaim = false;
      throw new Error("write unavailable");
    }
  };
  await act(async () => publish());
  expect(retries).toHaveLength(1);
  await act(async () => publish({ updatedAt: 1 }));
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("retries a rejected reconciliation write during save recovery", async () => {
  beforeWrite = (name, args) => {
    if (name === "updateVerseStatus" && args.status === "generating") {
      rows[0].status = "generating";
      throw new Error("claim reply lost");
    }
    if (name === "reconcileInterrupted") throw new Error("write unavailable");
  };
  await act(async () => publish());
  expect(retries).toHaveLength(1);
  await act(async () => retries.shift()!());
  expect(writes("reconcileInterrupted")).toHaveLength(1);
  expect({ restart: retries.length, ownsLock: localStorage.getItem("bulk-gen-lock-bulk-1") !== null })
    .toEqual({ restart: 1, ownsLock: false });
});

it("does not pause the replacement tab's job after an obsolete requeue is refused", async () => {
  await act(async () => publish());
  expect(rows[0].claim).toBe(1);
  rows[0].claim = 2;
  localStorage.setItem("bulk-gen-lock-bulk-1", JSON.stringify({ owner: "replacement-tab", expiresAt: Date.now() + 15_000 }));
  await act(async () => completeImage(Response.json({ error: "Insufficient credits" }, { status: 402 })));
  expect(rows[0]).toMatchObject({ claim: 2, status: "generating" });
  expect(writes("pause")).toHaveLength(0);
});

it("does not count an obsolete completion refused by the verse claim fence", async () => {
  await act(async () => publish());
  expect(rows[0].claim).toBe(1);
  rows[0].claim = 2;
  localStorage.setItem("bulk-gen-lock-bulk-1", JSON.stringify({ owner: "replacement-tab", expiresAt: Date.now() + 15_000 }));
  await act(async () => completeImage(success()));
  expect(rows[0]).toMatchObject({ claim: 2, status: "generating" });
  expect(writes("updateProgress")).toHaveLength(0);
});

it("shows the same action status and message after reloading a paused job", async () => {
  await act(async () => publish());
  await act(async () => completeImage(Response.json({
    error: "Engine binding changed",
    message: "This request is bound to the generic engine, which is not admitting new work right now.",
  }, { status: 409 })));
  const live = { status: bulk.state.status, message: bulk.state.errorMessage };
  expect(live.status).toBe("blocked");
  await act(async () => root.unmount());
  await act(async () => publish({ status: "paused", pausedReason: "engine_unavailable" }));
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  expect({ status: bulk.state.status, message: bulk.state.errorMessage }).toEqual(live);
});
