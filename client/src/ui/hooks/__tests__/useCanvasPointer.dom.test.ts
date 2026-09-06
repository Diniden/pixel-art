/**
 * `useCanvasPointer` — WIRED at last (REFRESH task 32).
 *
 * The hook shipped in W23 but was never connected: `Canvas.tsx` still held
 * ~600 lines of gesture arbitration tangled into a local `useState` cluster,
 * and W23 stopped at its scope boundary rather than forcing it.
 * `CanvasInteractionStore` is what made the wiring possible — the hook needs
 * `isDrawing` / `drawStartPoint` as VALUES and `startDrawing` as a callback,
 * which is exactly the shape a small transient store provides.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE INVARIANT THIS FILE EXISTS TO PIN: ONE STROKE CURSOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The hook allocates `lastStrokePixelRef` internally and RETURNS it. Its own
 * closures capture that internal binding — in particular the guard that nulls
 * the cursor when the pointer leaves the drawable area, so a re-entry does not
 * rasterise a line across the sprite from wherever the pointer left.
 *
 * A caller that kept a SECOND ref for the tool handlers would diverge on
 * exactly that path. `CanvasContainer` therefore binds the handlers to the
 * hook's returned ref rather than allocating its own. These tests assert the
 * behaviour that binding buys, so a future refactor that reintroduces a second
 * ref fails here instead of shipping a drawing bug.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasPointer, canDispatchTool } from "../useCanvasPointer";
import type { ToolContext } from "../../canvas/tools/toolHandlers";

/** A ToolContext whose effects are all spies. */
function makeCtx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    gridWidth: 16,
    gridHeight: 16,
    brushSize: 1,
    currentColor: { r: 255, g: 0, b: 0, a: 255 },
    pencilShape: (p) => [
      { x: p.x, y: p.y, color: { r: 0, g: 0, b: 0, a: 255 } },
    ],
    eraserShapeFn: (p) => [
      { x: p.x, y: p.y, color: { r: 0, g: 0, b: 0, a: 255 } },
    ],
    line: (a, b) => [a, b],
    shapeMode: "both",
    borderRadius: 0,
    lastStrokePixel: null,
    setLastStrokePixel: () => {},
    beginStroke: vi.fn(),
    endDrawing: vi.fn(),
    setPixels: vi.fn(),
    setPreviewPixels: vi.fn(),
    floodFillAt: () => [],
    gaussianFillAt: () => [],
    squarePixelsAt: () => [],
    rectanglePreview: () => [],
    ellipsePreview: () => [],
    linePreview: () => [],
    ...over,
  };
}

/**
 * Mounts the hook the way `CanvasContainer` does: the tool context reads and
 * writes THE HOOK'S OWN cursor ref, exactly as the container binds it.
 */
function mount(opts: {
  currentTool: string;
  isDrawing: boolean;
  drawStartPoint?: { x: number; y: number } | null;
  coords?: (x: number, y: number) => { x: number; y: number } | null;
}) {
  const startDrawing = vi.fn();
  const setPixels = vi.fn();
  // The single cursor, bound after the hook returns — the container's pattern.
  const cursor: { ref: { current: { x: number; y: number } | null } | null } = {
    ref: null,
  };

  const hook = renderHook(() =>
    useCanvasPointer({
      currentTool: opts.currentTool,
      getToolContext: () =>
        makeCtx({
          setPixels,
          lastStrokePixel: cursor.ref?.current ?? null,
          setLastStrokePixel: (p) => {
            if (cursor.ref) cursor.ref.current = p;
          },
        }),
      getCoords: opts.coords ?? ((x, y) => ({ x, y })),
      startDrawing,
      isDrawing: opts.isDrawing,
      drawStartPoint: opts.drawStartPoint ?? null,
    }),
  );
  cursor.ref = hook.result.current.lastStrokePixelRef;
  return { ...hook, startDrawing, setPixels, cursor };
}

describe("useCanvasPointer — the ONE-CURSOR invariant", () => {
  it("the ref the handlers write IS the ref the hook returns", () => {
    const h = mount({ currentTool: "pixel", isDrawing: false });
    act(() => {
      h.result.current.beginStroke(3, 4, "mouse");
    });
    // `paintDown` called `setLastStrokePixel`, which wrote through the bound
    // cursor. If the container had allocated a second ref, this would be null.
    expect(h.result.current.lastStrokePixelRef.current).toEqual({ x: 3, y: 4 });
  });

  it("leaving the drawable area CLEARS the cursor the handlers read", () => {
    // The whole point: a re-entry must not bridge a line across the sprite.
    let outside = false;
    const h = mount({
      currentTool: "pixel",
      isDrawing: true,
      coords: (x, y) => (outside ? null : { x, y }),
    });

    act(() => {
      h.result.current.continueStroke(5, 5, "mouse");
    });
    expect(h.result.current.lastStrokePixelRef.current).toEqual({ x: 5, y: 5 });

    outside = true;
    act(() => {
      h.result.current.continueStroke(999, 999, "mouse");
    });
    // Cleared — and because there is only one ref, the tool handlers see it.
    expect(h.result.current.lastStrokePixelRef.current).toBeNull();
    expect(h.cursor.ref?.current).toBeNull();
  });
});

describe("useCanvasPointer — device parity and the touch subset", () => {
  it("both devices dispatch the SAME handler for a paint tool", () => {
    const mouse = mount({ currentTool: "pixel", isDrawing: false });
    act(() => {
      mouse.result.current.beginStroke(2, 2, "mouse");
    });
    const touch = mount({ currentTool: "pixel", isDrawing: false });
    act(() => {
      touch.result.current.beginStroke(2, 2, "touch");
    });
    // Identical writes: `toolHandlers` carries `device` but never branches on
    // it — the structural version of the Q44 / R10 drift fix.
    expect(mouse.setPixels.mock.calls).toEqual(touch.setPixels.mock.calls);
  });

  it("touch does NOT dispatch the three remaining mouse-only tools", () => {
    // ⚠️ THREE, NOT FOUR. `"selection"` was the fourth until plan 09 task 08
    // gave it the touch gesture design this comment used to say it needed —
    // see `selectionTouch.dom.test.tsx`. These three still have none.
    for (const t of ["eyedropper", "origin", "reference-trace"]) {
      expect(canDispatchTool(t, "mouse")).toBe(true);
      // Preserved asymmetry, not a bug: the legacy touch handlers never
      // implemented these, and extending them needs its own gesture design.
      expect(canDispatchTool(t, "touch")).toBe(false);
    }
    for (const t of ["pixel", "eraser", "line", "flood-fill"]) {
      expect(canDispatchTool(t, "touch")).toBe(true);
    }
  });

  it("a touch on a mouse-only tool is a no-op, not a fallthrough to drawing", () => {
    const h = mount({ currentTool: "eyedropper", isDrawing: false });
    let handled = true;
    act(() => {
      handled = h.result.current.beginStroke(1, 1, "touch");
    });
    expect(handled).toBe(false);
    expect(h.startDrawing).not.toHaveBeenCalled();
    expect(h.setPixels).not.toHaveBeenCalled();
  });
});

describe("useCanvasPointer — gesture gating", () => {
  it("a move without an open gesture is not dispatched", () => {
    const h = mount({ currentTool: "pixel", isDrawing: false });
    let handled = true;
    act(() => {
      handled = h.result.current.continueStroke(1, 1, "mouse");
    });
    expect(handled).toBe(false);
    expect(h.setPixels).not.toHaveBeenCalled();
  });

  it("pointer-down opens the gesture through the injected callback", () => {
    const h = mount({ currentTool: "pixel", isDrawing: false });
    act(() => {
      h.result.current.beginStroke(7, 8, "mouse");
    });
    // `startDrawing` is CanvasInteractionStore's action, injected — the hook
    // holds no store reference of its own.
    expect(h.startDrawing).toHaveBeenCalledWith({ x: 7, y: 8 });
  });

  it("the shape tools preview against drawStartPoint, not the cursor", () => {
    const setPreviewPixels = vi.fn();
    const linePreview = vi.fn(() => [{ x: 0, y: 0 }]);
    const hook = renderHook(() =>
      useCanvasPointer({
        currentTool: "line",
        getToolContext: () => makeCtx({ setPreviewPixels, linePreview }),
        getCoords: (x, y) => ({ x, y }),
        startDrawing: () => {},
        isDrawing: true,
        drawStartPoint: { x: 1, y: 1 },
      }),
    );
    act(() => {
      hook.result.current.continueStroke(9, 9, "mouse");
    });
    expect(linePreview).toHaveBeenCalledWith({ x: 1, y: 1 }, { x: 9, y: 9 });
    expect(setPreviewPixels).toHaveBeenCalled();
  });

  /* ⚠️ REGRESSION (2026-09-01): line/rectangle/ellipse did nothing at all.
     `beginStroke` used to bail on `if (!handler?.onDown) return false` BEFORE
     calling `startDrawing`. The shape tools define only `onMove` — they preview
     on drag and commit on release — so the gesture never opened for them, and
     `continueStroke`'s `if (!isDrawing)` then rejected every move.

     The test above cannot catch that: it injects `isDrawing: true` and a
     `drawStartPoint` by hand, which is precisely the state `beginStroke` was
     failing to produce. These drive the DOWN path instead, which is the half
     that broke. */
  for (const tool of ["line", "rectangle", "ellipse"]) {
    it(`${tool} OPENS the gesture on pointer-down despite having no onDown`, () => {
      const h = mount({ currentTool: tool, isDrawing: false });
      let handled = false;
      act(() => {
        handled = h.result.current.beginStroke(4, 5, "mouse");
      });
      expect(handled).toBe(true);
      expect(h.startDrawing).toHaveBeenCalledWith({ x: 4, y: 5 });
    });
  }

  it("an unhandled tool still does NOT open a gesture", () => {
    const h = mount({ currentTool: "not-a-real-tool", isDrawing: false });
    let handled = true;
    act(() => {
      handled = h.result.current.beginStroke(1, 1, "mouse");
    });
    expect(handled).toBe(false);
    expect(h.startDrawing).not.toHaveBeenCalled();
  });
});
