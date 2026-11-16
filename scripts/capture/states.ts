import type { CaptureState } from "./plan";

/**
 * Every reader state the capture command shoots, at desktop (1440×900) and phone (390×844) size unless `sizes` says
 * otherwise. Add a state as one entry: a name for its pictures, the address, and the steps that reach it (see
 * `parseStep` in plan.ts). On a computer the dock and marks fade after 3 s without activity, so a state that shows
 * them hovers the words page last. A state that shows a picture waits for it by its name ("Picture of John 1:5"), so
 * a slow read never leaves a blank where the picture belongs.
 *
 * Addresses assume the seeded local data: John 1:1–5, 9 and 14 painted in Classical, the rest of John 1 unpainted.
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
  { name: "corner-menu", path: "/john/1/5", steps: ["click:button:Visibible menu", "waitfor:dialog:Visibible menu"] },
  { name: "feedback", path: "/john/1/5", steps: ["click:button:Visibible menu", "click:button:Send feedback", "wait:600"] },
  { name: "picture-menu", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Picture menu", "waitfor:dialog:Picture menu", "wait:600"] },
  { name: "picture-details", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Picture menu", "click:button:Details", "wait:400"] },
  { name: "report-picture", path: "/john/1/5", steps: ["waitfor:img:Picture of John 1:5", "click:button:Picture menu", "click:button:Report this picture", "wait:600"] },
];
