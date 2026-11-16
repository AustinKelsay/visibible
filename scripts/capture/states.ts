import type { CaptureState } from "./plan";

/**
 * Every reader state the capture command shoots, at desktop (1440×900) and phone (390×844) size unless `sizes` says
 * otherwise. Add a state as one entry: a name for its pictures, the address, and the steps that reach it (see
 * `parseStep` in plan.ts). On a computer the dock and marks fade after 3 s without activity, so a state that shows
 * them hovers the words page last. A state that shows a picture waits for it by its name ("Picture of John 1:5"), so
 * a slow read never leaves a blank where the picture belongs.
 *
 * Addresses assume the seeded local data: John 1:1–5, 9 and 14 painted in Classical, the rest of John 1 unpainted, and
 * John 4:7 painted only in Watercolor. The prose states (owner-only, `owner: true`) also assume an active analysis of
 * Alice whose moments are two paragraphs long in its first chapters, with ¶1 and ¶3 of "Down the Rabbit-Hole" painted
 * and ¶5 not (llm/workflow/READER_CAPTURE.md).
 */
export const READER_STATES: CaptureState[] = [
  { name: "reading", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "hover:css:article p:nth-of-type(2)"] },
  { name: "marks", path: "/john/1/14", steps: ["waitfor:img:Picture of John 1:14", "hover:css:article p:nth-of-type(2)"] },
  { name: "idle-faded", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "wait:4200"] },
  { name: "long-verse", path: "/esther/8/9", steps: ["hover:css:article p:nth-of-type(2)", "scroll:2000"] },
  { name: "unpainted", path: "/john/1/6", steps: ["waitfor:region:Picture", "hover:css:article p:nth-of-type(2)"] },
  { name: "whole-picture", path: "/john/1/5", steps: ["click:button:Show the whole picture of John 1:5", "wait:600"] },
  { name: "ask", path: "/john/1/5", steps: ["click:button:Ask a question…", "waitfor:dialog:Ask about John 1:5"], sizes: ["phone"] },
  { name: "contents", path: "/john/1/5", steps: ["click:button:Contents", "waitfor:dialog:Contents", "wait:1200"] },
  // Priced by the `priced` stub. The run's guest has no credits, so the balance note shows; a running job needs a
  // guest with credits and stubbed paintings, which this command cannot give (llm/workflow/READER_CAPTURE.md).
  { name: "paint-chapter", path: "/john/1/5", stubs: ["priced"], steps: ["click:button:Contents", "waitfor:dialog:Contents", "waitfor:button:Paint the", "wait:600"] },
  { name: "look", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Look", "waitfor:dialog:Look", "wait:800"] },
  // Painted only in Watercolor while Classical is chosen: the picture rule's note and its offer (priced by the stub; the
  // run's guest has no credits, so it reads "Get credits to paint").
  { name: "other-style", path: "/john/4/7", stubs: ["priced"], steps: ["waitfor:img:Picture of John 4:7", "waitfor:region:Other art style", "hover:css:article p:nth-of-type(2)"] },
  { name: "corner-menu", path: "/john/1/5", steps: ["click:button:Visibible menu", "waitfor:dialog:Visibible menu"] },
  { name: "feedback", path: "/john/1/5", steps: ["click:button:Visibible menu", "click:button:Send feedback", "wait:600"] },
  // Advanced opened in the corner menu; priced, so the image model is named as it is on the live site.
  { name: "advanced", path: "/john/1/5", stubs: ["priced"], steps: ["click:button:Visibible menu", "click:button:Advanced", "waitfor:radiogroup:Aspect ratio", "wait:600"] },
  { name: "welcome", path: "/john/1/5", steps: ["click:button:Visibible menu", "click:button:Advanced", "click:button:Show the welcome", "waitfor:dialog:Credits", "wait:400"] },
  { name: "picture-menu", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Picture menu", "waitfor:dialog:Picture menu", "wait:600"] },
  { name: "picture-details", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Picture menu", "click:button:Details", "wait:400"] },
  { name: "report-picture", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Picture menu", "click:button:Report this picture", "wait:600"] },
  // Moving pictures (#447, #480). Play needs a finished video of John 1:5's picture, made from that picture, in the
  // local data (READER_CAPTURE.md says how); the picture menu then shows that thumbnail's play badge. Video generation
  // is off locally, so "Make this picture move…" shows only with its pricing stubbed, on John 1:4, whose picture has no
  // video. The run's guest has no credits, so the review's confirm reads "Get credits to make the video".
  { name: "play-mark", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "waitfor:button:Play the video of John 1:5", "hover:css:article p:nth-of-type(2)"] },
  { name: "video-playing", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Play the video of John 1:5", "waitfor:css:video", "wait:1500"] },
  { name: "make-video", path: "/john/1/4", stubs: ["video-priced"], steps: ["waitfor:img:Picture of John 1:4", "click:button:Picture menu", "waitfor:text:Make this picture move", "wait:400"] },
  { name: "make-video-review", path: "/john/1/4", stubs: ["video-priced"], steps: ["waitfor:img:Picture of John 1:4", "click:button:Picture menu", "click:button:Make this picture move", "waitfor:group:Make this picture move", "wait:400"] },
  // The owner's prose reader (#451): a moment on the spread, its whole picture, its Contents of the work's divisions,
  // Look without translation, and an unpainted moment.
  { name: "prose", path: "/read/alice-in-wonderland/down-the-rabbit-hole-1", owner: true, steps: ["waitfor:img:Picture of Down the Rabbit-Hole ¶1–2", "hover:css:article h1"] },
  { name: "prose-whole-picture", path: "/read/alice-in-wonderland/down-the-rabbit-hole-1", owner: true, steps: ["click:button:Show the whole picture of Down the Rabbit-Hole ¶1–2", "wait:600"] },
  { name: "prose-contents", path: "/read/alice-in-wonderland/down-the-rabbit-hole-1", owner: true, steps: ["click:button:Contents", "waitfor:dialog:Contents", "wait:1200"] },
  { name: "prose-look", path: "/read/alice-in-wonderland/down-the-rabbit-hole-1", owner: true, steps: ["waitfor:img:Picture of Down the Rabbit-Hole ¶1–2", "click:button:Look", "waitfor:dialog:Look", "wait:800"] },
  { name: "prose-unpainted", path: "/read/alice-in-wonderland/down-the-rabbit-hole-5", owner: true, steps: ["waitfor:region:Picture", "hover:css:article h1"] },
];
