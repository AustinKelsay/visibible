/* @vitest-environment jsdom */

/**
 * Save recovery against the reader's Pause and Stop, and against overlapping snapshots (#552): a failed automatic pause
 * starts the job again, a recovery waits out its delay, a pending Pause or Stop holds every recovery write, and one
 * settlement at a time holds the run lock. Convex is stubbed by function name; the rows stand in for
 * bulkGenerationVerses, claim fence included.
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
let retries: Map<number, () => void>;

async function nextRetry() {
  const timer = retries.entries().next().value;
  if (!timer) throw new Error("No retry is scheduled");
  const [id, callback] = timer;
  retries.delete(id);
  await act(async () => callback());
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
type WriteArgs = Record<string, unknown> & Partial<Record<"verseId" | "status" | "expectedCurrentStatus" | "reason", string>> & { claim?: number; completedCount?: number; failedCount?: number; skippedCount?: number };
let beforeWrite: (name: string, args: WriteArgs) => void | Promise<void>;
let completeImage: (response: Response) => void;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  rows = [{ verseId: "verse-0", reference: "Genesis 1:1", order: 0, status: "queued", claim: 0 }];
  job = undefined;
  retries = new Map();
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
  const clearTimeout = window.clearTimeout.bind(window);
  let nextId = 100_000;
  vi.spyOn(window, "clearTimeout").mockImplementation(((id?: number) => {
    if (!retries.delete(Number(id))) clearTimeout(id);
  }) as typeof window.clearTimeout);
  vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 5000) {
      const id = nextId++;
      retries.set(id, () => (handler as () => void)());
      return id;
    }
    return timeout(handler, delay, ...args);
  }) as typeof window.setTimeout);
  const image = new Promise<Response>((resolve) => { completeImage = resolve; });
  fetchSpy = vi.fn(() => image);
  vi.stubGlobal("fetch", fetchSpy);
  mocks.query.mockReset().mockImplementation(async () => rows.map((row) => ({ ...row })));
  mocks.mutation.mockReset().mockImplementation(async (name: string, args: WriteArgs) => {
    await beforeWrite(name, args);
    switch (name) {
      case "updateVerseStatus": {
        const row = rows.find((candidate) => candidate.verseId === args.verseId)!;
        if (row.status !== args.expectedCurrentStatus || (args.claim !== undefined && row.claim !== args.claim)) {
          return { updated: false };
        }
        row.status = args.status!;
        if (args.status === "generating") return { updated: true, claim: ++row.claim };
        return { updated: true };
      }
      case "reconcileInterrupted":
        for (const row of rows) {
          if (row.status === "generating") row.status = "queued";
        }
        return { requeued: 1 };
      case "pause":
        if (job?.status === "paused" && args.reason) {
          publish({ pausedReason: args.reason });
          return { updated: true };
        }
        if (job?.status !== "active") return { updated: false };
        publish({ status: "paused", pausedReason: args.reason });
        return { updated: true };
      case "cancel":
        publish({ status: "cancelled" });
        return { updated: true };
      case "updateProgress":
        if (job?.status === "cancelled") return;
        publish({ ...args, status: (args.completedCount ?? 0) + (args.failedCount ?? 0) + (args.skippedCount ?? 0) >= rows.length ? "completed" : job?.status });
        return;
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

it.each(["requeue", "pause"])("restarts after a rejected %s write in the automatic pause", async (write) => {
  beforeWrite = (name, args) => {
    if ((write === "requeue" && name === "updateVerseStatus" && args.status === "queued")
      || (write === "pause" && name === "pause")) throw new Error("write unavailable");
  };
  await act(async () => publish());
  await act(async () => completeImage(Response.json({ error: "Insufficient credits" }, { status: 402 })));

  expect({ job: job?.status, ui: bulk.state.status, retries: retries.size })
    .toEqual({ job: "active", ui: "active", retries: 1 });
});

it("waits five seconds before retrying a failed final progress write", async () => {
  beforeWrite = (name) => {
    if (name === "updateProgress") throw new Error("write unavailable");
  };
  await act(async () => publish());
  await act(async () => completeImage(success()));
  expect(writes("updateProgress")).toHaveLength(1);
  expect(retries.size).toBe(1);

  await act(async () => publish({ updatedAt: 1 }));
  expect(writes("updateProgress")).toHaveLength(1);
  await nextRetry();
  expect(writes("updateProgress")).toHaveLength(2);
});

it("waits five seconds before reconciling a claim whose reply was lost", async () => {
  beforeWrite = (name, args) => {
    if (name === "updateVerseStatus" && args.status === "generating") {
      rows[0].status = "generating";
      rows[0].claim++;
      throw new Error("claim reply lost");
    }
  };
  await act(async () => publish());
  expect(retries.size).toBe(1);
  await act(async () => publish({ updatedAt: 1 }));
  expect(writes("reconcileInterrupted")).toHaveLength(0);
  await nextRetry();
  expect(writes("reconcileInterrupted")).toHaveLength(1);
});

it("a successfully stopped job with an interrupted claim stays cancelled through the retry window", async () => {
  beforeWrite = (name, args) => {
    if (name === "updateVerseStatus" && args.status === "generating") {
      rows[0].status = "generating";
      rows[0].claim++;
      throw new Error("claim reply lost");
    }
    if (name === "reconcileInterrupted") throw new Error("write unavailable");
  };
  await act(async () => publish());
  expect(retries.size).toBe(1);
  await act(async () => bulk.cancelBulkGeneration());
  expect(job?.status).toBe("cancelled");
  expect(bulk.state.status).toBe("cancelled");
  for (let i = 0; i < 4 && retries.size > 0; i++) await nextRetry();

  expect({ status: bulk.state.status, savePaused: writes("pause").length, images: fetchSpy.mock.calls.length })
    .toEqual({ status: "cancelled", savePaused: 0, images: 0 });
});

it("shows the canonical reason when another tab adds it to a manually paused job", async () => {
  await act(async () => publish({ status: "paused" }));
  expect(bulk.state).toMatchObject({ status: "paused", errorMessage: null });
  await act(async () => publish({ pausedReason: "engine_unavailable" }));
  const live = { status: bulk.state.status, message: bulk.state.errorMessage };
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  const reloaded = { status: bulk.state.status, message: bulk.state.errorMessage };
  expect(live).toEqual(reloaded);
});

it("a fresh snapshot during reconciliation cannot start a second reconciliation or release its lease", async () => {
  rows[0].status = "generating";
  const first = deferred();
  const second = deferred();
  let reconciliations = 0;
  beforeWrite = (name) => {
    if (name === "reconcileInterrupted") return ++reconciliations === 1 ? first.promise : second.promise;
  };
  await act(async () => publish());
  expect(reconciliations).toBe(1);
  await act(async () => publish({ updatedAt: 1 }));
  await act(async () => first.resolve());
  const lockHeld = localStorage.getItem("bulk-gen-lock-bulk-1") !== null;
  await act(async () => second.resolve());

  expect({ reconciliations, lockHeld }).toEqual({ reconciliations: 1, lockHeld: true });
});

it("does not submit a new image when Stop is pending before a reconciliation retry starts", async () => {
  rows[0].status = "generating";
  const stop = deferred();
  let failFirstReconciliation = true;
  beforeWrite = (name) => {
    if (name === "reconcileInterrupted" && failFirstReconciliation) {
      failFirstReconciliation = false;
      throw new Error("reconcile unavailable");
    }
    if (name === "cancel") return stop.promise;
  };
  await act(async () => publish());
  expect(retries.size).toBe(1);
  let stopping!: Promise<void>;
  await act(async () => { stopping = bulk.cancelBulkGeneration(); });
  expect(writes("cancel")).toHaveLength(1);
  await nextRetry();
  const premature = { claims: writes("updateVerseStatus").length, images: fetchSpy.mock.calls.length };
  await act(async () => { stop.resolve(); await stopping; });

  expect(premature).toEqual({ claims: 0, images: 0 });
});

it("does not submit a new image when Pause is pending and reconciliation publishes progress", async () => {
  rows[0].status = "generating";
  rows.push({ verseId: "verse-1", reference: "Genesis 1:2", order: 1, status: "generating", claim: 1 });
  const pause = deferred();
  let failFirstReconciliation = true;
  beforeWrite = (name) => {
    if (name === "reconcileInterrupted") {
      if (failFirstReconciliation) {
        failFirstReconciliation = false;
        throw new Error("reconcile unavailable");
      }
      rows[0].status = "completed";
      rows[1].status = "queued";
      publish({ completedCount: 1, totalCreditsUsed: 2, updatedAt: 1 });
    }
    if (name === "pause") return pause.promise;
  };
  await act(async () => publish());
  expect(retries.size).toBe(1);
  let pausing!: Promise<void>;
  await act(async () => { pausing = bulk.pauseBulkGeneration(); });
  expect(writes("pause")).toHaveLength(1);
  await nextRetry();
  const premature = { claims: writes("updateVerseStatus").length, images: fetchSpy.mock.calls.length };
  await act(async () => { pause.resolve(); await pausing; });

  expect(premature).toEqual({ claims: 0, images: 0 });
});
