/**
 * The derived view-zoom floor (plan 09, task 04).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE BUG THIS FILE EXISTS TO PIN: A BIG SPRITE COULD NOT BE SEEN WHOLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `viewZoom`'s lower bound was a hard-coded `0.25`, repeated in five places.
 * That is a limit on the SCALE, not on the resulting size, so what it means
 * depends entirely on how big the content is: a 2560px composition bottomed
 * out at 640px on screen — still far too large to fit — while a 32px sprite
 * bottomed out at 8px, far smaller than anyone wants. One number cannot serve
 * both. The floor is derived from the content size now: keep zooming out
 * until the LONGEST on-screen dimension reaches `MIN_CANVAS_SCREEN_PX`.
 *
 * ── Why the stores take the floor as a PARAMETER ──────────────────────────
 *
 * The floor needs the content's on-screen size, which is a DOM measurement,
 * and a store may not read the DOM (the note on `ViewportUIStore.setViewZoom`,
 * and the same reason `resetView` is handed a pre-computed centred pan). So
 * the helper lives in `ui/hooks/useCanvasViewport` — the layer that already
 * holds the measurement — and the container passes the result in. A caller
 * with no measurement omits it and gets exactly the legacy behaviour, which
 * is what keeps `CanvasContainer`'s untouched call site correct.
 *
 * ⚠️ The helper is imported from `ui/hooks/`, not from a store. That is not a
 * boundary violation: the `ui/` rule forbids `ui/` from importing STORES, not
 * the reverse, and this is a pure numeric function with no React and no DOM.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import {
  MIN_CANVAS_SCREEN_PX,
  MIN_VIEW_ZOOM,
  viewZoomFloor,
} from "@/ui/hooks/useCanvasViewport";
import { ViewportUIStore } from "@/stores/ui/ViewportUIStore";
import { CanvasCameraStore } from "@/stores/ui/CanvasCameraStore";

describe("viewZoomFloor — the derived limit", () => {
  it("⭐ lets a LARGE composition shrink far below the old 0.25", () => {
    // The motivating case. 2560 wide at the old floor stopped at 640px on
    // screen; the derived floor takes it to `MIN_CANVAS_SCREEN_PX`.
    const floor = viewZoomFloor(2560, 2240);

    expect(floor).toBeCloseTo(MIN_CANVAS_SCREEN_PX / 2560, 10); // ≈ 0.01953
    expect(floor).toBeLessThan(MIN_VIEW_ZOOM);
    // The whole point, restated as the size the user sees.
    expect(2560 * floor).toBeCloseTo(MIN_CANVAS_SCREEN_PX, 10);
  });

  it("⭐ uses the LONGEST dimension, so the whole sprite stays on screen", () => {
    // Taller than it is wide: the HEIGHT is what lands on 50, and the aspect
    // ratio carries the width down to 10 with it. Driving off the shorter
    // side instead would floor at 50/400 = 0.125 and leave the height at
    // 250px — five times the limit, and the tall sprite still unviewable.
    // "50 on the longest dimension" is a bound on the sprite's BOX, not a
    // promise that every side is at least 50.
    const floor = viewZoomFloor(400, 2000);

    expect(floor).toBeCloseTo(MIN_CANVAS_SCREEN_PX / 2000, 10);
    expect(2000 * floor).toBeCloseTo(MIN_CANVAS_SCREEN_PX, 10);
    expect(400 * floor).toBeCloseTo(10, 10);
    // Symmetric: orientation must not change the answer.
    expect(viewZoomFloor(2000, 400)).toBeCloseTo(floor, 10);
  });

  it("⭐ clamps to 1 on a SMALL sprite — 1:1 is always reachable", () => {
    // 50/40 is 1.25, which would be a floor ABOVE the neutral zoom: the user
    // could not view a 40px sprite at 1:1, and on a really tiny one the floor
    // would climb over `MAX_VIEW_ZOOM` and cross the ceiling entirely.
    expect(viewZoomFloor(40, 40)).toBe(1);
    expect(viewZoomFloor(1, 1)).toBe(1);
    // Exactly at the limit the clamp is not yet engaged.
    expect(viewZoomFloor(MIN_CANVAS_SCREEN_PX, MIN_CANVAS_SCREEN_PX)).toBe(1);
    // Just past it, it starts deriving.
    expect(viewZoomFloor(100, 100)).toBeCloseTo(0.5, 10);
  });

  it("falls back to 0.25 before the first measurement lands", () => {
    // `contentWidth`/`contentHeight` are 0 on the first render, and 50/0 is
    // Infinity. The legacy constant is the documented fallback.
    expect(viewZoomFloor(0, 0)).toBe(MIN_VIEW_ZOOM);
    expect(viewZoomFloor(0, 400)).toBeCloseTo(0.125, 10); // one side measured
    expect(viewZoomFloor(-10, -10)).toBe(MIN_VIEW_ZOOM);
    expect(viewZoomFloor(NaN, NaN)).toBe(MIN_VIEW_ZOOM);
  });
});

describe("the store clamps that consume it", () => {
  it("⭐ ViewportUIStore honours a supplied floor below 0.25", () => {
    const v = new ViewportUIStore();
    const floor = viewZoomFloor(2560, 2240);

    runInAction(() => v.setViewZoom(0.01, floor));

    // The value the gesture asked for is below the floor, so it lands ON the
    // floor — NOT on the legacy 0.25, which is the regression this pins.
    expect(v.viewZoom).toBeCloseTo(floor, 10);
    expect(v.viewZoom).toBeLessThan(MIN_VIEW_ZOOM);
  });

  it("⭐ still clamps at 0.25 with no floor argument — the legacy contract", () => {
    // `CanvasContainer`'s call site is deliberately not updated by this task,
    // so the default is what keeps it behaving exactly as it does today.
    const v = new ViewportUIStore();
    runInAction(() => v.setViewZoom(0.01));
    expect(v.viewZoom).toBe(MIN_VIEW_ZOOM);

    const c = new CanvasCameraStore();
    runInAction(() => c.setViewZoom(0.01));
    expect(c.viewZoom).toBe(MIN_VIEW_ZOOM);
  });

  it("CanvasCameraStore is a twin — the same clamp, the same floor", () => {
    const c = new CanvasCameraStore();
    const floor = viewZoomFloor(2560, 2240);

    runInAction(() => c.setViewZoom(0.01, floor));
    expect(c.viewZoom).toBeCloseTo(floor, 10);
  });

  it("the ceiling is untouched, and the floor cannot raise it", () => {
    // A floor is a lower bound only. `MAX_VIEW_ZOOM` stays 4 in both stores,
    // and because the helper clamps to <= 1 the floor can never cross it.
    const v = new ViewportUIStore();
    runInAction(() => v.setViewZoom(10, viewZoomFloor(2560, 2240)));
    expect(v.viewZoom).toBe(4);

    const c = new CanvasCameraStore();
    runInAction(() => c.setViewZoom(10, viewZoomFloor(40, 40)));
    expect(c.viewZoom).toBe(4);
  });

  it("a value inside the range passes through unchanged", () => {
    const v = new ViewportUIStore();
    runInAction(() => v.setViewZoom(0.1, viewZoomFloor(2560, 2240)));
    expect(v.viewZoom).toBe(0.1);
  });
});
