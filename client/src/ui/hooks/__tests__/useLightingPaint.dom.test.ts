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

/* ══ ONE STROKE = ONE UNDO ENTRY (plan 04 task 02) ════════════════════════ */

/**
 * ⚠️ The invariant these pin is not "a callback fires". It is that the history
 * transaction wrapping a stroke is opened exactly once and closed exactly
 * once — because an open transaction that is never closed swallows every
 * subsequent edit in the app (`PixelStore.ts:958-960`), and a second open
 * while one is in flight COMMITS the outer one, cutting the stroke in two.
 */
describe("useLightingPaint — the stroke history transaction", () => {
  it("a whole drag opens ONE transaction and closes it ONCE", () => {
    const onStrokeStart = vi.fn();
    const onStrokeEnd = vi.fn();
    const opts = makeOptions({ onStrokeStart, onStrokeEnd });
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.beginStroke({ x: 0, y: 0 }, false));
    act(() => result.current.continueStroke({ x: 1, y: 0 }, false));
    act(() => result.current.continueStroke({ x: 2, y: 0 }, false));
    act(() => result.current.continueStroke({ x: 3, y: 0 }, false));
    act(() => result.current.endStroke());

    expect(onStrokeStart).toHaveBeenCalledTimes(1);
    expect(onStrokeStart).toHaveBeenCalledWith("Paint normals");
    expect(onStrokeEnd).toHaveBeenCalledTimes(1);
    // …and the four paints that the one transaction collapses.
    expect(opts.paintNormals).toHaveBeenCalledTimes(4);
  });

  it("labels the transaction per edit mode", () => {
    const onStrokeStart = vi.fn();
    const { result } = renderHook(() =>
      useLightingPaint(makeOptions({ editMode: "height", onStrokeStart })),
    );

    act(() => result.current.beginStroke({ x: 0, y: 0 }, false));

    expect(onStrokeStart).toHaveBeenCalledWith("Paint heights");
  });

  it("🔧 a DOUBLE `endStroke` closes the transaction only once", () => {
    // `endStroke` is wired to BOTH `onMouseUp` and `onMouseLeave`, so the pair
    // firing back to back is routine, not pathological.
    const onStrokeEnd = vi.fn();
    const { result } = renderHook(() =>
      useLightingPaint(makeOptions({ onStrokeEnd })),
    );

    act(() => result.current.beginStroke({ x: 0, y: 0 }, false));
    act(() => result.current.endStroke());
    act(() => result.current.endStroke());

    expect(onStrokeEnd).toHaveBeenCalledTimes(1);
  });

  it("`endStroke` with no stroke in flight opens/closes nothing", () => {
    const onStrokeEnd = vi.fn();
    const { result } = renderHook(() =>
      useLightingPaint(makeOptions({ onStrokeEnd })),
    );

    act(() => result.current.endStroke());

    expect(onStrokeEnd).not.toHaveBeenCalled();
  });

  it("OBSERVED: a brush resolving to NO cells still opens AND closes one", () => {
    // The choice is deliberate: `beginStroke` sets `isPaintingRef` BEFORE it
    // resolves the brush (legacy ordering, pinned above), so a stroke really is
    // in flight even when nothing paints. Opening unconditionally keeps
    // begin/end symmetric; an empty transaction commits no entry, so it costs
    // nothing. Opening lazily on the first successful paint would leave
    // `endStroke` guessing whether to close — that is how one gets stranded.
    const onStrokeStart = vi.fn();
    const onStrokeEnd = vi.fn();
    const opts = makeOptions({
      resolveBrushCells: () => [],
      onStrokeStart,
      onStrokeEnd,
    });
    const { result } = renderHook(() => useLightingPaint(opts));

    act(() => result.current.beginStroke({ x: 1, y: 1 }, false));
    act(() => result.current.continueStroke({ x: 2, y: 2 }, false));
    act(() => result.current.endStroke());

    expect(onStrokeStart).toHaveBeenCalledTimes(1);
    expect(onStrokeEnd).toHaveBeenCalledTimes(1);
    expect(opts.paintNormals).not.toHaveBeenCalled();
  });

  it("🔧 UNMOUNTING mid-stroke closes the transaction", () => {
    // Otherwise every later edit in the app buffers into the orphan and
    // disappears — the failure `PixelStore.ts:958-960` warns about.
    const onStrokeEnd = vi.fn();
    const { result, unmount } = renderHook(() =>
      useLightingPaint(makeOptions({ onStrokeEnd })),
    );

    act(() => result.current.beginStroke({ x: 0, y: 0 }, false));
    expect(onStrokeEnd).not.toHaveBeenCalled();

    unmount();

    expect(onStrokeEnd).toHaveBeenCalledTimes(1);
  });

  it("unmounting with NO stroke in flight closes nothing", () => {
    const onStrokeEnd = vi.fn();
    const { unmount } = renderHook(() =>
      useLightingPaint(makeOptions({ onStrokeEnd })),
    );

    unmount();

    expect(onStrokeEnd).not.toHaveBeenCalled();
  });

  it("🔧 the callbacks do NOT reintroduce a render per painted pixel", () => {
    // The zero-render pin at the top of this file, re-run WITH the transaction
    // callbacks supplied — a `useState` for "is a transaction open" would fail
    // here and nowhere else.
    let renders = 0;
    const opts = makeOptions({
      onStrokeStart: vi.fn(),
      onStrokeEnd: vi.fn(),
    });
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

    expect(renders).toBe(afterMount);
    expect(opts.paintNormals).toHaveBeenCalledTimes(50);
    expect(opts.onStrokeStart).toHaveBeenCalledTimes(1);
    expect(opts.onStrokeEnd).toHaveBeenCalledTimes(1);
  });
});
