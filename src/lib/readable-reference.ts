/**
 * A reference as readers write it. A chapter or verse of Psalms is one psalm, so it reads "Psalm 23" and "Psalm 23:1",
 * while the book itself stays "Psalms". Every other reference is returned as it is.
 *
 * Only text a reader reads goes through here. The app's own form ("Psalms 23:1", `formatReference`) stays the
 * identifier that requests, stored pictures, videos and answers, and the public image API match on.
 */
export function readableReference(reference: string): string {
  return reference.replace(/^Psalms (?=\d)/, "Psalm ");
}
