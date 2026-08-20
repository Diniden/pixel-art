/**
 * `useLightingPaint` — and the pinning of W19 latent bug 2.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE INVARIANT THIS FILE EXISTS TO PIN: A STROKE DOES NOT RE-RENDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LightingCanvas.tsx:32` held the last painted cell in `useState`, so every
 * pointer move during a stroke re-rendered a 785-line component to remember a
 * coordinate nothing displays. Task 33 moved it — and `isPainting` — to refs.
 *
 * "It is a ref now" is not a falsifiable claim on its own, so the first test
 * below COUNTS RENDERS across a 50-cell stroke and asserts the count does not
 * grow with the stroke. That is the assertion a future refactor reintroducing
 * `useState` fails.
 *
 * `hoverPixel` deliberately stays state and deliberately DOES re-render — it
 * drives the brush overlay — and there is a test for that too, so the two are
 * not confused for one another.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLightingPaint } from "../useLightingPaint";
import type { UseLightingPaintOptions } from "../useLightingPaint";

/** The brush resolves to the single cell under the cursor, unless told not to. */
function makeOptions(over: Partial<UseLightingPaintOptions> = {}) {
  return {
    editMode: "normals" as const,
    resolveBrushCells: (c: { x: number; y: number }) => [c],
    paintNormals: vi.fn(),
    paintHeights: vi.fn(),
    ...over,
  };
}

describe("useLightingPaint — W19 BUG 2: no re-render per painted pixel", () => {
  it("🔧 a 50-cell stroke causes ZERO renders beyond the mount", () => {
    let renders = 0;
    const opts = makeOptions();
    const { result } = renderHook(() => {
      renders += 1;
      return useLightingPaint(opts);
    });

    const afterMount = renders;

    act(() => result.current.beginStroke({ x: 0, y: 0 }, false));
    for (let i = 1; i < 50; i++) {
      act(() => result.current.continueStroke({ x: i, y: 0 }, false));
    }
    act(() => result.current.endStroke());

    // The legacy implementation would have produced ~50 more.
    expect(renders).toBe(afterMount);
    expect(opts.paintNormals).toHaveBeenCalledTimes(50);
  });

  it("exposes `isPainting` through a REF, not a rendered value", () => {
    const { result } = renderHook(() => useLightingPaint(makeOptions()));

    expect(result.current.isPaintingRef.current).toBe(false);
    act(() => result.current.beginStroke({ x: 1, y: 1 }, false));
    expect(result.current.isPaintingRef.current).toBe(true);
    act(() => result.current.endStroke());
    expect(result.current.isPaintingRef.current).toBe(false);
  });

  it("`hoverPixel` DOES re-render — it drives the overlay", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useLightingPaint(makeOptions());
    });
    const before = renders;

    act(() => result.current.setHoverPixel({ x: 3, y: 4 }));

    expect(renders).toBeGreaterThan(before);
    expect(result.current.hoverPixel).toEqual({ x: 3, y: 4 });
  });
});

describe("useLightingPaint — the legacy behaviour, preserved verbatim", () => {
  it("skips a repeat of the cell already painted", () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.beginStroke({ x: 2, y: 2 }, false));
    act(() => result.current.continueStroke({ x: 2, y: 2 }, false));
    act(() => result.current.continueStroke({ x: 2, y: 2 }, false));

    expect(opts.paintNormals).toHaveBeenCalledTimes(1);
  });

  it("ignores `continueStroke` when no stroke is in flight", () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.continueStroke({ x: 1, y: 1 }, false));

    expect(opts.paintNormals).not.toHaveBeenCalled();
  });

  it("⚠️ leaves the cursor on the last PAINTED cell, not the last visited", () => {
    // Legacy order: resolve first, and advance `lastPaintPixel` only if there
    // was something to paint. So a drag across an empty region does not move
    // the cursor, and returning to the previous cell repaints it.
    const empty = new Set(["5,5"]);
    const opts = makeOptions({
      resolveBrushCells: (c) => (empty.has(`${c.x},${c.y}`) ? [] : [c]),
    });
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.beginStroke({ x: 4, y: 5 }, false));
    act(() => result.current.continueStroke({ x: 5, y: 5 }, false)); // empty
    act(() => result.current.continueStroke({ x: 4, y: 5 }, false)); // back

    // Two calls, not three: the empty cell painted nothing, and the return to
    // (4,5) was BLOCKED because the cursor never left it.
    expect(opts.paintNormals).toHaveBeenCalledTimes(1);
  });

  it("routes to `paintHeights` in height mode, and forwards `erase`", () => {
    const opts = makeOptions({ editMode: "height" });
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.beginStroke({ x: 1, y: 1 }, true));

    expect(opts.paintNormals).not.toHaveBeenCalled();
    expect(opts.paintHeights).toHaveBeenCalledWith([{ x: 1, y: 1 }], true);
  });

  it("clears the hover on `beginStroke` — the brush overlay hides while painting", () => {
    const { result } = renderHook(() => useLightingPaint(makeOptions()));

    act(() => result.current.setHoverPixel({ x: 7, y: 7 }));
    expect(result.current.hoverPixel).not.toBeNull();

    act(() => result.current.beginStroke({ x: 1, y: 1 }, false));
    expect(result.current.hoverPixel).toBeNull();
  });

  it("paints nothing when the brush resolves to no cells", () => {
    const opts = makeOptions({ resolveBrushCells: () => [] });
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.beginStroke({ x: 1, y: 1 }, false));
    act(() => result.current.continueStroke({ x: 2, y: 2 }, false));

    expect(opts.paintNormals).not.toHaveBeenCalled();
  });
});
