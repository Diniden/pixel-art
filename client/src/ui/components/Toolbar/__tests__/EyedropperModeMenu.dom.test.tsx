/**
 * The eyedropper's mode menu, driven by the REAL gesture (2026-08-28).
 *
 * ⚠️ WHAT THIS PINS, and why it exists: the menu is opened by a long press
 * and dismissed by an outside `pointerdown`. Those two facts collide — the
 * long press fires at 500 ms while the finger is STILL DOWN, so the menu
 * mounts mid-gesture and its own dismissal listener is live before the user
 * has lifted. Every event remaining in that gesture is therefore a candidate
 * for closing the menu the instant it opened, which is exactly the bug this
 * file was written to catch.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PixelStudioTools } from "../PixelStudioTools";

const base = {
  selectedTool: "pixel" as const,
  onSelectTool: () => {},
  alternateTool: "eraser" as const,
  onSelectAlternateTool: () => {},
  onSwapTools: () => {},
  eyedropperMode: "revert" as const,
  onSelectEyedropperMode: () => {},
  onUndo: () => {},
  onRedo: () => {},
  canUndo: true,
  canRedo: true,
  onFlipHorizontal: () => {},
  onFlipVertical: () => {},
  referenceImageModal: () => null,
};

/** The eyedropper's button, found the way a user finds it: by its label. */
function eyedropperButton(): HTMLElement {
  const btn = screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("title")?.startsWith("Eyedropper"));
  if (!btn) throw new Error("no eyedropper button rendered");
  return btn;
}

const menu = () => screen.queryByRole("menu", { name: "Eyedropper mode" });

/**
 * Press and hold past the long-press threshold, then release — the COMPLETE
 * gesture, including the pointerup and the click that follow it.
 *
 * ⚠️ The release is the point. A test that only presses and advances the
 * timer passes even when the release immediately closes the menu again.
 */
function longPress(el: HTMLElement, { release = true } = {}) {
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  if (release) {
    fireEvent.pointerUp(el, { clientX: 10, clientY: 10 });
    fireEvent.click(el, { clientX: 10, clientY: 10 });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("opening the menu", () => {
  it("is closed until the gesture happens", () => {
    render(<PixelStudioTools {...base} />);
    expect(menu()).toBeNull();
  });

  it("⭐ a long press OPENS it — and it SURVIVES the release", () => {
    // The regression: the menu mounts while the finger is still down, so the
    // pointerup and click that end the very same gesture arrive after its
    // dismissal listener is live.
    render(<PixelStudioTools {...base} />);

    longPress(eyedropperButton());

    expect(menu()).not.toBeNull();
  });

  it("a double click opens it", () => {
    render(<PixelStudioTools {...base} />);

    fireEvent.doubleClick(eyedropperButton());

    expect(menu()).not.toBeNull();
  });

  it("a plain click does NOT open it — that still just selects the tool", () => {
    const onSelectTool = vi.fn();
    render(<PixelStudioTools {...base} onSelectTool={onSelectTool} />);

    fireEvent.click(eyedropperButton());

    expect(menu()).toBeNull();
    expect(onSelectTool).toHaveBeenCalledWith("eyedropper");
  });

  it("⭐ the long press does NOT also select the tool", () => {
    // `didLongPress()` guards the click that follows a completed hold.
    const onSelectTool = vi.fn();
    render(<PixelStudioTools {...base} onSelectTool={onSelectTool} />);

    longPress(eyedropperButton());

    expect(onSelectTool).not.toHaveBeenCalled();
  });

  it("no OTHER tool opens a menu on a long press", () => {
    // Only the eyedropper claims the gesture; the rest keep slot-B assignment.
    const onSelectAlternateTool = vi.fn();
    render(
      <PixelStudioTools
        {...base}
        onSelectAlternateTool={onSelectAlternateTool}
      />,
    );

    const pencil = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("title")?.startsWith("Pencil"))!;
    longPress(pencil);

    expect(menu()).toBeNull();
    expect(onSelectAlternateTool).toHaveBeenCalledWith("pixel");
  });
});

describe("⭐ the portal — the reason the menu was invisible", () => {
  it("renders OUTSIDE the toolbar subtree, on document.body", () => {
    // THE REGRESSION THIS FILE EXISTS FOR. `.toolbar` is a scroll container
    // (`overflow-x: auto` + `overflow-y: hidden`, 36px min-height), so a menu
    // rendered inside it is clipped away completely: it opens, the state
    // flips, and the user sees nothing. Only leaving the subtree fixes it.
    //
    // ⚠️ jsdom does NO layout and NO clipping, so it cannot observe the
    // invisibility itself. Asserting on the menu's PARENTAGE is the part of
    // the fix that is testable here — hence this test rather than a size one.
    const { container } = render(<PixelStudioTools {...base} />);
    longPress(eyedropperButton());

    const el = menu()!;
    expect(el).not.toBeNull();
    expect(container.contains(el)).toBe(false);
    expect(document.body.contains(el)).toBe(true);
  });

  it("is not a DESCENDANT of the button — no nested-button markup", () => {
    render(<PixelStudioTools {...base} />);
    longPress(eyedropperButton());

    expect(eyedropperButton().contains(menu())).toBe(false);
  });

  it("carries the dock edge as a modifier", () => {
    render(<PixelStudioTools {...base} edge="bottom" />);
    longPress(eyedropperButton());

    expect(menu()!.className).toContain("eyedropper-mode-menu--bottom");
  });

  it("unmounts on close, leaving nothing behind in the body", () => {
    render(<PixelStudioTools {...base} />);
    longPress(eyedropperButton());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.querySelector(".eyedropper-mode-menu")).toBeNull();
  });
});

describe("choosing a mode", () => {
  it("⭐ reports the chosen mode and closes", () => {
    const onSelectEyedropperMode = vi.fn();
    render(
      <PixelStudioTools
        {...base}
        onSelectEyedropperMode={onSelectEyedropperMode}
      />,
    );
    longPress(eyedropperButton());

    fireEvent.click(screen.getByRole("menuitemradio", { name: /stay/i }));

    expect(onSelectEyedropperMode).toHaveBeenCalledWith("stay");
    expect(menu()).toBeNull();
  });

  it("ticks the mode in force", () => {
    render(<PixelStudioTools {...base} eyedropperMode="stay" />);
    longPress(eyedropperButton());

    expect(
      screen.getByRole("menuitemradio", { name: /stay/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: /return/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("choosing a mode does NOT also select the tool", () => {
    const onSelectTool = vi.fn();
    render(<PixelStudioTools {...base} onSelectTool={onSelectTool} />);
    longPress(eyedropperButton());

    fireEvent.click(screen.getByRole("menuitemradio", { name: /stay/i }));

    expect(onSelectTool).not.toHaveBeenCalled();
  });
});

describe("dismissing", () => {
  it("⭐ an outside pointerdown closes it", () => {
    render(<PixelStudioTools {...base} />);
    longPress(eyedropperButton());
    expect(menu()).not.toBeNull();

    fireEvent.pointerDown(document.body);

    expect(menu()).toBeNull();
  });

  it("Escape closes it", () => {
    render(<PixelStudioTools {...base} />);
    longPress(eyedropperButton());

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu()).toBeNull();
  });

  it("a second long press toggles it shut", () => {
    render(<PixelStudioTools {...base} />);
    longPress(eyedropperButton());
    expect(menu()).not.toBeNull();

    longPress(eyedropperButton());

    expect(menu()).toBeNull();
  });
});
