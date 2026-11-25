/* @vitest-environment jsdom */

/**
 * Painting four verses at once (#530): stopping, binding, credits, pause messages and the run lock with workers in
 * flight. Each case drives the real coordinator with a stubbed image route and Convex.
 */
import { act, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BulkGenerationProvider, useBulkGeneration } from "@/context/bulk-generation-context";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  client: { query: vi.fn() },
  tier: "paid" as "paid" | "admin",
}));
vi.mock("convex/react", () => ({
  useConvex: () => mocks.client,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => mocks.mutation,
  useQuery: () => useSyncExternalStore(subscribe, getServerJob),
}));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid: "guest", credits: 100, tier: mocks.tier }) }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));

let serverJob: Record<string, unknown> | undefined;
const subscribers = new Set<() => void>();
function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function getServerJob() { return serverJob; }
function publishServerJob(overrides: Record<string, unknown>) {
  serverJob = {
    _id: "bulk-1", status: "paused", modelId: "test", aspectRatio: "16:9",
    resolution: "1K", translation: "web", artStyleId: "classical", engine: "generic",
    totalVerses: 4, completedCount: 1, failedCount: 1, skippedCount: 0, totalCreditsUsed: 2,
    pausedReason: "images_unavailable", ...overrides,
  };
  subscribers.forEach((listener) => listener());
}

let bulk: ReturnType<typeof useBulkGeneration>;
function Probe() {
  const value = useBulkGeneration();
  useEffect(() => { bulk = value; });
  return null;
}
const success = () => Response.json({ creditsCost: 2, engine: "generic" });
const refuse = (status: number, error: string, extra = {}) => Response.json({ error, ...extra }, { status });
const spyFetch = (responder: (order: number) => Response | Promise<Response>) =>
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    sent.push(request);
    return Promise.resolve(responder(Number(request.requestId.at(-1))));
  }));
const sent: Array<{requestId: string; engine?: string}> = [];
const orders = () => sent.map((request) => Number(request.requestId.at(-1)));
const lock = () => localStorage.getItem("bulk-gen-lock-bulk-1");
const started = async (count: number) => {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  await act(async () => {
    await bulk.startBulkGeneration({
      scope: { type: "chapters", count: 1 }, scopeLabel: "Genesis 1", estimatedTotalCredits: count * 2, translation: "web",
      queue: Array.from({ length: count }, (_, order) => ({ verseId: `verse-${order}`, reference: `Genesis 1:${order + 1}`, order })),
    });
  });
  return root;
};
const wait = (assertion: () => void) => vi.waitFor(async () => {
  await act(async () => {});
  assertion();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve, done: false };
}
let onMutation: (args: Record<string, unknown>) => Promise<void> | void;
let persistedStatus: string;
let persistedReason: unknown;
// As convex/bulkGenerations.ts updateVerseStatus: a requeue that marks its request spent answers with the verse's attempt.
let attemptAfterSpend: (verseId: string) => number;
beforeEach(() => {
  serverJob = undefined;
  document.cookie = "visibible_csrf=" + "a".repeat(64);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  sent.length = 0;
  mocks.tier = "paid";
  onMutation = () => {};
  persistedStatus = "active";
  persistedReason = null;
  attemptAfterSpend = () => 0;
  mocks.mutation.mockReset();
  mocks.mutation.mockImplementation(async (args) => {
    await onMutation(args);
    if (args.spentRequest) return { updated: true, attempt: attemptAfterSpend(String(args.verseId)) };
    if ("verses" in args) {
      return { created: true, status: "active", bulkId: "bulk-1", totalVerses: args.verses.length,
        completedCount: 0, failedCount: 0, skippedCount: 0, totalCreditsUsed: 0 };
    }
    if ("reason" in args) {
      // As convex/bulkGenerations.ts pause: a paused job takes the reason that arrives.
      if (persistedStatus === "paused" && args.reason) {
        persistedReason = args.reason;
        return { updated: true };
      }
      if (persistedStatus !== "active") return { updated: false };
      persistedStatus = "paused";
      persistedReason = args.reason;
    }
    return { updated: true };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("sends nothing more when Stop is pressed while a rate limit is waited out", async () => {
  const pendingRateWait = deferred<void>();
  const originalTimeout = window.setTimeout.bind(window);
  const waitIntercepted = deferred<void>();
  vi.spyOn(window, "setTimeout").mockImplementation(((fn: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 12345) {
      waitIntercepted.resolve();
      void pendingRateWait.promise.then(() => fn());
      return 0;
    }
    return originalTimeout(fn, delay, ...args);
  }) as typeof window.setTimeout);
  spyFetch(() => sent.length === 1 ? refuse(429, "Rate limit exceeded", { retryAfter: 12.345 }) : success());
  const root = await started(3);
  await act(async () => waitIntercepted.promise);
  await act(async () => bulk.cancelBulkGeneration());
  expect(bulk.state.status).toBe("cancelled");
  await act(async () => pendingRateWait.resolve());
  await act(async () => {});
  expect(orders()).toEqual([0]);
  await act(async () => root.unmount());
});

it("keeps painting one verse at a time until a verse binds the job's engine", async () => {
  spyFetch((order) => order === 0 ? refuse(500, "Failed to generate image") : success());
  const root = await started(5);
  await wait(() => expect(bulk.state.status).toBe("completed"));
  expect(orders()).toEqual([0, 1, 2, 3, 4]);
  // Genesis 1:2 binds the job; the three after it go out bound.
  expect(sent.map((request) => request.engine ?? null)).toEqual([null, null, "generic", "generic", "generic"]);
  await act(async () => root.unmount());
});

it("tries a verse refused for credits again only once every other verse has settled", async () => {
  const second = deferred<Response>();
  const third = deferred<Response>();
  const fourth = deferred<Response>();
  spyFetch((order) => order === 0 ? success() : order === 1
    ? orders().filter((seen) => seen === 1).length === 1 ? second.promise : success()
    : order === 2 ? third.promise : fourth.promise);
  const root = await started(4);
  await wait(() => expect(orders()).toEqual([0, 1, 2, 3]));
  await act(async () => second.resolve(refuse(402, "Insufficient credits")));
  await act(async () => third.resolve(success()));
  await act(async () => {});
  // The fourth verse still holds credits, so Genesis 1:2 waits.
  expect(orders()).toEqual([0, 1, 2, 3]);
  await act(async () => fourth.resolve(success()));
  await wait(() => expect(bulk.state.status).toBe("completed"));
  expect(orders()).toEqual([0, 1, 2, 3, 1]);
  expect(persistedReason).toBeNull();
  await act(async () => root.unmount());
});

it("retries rather than pauses when the other verse's hold settles while the refused one is handed back", async () => {
  const second = deferred<Response>();
  const third = deferred<Response>();
  const requeue = deferred<void>();
  const sawRequeue = deferred<void>();
  onMutation = (args) => {
    if (args.verseId === "verse-1" && args.status === "queued" && !sawRequeue.done) {
      sawRequeue.done = true;
      sawRequeue.resolve();
      return requeue.promise;
    }
  };
  spyFetch((order) => order === 0 ? success() : order === 1
    ? orders().filter((seen) => seen === 1).length === 1 ? second.promise : success()
    : third.promise);
  const root = await started(3);
  await wait(() => expect(orders()).toEqual([0, 1, 2]));
  await act(async () => {
    second.resolve(refuse(402, "Insufficient credits"));
    await sawRequeue.promise;
  });
  await act(async () => third.resolve(success()));
  await act(async () => requeue.resolve());
  await wait(() => expect(bulk.state.status).toBe("completed"));
  expect(orders()).toEqual([0, 1, 2, 1]);
  expect(persistedReason).toBeNull();
  await act(async () => root.unmount());
});

it("keeps the first pause's reason and message when a verse still painting is refused for another reason", async () => {
  const second = deferred<Response>();
  const third = deferred<Response>();
  spyFetch((order) => order === 0 ? success() : order === 1 ? second.promise : third.promise);
  const root = await started(3);
  await wait(() => expect(orders()).toEqual([0, 1, 2]));
  await act(async () => second.resolve(refuse(503, "Images are temporarily unavailable")));
  await wait(() => expect(bulk.state.errorMessage).toContain("Images are temporarily unavailable"));
  await act(async () => third.resolve(refuse(429, "Daily spending limit exceeded")));
  await act(async () => {});
  expect(bulk.state.errorMessage).toContain("Images are temporarily unavailable");
  expect(persistedReason).toBe("images_unavailable");
  await act(async () => root.unmount());
});

it("holds the run lock after a failed claim until every verse in flight has settled", async () => {
  const delayed = deferred<Response>();
  const claim = deferred<void>();
  onMutation = (args) => {
    if (args.verseId === "verse-2" && args.status === "generating") return claim.promise.then(() => { throw new Error("Claim network/auth error"); });
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  spyFetch((order) => order === 0 ? success() : delayed.promise.then(() => success()));
  const root = await started(5);
  await wait(() => expect(orders()).toEqual([0, 1, 3, 4]));
  await act(async () => claim.resolve());
  await act(async () => {});
  expect(lock()).toBeTruthy();
  await act(async () => delayed.resolve(success()));
  await wait(() => expect(lock()).toBeNull());
  expect(bulk.state.completedCount).toBe(4);
  await act(async () => root.unmount());
});

it("keeps a pause's message through the progress that verses still painting write after it", async () => {
  const second = deferred<Response>();
  const third = deferred<Response>();
  const fourth = deferred<Response>();
  spyFetch((order) => order === 0 ? success() : [second, third, fourth][order - 1].promise);
  const root = await started(4);
  await wait(() => expect(orders()).toEqual([0, 1, 2, 3]));
  await act(async () => second.resolve(refuse(503, "Images are temporarily unavailable")));
  await wait(() => expect(bulk.state.errorMessage).toContain("Images are temporarily unavailable"));
  await act(async () => publishServerJob({}));
  await act(async () => third.resolve(success()));
  await act(async () => publishServerJob({ completedCount: 2, totalCreditsUsed: 4 }));
  // A job paused for an outage shows as blocked, as the pause table says (#552).
  expect(bulk.state.status).toBe("blocked");
  expect(bulk.state.errorMessage).toContain("Images are temporarily unavailable");
  await act(async () => fourth.resolve(success()));
  await act(async () => root.unmount());
});

// Fires the coordinator's wait of `delay` ms only when the test says so.
function holdTimer(delay: number) {
  const fire = deferred<void>();
  const started = deferred<void>();
  const originalTimeout = window.setTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
    if (ms === delay) {
      started.resolve();
      void fire.promise.then(() => fn());
      return 0;
    }
    return originalTimeout(fn, ms, ...args);
  }) as typeof window.setTimeout);
  return { started: started.promise, fire: () => fire.resolve() };
}

it("sends no further poll for a verse still running elsewhere once Stop is pressed", async () => {
  const poll = holdTimer(3000);
  spyFetch(() => sent.length === 1 ? Response.json({ status: "generating", reused: true, engine: "generic" }, { status: 202 }) : success());
  const root = await started(2);
  await act(async () => poll.started);
  await act(async () => bulk.cancelBulkGeneration());
  await act(async () => poll.fire());
  await act(async () => {});
  expect(orders()).toEqual([0]);
  await act(async () => root.unmount());
});

it("leaves a verse alone after the run lock passes to another tab during a rate-limit wait", async () => {
  const rateWait = holdTimer(12345);
  const updates: Record<string, unknown>[] = [];
  onMutation = (args) => { if (args.verseId === "verse-0") updates.push(args); };
  spyFetch(() => refuse(429, "Rate limit exceeded", { retryAfter: 12.345 }));
  const root = await started(2);
  await act(async () => rateWait.started);
  // The replacement tab takes the expired lock, reconciles the verse and claims it.
  localStorage.setItem("bulk-gen-lock-bulk-1", JSON.stringify({ owner: "replacement-tab", expiresAt: Date.now() + 15000 }));
  const before = updates.length;
  await act(async () => rateWait.fire());
  await act(async () => {});
  expect(orders()).toEqual([0]);
  expect(updates.slice(before)).toEqual([]);
  await act(async () => root.unmount());
});

it("finishes a paused run whose worker failed, releasing the lock, and paints the rest on Resume", async () => {
  const result = deferred<Response>();
  const claim = deferred<void>();
  mocks.client.query.mockResolvedValue([5].map((order) => ({ verseId: `verse-${order}`, reference: `Genesis 1:${order + 1}`, order, status: "queued" })));
  onMutation = (args) => {
    if (args.verseId === "verse-2" && args.status === "generating") return claim.promise.then(() => { throw new Error("Claim network error"); });
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  spyFetch((order) => order === 0 ? success() : result.promise.then(() => success()));
  const root = await started(6);
  await wait(() => expect(orders()).toEqual([0, 1, 3, 4]));
  await act(async () => bulk.pauseBulkGeneration());
  await act(async () => result.resolve(success()));
  await act(async () => claim.resolve());
  // The failure wakes the workers waiting for Resume, so the run ends and lets go of its lock.
  await wait(() => expect(lock()).toBeNull());
  await act(async () => bulk.resumeBulkGeneration());
  await act(async () => publishServerJob({ status: "active", totalVerses: 6, completedCount: 4, failedCount: 0, totalCreditsUsed: 8, pausedReason: undefined }));
  await wait(() => expect(orders()).toContain(5));
  await act(async () => root.unmount());
  mocks.client.query.mockReset();
});

it("keeps Stop in force when an older progress snapshot arrives before the cancel lands", async () => {
  const poll = holdTimer(3000);
  const finishCancel = deferred<void>();
  const cancelSent = deferred<void>();
  const otherImage = deferred<Response>();
  spyFetch((order) => order === 0
    ? success()
    : order === 1 && orders().filter((seen) => seen === 1).length === 1
      ? Response.json({ status: "generating", reused: true, engine: "generic" }, { status: 202 })
      : order === 2 ? otherImage.promise : success());
  mocks.client.query.mockResolvedValue([]);
  const root = await started(3);
  await act(async () => poll.started);
  await wait(() => expect(orders()).toEqual([0, 1, 2]));
  await act(async () => otherImage.resolve(success()));
  onMutation = (args) => {
    if (Object.keys(args).sort().join(",") === "id,sid") {
      cancelSent.resolve();
      return finishCancel.promise;
    }
  };
  let cancel: Promise<void> | undefined;
  await act(async () => {
    cancel = bulk.cancelBulkGeneration();
    await cancelSent.promise;
  });
  // A snapshot from before the cancel reaches the subscription while the cancel is on its way.
  await act(async () => publishServerJob({ status: "active", totalVerses: 3, completedCount: 2, failedCount: 0, totalCreditsUsed: 4, pausedReason: undefined }));
  await act(async () => poll.fire());
  await act(async () => {});
  expect(orders()).toEqual([0, 1, 2]);
  await act(async () => { finishCancel.resolve(); await cancel; });
  await act(async () => root.unmount());
  mocks.client.query.mockReset();
});


it.each(["same tab", "another tab"])(
  "starts a new run after a failed claim when a Resume from %s arrives while the old run drains",
  async (resumeSource) => {
    const rejectFirstClaim = deferred<void>();
    const firstClaimSent = deferred<void>();
    const finishQueueLoad = deferred<void>();
    const wait429 = holdTimer(12345);
    const done = deferred<void>();
    const statuses = new Map([0, 1, 2, 3, 4].map((order) => [order, "queued"]));
    let firstClaim = true;
    let claimRejected = false;
    onMutation = async (args) => {
      if (!args.verseId) return;
      const order = Number(String(args.verseId).at(-1));
      if (order === 1 && args.status === "generating" && firstClaim) {
        firstClaim = false;
        firstClaimSent.resolve();
        await rejectFirstClaim.promise;
        claimRejected = true;
        throw new Error("One transient claim error");
      }
      expect(statuses.get(order)).toBe(args.expectedCurrentStatus);
      statuses.set(order, String(args.status));
      if ([...statuses.values()].every((status) => status === "completed")) done.resolve();
    };
    mocks.client.query.mockImplementation(async () => {
      if (serverJob?.status === "active") await finishQueueLoad.promise;
      return [...statuses].map(([order, status]) => ({
        verseId: `verse-${order}`, reference: `Genesis 1:${order + 1}`, order, status,
      }));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    spyFetch(() => claimRejected || orders().length === 1
      ? success()
      : refuse(429, "Rate limit exceeded", { retryAfter: 12.345 }));
    const root = await started(5);
    try {
      await act(async () => firstClaimSent.promise);
      if (resumeSource === "same tab") {
        await act(async () => bulk.pauseBulkGeneration());
        await act(async () => bulk.resumeBulkGeneration());
      } else {
        // A different connection can commit Pause and Resume while the owner's claim is pending.
        await act(async () => publishServerJob({
          status: "paused", totalVerses: 5, completedCount: 1, failedCount: 0,
          totalCreditsUsed: 2, pausedReason: undefined,
        }));
        expect(bulk.state.status).toBe("paused");
      }
      mocks.client.query.mockClear();
      // The Resume transition starts a getVerses query. Its result can arrive after
      // the failed mutation and before other workers' HTTP waits have drained.
      await act(async () => publishServerJob({
        status: "active", totalVerses: 5, completedCount: 1, failedCount: 0,
        totalCreditsUsed: 2, pausedReason: undefined,
      }));
      expect(mocks.client.query).toHaveBeenCalledTimes(1);
      await act(async () => rejectFirstClaim.resolve());
      expect(claimRejected).toBe(true);
      const draining = lock() !== null;
      if (draining) await act(async () => wait429.started);
      await act(async () => finishQueueLoad.resolve());
      await act(async () => wait429.fire());
      await wait(() => expect(lock()).toBeNull());
      expect(orders()).toContain(1);
      await done.promise;
      expect(bulk.state.status).toBe("completed");
    } finally {
      await act(async () => { rejectFirstClaim.resolve(); finishQueueLoad.resolve(); wait429.fire(); });
      await act(async () => root.unmount());
      mocks.client.query.mockReset();
    }
  },
);

it("leaves the next chapter alone when a stopped and dismissed run finally drains", async () => {
  const oldImage = deferred<Response>();
  const newImage = deferred<Response>();
  const reconcileNextJob = vi.fn();
  const states = new Map([["bulk-1", ["queued", "queued"]], ["bulk-2", ["queued", "queued"]]]);
  let creates = 0;
  mocks.mutation.mockImplementation(async (args) => {
    if ("verses" in args) {
      creates++;
      return {
        created: true, status: "active", bulkId: `bulk-${creates}`, totalVerses: 2,
        completedCount: 0, failedCount: 0, skippedCount: 0, totalCreditsUsed: 0,
      };
    }
    if ("verseId" in args) {
      const statuses = states.get(args.bulkGenerationId)!;
      const order = Number(String(args.verseId).at(-1));
      if (statuses[order] !== args.expectedCurrentStatus) return { updated: false };
      statuses[order] = args.status;
    }
    if (args.id === "bulk-2" && Object.keys(args).sort().join(",") === "id,sid") {
      reconcileNextJob();
      // Mirror reconcileInterrupted's accepted-but-unfinished branch. The first image request
      // is still live, so repairing its status opens it to a second runner's claim.
      expect(states.get("bulk-2")![0]).toBe("generating");
      states.get("bulk-2")![0] = "queued";
      return { completed: 0, failed: 0, requeued: 1 };
    }
    return { updated: true };
  });
  mocks.client.query.mockImplementation(async (_fn, args) =>
    states.get(args.bulkGenerationId)!.map((status, order) => ({
      verseId: `verse-${order}`, reference: `Genesis 1:${order + 1}`, order, status,
    })),
  );
  spyFetch(() => sent.at(-1)?.requestId.startsWith("bulk-bulk-1-") ? oldImage.promise : newImage.promise);
  const root = await started(2);
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await wait(() => expect(sent.map(({ requestId }) => requestId)).toEqual(["bulk-bulk-1-0"]));
    await act(async () => bulk.pauseBulkGeneration());
    await act(async () => bulk.resumeBulkGeneration());
    await act(async () => bulk.cancelBulkGeneration());
    expect(bulk.state.status).toBe("cancelled");
    await act(async () => bulk.dismissBulkGeneration());

    await act(async () => bulk.startBulkGeneration({
      scope: { type: "chapters", count: 1 }, scopeLabel: "Genesis 2",
      estimatedTotalCredits: 4, translation: "web",
      queue: [0, 1].map((order) => ({ verseId: `verse-${order}`, reference: `Genesis 2:${order + 1}`, order })),
    }));
    await wait(() => expect(sent.map(({ requestId }) => requestId)).toEqual(["bulk-bulk-1-0", "bulk-bulk-2-0"]));
    await act(async () => publishServerJob({
      _id: "bulk-2", status: "active", totalVerses: 2, completedCount: 0,
      failedCount: 0, totalCreditsUsed: 0, pausedReason: undefined, engine: undefined,
    }));
    expect(reconcileNextJob).not.toHaveBeenCalled();

    await act(async () => oldImage.resolve(success()));
    expect(sent.map(({ requestId }) => requestId)).toEqual(["bulk-bulk-1-0", "bulk-bulk-2-0"]);
    expect(reconcileNextJob).not.toHaveBeenCalled();
    // The old run's late result neither shows in the new chapter nor stops it.
    expect(bulk.state).toMatchObject({ bulkId: "bulk-2", status: "active", completedCount: 0 });
    // The mock's verse list names the new job's first verse so.
    expect(bulk.state.currentVerseReference).toBe("Genesis 1:1");
    await act(async () => newImage.resolve(success()));
    await wait(() => expect(sent.map(({ requestId }) => requestId)).toEqual(["bulk-bulk-1-0", "bulk-bulk-2-0", "bulk-bulk-2-1"]));
  } finally {
    await act(async () => { oldImage.resolve(success()); newImage.resolve(success()); });
    await act(async () => root.unmount());
    mocks.client.query.mockReset();
  }
});

it("sends nothing for a verse whose claim comes back after the reader paused, and paints it on Resume", async () => {
  const claim = deferred<void>();
  onMutation = (args) => {
    if (args.verseId === "verse-0" && args.status === "generating") return claim.promise;
  };
  spyFetch(() => success());
  const root = await started(1);
  await act(async () => bulk.pauseBulkGeneration());
  await act(async () => claim.resolve());
  await act(async () => {});
  expect(sent).toHaveLength(0);
  await act(async () => bulk.resumeBulkGeneration());
  await wait(() => expect(orders()).toEqual([0]));
  await act(async () => root.unmount());
});

it("wakes a worker that parked for a Pause the server did not take", async () => {
  const pause = deferred<void>();
  const first = deferred<Response>();
  let pauses = 0;
  const base = mocks.mutation.getMockImplementation()!;
  mocks.mutation.mockImplementation(async (args) => {
    if (Object.keys(args).sort().join(",") === "id,sid" && pauses++ === 0) {
      await pause.promise;
      return { updated: false };
    }
    return base(args);
  });
  spyFetch((order) => order === 0 ? first.promise : success());
  const root = await started(3);
  await wait(() => expect(orders()).toEqual([0]));
  let pausing!: Promise<void>;
  await act(async () => { pausing = bulk.pauseBulkGeneration(); });
  await act(async () => first.resolve(success()));
  await act(async () => {});
  expect(orders()).toEqual([0]);
  await act(async () => { pause.resolve(); await pausing; });
  await wait(() => expect(orders()).toEqual([0, 1, 2]));
  await act(async () => root.unmount());
});

it("carries each verse's claim number on every write that follows the claim (#552)", async () => {
  const base = mocks.mutation.getMockImplementation()!;
  const claims = new Map<unknown, number>();
  const writes: Record<string, unknown>[] = [];
  mocks.mutation.mockImplementation(async (args) => {
    if (args.verseId && args.status === "generating" && args.expectedCurrentStatus === "queued") {
      await base(args);
      const claim = (claims.get(args.verseId) ?? 40) + 1;
      claims.set(args.verseId, claim);
      return { updated: true, claim };
    }
    if (args.verseId) writes.push(args);
    return base(args);
  });
  // The second verse is refused once by the site's limit, so it is put back and claimed again.
  const rateWait = holdTimer(1000);
  spyFetch((order) => order === 1 && orders().filter((seen) => seen === 1).length === 1
    ? refuse(429, "Rate limit exceeded", { retryAfter: 1 })
    : success());
  const root = await started(3);
  await act(async () => rateWait.started);
  await act(async () => bulk.pauseBulkGeneration());
  await act(async () => rateWait.fire());
  await act(async () => bulk.resumeBulkGeneration());
  await act(async () => publishServerJob({ status: "active", totalVerses: 3, completedCount: 2, failedCount: 0, totalCreditsUsed: 4, pausedReason: undefined }));
  await wait(() => expect(writes.filter((write) => write.status === "completed")).toHaveLength(3));
  expect(writes.map(({ verseId, status, claim }) => [verseId, status, claim])).toEqual(expect.arrayContaining([
    ["verse-0", "completed", 41],
    ["verse-1", "queued", 41],
    ["verse-1", "completed", 42],
    ["verse-2", "completed", 41],
  ]));
  expect(writes.every((write) => write.claim === claims.get(write.verseId) || write.status === "queued")).toBe(true);
  await act(async () => root.unmount());
});

it("ends a job dismissed during its first claim instead of spinning on the unbound verses (#540)", async () => {
  const claim = deferred<void>();
  onMutation = (args) => {
    if (args.verseId === "verse-0" && args.status === "generating") return claim.promise;
  };
  spyFetch(() => success());
  const root = await started(3);
  await act(async () => bulk.dismissBulkGeneration());
  await act(async () => claim.resolve());
  // A run that kept looping here would never yield, and this timer would never fire.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(sent).toEqual([]);
  await act(async () => root.unmount());
});

it("paints eight at once for the owner (#552)", async () => {
  mocks.tier = "admin";
  const held = deferred<Response>();
  spyFetch((order) => order === 0 ? success() : held.promise);
  const root = await started(12);
  // The first verse binds the engine alone; then eight go out together.
  await wait(() => expect(orders()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  await act(async () => held.resolve(success()));
  await wait(() => expect(bulk.state.status).toBe("completed"));
  await act(async () => root.unmount());
});

it("shows a reloaded job's pause message from its stored reason (#552)", async () => {
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<BulkGenerationProvider><Probe /></BulkGenerationProvider>));
  await act(async () => publishServerJob({ status: "paused", pausedReason: "daily_limit" }));
  expect(bulk.state.errorMessage).toBe("This session has reached today's spending limit. Resume tomorrow to paint the rest.");
  await act(async () => publishServerJob({ status: "paused", pausedReason: undefined }));
  await act(async () => root.unmount());
});

it("starts the run again after a failed save, and paints the verse whose claim failed (#552)", async () => {
  const retry = holdTimer(5000);
  const statuses = new Map([0, 1, 2].map((order) => [`verse-${order}`, "queued"]));
  let failClaim = true;
  onMutation = (args) => {
    const verseId = args.verseId as string | undefined;
    if (!verseId) return;
    if (verseId === "verse-1" && args.status === "generating" && failClaim) {
      failClaim = false;
      throw new Error("Network error");
    }
    statuses.set(verseId, String(args.status));
  };
  mocks.client.query.mockImplementation(async () => [...statuses].map(([verseId, status]) => ({
    verseId, reference: `Genesis 1:${Number(verseId.at(-1)) + 1}`, order: Number(verseId.at(-1)), status,
  })));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const first = deferred<Response>();
  spyFetch((order) => order === 0 && orders().length === 1 ? first.promise : success());
  const root = await started(3);
  await act(async () => publishServerJob({ status: "active", totalVerses: 3, completedCount: 0, failedCount: 0, totalCreditsUsed: 0, pausedReason: undefined }));
  await act(async () => first.resolve(success()));
  await act(async () => retry.started);
  expect(statuses.get("verse-1")).toBe("queued");
  await act(async () => retry.fire());
  await wait(() => expect([...statuses.values()]).toEqual(["completed", "completed", "completed"]));
  expect(orders()).toEqual(expect.arrayContaining([0, 1, 2]));
  await act(async () => root.unmount());
  mocks.client.query.mockReset();
});

it("shows the job blocked after three restarts that each failed to save (#552)", async () => {
  const retries: Array<() => void> = [];
  const originalTimeout = window.setTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
    if (ms === 5000) { retries.push(fn); return 0; }
    return originalTimeout(fn, ms, ...args);
  }) as typeof window.setTimeout);
  onMutation = (args) => {
    if (args.verseId === "verse-1" && args.status === "generating") throw new Error("Network error");
  };
  mocks.client.query.mockImplementation(async () => [{ verseId: "verse-1", reference: "Genesis 1:2", order: 1, status: "queued" }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const first = deferred<Response>();
  spyFetch((order) => order === 0 ? first.promise : success());
  const root = await started(2);
  await act(async () => publishServerJob({ status: "active", totalVerses: 2, completedCount: 0, failedCount: 0, totalCreditsUsed: 0, pausedReason: undefined }));
  await act(async () => first.resolve(success()));
  for (let restart = 1; restart <= 3; restart++) {
    await wait(() => expect(retries).toHaveLength(restart));
    await act(async () => retries[restart - 1]());
  }
  await wait(() => expect(bulk.state.status).toBe("blocked"));
  expect(bulk.state.errorMessage).toBe("Couldn't save progress. Resume to try again.");
  expect(persistedReason).toBe("save_failed");
  expect(retries).toHaveLength(3);
  await act(async () => root.unmount());
  mocks.client.query.mockReset();
});

it("sends a deferred verse whose refused request ended failed under its next request id", async () => {
  // The hold was refused while Genesis 1:3 painted, and the refused request could not be withdrawn, so it ended failed:
  // Convex gives the verse its next attempt, and the deferred retry goes out under that id instead of replaying the failure.
  const second = deferred<Response>();
  const third = deferred<Response>();
  attemptAfterSpend = (verseId) => verseId === "verse-1" ? 1 : 0;
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    sent.push(request);
    if (request.requestId === "bulk-bulk-1-0") return Promise.resolve(success());
    if (request.requestId === "bulk-bulk-1-2") return third.promise;
    if (request.requestId === "bulk-bulk-1-1-a1") return Promise.resolve(success());
    // The spent id answers with its recorded failure, as the route's replay does.
    return sent.filter((seen) => seen.requestId === "bulk-bulk-1-1").length === 1
      ? second.promise
      : Promise.resolve(refuse(409, "Insufficient credits", { status: "failed", reused: true }));
  }));
  const root = await started(3);
  await wait(() => expect(sent).toHaveLength(3));
  await act(async () => second.resolve(refuse(402, "Insufficient credits")));
  await act(async () => third.resolve(success()));
  await wait(() => expect(bulk.state.status).toBe("completed"));
  expect(sent.map((request) => request.requestId)).toEqual(["bulk-bulk-1-0", "bulk-bulk-1-1", "bulk-bulk-1-2", "bulk-bulk-1-1-a1"]);
  expect(bulk.state).toMatchObject({ completedCount: 3, failedCount: 0 });
  expect(mocks.mutation).toHaveBeenCalledWith(expect.objectContaining({ verseId: "verse-1", status: "queued", spentRequest: true }));
  await act(async () => root.unmount());
});

it.each([
  ["credits", 402, "Insufficient credits"],
  ["daily_limit", 429, "Daily spending limit exceeded"],
])("marks the request spent when a lone verse pauses the job for %s, so Resume does not replay a recorded failure", async (reason, status, error) => {
  spyFetch(() => refuse(status, error));
  const root = await started(2);
  await wait(() => expect(persistedReason).toBe(reason));
  expect(mocks.mutation).toHaveBeenCalledWith(expect.objectContaining({ verseId: "verse-0", status: "queued", spentRequest: true }));
  await act(async () => root.unmount());
});

it("waits out each refusal in turn when a rate-limit retry is answered by a scene still preparing", async () => {
  const preparing = holdTimer(2000);
  const answers = [
    refuse(429, "Rate limit exceeded", { retryAfter: 0.001 }),
    refuse(503, "Scene unavailable", { retryable: true }),
    refuse(429, "Rate limit exceeded", { retryAfter: 0.001 }),
    success(),
  ];
  spyFetch(() => answers[sent.length - 1] ?? success());
  const root = await started(1);
  await act(async () => preparing.started);
  preparing.fire();
  await wait(() => expect(bulk.state.status).toBe("completed"));
  expect(sent).toHaveLength(4);
  expect(persistedReason).toBeNull();
  await act(async () => root.unmount());
});
