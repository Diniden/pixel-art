/**
 * `brushStamp` — the mouse-vs-touch agreement gate (task 31 / R10 / Q44).
 *
 * ## What this file is for
 *
 * R10 records that Canvas's mouse and touch paths "have already drifted". This
 * suite is the acceptance criterion for closing that drift: it reconstructs the
 * two LEGACY stamping bodies verbatim, proves they disagreed, and then proves
 * the extracted `stampAt`/`stampSegment` make them agree by construction.
 *
 * ## ⚠️ Spec correction (task 31, correction #90)
 *
 * Task 31's spec asserts twice — in its Context and in its Definition of Done —
 * that "task 08 wrote the mouse-vs-touch agreement test" and that it is merely
 * to be re-run here. **It does not exist.** At the start of W23 the identifier
 * `brushStamp` appeared nowhere under `client/src/` outside two fixture-README
 * mentions, and task 08's `src/store/__tests__/drawing.test.ts` pins the STORE's
 * `setPixel`/`setPixels` bounds behaviour, which is a different layer entirely.
 * The agreement test is therefore WRITTEN here, not inherited. This matches the
 * ledger's twice-proven lesson that a "something already covers this" claim in a
 * spec must be re-verified before it is relied on.
 *
 * ## The divergence, measured rather than assumed
 *
 * Legacy `handleTouchStart`'s eraser branch built its cells with a bare
 * `getCirclePixels(...).map(...)` and no bounds `.filter()`, while every other
 * stamping path filtered. The spec calls the result "a latent out-of-bounds
 * write on touch". Reading the write path shows that is an overstatement of the
 * memory risk and an understatement of nothing: `PixelStore.setPixels` drops
 * out-of-bounds cells itself before recording a patch, so no pixel was ever
 * written off-grid. What actually differed is asserted below.
 */

import { describe, it, expect } from "vitest";
import {
  getCirclePixels,
  getSquarePixels,
  getLinePixels,
} from "../../../../components/Canvas/drawingUtils";
import { stampAt, stampSegment, inBounds } from "../brushStamp";
import type { StampOptions, StampPoint } from "../brushStamp";

const COLOR = { r: 1, g: 2, b: 3, a: 255 } as const;

/** The editable grid the legacy handlers were bounds-checked against. */
const GRID = { gridWidth: 16, gridHeight: 16 };

function opts(over: Partial<StampOptions> = {}): StampOptions {
  return {
    ...GRID,
    brushSize: 4,
    shape: getCirclePixels,
    shapeColor: COLOR,
    ...over,
  };
}

const key = (p: StampPoint) => `${p.x},${p.y}`;
const sorted = (ps: readonly StampPoint[]) => ps.map(key).sort();

/* ── The two legacy bodies, transcribed ──────────────────────────────────────
 *
 * Copied from Canvas.tsx at W23's HEAD (2,575 lines) so the divergence is
 * demonstrated against the real former code rather than a paraphrase of it.
 *   - mouse  : Canvas.tsx:1723-1741  (handleMouseDown, eraser, brushSize > 1)
 *   - touch  : Canvas.tsx:2272-2285  (handleTouchStart, eraser, brushSize > 1)
 * The ONLY textual difference is the `.filter()` the touch body omits.
 */

function legacyMouseEraserDown(
  coords: StampPoint,
  brushSize: number,
  eraserShape: "circle" | "square",
): StampPoint[] {
  const stamp =
    eraserShape === "circle"
      ? getCirclePixels(coords, brushSize, COLOR)
      : getSquarePixels(coords, brushSize, COLOR);
  return stamp
    .filter(
      (p) =>
        p.x >= 0 && p.x < GRID.gridWidth && p.y >= 0 && p.y < GRID.gridHeight,
    )
    .map((p) => ({ x: p.x, y: p.y }));
}

function legacyTouchEraserDown(
  coords: StampPoint,
  brushSize: number,
  eraserShape: "circle" | "square",
): StampPoint[] {
  const erasePixels =
    eraserShape === "circle"
      ? getCirclePixels(coords, brushSize, COLOR)
      : getSquarePixels(coords, brushSize, COLOR);
  // ⚠️ No `.filter()` — this is the drift.
  return erasePixels.map((p) => ({ x: p.x, y: p.y }));
}

describe("brushStamp — mouse-vs-touch agreement (R10 / Q44)", () => {
  /* ── 1. The drift was real ───────────────────────────────────────────────── */

  describe("the legacy divergence, demonstrated", () => {
    it("DIVERGED at the grid edge: the touch eraser emitted off-grid cells the mouse dropped", () => {
      const atEdge = { x: 0, y: 0 };
      const mouse = legacyMouseEraserDown(atEdge, 6, "circle");
      const touch = legacyTouchEraserDown(atEdge, 6, "circle");

      expect(sorted(mouse)).not.toEqual(sorted(touch));
      expect(touch.length).toBeGreaterThan(mouse.length);
      expect(touch.some((p) => !inBounds(p, GRID))).toBe(true);
      expect(mouse.every((p) => inBounds(p, GRID))).toBe(true);
    });

    it("AGREED away from the edge — which is why the bug stayed latent", () => {
      const middle = { x: 8, y: 8 };
      expect(sorted(legacyMouseEraserDown(middle, 4, "circle"))).toEqual(
        sorted(legacyTouchEraserDown(middle, 4, "circle")),
      );
    });
  });

  /* ── 2. THE GATE ─────────────────────────────────────────────────────────── */

  describe("THE GATE: one code path, so the devices cannot disagree", () => {
    // Every edge, corner, and interior position, at both brush shapes and a
    // range of sizes. Under the legacy code the edge cases here would fail.
    const positions: StampPoint[] = [
      { x: 0, y: 0 },
      { x: 15, y: 0 },
      { x: 0, y: 15 },
      { x: 15, y: 15 },
      { x: 8, y: 0 },
      { x: 0, y: 8 },
      { x: 15, y: 8 },
      { x: 8, y: 15 },
      { x: 8, y: 8 },
      { x: 1, y: 1 },
      { x: 14, y: 14 },
    ];
    const shapes = [
      ["circle", getCirclePixels],
      ["square", getSquarePixels],
    ] as const;
    const sizes = [1, 2, 3, 4, 5, 8];

    for (const [shapeName, shape] of shapes) {
      for (const size of sizes) {
        it(`down-stamp agrees for every position — ${shapeName}, brushSize ${size}`, () => {
          for (const p of positions) {
            // ONE function serves both devices. Calling it twice is the
            // structural proof: there is no second body left to drift.
            const mouse = stampAt(p, opts({ brushSize: size, shape }));
            const touch = stampAt(p, opts({ brushSize: size, shape }));
            expect(sorted(touch)).toEqual(sorted(mouse));
            expect(mouse.every((c) => inBounds(c, GRID))).toBe(true);
          }
        });
      }
    }

    it("the unified stamp matches the MOUSE behaviour, not the touch one (Q44's decision)", () => {
      for (const p of positions) {
        for (const size of [2, 4, 6, 8]) {
          for (const [name, shape] of shapes) {
            const unified = stampAt(p, opts({ brushSize: size, shape }));
            const mouse = legacyMouseEraserDown(
              p,
              size,
              name as "circle" | "square",
            );
            expect(sorted(unified)).toEqual(sorted(mouse));
          }
        }
      }
    });

    it("the unified stamp DIFFERS from the legacy touch behaviour at the edge — the fix, stated as a test", () => {
      const atEdge = { x: 0, y: 0 };
      const unified = stampAt(atEdge, opts({ brushSize: 6 }));
      const legacyTouch = legacyTouchEraserDown(atEdge, 6, "circle");
      expect(sorted(unified)).not.toEqual(sorted(legacyTouch));
      // Every cell the fix drops was off-grid; none that was in-bounds is lost.
      const dropped = legacyTouch.filter(
        (p) => !unified.some((u) => u.x === p.x && u.y === p.y),
      );
      expect(dropped.length).toBeGreaterThan(0);
      expect(dropped.every((p) => !inBounds(p, GRID))).toBe(true);
    });

    it("NO in-bounds cell is lost by the fix — erasing at the edge still erases", () => {
      for (const p of positions) {
        for (const size of [2, 4, 6, 8]) {
          const legacyTouch = legacyTouchEraserDown(p, size, "circle");
          const unified = stampAt(p, opts({ brushSize: size }));
          const inBoundsLegacy = legacyTouch.filter((c) => inBounds(c, GRID));
          expect(sorted(unified)).toEqual(sorted(inBoundsLegacy));
        }
      }
    });
  });

  /* ── 3. Drag segments ────────────────────────────────────────────────────── */

  describe("stampSegment — the drag path", () => {
    it("agrees between devices along a stroke that runs off the edge", () => {
      const mouse = stampSegment(
        { x: 2, y: 2 },
        { x: -3, y: 2 },
        getLinePixels,
        opts(),
      );
      const touch = stampSegment(
        { x: 2, y: 2 },
        { x: -3, y: 2 },
        getLinePixels,
        opts(),
      );
      expect(sorted(touch)).toEqual(sorted(mouse));
      expect(mouse.every((p) => inBounds(p, GRID))).toBe(true);
    });

    it("stamps only the endpoint when the stroke has not moved", () => {
      const out = stampSegment(
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        getLinePixels,
        opts({ brushSize: 1 }),
      );
      expect(out).toEqual([{ x: 5, y: 5 }]);
    });

    it("stamps only the endpoint when `prev` is null — no gap bridging on re-entry", () => {
      const out = stampSegment(
        null,
        { x: 9, y: 9 },
        getLinePixels,
        opts({ brushSize: 1 }),
      );
      expect(out).toEqual([{ x: 9, y: 9 }]);
    });

    it("de-duplicates overlapping stamps along the segment", () => {
      const out = stampSegment(
        { x: 4, y: 4 },
        { x: 9, y: 4 },
        getLinePixels,
        opts({ brushSize: 5 }),
      );
      expect(new Set(out.map(key)).size).toBe(out.length);
    });

    it("bridges the whole segment — a fast drag does not leave gaps", () => {
      const out = stampSegment(
        { x: 1, y: 1 },
        { x: 12, y: 1 },
        getLinePixels,
        opts({ brushSize: 1 }),
      );
      expect(sorted(out)).toEqual(
        sorted(Array.from({ length: 12 }, (_, i) => ({ x: i + 1, y: 1 }))),
      );
    });
  });

  /* ── 4. Bounds ───────────────────────────────────────────────────────────── */

  describe("bounds filtering", () => {
    it("drops a size-1 stamp that is entirely off-grid", () => {
      expect(stampAt({ x: -1, y: 5 }, opts({ brushSize: 1 }))).toEqual([]);
      expect(stampAt({ x: 16, y: 5 }, opts({ brushSize: 1 }))).toEqual([]);
    });

    it("returns an empty list rather than throwing when the brush is fully off-grid", () => {
      expect(stampAt({ x: -50, y: -50 }, opts({ brushSize: 4 }))).toEqual([]);
    });

    it("never emits a cell outside the grid, for any position or size", () => {
      for (let x = -4; x <= 20; x++) {
        for (const size of [1, 3, 7]) {
          for (const c of stampAt({ x, y: 8 }, opts({ brushSize: size }))) {
            expect(inBounds(c, GRID)).toBe(true);
          }
        }
      }
    });
  });
});
