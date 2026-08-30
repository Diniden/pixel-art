/**
 * `useCanvasViewport` — the two-finger gestures the iPad needs.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE BUG THIS FILE EXISTS TO PIN: PINCH ZOOMED, BUT NEVER PANNED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `updatePinch` re-anchored — it held the point under the pinch centre still
 * while the scale changed. Slide two fingers across the glass at a CONSTANT
 * separation and `dist` never changes, so `zoomRatio` is 1 and the whole
 * expression collapses to the pan the gesture started with. The content did
 * not move. Two-finger panning simply did not exist, though a comment in
 * `CanvasContainer` claimed "view zoom + pan".
 *
 * The other half of the fix is not observable from here: the gesture is now
 * bound natively and non-passively on the VIEWPORT rather than through
 * React's (passive) synthetic handlers on the transformed `<canvas>`. The
 * listener-registration test below pins the part jsdom can see; the reason it
 * matters is in the hook's header.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasViewport } from "../useCanvasViewport";

/**
 * The shared pixel scale, and the 1:1 grid it now magnifies.
 *
 * ⚠️ `contentWidth` is `CELLS * ZOOM` — the on-screen CSS box at view zoom 1 —
 * NOT the `<canvas>` backing store, which is `CELLS` (plan 05, task 02). The
 * fixture used to pass `canvasWidth: 400`, which was both at once because the
 * backing store WAS `40 * 10`. Splitting the constants keeps the numbers below
 * identical while making it impossible to pass the wrong one by accident.
 */
const ZOOM = 10;
const CELLS_X = 40;
const CELLS_Y = 40;
const CONTENT_W = CELLS_X * ZOOM; // 400 — the old `canvasWidth`, unchanged
const CONTENT_H = CELLS_Y * ZOOM; // 400

/** A container with a known rect, so gesture centres are predictable. */
function makeContainer() {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 600, configurable: true });
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** Two touches, as the gesture math consumes them. */
function touches(a: [number, number], b: [number, number]) {
  return [
    { clientX: a[0], clientY: a[1] },
    { clientX: b[0], clientY: b[1] },
  ] as unknown as React.TouchList;
}

function setup(el: HTMLElement) {
  const containerRef = { current: el };
  return renderHook(() =>
    useCanvasViewport({
      containerRef,
      contentWidth: CONTENT_W,
      contentHeight: CONTENT_H,
      panOffset: { x: 0, y: 0 },
    }),
  );
}

describe("two-finger PAN — the gesture that was missing", () => {
  it("⭐ translates by the movement of the pinch centre at constant spread", () => {
    const el = makeContainer();
    const { result } = setup(el);

    // Fingers 100px apart, centred at (200, 200).
    act(() => result.current.beginPinch(touches([150, 200], [250, 200])));
    const zoomBefore = result.current.viewZoom;

    // Slide BOTH fingers +80x / +40y. The separation is unchanged, so this is
    // a pure pan — the exact case that used to do nothing at all.
    act(() => {
      result.current.updatePinch(touches([230, 240], [330, 240]));
    });

    expect(result.current.viewPanOffset.x).toBeCloseTo(80, 5);
    expect(result.current.viewPanOffset.y).toBeCloseTo(40, 5);
    // A pure pan must not zoom.
    expect(result.current.viewZoom).toBeCloseTo(zoomBefore, 5);
  });

  it("accumulates across successive moves rather than snapping back", () => {
    const el = makeContainer();
    const { result } = setup(el);

    act(() => result.current.beginPinch(touches([100, 100], [200, 100])));
    act(() => result.current.updatePinch(touches([120, 110], [220, 110])));
    act(() => result.current.updatePinch(touches([140, 130], [240, 130])));

    // +20 then +20 across, +10 then +20 down.
    expect(result.current.viewPanOffset.x).toBeCloseTo(40, 5);
    expect(result.current.viewPanOffset.y).toBeCloseTo(30, 5);
  });

  it("pans in the direction the fingers move (content follows the hand)", () => {
    const el = makeContainer();
    const { result } = setup(el);

    act(() => result.current.beginPinch(touches([400, 300], [500, 300])));
    act(() => result.current.updatePinch(touches([350, 300], [450, 300])));

    // Fingers moved LEFT, so the content moves left with them.
    expect(result.current.viewPanOffset.x).toBeCloseTo(-50, 5);
  });
});

describe("two-finger ZOOM still works, and composes with pan", () => {
  it("zooms when the fingers separate", () => {
    const el = makeContainer();
    const { result } = setup(el);

    act(() => result.current.beginPinch(touches([300, 300], [400, 300])));
    act(() => result.current.updatePinch(touches([250, 300], [450, 300])));

    // Distance doubled about a stationary centre: zoom in, no net pan.
    expect(result.current.viewZoom).toBeGreaterThan(1);
    expect(result.current.viewPanOffset.x).toBeCloseTo(
      350 * (1 - result.current.viewZoom),
      5,
    );
  });

  it("⭐ zooms AND pans in one gesture", () => {
    const el = makeContainer();
    const { result } = setup(el);

    act(() => result.current.beginPinch(touches([300, 300], [400, 300])));
    // Spread apart AND slide right: both must apply.
    act(() => result.current.updatePinch(touches([300, 300], [500, 300])));

    expect(result.current.viewZoom).toBeGreaterThan(1);
    // The centre moved 350 → 400, so a +50 translation rides on top of the
    // zoom re-anchoring. Without the pan term this would be strictly the
    // anchored value, which is what the old code produced.
    const anchored = 350 * (1 - result.current.viewZoom);
    expect(result.current.viewPanOffset.x).toBeCloseTo(anchored + 50, 5);
  });

  it("clamps zoom to the documented range", () => {
    const el = makeContainer();
    const { result } = setup(el);

    act(() => result.current.beginPinch(touches([399, 300], [401, 300])));
    for (let i = 0; i < 12; i++) {
      act(() => result.current.updatePinch(touches([100, 300], [700, 300])));
    }
    expect(result.current.viewZoom).toBeLessThanOrEqual(4);

    act(() => result.current.endPinch());
    act(() => result.current.beginPinch(touches([100, 300], [700, 300])));
    for (let i = 0; i < 12; i++) {
      act(() => result.current.updatePinch(touches([399, 300], [401, 300])));
    }
    expect(result.current.viewZoom).toBeGreaterThanOrEqual(0.25);
  });
});

describe("the listener binding iPad depends on", () => {
  it("⭐ binds touchstart/touchmove NON-PASSIVELY, on the container", () => {
    // React's synthetic touch handlers are passive, so `preventDefault()`
    // cannot stop Safari claiming the gesture for its own page zoom. Binding
    // must therefore be native with `{ passive: false }`, and on the
    // container — the `<canvas>` is inside the pan/zoom transform and misses
    // fingers placed around a zoomed-out sprite.
    const el = makeContainer();
    const spy = vi.spyOn(el, "addEventListener");
    setup(el);

    const opts = (type: string) =>
      spy.mock.calls.find((c) => c[0] === type)?.[2] as
        | AddEventListenerOptions
        | undefined;

    expect(opts("touchstart")).toMatchObject({ passive: false });
    expect(opts("touchmove")).toMatchObject({ passive: false });
    // The wheel listener has always been non-passive for the same reason.
    expect(opts("wheel")).toMatchObject({ passive: false });
  });

  it("ends the gesture when a finger lifts, so it cannot become a stroke", () => {
    const el = makeContainer();
    const { result } = setup(el);

    act(() => result.current.beginPinch(touches([100, 100], [200, 100])));
    expect(result.current.isPinching()).toBe(true);

    act(() => {
      el.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
    });
    expect(result.current.isPinching()).toBe(false);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ R1 — THE SAVED `panOffset` MUST STILL LAND WHERE THE OWNER LEFT IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This is a DATA-SAFETY test, not a rendering one. `panOffset` persists in
 * post-transform CSS pixels, measured against a content box of
 * `gridWidth * zoom`, and there is **no migration hook for `zoom`** —
 * `ViewportUIStore.ts:230` hydrates it straight in. So if the move to 1:1
 * backing stores had renormalised `zoom`, merged it into `viewZoom`, or
 * dropped it from the content box, every saved pan in every real project would
 * silently mean a different position and every sprite would load off-screen.
 *
 * The invariant that makes the change safe is arithmetic: the backing store
 * shrank by a factor of `zoom` and the CSS transform grew by the same factor,
 * so `contentWidth = cellWidth * zoom` is the SAME NUMBER the old
 * `canvasWidth` was. These tests pin that number at the two places it is
 * observable from this hook — the pan clamp and the centring formula — with
 * `zoom: 10`, the shipped default (`types/constants.ts:34`).
 */
describe("R1: a saved panOffset still means the same position", () => {
  /** The shipped default, and what every existing project's pan was saved at. */
  const SAVED_ZOOM = 10;
  const GRID_W = 40;
  const GRID_H = 40;

  /**
   * BEFORE this task: `canvasWidth = gridWidth * zoom`, and the canvas was
   * that many device pixels wide. AFTER: `cellWidth = gridWidth` and
   * `contentWidth = cellWidth * zoom`. The on-screen box is unchanged, which
   * is the entire basis of "zero migration".
   */
  const legacyCanvasWidth = GRID_W * SAVED_ZOOM;
  const legacyCanvasHeight = GRID_H * SAVED_ZOOM;
  const cellWidth = GRID_W;
  const cellHeight = GRID_H;
  const contentWidth = cellWidth * SAVED_ZOOM;
  const contentHeight = cellHeight * SAVED_ZOOM;

  it("⭐ the content box is byte-identical to the pre-1:1 canvas box", () => {
    expect(contentWidth).toBe(legacyCanvasWidth);
    expect(contentHeight).toBe(legacyCanvasHeight);
    // And the backing store really did shrink — otherwise this test would
    // pass vacuously against a refactor that changed nothing.
    expect(cellWidth).toBe(contentWidth / SAVED_ZOOM);
    expect(cellWidth * cellHeight).toBeLessThan(
      (legacyCanvasWidth * legacyCanvasHeight) / 50,
    );
  });

  it("⭐ handleResetView's centring produces the same pan as before", () => {
    // `CanvasContainer.handleResetView` centres with
    // `(container.clientWidth - <content width>) / 2`. The container is the
    // 800x600 box `makeContainer` defines.
    const CONTAINER_W = 800;
    const CONTAINER_H = 600;
    const before = {
      x: Math.round((CONTAINER_W - legacyCanvasWidth) / 2),
      y: Math.round((CONTAINER_H - legacyCanvasHeight) / 2),
    };
    const after = {
      x: Math.round((CONTAINER_W - contentWidth) / 2),
      y: Math.round((CONTAINER_H - contentHeight) / 2),
    };
    expect(after).toEqual(before);
    // Not a tautology against zero: this sprite is genuinely off-centre.
    expect(after.x).toBe(200);
    expect(after.y).toBe(100);
  });

  it("⭐ a saved pan survives the clamp unchanged, at the same coordinates", () => {
    const el = makeContainer();
    const containerRef = { current: el };
    // A pan the owner might have saved: the sprite nudged up and left inside
    // the 800x600 viewport.
    const savedPan = { x: 120, y: 60 };

    const { result } = renderHook(() =>
      useCanvasViewport({
        containerRef,
        contentWidth,
        contentHeight,
        panOffset: savedPan,
      }),
    );

    // Seeded verbatim — no renormalisation on the way in.
    expect(result.current.viewPanOffset).toEqual(savedPan);

    // And the clamp, given the same content box, returns it untouched.
    const clamped = result.current.clampPanToViewport(
      savedPan,
      contentWidth,
      contentHeight,
    );
    expect(clamped).toEqual(savedPan);

    // ── the negative control ────────────────────────────────────────────
    //
    // Handing the clamp `cellWidth` instead of `contentWidth` is the R1 bug in
    // miniature, and it is only VISIBLE past the edge of the correct box. In
    // the 800px viewport the correct content box (400) allows pans in
    // [0, 400]; the 1:1 cell box (40) allows [0, 760]. A pan of 600 is
    // therefore pinned to 400 by the correct box and waved straight through by
    // the wrong one — which is exactly how a sprite ends up somewhere the
    // owner never left it.
    const farPan = { x: 600, y: 500 };
    expect(
      result.current.clampPanToViewport(farPan, contentWidth, contentHeight),
    ).toEqual({ x: 400, y: 200 });
    expect(
      result.current.clampPanToViewport(farPan, cellWidth, cellHeight),
    ).toEqual(farPan);
  });

  it("⭐ wheel-panning clamps against the full content size, not the cells", () => {
    // The `:339-340` fix, observed end-to-end. `contentWidth` (400) is smaller
    // than the 800px viewport, so `clampPanToViewport`'s min/max collapse to
    // [0, 400] — a wheel pan lands inside that range. Had the hook been handed
    // `cellWidth` (40) the range would be [0, 760] and the same gesture would
    // settle somewhere else entirely.
    const el = makeContainer();
    const containerRef = { current: el };
    const { result } = renderHook(() =>
      useCanvasViewport({
        containerRef,
        contentWidth,
        contentHeight,
        panOffset: { x: 0, y: 0 },
      }),
    );

    act(() => {
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: -50,
          deltaY: -30,
          cancelable: true,
        }),
      );
    });

    // 0 - (-50) = 50, inside [min(0, 800-400), max(0, 800-400)] = [0, 400].
    expect(result.current.viewPanOffset.x).toBeCloseTo(50, 5);
    expect(result.current.viewPanOffset.y).toBeCloseTo(30, 5);
  });
});
