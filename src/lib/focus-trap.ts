import type { KeyboardEvent } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isRadio = (item: HTMLElement): item is HTMLInputElement => item instanceof HTMLInputElement && item.type === "radio";

/**
 * The container's Tab stops, in order. A control hidden at this size (a phone-only close button on a computer) is
 * skipped, and a named radio group is one stop, as in the browser: its checked radio, or its first when none is checked.
 */
export function tabbableIn(container: HTMLElement): HTMLElement[] {
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => {
    for (let node: HTMLElement | null = item; node && node !== container; node = node.parentElement) {
      if (getComputedStyle(node).display === "none") return false;
    }
    return true;
  });
  return items.filter((item) => {
    if (!isRadio(item) || !item.name) return true;
    const group = items.filter((other) => isRadio(other) && other.name === item.name) as HTMLInputElement[];
    return item === (group.find((radio) => radio.checked) ?? group[0]);
  });
}

/** Keeps Tab and Shift+Tab inside `container`, wrapping from its last stop to its first and back. */
export function trapTab(event: KeyboardEvent<HTMLElement>, container: HTMLElement) {
  if (event.key !== "Tab") return;
  const items = tabbableIn(container);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
