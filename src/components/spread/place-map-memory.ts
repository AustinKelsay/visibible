import type { MapView, ZoomStep } from "./place-map-view";

/**
 * The reader's zoom step, Then or Today, opened card (by its site) and, where places share its marker, the place whose chapters it
 * shows, kept while turning pages for the visit, as the map itself is. Its own module, so the reader's stage can forget
 * the card without loading the map.
 */
export const remembered: { step: ZoomStep; view: MapView; opened: string | null; place: string | null } = { step: "land", view: "then", opened: null, place: null };

export function remember(change: Partial<typeof remembered>) {
  Object.assign(remembered, change);
}

/** A verse with no setting puts the card away, as a page without its site does. */
export function forgetOpenedCard() {
  remembered.opened = null;
}

/** Back to the opening step and Then with no card open; for tests, which share this module's state. */
export function resetPlaceMap() {
  remembered.step = "land";
  remembered.view = "then";
  remembered.opened = null;
  remembered.place = null;
}
