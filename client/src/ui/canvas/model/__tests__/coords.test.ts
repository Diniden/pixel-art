/**
 * Tests for `screenToPixel` — the mapping that decides which cell a click hits.
 *
 * Task 08 tested normal mode, variant mode with negative offsets, out-of-bounds
 * → `null`, and half-pixel snapping; those four cases are all reproduced here
 * against the extracted function.
 */
import { describe, expect, it } from "vitest";
import { screenToPixel } from "@/ui/canvas/model/coords";
import type { CanvasViewGeometry } from "@/ui/canvas/model/coords";

/** A 4×4 grid rendered into a 160×160 rect at (0,0) — 40 screen px per cell. */
const rect = { left: 0, top: 0, width: 160, height: 160 };

const geom = (over: Partial<CanvasViewGeometry> = {}): CanvasViewGeometry => ({
  gridWidth: 4,
  gridHeight: 4,
  objWidth: 4,
  objHeight: 4,
  editingVariant: false,
  variantOffset: { x: 0, y: 0 },
  viewMinX: 0,
  viewMinY: 0,
  viewWidth: 4,
  viewHeight: 4,
  ...over,
});

describe('screenToPixel — "pixel" mode, normal', () => {
  it("maps a click to the cell containing it", () => {
    expect(screenToPixel(0, 0, rect, geom(), "pixel")).toEqual({ x: 0, y: 0 });
    expect(screenToPixel(50, 90, rect, geom(), "pixel")).toEqual({
      x: 1,
      y: 2,
    });
  });

  it("FLOORS — anywhere inside a cell yields the same cell", () => {
    expect(screenToPixel(40, 40, rect, geom(), "pixel")).toEqual({
      x: 1,
      y: 1,
    });
    expect(screenToPixel(79, 79, rect, geom(), "pixel")).toEqual({
      x: 1,
      y: 1,
    });
    expect(screenToPixel(80, 80, rect, geom(), "pixel")).toEqual({
      x: 2,
      y: 2,
    });
  });

  it("honours a rect that is not at the viewport origin", () => {
    const offsetRect = { left: 100, top: 200, width: 160, height: 160 };
    expect(screenToPixel(100, 200, offsetRect, geom(), "pixel")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(140, 240, offsetRect, geom(), "pixel")).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("maps through the RECT, so a CSS-scaled canvas still resolves correctly", () => {
    // Same 4×4 grid, but the element is rendered at half size by a pinch zoom.
    const scaled = { left: 0, top: 0, width: 80, height: 80 };
    expect(screenToPixel(20, 20, scaled, geom(), "pixel")).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("returns null OUTSIDE the grid on every side", () => {
    expect(screenToPixel(-1, 0, rect, geom(), "pixel")).toBeNull();
    expect(screenToPixel(0, -1, rect, geom(), "pixel")).toBeNull();
    expect(screenToPixel(160, 0, rect, geom(), "pixel")).toBeNull();
    expect(screenToPixel(0, 160, rect, geom(), "pixel")).toBeNull();
  });

  it("returns null for a degenerate rect (unmounted / display:none canvas)", () => {
    const dead = { left: 0, top: 0, width: 0, height: 0 };
    expect(screenToPixel(10, 10, dead, geom(), "pixel")).toBeNull();
    expect(
      screenToPixel(10, 10, { ...rect, height: 0 }, geom(), "pixel"),
    ).toBeNull();
  });
});

describe('screenToPixel — "pixel" mode, editing a variant', () => {
  // A 2×2 variant sitting at object cell (1,1) inside a 4×4 world view.
  const variant = geom({
    editingVariant: true,
    gridWidth: 2,
    gridHeight: 2,
    variantOffset: { x: 1, y: 1 },
    viewMinX: 0,
    viewMinY: 0,
    viewWidth: 4,
    viewHeight: 4,
  });

  it("returns VARIANT-LOCAL coordinates, not world ones", () => {
    // Screen (40,40) is world cell (1,1), which is variant cell (0,0).
    expect(screenToPixel(40, 40, rect, variant, "pixel")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(80, 80, rect, variant, "pixel")).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("rejects world cells outside the VARIANT even when inside the view", () => {
    // World (0,0) is inside the 4×4 view but is variant cell (-1,-1).
    expect(screenToPixel(0, 0, rect, variant, "pixel")).toBeNull();
    // World (3,3) is variant cell (2,2) — past the 2×2 variant.
    expect(screenToPixel(120, 120, rect, variant, "pixel")).toBeNull();
  });

  it("handles a NEGATIVE variant offset (variant extends left/above the object)", () => {
    const negative = geom({
      editingVariant: true,
      gridWidth: 2,
      gridHeight: 2,
      variantOffset: { x: -1, y: -1 },
      viewMinX: -1,
      viewMinY: -1,
      viewWidth: 5,
      viewHeight: 5,
    });
    const wide = { left: 0, top: 0, width: 200, height: 200 };
    // Screen (0,0) is world (-1,-1) which is variant cell (0,0).
    expect(screenToPixel(0, 0, wide, negative, "pixel")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(40, 40, wide, negative, "pixel")).toEqual({
      x: 1,
      y: 1,
    });
    // World (1,1) is variant cell (2,2) — outside the 2×2 variant.
    expect(screenToPixel(80, 80, wide, negative, "pixel")).toBeNull();
  });
});

describe('screenToPixel — "pixel-unbounded" mode', () => {
  /* The mode exists so a shape drag survives leaving the canvas: a
     line/rectangle/ellipse must keep tracking the real pointer rather than
     vanishing, which is what `"pixel"`'s `null` caused (owner, 2026-09-01). */
  it('agrees with "pixel" everywhere INSIDE the grid', () => {
    for (const [cx, cy] of [
      [0, 0],
      [50, 90],
      [40, 40],
      [159, 159],
    ]) {
      expect(screenToPixel(cx, cy, rect, geom(), "pixel-unbounded")).toEqual(
        screenToPixel(cx, cy, rect, geom(), "pixel"),
      );
    }
  });

  /* ⚠️ UNBOUNDED, NOT CLAMPED — the distinction is the whole feature. Clamping
     would pin the shape's far corner to the border, so dragging further out
     would stop changing it; the drag has to keep sizing against the cursor.
     Off-grid cells are dropped by `setPixels` at commit. */
  it("keeps counting cells PAST the grid, in both directions", () => {
    // One cell is 40px, so -60 is cell -2 and 260 is cell 6 on a 4-wide grid.
    expect(screenToPixel(-60, -60, rect, geom(), "pixel-unbounded")).toEqual({
      x: -2,
      y: -2,
    });
    expect(screenToPixel(260, 260, rect, geom(), "pixel-unbounded")).toEqual({
      x: 6,
      y: 6,
    });
    // One axis out, one in.
    expect(screenToPixel(-20, 90, rect, geom(), "pixel-unbounded")).toEqual({
      x: -1,
      y: 2,
    });
  });

  it("does NOT clamp to the border — further out keeps changing the cell", () => {
    const a = screenToPixel(200, 80, rect, geom(), "pixel-unbounded");
    const b = screenToPixel(400, 80, rect, geom(), "pixel-unbounded");
    expect(a).not.toEqual(b);
    // A clamping implementation would return { x: 3 } for both.
    expect(a!.x).toBeGreaterThan(3);
    expect(b!.x).toBeGreaterThan(a!.x);
  });

  it("the same points are all null in \"pixel\" mode", () => {
    for (const [cx, cy] of [
      [-60, -60],
      [260, 260],
      [-20, 90],
    ]) {
      expect(screenToPixel(cx, cy, rect, geom(), "pixel")).toBeNull();
    }
  });

  it("still returns null for a DEGENERATE rect", () => {
    const dead = { left: 0, top: 0, width: 0, height: 0 };
    expect(screenToPixel(10, 10, dead, geom(), "pixel-unbounded")).toBeNull();
  });

  it("goes unbounded in VARIANT space too", () => {
    const g = geom({
      editingVariant: true,
      variantOffset: { x: 2, y: 2 },
    });
    // Variant-local, so the offset shifts the result but nothing clamps it.
    expect(screenToPixel(-60, -60, rect, g, "pixel-unbounded")).toEqual({
      x: -4,
      y: -4,
    });
  });
});

describe('screenToPixel — "origin" mode', () => {
  it("SNAPS to the nearest half cell", () => {
    expect(screenToPixel(0, 0, rect, geom(), "origin")).toEqual({ x: 0, y: 0 });
    // Screen 20 is cell 0.5 exactly.
    expect(screenToPixel(20, 20, rect, geom(), "origin")).toEqual({
      x: 0.5,
      y: 0.5,
    });
    // Screen 30 is cell 0.75 -> snaps up to 1.
    expect(screenToPixel(30, 30, rect, geom(), "origin")).toEqual({
      x: 1,
      y: 1,
    });
    // Screen 25 is cell 0.625 -> snaps down to 0.5.
    expect(screenToPixel(25, 25, rect, geom(), "origin")).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("stays in OBJECT space — it does NOT subtract the variant offset", () => {
    const variant = geom({
      editingVariant: true,
      gridWidth: 2,
      gridHeight: 2,
      variantOffset: { x: 1, y: 1 },
    });
    // The same screen point that "pixel" mode called variant cell (0,0).
    expect(screenToPixel(40, 40, rect, variant, "origin")).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("ALLOWS one cell of slop outside the object on every side", () => {
    // The object is 4×4, so -1 .. 5 is accepted.
    const wide = { left: 0, top: 0, width: 160, height: 160 };
    expect(screenToPixel(-40, 0, wide, geom(), "origin")).toEqual({
      x: -1,
      y: 0,
    });
    expect(screenToPixel(200, 0, wide, geom(), "origin")).toEqual({
      x: 5,
      y: 0,
    });
  });

  it("rejects a point beyond that slop", () => {
    const wide = { left: 0, top: 0, width: 160, height: 160 };
    // The bound is applied AFTER half-cell snapping, so the rejection threshold
    // is not -1 cell but the point that snaps past it: anything up to -1.25
    // cells still rounds to -1 and is accepted. -1.5 cells (screen -60) is the
    // first value that snaps to -1.5 and fails.
    expect(screenToPixel(-45, 0, wide, geom(), "origin")).toEqual({
      x: -1,
      y: 0,
    });
    expect(screenToPixel(-60, 0, wide, geom(), "origin")).toBeNull();
    expect(screenToPixel(0, 240, wide, geom(), "origin")).toBeNull();
  });

  it("returns null for a degenerate rect", () => {
    const dead = { left: 0, top: 0, width: 0, height: 0 };
    expect(screenToPixel(10, 10, dead, geom(), "origin")).toBeNull();
  });
});

describe('screenToPixel — "corner" mode', () => {
  it("ROUNDS to the nearest cell corner, unlike pixel mode's floor", () => {
    // 40 screen px per cell. 0..19 rounds to corner 0, 20..59 to corner 1.
    expect(screenToPixel(0, 0, rect, geom(), "corner")).toEqual({ x: 0, y: 0 });
    expect(screenToPixel(19, 19, rect, geom(), "corner")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(21, 21, rect, geom(), "corner")).toEqual({
      x: 1,
      y: 1,
    });
    expect(screenToPixel(50, 90, rect, geom(), "corner")).toEqual({
      x: 1,
      y: 2,
    });
  });

  it("reaches the FAR corner — the lattice is inclusive of gridWidth/Height", () => {
    // "pixel" mode's last cell is 3; the corner lattice runs 0..4.
    expect(screenToPixel(160, 160, rect, geom(), "corner")).toEqual({
      x: 4,
      y: 4,
    });
    expect(screenToPixel(145, 145, rect, geom(), "corner")).toEqual({
      x: 4,
      y: 4,
    });
  });

  it("CLAMPS out-of-range points instead of returning null", () => {
    // A drag past the edge must land ON the edge, not be swallowed.
    expect(screenToPixel(-500, -500, rect, geom(), "corner")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(9999, 9999, rect, geom(), "corner")).toEqual({
      x: 4,
      y: 4,
    });
    expect(screenToPixel(-40, 200, rect, geom(), "corner")).toEqual({
      x: 0,
      y: 4,
    });
  });

  it("returns VARIANT-LOCAL corners while editing a variant", () => {
    const variant = geom({
      editingVariant: true,
      gridWidth: 2,
      gridHeight: 2,
      variantOffset: { x: 1, y: 1 },
      viewMinX: 0,
      viewMinY: 0,
      viewWidth: 4,
      viewHeight: 4,
    });
    // Screen (40,40) is world corner (1,1), which is variant corner (0,0).
    expect(screenToPixel(40, 40, rect, variant, "corner")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(80, 80, rect, variant, "corner")).toEqual({
      x: 1,
      y: 1,
    });
    // World corner (3,3) is variant corner (2,2) — the far edge of a 2×2 grid.
    expect(screenToPixel(120, 120, rect, variant, "corner")).toEqual({
      x: 2,
      y: 2,
    });
    // World (0,0) would be variant corner (-1,-1); it clamps to (0,0).
    expect(screenToPixel(0, 0, rect, variant, "corner")).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("returns null for a degenerate rect", () => {
    const dead = { left: 0, top: 0, width: 0, height: 0 };
    expect(screenToPixel(10, 10, dead, geom(), "corner")).toBeNull();
    expect(
      screenToPixel(10, 10, { ...rect, width: 0 }, geom(), "corner"),
    ).toBeNull();
  });
});

describe("the three modes are genuinely different rules", () => {
  it("disagree on the same point: whole-cell floor vs half-cell round", () => {
    expect(screenToPixel(30, 30, rect, geom(), "pixel")).toEqual({
      x: 0,
      y: 0,
    });
    expect(screenToPixel(30, 30, rect, geom(), "origin")).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("disagree at the edge: pixel mode rejects, origin mode allows slop", () => {
    expect(screenToPixel(165, 0, rect, geom(), "pixel")).toBeNull();
    expect(screenToPixel(165, 0, rect, geom(), "origin")).not.toBeNull();
  });
});
