/**
 * The eyedropper's mode menu, driven by the REAL gesture.
 *
 * ⚠️ THE OPENING GESTURE CHANGED ON 2026-08-31. It was a long press; it is now
 * a double-tap / double-click (with right-click as the pointer equivalent).
 * The owner asked for long-press to show TOOLTIPS on every tool, on every
 * platform, and a touch device has only the one hold gesture — it cannot both
 * describe a button and operate it. See `PixelStudioTools`' note on
 * `secondary`.
 *
 * The original hazard this file was written for is GONE with that change: a
 * long press fired at 500 ms while the finger was still down, so the menu
 * mounted mid-gesture with its dismissal listener live, and the pointerup and
 * click that ended the same gesture could close it instantly. A double-click
 * completes before the menu mounts, so no part of the opening gesture is left
 * to dismiss it. The release-survival cases are kept anyway, retargeted, since
 * they cost nothing and the dismissal listener is still live.
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

/** The eyedropper's button, found the way a user finds it: by its label.
 *
 * ⚠️ Reads `aria-label`, not `title`. The tool buttons' `title=` attributes
 * became `Tooltip` wrappers on 2026-08-31 — a `title` is invisible on an iPad
 * and unstyleable everywhere, which is why the tools had no tooltips there. */
function eyedropperButton(): HTMLElement {
  const btn = screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("aria-label")?.startsWith("Eyedropper"));
  if (!btn) throw new Error("no eyedropper button rendered");
  return btn;
}

const menu = () => screen.queryByRole("menu", { name: "Eyedropper mode" });

/**
 * The COMPLETE opening gesture: two taps, including the clicks the browser
 * sends before the `dblclick`.
 *
 * ⚠️ The trailing events are the point. `onClick` fires TWICE before
 * `onDoubleClick` does, so a helper that only dispatches `doubleClick` would
 * pass even if the real gesture selected the tool twice and then opened a menu
 * that the second click had already dismissed.
 */
function doubleTap(el: HTMLElement) {
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(el, { clientX: 10, clientY: 10 });
  fireEvent.click(el, { clientX: 10, clientY: 10 });
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(el, { clientX: 10, clientY: 10 });
  fireEvent.click(el, { clientX: 10, clientY: 10 });
  fireEvent.doubleClick(el, { clientX: 10, clientY: 10 });
}

/**
 * A long press — which must now do NOTHING to the menu, because that gesture
 * belongs to the tooltip.
 */
function longPress(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerType: "touch", clientX: 10, clientY: 10 });
  act(() => {
    vi.advanceTimersByTime(600);
  });
  fireEvent.pointerUp(el, { pointerType: "touch", clientX: 10, clientY: 10 });
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

  it("⭐ a double tap OPENS it — and it SURVIVES the clicks that precede it", () => {
    // `onClick` fires twice before `onDoubleClick`, and the menu's dismissal
    // listener goes live the moment it mounts.
    render(<PixelStudioTools {...base} />);

    doubleTap(eyedropperButton());

    expect(menu()).not.toBeNull();
  });

  it("a bare double click opens it too — the mouse route", () => {
    render(<PixelStudioTools {...base} />);

    fireEvent.doubleClick(eyedropperButton());

    expect(menu()).not.toBeNull();
  });

  it("⭐ a LONG PRESS no longer opens it — that gesture is the tooltip's now", () => {
    // Changed 2026-08-31 at the owner's request. Pinned rather than deleted:
    // restoring a long-press here would silently take the gesture back off the
    // tooltip on every tool button.
    render(<PixelStudioTools {...base} />);

    longPress(eyedropperButton());

    expect(menu()).toBeNull();
  });

  it("a plain click does NOT open it — that still just selects the tool", () => {
    const onSelectTool = vi.fn();
    render(<PixelStudioTools {...base} onSelectTool={onSelectTool} />);

    fireEvent.click(eyedropperButton());

    expect(menu()).toBeNull();
    expect(onSelectTool).toHaveBeenCalledWith("eyedropper");
  });

  it("the double tap selects the tool on the way — and that is harmless", () => {
    // ⚠️ A DELIBERATE behaviour change. The long press used to suppress its
    // trailing click via `didLongPress()`; a double tap has no such guard and
    // its two clicks DO select the eyedropper before the menu opens. That is
    // fine, and is why the secondary action had to be idempotent: selecting
    // the tool you are configuring is what the user wanted anyway.
    const onSelectTool = vi.fn();
    render(<PixelStudioTools {...base} onSelectTool={onSelectTool} />);

    doubleTap(eyedropperButton());

    expect(onSelectTool).toHaveBeenCalledWith("eyedropper");
    expect(menu()).not.toBeNull();
  });

  it("no OTHER tool opens a menu on a double tap", () => {
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
      .find((b) => b.getAttribute("aria-label")?.startsWith("Pencil"))!;
    doubleTap(pencil);

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
    doubleTap(eyedropperButton());

    const el = menu()!;
    expect(el).not.toBeNull();
    expect(container.contains(el)).toBe(false);
    expect(document.body.contains(el)).toBe(true);
  });

  it("is not a DESCENDANT of the button — no nested-button markup", () => {
    render(<PixelStudioTools {...base} />);
    doubleTap(eyedropperButton());

    expect(eyedropperButton().contains(menu())).toBe(false);
  });

  it("carries the dock edge as a modifier", () => {
    render(<PixelStudioTools {...base} edge="bottom" />);
    doubleTap(eyedropperButton());

    expect(menu()!.className).toContain("eyedropper-mode-menu--bottom");
  });

  it("unmounts on close, leaving nothing behind in the body", () => {
    render(<PixelStudioTools {...base} />);
    doubleTap(eyedropperButton());
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
    doubleTap(eyedropperButton());

    fireEvent.click(screen.getByRole("menuitemradio", { name: /stay/i }));

    expect(onSelectEyedropperMode).toHaveBeenCalledWith("stay");
    expect(menu()).toBeNull();
  });

  it("ticks the mode in force", () => {
    render(<PixelStudioTools {...base} eyedropperMode="stay" />);
    doubleTap(eyedropperButton());

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
    doubleTap(eyedropperButton());

    // ⚠️ Scoped to the MENU CLICK, not the whole interaction. The opening
    // double tap legitimately selects the eyedropper on its way through (see
    // "the double tap selects the tool on the way"), so the old
    // `not.toHaveBeenCalled()` would now fail for a reason that has nothing to
    // do with what this test is about: clicking a menu item must not reach the
    // button underneath it.
    onSelectTool.mockClear();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /stay/i }));

    expect(onSelectTool).not.toHaveBeenCalled();
  });
});

describe("dismissing", () => {
  it("⭐ an outside pointerdown closes it", () => {
    render(<PixelStudioTools {...base} />);
    doubleTap(eyedropperButton());
    expect(menu()).not.toBeNull();

    fireEvent.pointerDown(document.body);

    expect(menu()).toBeNull();
  });

  it("Escape closes it", () => {
    render(<PixelStudioTools {...base} />);
    doubleTap(eyedropperButton());

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu()).toBeNull();
  });

  it("a second long press toggles it shut", () => {
    render(<PixelStudioTools {...base} />);
    doubleTap(eyedropperButton());
    expect(menu()).not.toBeNull();

    doubleTap(eyedropperButton());

    expect(menu()).toBeNull();
  });
});
