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
      canvasWidth: 400,
      canvasHeight: 400,
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
