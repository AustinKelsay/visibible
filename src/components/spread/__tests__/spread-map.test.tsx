/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Spread } from "@/components/spread/spread";
import { resetMapMode } from "@/components/spread/place-map";
import { answerPictureRead } from "@/app/__tests__/fake-picture-reads";
import type { VerseSetting } from "@/lib/verse-setting";

const fixture = vi.hoisted(() => ({
  push: vi.fn(),
  shown: vi.fn(),
  session: { isLoading: false, tier: "paid", credits: 0 },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: fixture.push, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/exodus/15/23",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/components/convex-client-provider", () => ({ useConvexEnabled: () => true }));
vi.mock("@/context/preferences-context", () => ({
  usePreferences: () => ({ artStyle: "classical", textSize: "medium", translation: "web", autoGenerate: false }),
}));
vi.mock("@/context/session-context", () => ({ useSession: () => fixture.session }));
vi.mock("@/lib/analytics", async (getOriginal) => ({
  ...(await getOriginal<typeof import("@/lib/analytics")>()),
  trackMapLinkShown: fixture.shown,
  trackMapOpened: vi.fn(),
  trackVerseNavigation: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: { imageId?: string } | "skip") => {
    if (args === "skip") return undefined;
    if (getFunctionName(query) === "verseVideos:getPictureVideo") {
      return { id: `clip-${args.imageId}`, videoUrl: "https://example.test/video.mp4" };
    }
    return answerPictureRead(
      [23, 24].map((verse) => ({
        id: `exodus-15-${verse}:classical`,
        artStyle: "classical",
        imageUrl: "https://example.test/picture.jpg",
        createdAt: 0,
      })),
      query,
      args,
    );
  },
  useMutation: () => vi.fn(async () => ({})),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  resetMapMode();
  fixture.push.mockClear();
  fixture.shown.mockClear();
  fixture.session = { isLoading: false, tier: "paid", credits: 0 };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const setting: VerseSetting = {
  fromVerse: null,
  places: [{ id: "marah", name: "Marah", proseName: "Marah", region: false, debated: false,
    sites: [{ lon: 32.943, lat: 29.346, score: 384, name: "Ain Hawarah" }] }],
};

const render = () => act(async () => root.render(
  <Spread
    verseId="exodus-15-23" path="/exodus/15/23" bookSlug="exodus" bookName="Exodus"
    chapter={15} verseNumber={23} totalVerses={27} reference="Exodus 15:23"
    verseText="When they came to Marah" translationName="WEB"
    nextVerseId="exodus-15-24" nextUrl="/exodus/15/24" setting={setting}
  />,
));
const button = (label: string) => [...host.querySelectorAll("button")].find(
  (element) => (element.getAttribute("aria-label") ?? element.textContent?.trim()) === label,
);
const open = async () => {
  await act(async () => button("See where this happened")!.click());
  await vi.waitFor(() => expect(host.querySelector("svg[role=group]")).not.toBeNull());
};

it("hides the picture under the map without unmounting it, and stops its video", async () => {
  await render();
  const play = button("Play the video of Exodus 15:23")!;
  await act(async () => play.click());
  const video = host.querySelector<HTMLVideoElement>("[data-picture-video]")!;
  act(() => video.dispatchEvent(new Event("playing")));
  await act(async () => button("Continuous play: carry on into the next verse's video")!.click());

  await open();
  // Hidden with its controls, but the same picture: its painting state carries on.
  expect(play.isConnected).toBe(true);
  expect(play.closest(".hidden")).not.toBeNull();
  // The video stops, so Continuous play cannot turn the page under the map.
  expect(video.isConnected).toBe(false);
  expect(fixture.push).not.toHaveBeenCalled();

  await act(async () => button("Back to the picture")!.click());
  expect(host.querySelector('svg[role="group"]')).toBeNull();
  expect(button("Play the video of Exodus 15:23")).toBe(play);
  expect(play.closest(".hidden")).toBeNull();
  expect(host.querySelector("[data-picture-video]")).toBeNull();
});
