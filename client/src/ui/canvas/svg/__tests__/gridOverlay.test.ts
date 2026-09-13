/**
 * Tests for the SVG grid overlay.
 *
 * Three things matter here and nothing else does:
 *
 * 1. **Line count.** `cells + 1` per axis — both outer edges are drawn
 *    (`canvasBackground.ts:163`). One missing line is an invisible off-by-one
 *    on the sprite's boundary, which is exactly where it is least noticeable
 *    and most wrong.
 * 2. **No `+ 0.5`.** The half pixel `gridLinePath` bakes in exists to centre a
 *    1px CANVAS stroke on a device pixel. SVG's `non-scaling-stroke` does that
 *    itself; leaving it in shifts the entire grid half a cell relative to the
 *    pixels it is supposed to be gridding. Silent, and visible only as
 *    "the grid looks slightly wrong".
 * 3. **The alpha rule.** Black 8% light / white 5% dark, measured
 *    2026-08-19 and documented at `canvasBackground.ts:19-24`. The asymmetry
 *    looks like a bug and has been "fixed" by mistake before.
 *
 * Plus the property the whole plan rests on: `vector-effect` is present.
 */
import { describe, expect, it } from "vitest";
import {
  gridOverlayPath,
  gridOverlayPathData,
  gridOverlayAttrs,
} from "@/ui/canvas/svg/gridOverlay";
import { BLACK_08, WHITE_05 } from "@/ui/theme/canvasTokens";

/** Every `M x y L x y` subpath in a `d` string, as numbers. */
function segments(d: string): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const re = /M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return out;
}

describe("gridOverlayPathData", () => {
  it("draws cells + 1 lines per axis — both outer edges included", () => {
    const d = gridOverlayPathData({ cellWidth: 4, cellHeight: 3 });
    const segs = segments(d);

    const vertical = segs.filter(([x1, , x2]) => x1 === x2);
    const horizontal = segs.filter(([, y1, , y2]) => y1 === y2);

    expect(vertical).toHaveLength(5); // 4 cells + 1
    expect(horizontal).toHaveLength(4); // 3 cells + 1
    expect(segs).toHaveLength(9);
  });

  it("places lines on whole cell boundaries — the + 0.5 is DROPPED", () => {
    const d = gridOverlayPathData({ cellWidth: 3, cellHeight: 2 });

    // Not a single coordinate anywhere may carry a half.
    for (const seg of segments(d)) {
      for (const n of seg) {
        expect(Number.isInteger(n)).toBe(true);
      }
    }
    expect(d).not.toContain(".5");
  });

  it("puts the vertical lines at x = 0..cellWidth, spanning the full height", () => {
    const d = gridOverlayPathData({ cellWidth: 3, cellHeight: 2 });
    const vertical = segments(d).filter(([x1, , x2]) => x1 === x2);

    expect(vertical.map(([x1]) => x1)).toEqual([0, 1, 2, 3]);
    for (const [, y1, , y2] of vertical) {
      expect(y1).toBe(0);
      expect(y2).toBe(2);
    }
  });

  it("puts the horizontal lines at y = 0..cellHeight, spanning the full width", () => {
    const d = gridOverlayPathData({ cellWidth: 3, cellHeight: 2 });
    const horizontal = segments(d).filter(([, y1, , y2]) => y1 === y2);

    expect(horizontal.map(([, y1]) => y1)).toEqual([0, 1, 2]);
    for (const [x1, , x2] of horizontal) {
      expect(x1).toBe(0);
      expect(x2).toBe(3);
    }
  });

  it("emits one user unit per CELL, not per zoomed pixel", () => {
    // The whole point of the 1:1 model: a 4-cell grid spans 4 units, whatever
    // the view is magnified to. A surviving `* zoom` would make this 40 or 200.
    const d = gridOverlayPathData({ cellWidth: 4, cellHeight: 4 });
    const xs = segments(d).flatMap(([x1, , x2]) => [x1, x2]);
    expect(Math.max(...xs)).toBe(4);
  });

  it("handles a 1×1 grid — two lines per axis, no degenerate output", () => {
    const segs = segments(gridOverlayPathData({ cellWidth: 1, cellHeight: 1 }));
    expect(segs).toHaveLength(4);
  });

  it("scales to a real sprite: Landscapes 256×224 is 482 lines in ONE path", () => {
    // One <path> rather than 482 <line> elements is deliberate — see the
    // module header. If this ever becomes 482 specs, the compositing cost of
    // the overlay changes materially.
    const d = gridOverlayPathData({ cellWidth: 256, cellHeight: 224 });
    expect(segments(d)).toHaveLength(257 + 225);
  });
});

describe("gridOverlayAttrs", () => {
  it("uses BLACK at 8% in light mode", () => {
    expect(gridOverlayAttrs(true).stroke).toBe(BLACK_08);
    expect(gridOverlayAttrs(true).stroke).toBe("rgba(0, 0, 0, 0.08)");
  });

  it("uses WHITE at 5% in dark mode", () => {
    expect(gridOverlayAttrs(false).stroke).toBe(WHITE_05);
    expect(gridOverlayAttrs(false).stroke).toBe("rgba(255, 255, 255, 0.05)");
  });

  it("carries vector-effect=non-scaling-stroke — the point of the whole task", () => {
    for (const light of [true, false]) {
      expect(gridOverlayAttrs(light)["vector-effect"]).toBe(
        "non-scaling-stroke",
      );
    }
  });

  it("strokes a 1px hairline and fills nothing", () => {
    const attrs = gridOverlayAttrs(false);
    expect(attrs["stroke-width"]).toBe(1);
    expect(attrs.fill).toBe("none");
  });

  it("asks for crispEdges so the hairlines land on device pixels", () => {
    expect(gridOverlayAttrs(false)["shape-rendering"]).toBe("crispEdges");
  });
});

describe("gridOverlayPath", () => {
  it("returns the path data and the attributes together", () => {
    const spec = gridOverlayPath({ cellWidth: 2, cellHeight: 2 }, false);
    expect(spec.d).toBe(gridOverlayPathData({ cellWidth: 2, cellHeight: 2 }));
    expect(spec.attrs).toEqual(gridOverlayAttrs(false));
  });

  it("is pure — the same geometry twice gives an identical string", () => {
    const a = gridOverlayPath({ cellWidth: 9, cellHeight: 7 }, true);
    const b = gridOverlayPath({ cellWidth: 9, cellHeight: 7 }, true);
    expect(a.d).toBe(b.d);
  });
});
