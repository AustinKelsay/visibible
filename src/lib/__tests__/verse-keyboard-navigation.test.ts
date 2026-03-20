import { describe, expect, it } from "vitest";
import { getVerseNavigationDirection } from "@/lib/verse-keyboard-navigation";

function createTarget(overrides: Record<string, unknown> = {}): EventTarget {
  return {
    getAttribute: () => null,
    closest: () => null,
    ...overrides,
  } as unknown as EventTarget;
}

function createKeyboardEvent(
  key: string,
  overrides: Partial<KeyboardEvent> = {}
): KeyboardEvent {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: createTarget(),
    ...overrides,
  } as KeyboardEvent;
}

describe("getVerseNavigationDirection", () => {
  it("maps plain arrow keys to verse directions", () => {
    expect(getVerseNavigationDirection(createKeyboardEvent("ArrowLeft"))).toBe("prev");
    expect(getVerseNavigationDirection(createKeyboardEvent("ArrowRight"))).toBe("next");
  });

  it("ignores non-arrow keys and modified shortcuts", () => {
    expect(getVerseNavigationDirection(createKeyboardEvent("Enter"))).toBeNull();
    expect(
      getVerseNavigationDirection(createKeyboardEvent("ArrowLeft", { metaKey: true }))
    ).toBeNull();
    expect(
      getVerseNavigationDirection(createKeyboardEvent("ArrowRight", { ctrlKey: true }))
    ).toBeNull();
  });

  it("does not navigate while typing in editable fields", () => {
    const input = createTarget({ tagName: "input" });
    const textarea = createTarget({ tagName: "textarea" });
    const editable = createTarget({ isContentEditable: true });
    const nestedTextbox = createTarget({
      closest: (selector: string) => (selector.includes("[role=\"textbox\"]") ? {} : null),
    });

    expect(
      getVerseNavigationDirection(createKeyboardEvent("ArrowLeft", { target: input }))
    ).toBeNull();
    expect(
      getVerseNavigationDirection(createKeyboardEvent("ArrowRight", { target: textarea }))
    ).toBeNull();
    expect(
      getVerseNavigationDirection(createKeyboardEvent("ArrowRight", { target: editable }))
    ).toBeNull();
    expect(
      getVerseNavigationDirection(createKeyboardEvent("ArrowRight", { target: nestedTextbox }))
    ).toBeNull();
  });
});
