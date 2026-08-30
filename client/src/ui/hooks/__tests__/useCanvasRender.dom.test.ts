/**
 * `useCanvasRender` — the rAF scheduler and its dirty-region accumulator.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHAT THIS FILE EXISTS TO PIN: THE ACCUMULATOR NEVER DOWNGRADES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The hook had NO test file before plan 05 task 07 — the scheduler half was
 * covered only indirectly, through `CanvasContainer`'s DOM tests.
 *
 * The accumulator's failure modes are all silent and all look like "the
 * canvas is fine, mostly":
 *
 *   - dropping a region published earlier in the same frame  → a fast drag
 *     skips pixels
 *   - letting a `{cells}` region overwrite a standing `"all"` → the cells a
 *     wholesale grid replacement touched are never repainted, so a flip or a
 *     paste leaves the OLD artwork on screen
 *   - resetting before the paint rather than after            → the frame
 *     paints nothing
 *
 * None of those throw, and none change a pixel the tests below could not see.
 * So they are asserted directly, on the scope object the hook hands `render`.
 *
 * `requestAnimationFrame` is driven by hand: jsdom's is a `setTimeout`
 * shim, and waiting on real time would make every assertion a race.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StrictMode } from "react";
import {
  useCanvasRender,
  type DirtyScope,
} from "../useCanvasRender";

/* ── a hand-driven rAF ───────────────────────────────────────────────────── */

let frames: Map<number, FrameRequestCallback>;
let nextHandle: number;
/** Every handle ever cancelled — the StrictMode/leak assertions read this. */
let cancelled: number[];

function installRaf(): void {
  frames = new Map();
  nextHandle = 1;
  cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const handle = nextHandle++;
    frames.set(handle, cb);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    cancelled.push(handle);
    frames.delete(handle);
  });
}

/** Run every pending frame callback, exactly as a real vsync would. */
function flushFrames(): void {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, cb] of pending) cb(performance.now());
}

beforeEach(installRaf);
afterEach(() => vi.unstubAllGlobals());

/** A render spy that records the scope it was handed, frame by frame. */
function makeRender() {
  const scopes: DirtyScope[] = [];
  const render = vi.fn((scope: DirtyScope) => {
    scopes.push(scope);
  });
  return { render, scopes };
}

/** The cells the scope holds for one layer, sorted, as `"x,y"` strings. */
function cellsOf(scope: DirtyScope, layerId: string): string[] {
  if (scope.kind !== "cells") throw new Error(`scope is "all", not cells`);
  return (scope.byLayer.get(layerId) ?? [])
    .map((c) => `${c.x},${c.y}`)
    .sort();
}

/** Which layers the scope names at all. */
function layerIdsOf(scope: DirtyScope): string[] {
  if (scope.kind !== "cells") throw new Error(`scope is "all", not cells`);
  return [...scope.byLayer.keys()].sort();
}

describe("useCanvasRender — the scheduler (behaviour preserved)", () => {
  it("paints once on mount, on the next frame and not before", () => {
    const { render } = makeRender();
    renderHook(() => useCanvasRender(render, [1]));

    expect(render).not.toHaveBeenCalled();
    act(flushFrames);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated invalidations inside one frame into ONE paint", () => {
    const { render } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    render.mockClear();

    act(() => {
      result.current.invalidate();
      result.current.invalidate();
      result.current.invalidate();
    });
    act(flushFrames);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("calls the LATEST render, not the one captured when the frame was requested", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ fn }: { fn: () => void }) => useCanvasRender(fn, [1]),
      { initialProps: { fn: first } },
    );

    // A frame is pending from mount; swap the render before it fires.
    rerender({ fn: second });
    act(flushFrames);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops the pending frame without painting", () => {
    const { render } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));

    act(() => result.current.cancel());
    act(flushFrames);

    expect(render).not.toHaveBeenCalled();
  });

  it("repaints when deps change, and a deps change is a FULL repaint", () => {
    const { render, scopes } = makeRender();
    const { rerender } = renderHook(
      ({ dep }: { dep: number }) => useCanvasRender(render, [dep]),
      { initialProps: { dep: 1 } },
    );
    act(flushFrames);
    render.mockClear();
    scopes.length = 0;

    rerender({ dep: 2 });
    act(flushFrames);

    expect(render).toHaveBeenCalledTimes(1);
    expect(scopes[0]).toEqual({ kind: "all" });
  });

  it("cleanup cancels the pending frame and leaks no handle", () => {
    const { render } = makeRender();
    const { unmount } = renderHook(() => useCanvasRender(render, [1]));

    unmount();
    act(flushFrames);

    expect(render).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});

describe("useCanvasRender — the dirty accumulator", () => {
  it("a frame scheduled by invalidateRegion carries only those cells", () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames); // the mount paint
    scopes.length = 0;

    act(() =>
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 3, y: 4 }],
      }),
    );
    act(flushFrames);

    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.kind).toBe("cells");
    expect(cellsOf(scopes[0] as DirtyScope, "layer-a")).toEqual(["3,4"]);
  });

  it("merges two regions on DIFFERENT layers into one frame", () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;
    render.mockClear();

    act(() => {
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 1, y: 1 }],
      });
      result.current.invalidateRegion({
        layerId: "layer-b",
        cells: [{ x: 2, y: 2 }],
      });
    });
    act(flushFrames);

    // ONE paint, BOTH layers — the coalescing must not cost the first region.
    expect(render).toHaveBeenCalledTimes(1);
    const scope = scopes[0] as DirtyScope;
    expect(cellsOf(scope, "layer-a")).toEqual(["1,1"]);
    expect(cellsOf(scope, "layer-b")).toEqual(["2,2"]);
  });

  it("merges two regions on the SAME layer — this is the fast-drag case", () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;
    render.mockClear();

    act(() => {
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      });
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 2, y: 0 }],
      });
    });
    act(flushFrames);

    expect(render).toHaveBeenCalledTimes(1);
    // Rule 1: union, never replace. Replacing would silently skip 0,0 and 1,0.
    expect(cellsOf(scopes[0] as DirtyScope, "layer-a")).toEqual([
      "0,0",
      "1,0",
      "2,0",
    ]);
  });

  it("null promotes the frame to a FULL repaint (rule 2 / risk R6)", () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;

    act(() => {
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 1, y: 1 }],
      });
      result.current.invalidateRegion(null); // e.g. a flip, a paste, a load
    });
    act(flushFrames);

    expect(scopes[0]).toEqual({ kind: "all" });
  });

  it('⚠️ "all" is NEVER downgraded back to "cells" — the load-bearing rule', () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;

    act(() => {
      result.current.invalidateRegion(null);
      // A namable write landing in the SAME frame must not narrow the
      // wholesale one — the cells the flip touched would never be repainted.
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 1, y: 1 }],
      });
    });
    act(flushFrames);

    expect(scopes[0]).toEqual({ kind: "all" });
  });

  it('invalidate() also promotes a pending "cells" frame to "all"', () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;

    act(() => {
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 1, y: 1 }],
      });
      result.current.invalidate(); // zoom, focus mode, tool change, …
    });
    act(flushFrames);

    expect(scopes[0]).toEqual({ kind: "all" });
  });

  it("resets after the paint — the next frame does not re-carry old cells", () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;

    act(() =>
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 5, y: 5 }],
      }),
    );
    act(flushFrames);

    act(() =>
      result.current.invalidateRegion({
        layerId: "layer-b",
        cells: [{ x: 6, y: 6 }],
      }),
    );
    act(flushFrames);

    expect(cellsOf(scopes[1] as DirtyScope, "layer-b")).toEqual(["6,6"]);
    // Rule 3's converse: layer-a is GONE, it was already painted.
    expect(layerIdsOf(scopes[1] as DirtyScope)).toEqual(["layer-b"]);
  });

  it("resets AFTER render returns, not before — a region published from inside render survives", () => {
    const scopes: DirtyScope[] = [];
    let scheduler: {
      invalidateRegion: (r: { layerId: string; cells: { x: number; y: number }[] } | null) => void;
    } | null = null;
    let publishFromInside = false;

    const render = vi.fn((scope: DirtyScope) => {
      scopes.push(scope);
      if (publishFromInside) {
        publishFromInside = false;
        scheduler?.invalidateRegion({
          layerId: "layer-late",
          cells: [{ x: 9, y: 9 }],
        });
      }
    });

    const { result } = renderHook(() => useCanvasRender(render, [1]));
    scheduler = result.current;
    act(flushFrames); // mount paint
    scopes.length = 0;

    publishFromInside = true;
    act(() =>
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 1, y: 1 }],
      }),
    );
    act(flushFrames);
    act(flushFrames); // the frame the inside-render publish scheduled

    expect(cellsOf(scopes[0] as DirtyScope, "layer-a")).toEqual(["1,1"]);
    // Rule 4: had the reset run before `render`, this cell would be lost.
    expect(cellsOf(scopes[1] as DirtyScope, "layer-late")).toEqual(["9,9"]);
  });

  it("a region published while NO frame is pending still paints", () => {
    const { render, scopes } = makeRender();
    const { result } = renderHook(() => useCanvasRender(render, [1]));
    act(flushFrames);
    scopes.length = 0;
    expect(frames.size).toBe(0);

    act(() =>
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 7, y: 7 }],
      }),
    );
    expect(frames.size).toBe(1);
    act(flushFrames);

    expect(cellsOf(scopes[0] as DirtyScope, "layer-a")).toEqual(["7,7"]);
  });
});

describe("useCanvasRender — StrictMode", () => {
  it("a double mount schedules, cancels and re-schedules: ONE paint, no leaked handle", () => {
    const { render } = makeRender();
    renderHook(() => useCanvasRender(render, [1]), { wrapper: StrictMode });

    // Mount, synthetic unmount (cancel), remount (re-schedule).
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    act(flushFrames);

    expect(render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("StrictMode's synthetic cleanup does NOT discard an accumulated region", () => {
    // The cleanup runs between the two mounts. Regions published before it
    // must survive: dropping them is how a StrictMode-only stale pixel gets
    // in, which is the worst kind to debug.
    const { render, scopes } = makeRender();
    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => useCanvasRender(render, [dep]),
      { initialProps: { dep: 1 }, wrapper: StrictMode },
    );
    act(flushFrames);
    scopes.length = 0;

    act(() =>
      result.current.invalidateRegion({
        layerId: "layer-a",
        cells: [{ x: 4, y: 4 }],
      }),
    );
    // A deps change now runs cleanup + effect, i.e. cancel + invalidate.
    rerender({ dep: 2 });
    act(flushFrames);

    // Promoted to "all" by the deps effect — which is CORRECT, and strictly
    // safer than the cells alone. What must not happen is a paint that
    // carries neither, or no paint at all.
    expect(render).toHaveBeenCalled();
    expect(scopes[0]).toEqual({ kind: "all" });
    // And every paint in this frame is a full one; none silently narrowed.
    for (const s of scopes) expect(s).toEqual({ kind: "all" });
  });
});
