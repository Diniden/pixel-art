/**
 * `useBrushPointerHandlers` — the brush canvas's device layer (Brush Studio
 * task 20).
 *
 * The hook was lifted verbatim out of `BrushCanvasContainer` so the gesture
 * wiring fit under `max-lines`; these tests pin what the lift must preserve:
 * which events reach `beginPointer` / `continuePointer` with which device,
 * the hover marker's lifecycle, the WINDOW `mouseup` bound only while a
 * gesture is open, and the pinch / cancel paths that abort rather than
 * finish. Every effect is a spy — no store, no DOM canvas.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBrushPointerHandlers } from "../useBrushPointerHandlers";
import type { BrushPointerHandlerArgs } from "../useBrushPointerHandlers";

type MouseEv = React.MouseEvent<HTMLCanvasElement>;
type TouchEv = React.TouchEvent<HTMLCanvasElement>;

const mouse = (clientX: number, clientY: number, button = 0): MouseEv =>
  ({ button, clientX, clientY }) as unknown as MouseEv;

const touch = (
  ...contacts: readonly { clientX: number; clientY: number }[]
): TouchEv => ({ touches: contacts }) as unknown as TouchEv;

function makeArgs(
  overrides: Partial<BrushPointerHandlerArgs> = {},
): BrushPointerHandlerArgs {
  return {
    inert: false,
    hasLayer: true,
    isDrawing: false,
    getCoords: vi.fn((x: number, y: number) => ({ x: x / 10, y: y / 10 })),
    setHoverPixel: vi.fn(),
    beginPointer: vi.fn(),
    continuePointer: vi.fn(),
    finishStroke: vi.fn(),
    abortStroke: vi.fn(),
    zoomBy: vi.fn(),
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
    act(() => result.current.onMouseDown(mouse(30, 40)));
    expect(args.beginPointer).toHaveBeenCalledWith(30, 40, "mouse");
  });

  it("a secondary button never reaches beginPointer", () => {
    const { args, result } = mount();
    act(() => result.current.onMouseDown(mouse(1, 1, 2)));
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it.each([
    ["an inert tool", { inert: true }],
    ["no selected layer", { hasLayer: false }],
  ])("a press with %s never reaches beginPointer", (_label, over) => {
    const { args, result } = mount(over);
    act(() => result.current.onMouseDown(mouse(1, 1)));
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it("a move with no gesture open only moves the hover marker", () => {
    const { args, result } = mount();
    act(() => result.current.onMouseMove(mouse(30, 40)));
    expect(args.getCoords).toHaveBeenCalledWith(30, 40);
    expect(args.setHoverPixel).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("a move during a gesture hides the marker and continues as a mouse", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.onMouseMove(mouse(30, 40)));
    expect(args.setHoverPixel).toHaveBeenCalledWith(null);
    expect(args.continuePointer).toHaveBeenCalledWith(30, 40, "mouse");
  });

  it("a move during a gesture on an inert tool continues nothing", () => {
    const { args, result } = mount({ isDrawing: true, inert: true });
    act(() => result.current.onMouseMove(mouse(30, 40)));
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("leaving the surface clears the marker", () => {
    const { args, result } = mount();
    act(() => result.current.onMouseLeave());
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

describe("touch", () => {
  it("one finger down dispatches beginPointer as a touch, with no hover marker", () => {
    const { args, result } = mount();
    act(() => result.current.onTouchStart(touch({ clientX: 5, clientY: 6 })));
    expect(args.beginPointer).toHaveBeenCalledWith(5, 6, "touch");
    expect(args.setHoverPixel).not.toHaveBeenCalled();
  });

  it.each([
    ["an inert tool", { inert: true }],
    ["no selected layer", { hasLayer: false }],
  ])("one finger down with %s does nothing", (_label, over) => {
    const { args, result } = mount(over);
    act(() => result.current.onTouchStart(touch({ clientX: 5, clientY: 6 })));
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it("⭐ a second finger is a pinch: it aborts an open gesture and opens none", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() =>
      result.current.onTouchStart(
        touch({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 }),
      ),
    );
    expect(args.abortStroke).toHaveBeenCalledTimes(1);
    expect(args.beginPointer).not.toHaveBeenCalled();
  });

  it("a second finger with nothing open aborts nothing", () => {
    const { args, result } = mount({ isDrawing: false });
    act(() =>
      result.current.onTouchStart(
        touch({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 }),
      ),
    );
    expect(args.abortStroke).not.toHaveBeenCalled();
  });

  it("a pinch move zooms by the ratio of the finger distances", () => {
    const { args, result } = mount();
    act(() =>
      result.current.onTouchStart(
        touch({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 }), // 50
      ),
    );
    act(() =>
      result.current.onTouchMove(
        touch({ clientX: 0, clientY: 0 }, { clientX: 60, clientY: 80 }), // 100
      ),
    );
    expect(args.zoomBy).toHaveBeenCalledWith(2);
    act(() =>
      result.current.onTouchMove(
        touch({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 }), // 50
      ),
    );
    expect(args.zoomBy).toHaveBeenLastCalledWith(0.5);
    expect(args.continuePointer).not.toHaveBeenCalled();
  });

  it("a pinch move without a recorded start distance zooms nothing", () => {
    const { args, result } = mount();
    act(() =>
      result.current.onTouchMove(
        touch({ clientX: 0, clientY: 0 }, { clientX: 60, clientY: 80 }),
      ),
    );
    expect(args.zoomBy).not.toHaveBeenCalled();
  });

  it("one finger moving during a gesture continues as a touch", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.onTouchMove(touch({ clientX: 7, clientY: 8 })));
    expect(args.continuePointer).toHaveBeenCalledWith(7, 8, "touch");
  });

  it("one finger moving with no gesture open, or on an inert tool, continues nothing", () => {
    const idle = mount({ isDrawing: false });
    act(() =>
      idle.result.current.onTouchMove(touch({ clientX: 7, clientY: 8 })),
    );
    expect(idle.args.continuePointer).not.toHaveBeenCalled();

    const inert = mount({ isDrawing: true, inert: true });
    act(() =>
      inert.result.current.onTouchMove(touch({ clientX: 7, clientY: 8 })),
    );
    expect(inert.args.continuePointer).not.toHaveBeenCalled();
  });

  it("a lift with a finger still down ends nothing", () => {
    const { args, result } = mount({ isDrawing: true });
    act(() => result.current.onTouchEnd(touch({ clientX: 1, clientY: 1 })));
    expect(args.finishStroke).not.toHaveBeenCalled();
  });

  it("the last finger lifting finishes an open gesture — and only an open one", () => {
    const open = mount({ isDrawing: true });
    act(() => open.result.current.onTouchEnd(touch()));
    expect(open.args.finishStroke).toHaveBeenCalledTimes(1);

    const idle = mount({ isDrawing: false });
    act(() => idle.result.current.onTouchEnd(touch()));
    expect(idle.args.finishStroke).not.toHaveBeenCalled();
  });

  it("a cancel aborts and forgets the pinch distance", () => {
    const { args, result } = mount();
    act(() =>
      result.current.onTouchStart(
        touch({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 }),
      ),
    );
    act(() => result.current.onTouchCancel());
    expect(args.abortStroke).toHaveBeenCalledTimes(1);
    // The next pinch move has no baseline to zoom against.
    act(() =>
      result.current.onTouchMove(
        touch({ clientX: 0, clientY: 0 }, { clientX: 60, clientY: 80 }),
      ),
    );
    expect(args.zoomBy).not.toHaveBeenCalled();
  });

  it("the last finger lifting forgets the pinch distance too", () => {
    const { args, result } = mount();
    act(() =>
      result.current.onTouchStart(
        touch({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 }),
      ),
    );
    act(() => result.current.onTouchEnd(touch()));
    act(() =>
      result.current.onTouchMove(
        touch({ clientX: 0, clientY: 0 }, { clientX: 60, clientY: 80 }),
      ),
    );
    expect(args.zoomBy).not.toHaveBeenCalled();
  });
});
