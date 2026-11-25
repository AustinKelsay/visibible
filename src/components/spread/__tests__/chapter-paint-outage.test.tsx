/* @vitest-environment jsdom */

/** A chapter job paused for an image outage (#546) says why when the reader comes back to it. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BulkGenerationProvider } from "@/context/bulk-generation-context";
import { ChapterPaint } from "@/components/spread/chapter-paint";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { pausedJob, convex } = vi.hoisted(() => ({
  pausedJob: {
    _id: "bulk-1", status: "paused", pausedReason: "images_unavailable",
    totalVerses: 2, completedCount: 0, failedCount: 0, skippedCount: 0, totalCreditsUsed: 0,
    modelId: "test-model", aspectRatio: "16:9", resolution: "1K", translation: "web",
  },
  convex: { query: vi.fn(async () => [{ verseId: "genesis-1-1", reference: "Genesis 1:1", order: 0, status: "queued", attempt: 1 }]) },
}));
vi.mock("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
  useQuery: () => pausedJob,
}));
vi.mock("@/context/session-context", () => ({ useSession: () => ({ sid: "guest", credits: 100 }) }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));

vi.mock("@/lib/use-verse-generation", () => ({ useVerseGeneration: () => ({}) }));

it("shows the outage reason when opening a paused job", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BulkGenerationProvider><ChapterPaint book={{ slug: "genesis", name: "Genesis" } as never} chapter={1} unpaintedVerses={undefined} /></BulkGenerationProvider>));
    expect(container.textContent).toContain("Images are temporarily unavailable. The job is paused; resume when painting is back.");
  } finally {
    await act(async () => root.unmount());
  }
});
