export type VerseNavigationDirection = "prev" | "next";

type VerseNavigationKeyboardEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "defaultPrevented" | "target"
>;

type EditableTarget = EventTarget & {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;

  const element = target as EditableTarget;
  const tagName = element.tagName?.toUpperCase();

  if (element.isContentEditable) return true;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return true;
  if (element.getAttribute?.("role") === "textbox") return true;
  if (element.getAttribute?.("contenteditable") === "" || element.getAttribute?.("contenteditable") === "true") {
    return true;
  }

  return Boolean(element.closest?.("[contenteditable=\"true\"], [contenteditable=\"\"], [role=\"textbox\"]"));
}

export function getVerseNavigationDirection(
  event: VerseNavigationKeyboardEvent
): VerseNavigationDirection | null {
  if (event.defaultPrevented) return null;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (isEditableTarget(event.target)) return null;

  if (event.key === "ArrowLeft") return "prev";
  if (event.key === "ArrowRight") return "next";

  return null;
}
