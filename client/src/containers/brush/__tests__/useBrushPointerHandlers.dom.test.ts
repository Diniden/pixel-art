/**
 * `useBrushPointerHandlers` — the brush canvas's device layer (Brush Studio
 * task 20; touch arbitration and the mouse pan from follow-ups task 06).
 *
 * The hook was lifted verbatim out of `BrushCanvasContainer` so the gesture
 * wiring fit under `max-lines`; these tests pin what the lift must preserve:
 * which events reach `beginPointer` / `continuePointer` with which device,
 * the hover marker's lifecycle, the WINDOW `mouseup` bound only while a
 * gesture is open, and the pinch / cancel paths that abort rather than
 * finish. Task 06 replaced the hand-rolled pinch with `canvasTouchFilter`'s
 * arbitration — two FINGERS are a pinch the engine owns, a stylus plus a
 * finger is a stroke, a lone finger under `pencilOnly` is nothing — and added
 * the middle / alt mouse pan through the engine's pan ref. Every effect is a
 * spy — no store, no DOM canvas.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBrushPointerHandlers } from "../useBrushPointerHandlers";
import type { BrushPointerHandlerArgs } from "../useBrushPointerHandlers";

type MouseEv = React.MouseEvent<HTMLCanvasElement>;
type TouchEv = React.TouchEvent<HTMLCanvasElement>;

const mouse = (
  clientX: number,
  clientY: number,
  button = 0,
  altKey = false,
): MouseEv => ({ button, clientX, clientY, altKey }) as unknown as MouseEv;

interface Contact {
  clientX: number;
  clientY: number;
  /** WebKit's `Touch.touchType`; absent = a finger. */
  touchType?: "stylus" | "direct";
  target?: unknown;
}

/** Contacts as the filter consumes them: a `target` inside the (null) container. */
const touch = (...contacts: readonly Contact[]): TouchEv =>
  ({
    touches: contacts.map((c) => ({ target: null, ...c })),
  }) as unknown as TouchEv;

const finger = (clientX: number, clientY: number): Contact => ({
  clientX,
  clientY,
  touchType: "direct",
});
const pencil = (clientX: number, clientY: number): Contact => ({
  clientX,
  clientY,
  touchType: "stylus",
});

function makeArgs(
  overrides: Partial<BrushPointerHandlerArgs> = {},
): BrushPointerHandlerArgs {
  return {
    inert: false,
    hasLayer: true,
    isDrawing: false,
    // `null` counts every touch, exactly as `touchesInContainer` does.
    containerRef: { current: null },
    pencilOnly: false,
    isPinching: vi.fn(() => false),
    viewPanRef: { current: { x: 0, y: 0 } },
    setViewPanOffset: vi.fn(),
    scheduleCommitPan: vi.fn(),
    getCoords: vi.fn((x: number, y: number) => ({ x: x / 10, y: y / 10 })),
    setHoverPixel: vi.fn(),
    beginPointer: vi.fn(),
    continuePointer: vi.fn(),
    finishStroke: vi.fn(),
    abortStroke: vi.fn(),
    ...overrides,
  };
}

function mount(overrides: Partial<BrushPointerHandlerArgs> = {}) {
  const args = makeArgs(overrides);
  const hook = renderHook(
    (props: BrushPointerHandlerArgs) => useBrushPointerHandlers(props),
    { initialProps: args },
  );
  return { args, ...hook };
}

describe("mouse", () => {
  it("a primary-button press dispatches beginPointer as a mouse", () => {
    const { args, result } = mount();
    act(() => result.current.handlers.onMouseDown(mouse(30, 40)));
    expect(args.beginPointer).toHaveBeenCalledWith(30, 40, "mouse");
  });

  it("a secondary button never reaches beginPointer", () => {
    const { args, result } = mount();
    act(() => result.current.handlers.onMouseDown(mouse(1, 1, 2)));
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it.each([
    ["an inert tool", { inert: true }],
    ["no selected layer", { hasLayer: false }],
  ])("a press with %s never reaches beginPointer", (_label, over) => {
    const { args, result } = mount(over);
    act(() => result.current.handlers.onMouseDown(mouse(1, 1)));
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it("a move with no gesture open only moves the hover marker", () => {
    const { args, result } = mount();
    act(() => result.current.handlers.onMouseMove(mouse(30, 40)));
    expect(args.getCoords).toHaveBeenCalledWith(30, 40);
    expect(args.setHoverPixel).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("a move during a gesture hides the marker and continues as a mouse", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.handlers.onMouseMove(mouse(30, 40)));
    expect(args.setHoverPixel).toHaveBeenCalledWith(null);
    expect(args.continuePointer).toHaveBeenCalledWith(30, 40, "mouse");
  });

  it("a move during a gesture on an inert tool continues nothing", () => {
    const { args, result } = mount({ isDrawing: true, inert: true });
    act(() => result.current.handlers.onMouseMove(mouse(30, 40)));
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("leaving the surface clears the marker", () => {
    const { args, result } = mount();
    act(() => result.current.handlers.onMouseLeave());
    expect(args.setHoverPixel).toHaveBeenCalledWith(null);
  });

  it("⭐ the release is a WINDOW mouseup, bound only while a gesture is open", () => {
    const { args, rerender } = mount({ isDrawing: false });
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(args.finishStroke).not.toHaveBeenCalled();

    rerender({ ...args, isDrawing: true });
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(args.finishStroke).toHaveBeenCalledTimes(1);

    rerender({ ...args, isDrawing: false });
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(args.finishStroke).toHaveBeenCalledTimes(1);
  });
});

describe("mouse pan — middle button, or alt + primary (task 06)", () => {
  it.each([
    ["the middle button", mouse(10, 10, 1)],
    ["alt + primary", mouse(10, 10, 0, true)],
  ])("⭐ %s pans and never opens a stroke", (_label, press) => {
    const { args, result } = mount();
    act(() => result.current.handlers.onMouseDown(press));
    expect(result.current.isPanning).toBe(true);
    expect(args.beginPointer).not.toHaveBeenCalled();

    // +dx/+dy on top of the engine's LIVE pan, committed on its debounce.
    args.viewPanRef.current = { x: 100, y: 50 };
    act(() => result.current.handlers.onMouseMove(mouse(25, 40)));
    expect(args.setViewPanOffset).toHaveBeenCalledWith({ x: 115, y: 80 });
    expect(args.scheduleCommitPan).toHaveBeenCalledTimes(1);
    expect(args.continuePointer).not.toHaveBeenCalled();

    // Incremental: the next move is measured from the last point.
    args.viewPanRef.current = { x: 115, y: 80 };
    act(() => result.current.handlers.onMouseMove(mouse(20, 45)));
    expect(args.setViewPanOffset).toHaveBeenLastCalledWith({ x: 110, y: 85 });
  });

  it("the window mouseup ends the pan without finishing a stroke", () => {
    const { args, result } = mount();
    act(() => result.current.handlers.onMouseDown(mouse(10, 10, 1)));
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(result.current.isPanning).toBe(false);
    expect(args.finishStroke).not.toHaveBeenCalled();
    // And a later move pans nothing.
    act(() => result.current.handlers.onMouseMove(mouse(50, 50)));
    expect(args.setViewPanOffset).not.toHaveBeenCalled();
  });

  it("a pan press pans even on an inert tool or with no layer", () => {
    const { args, result } = mount({ inert: true, hasLayer: false });
    act(() => result.current.handlers.onMouseDown(mouse(10, 10, 0, true)));
    expect(result.current.isPanning).toBe(true);
    act(() => result.current.handlers.onMouseMove(mouse(11, 12)));
    expect(args.setViewPanOffset).toHaveBeenCalledWith({ x: 1, y: 2 });
  });
});

describe("touch", () => {
  it("one finger down dispatches beginPointer as a touch, with no hover marker", () => {
    const { args, result } = mount();
    act(() => result.current.handlers.onTouchStart(touch(finger(5, 6))));
    expect(args.beginPointer).toHaveBeenCalledWith(5, 6, "touch");
    expect(args.setHoverPixel).not.toHaveBeenCalled();
  });

  it("a contact with no touchType (non-WebKit) still draws as a finger", () => {
    const { args, result } = mount();
    act(() =>
      result.current.handlers.onTouchStart(touch({ clientX: 5, clientY: 6 })),
    );
    expect(args.beginPointer).toHaveBeenCalledWith(5, 6, "touch");
  });

  it.each([
    ["an inert tool", { inert: true }],
    ["no selected layer", { hasLayer: false }],
  ])("one finger down with %s does nothing", (_label, over) => {
    const { args, result } = mount(over);
    act(() => result.current.handlers.onTouchStart(touch(finger(5, 6))));
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it("⭐ two fingers are a pinch: it aborts an open gesture, opens none, and zooms NOTHING here", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() =>
      result.current.handlers.onTouchStart(touch(finger(0, 0), finger(30, 40))),
    );
    expect(args.abortStroke).toHaveBeenCalledTimes(1);
    expect(args.beginPointer).not.toHaveBeenCalled();
    // The engine's native listener owns the pinch; a move here touches no
    // pan, no zoom, no stroke.
    act(() =>
      result.current.handlers.onTouchMove(touch(finger(0, 0), finger(60, 80))),
    );
    expect(args.setViewPanOffset).not.toHaveBeenCalled();
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("two fingers with nothing open abort nothing", () => {
    const { args, result } = mount({ isDrawing: false });
    act(() =>
      result.current.handlers.onTouchStart(touch(finger(0, 0), finger(30, 40))),
    );
    expect(args.abortStroke).not.toHaveBeenCalled();
  });

  it("⭐ a stylus plus a resting finger is a stroke by the stylus, not a pinch", () => {
    const { args, result } = mount();
    act(() =>
      result.current.handlers.onTouchStart(
        touch(finger(300, 300), pencil(5, 6)),
      ),
    );
    expect(args.abortStroke).not.toHaveBeenCalled();
    expect(args.beginPointer).toHaveBeenCalledWith(5, 6, "touch");
  });

  it("a stylus plus a resting finger keeps drawing on move, by the stylus", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() =>
      result.current.handlers.onTouchMove(
        touch(finger(300, 300), pencil(7, 8)),
      ),
    );
    expect(args.continuePointer).toHaveBeenCalledWith(7, 8, "touch");
  });

  it("⭐ under pencilOnly a lone finger opens no stroke and writes nothing", () => {
    const { args, result } = mount({ pencilOnly: true });
    act(() => result.current.handlers.onTouchStart(touch(finger(5, 6))));
    expect(args.beginPointer).not.toHaveBeenCalled();
    expect(args.setViewPanOffset).not.toHaveBeenCalled();
    expect(args.abortStroke).not.toHaveBeenCalled();
    // Nor does a finger drag continue a gesture something else opened.
    const open = mount({ pencilOnly: true, isDrawing: true });
    act(() => open.result.current.handlers.onTouchMove(touch(finger(7, 8))));
    expect(open.args.continuePointer).not.toHaveBeenCalled();
    // The Pencil still draws.
    act(() => result.current.handlers.onTouchStart(touch(pencil(5, 6))));
    expect(args.beginPointer).toHaveBeenCalledWith(5, 6, "touch");
  });

  it("only touches inside the container count (a thumb on a rail is not a pinch)", () => {
    const container = document.createElement("div");
    const inside = document.createElement("canvas");
    container.appendChild(inside);
    const outside = document.createElement("div");
    const { args, result } = mount({
      isDrawing: true,
      containerRef: { current: container },
    });
    act(() =>
      result.current.handlers.onTouchStart(
        touch(
          { ...finger(5, 6), target: inside },
          { ...finger(500, 500), target: outside },
        ),
      ),
    );
    expect(args.abortStroke).not.toHaveBeenCalled();
    expect(args.beginPointer).toHaveBeenCalledWith(5, 6, "touch");
  });

  it("a move bails while the engine reports a pinch in flight", () => {
    const { args, result } = mount({
      isDrawing: true,
      isPinching: vi.fn(() => true),
    });
    act(() => result.current.handlers.onTouchMove(touch(finger(7, 8))));
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("one finger moving during a gesture continues as a touch", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.handlers.onTouchMove(touch(finger(7, 8))));
    expect(args.continuePointer).toHaveBeenCalledWith(7, 8, "touch");
  });

  it("one finger moving with no gesture open, or on an inert tool, continues nothing", () => {
    const idle = mount({ isDrawing: false });
    act(() => idle.result.current.handlers.onTouchMove(touch(finger(7, 8))));
    expect(idle.args.continuePointer).not.toHaveBeenCalled();

    const inert = mount({ isDrawing: true, inert: true });
    act(() => inert.result.current.handlers.onTouchMove(touch(finger(7, 8))));
    expect(inert.args.continuePointer).not.toHaveBeenCalled();
  });

  it("a lift with a contact still on the viewport ends nothing", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.handlers.onTouchEnd(touch(finger(1, 1))));
    expect(args.finishStroke).not.toHaveBeenCalled();
  });

  it("the last contact lifting finishes an open gesture — and only an open one", () => {
    const open = mount({ isDrawing: true });
    act(() => open.result.current.handlers.onTouchEnd(touch()));
    expect(open.args.finishStroke).toHaveBeenCalledTimes(1);

    const idle = mount({ isDrawing: false });
    act(() => idle.result.current.handlers.onTouchEnd(touch()));
    expect(idle.args.finishStroke).not.toHaveBeenCalled();
  });

  it("a cancel aborts", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.handlers.onTouchCancel());
    expect(args.abortStroke).toHaveBeenCalledTimes(1);
  });
});
