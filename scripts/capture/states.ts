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
];
