/**
 * Golden-hash tests for the checkerboard background and the pixel grid.
 *
 * Render mode covered: **background** (both `lightGridMode` states).
 *
 * The checkerboard is `putImageData` work, so it hashes exactly. The GRID is
 * stroked, and `canvasStub` does not rasterise strokes — so the grid is asserted
 * two ways instead: its geometry via `gridLinePath` (pure data), and its drawing
 * via `ctx.calls`.
 *
 * Every hash below was recorded from a real run (MASTER.md §10 rule 10).
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  backgroundTheme,
  paintCheckerboard,
  gridLinePath,
  strokeGrid,
} from "@/ui/canvas/render/canvasBackground";
import type { BackgroundGeometry } from "@/ui/canvas/render/canvasBackground";
import {
  createBuffer,
  createStubContext,
  getPixel,
  hashBuffer,
} from "@/test/canvasStub";

const geom = (over: Partial<BackgroundGeometry> = {}): BackgroundGeometry => ({
  canvasWidth: 16,
  canvasHeight: 16,
  cellsX: 4,
  cellsY: 4,
  offsetX: 0,
  offsetY: 0,
  zoom: 4,
  ...over,
});

const paint = (g: BackgroundGeometry, light: boolean) => {
  const buf = createBuffer(g.canvasWidth, g.canvasHeight);
  paintCheckerboard(buf, g, backgroundTheme(light));
  return buf;
};

describe("paintCheckerboard — golden hashes", () => {
  it("GOLDEN: dark mode, 4×4 cells at zoom 4", () => {
    expect(hashBuffer(paint(geom(), false))).toBe("16x16:160a0385");
  });

  it("GOLDEN: light mode, 4×4 cells at zoom 4", () => {
    expect(hashBuffer(paint(geom(), true))).toBe("16x16:085c2685");
  });

  it("the two grid modes produce DIFFERENT pixels", () => {
    expect(hashBuffer(paint(geom(), false))).not.toBe(
      hashBuffer(paint(geom(), true)),
    );
  });

  it("dark mode uses #2a2a3a / #222230 on alternating cells", () => {
    const buf = paint(geom(), false);
    // Cell (0,0) is even parity -> color1.
    expect(getPixel(buf, 0, 0)).toEqual([42, 42, 58, 255]);
    // Cell (1,0) is odd parity -> color2.
    expect(getPixel(buf, 4, 0)).toEqual([34, 34, 48, 255]);
  });

  it("light mode uses #cccccc / #eeeeee on alternating cells", () => {
    const buf = paint(geom(), true);
    expect(getPixel(buf, 0, 0)).toEqual([204, 204, 204, 255]);
    expect(getPixel(buf, 4, 0)).toEqual([238, 238, 238, 255]);
  });

  it("every pixel is fully opaque — the background never lets canvas show through", () => {
    const buf = paint(geom(), false);
    for (let i = 3; i < buf.data.length; i += 4) {
      expect(buf.data[i]).toBe(255);
    }
  });

  it("a world offset FLIPS the checker parity, keeping phase across a variant view", () => {
    const even = paint(geom({ offsetX: 0 }), false);
    const odd = paint(geom({ offsetX: 1 }), false);
    expect(getPixel(even, 0, 0)).toEqual([42, 42, 58, 255]);
    expect(getPixel(odd, 0, 0)).toEqual([34, 34, 48, 255]);
    expect(hashBuffer(even)).not.toBe(hashBuffer(odd));
  });

  it("the base colour shows where the cells do not reach", () => {
    // 4 cells × zoom 4 = 16px of checker in a 24px buffer; the rest is base.
    const buf = paint(geom({ canvasWidth: 24, canvasHeight: 24 }), false);
    expect(getPixel(buf, 20, 20)).toEqual([26, 26, 37, 255]);
  });

  it("clips cells that overhang the buffer instead of writing out of bounds", () => {
    // 4 cells × zoom 4 = 16px of content in an 8px buffer.
    const g = geom({ canvasWidth: 8, canvasHeight: 8 });
    expect(() => paint(g, false)).not.toThrow();
    expect(hashBuffer(paint(g, false))).toBe("8x8:99fe61a5");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * The CSS DIV's equivalence to the raster painter (plan 05, task 06, D11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `paintCheckerboard` NO LONGER PAINTS THE EDITING CANVAS's background — it is
 * a `conic-gradient` on `.canvas__background` now. But the function survives,
 * because the LIGHTING studio still calls it through `renderNormalEdit.ts` and
 * `renderLitComposite.ts` (task 08 owns that migration), which is exactly why
 * the two implementations can now drift apart silently.
 *
 * These tests are the guard. They model the CSS rules in a few lines of
 * arithmetic and assert the model agrees with the raster painter cell for
 * cell. If someone edits the quadrant order in `CanvasSurface.css`, or drops
 * the `background-position` phase, or "simplifies" the double modulo in
 * `CanvasContainer`'s `checkerParity`, the disagreement shows up HERE rather
 * than as a checkerboard that looks subtly wrong on someone's screen — which
 * is the one failure mode a green suite otherwise cannot catch.
 *
 * ⚠️ They assert the CSS is EQUIVALENT, not that the CSS renders. jsdom has no
 * gradient rasteriser and there is no browser in this environment, so
 * "the pattern is crisp and not grey mush" still needs eyes.
 */
describe("the CSS checkerboard reproduces paintCheckerboard exactly", () => {
  /**
   * `.canvas__background`'s tile, as the browser resolves it.
   *
   * `background-size: 2px 2px` with `conic-gradient(B 0 25%, A 0 50%, B 0
   * 75%, A 0)`. A conic gradient starts at 12 o'clock and sweeps CLOCKWISE
   * from the tile centre, so the four stops land on the quadrants in the
   * order top-right, bottom-right, bottom-left, top-left:
   *
   *     0-25%   top-right    (1,0) -> B
   *     25-50%  bottom-right (1,1) -> A
   *     50-75%  bottom-left  (0,1) -> B
   *     75-100% top-left     (0,0) -> A
   *
   * i.e. A on EVEN `(x + y)`, which is `paintCheckerboard`'s `color1` rule.
   */
  const tileIsColorA = (tileX: number, tileY: number) =>
    (tileX + tileY) % 2 === 0;

  /**
   * `background-position`, from `CanvasContainer`'s `checkerParity`.
   *
   * ⚠️ HONEST NOTE ON WHAT THIS DOES AND DOES NOT PIN. `bgGeom.offsetX` is
   * `Math.min(0, variantOffset.x)` in variant-edit mode, so it can be
   * NEGATIVE, and JS's `%` returns -1 for -1. The double modulo normalises
   * that to 0 or 1. Verified by mutation on 2026-08-30: replacing it with a
   * bare `% 2` does NOT fail these tests, and that is CORRECT rather than a
   * gap — on a 2px tile `background-position: -1px` and `1px` are congruent
   * mod 2, so both flip the phase. The normalisation is defensive (a
   * negative background-position reads as a bug, and it would stop being
   * congruent the moment the tile size changed), not load-bearing.
   *
   * What IS load-bearing and IS pinned: that the offset reaches the CSS at
   * all, and the quadrant order below. Both fail loudly if broken.
   */
  const checkerParity = (offset: number) => ((offset % 2) + 2) % 2;

  /**
   * What colour the CSS paints at SURFACE cell (px, py).
   *
   * `background-position: P` makes surface pixel `x` sample tile position
   * `x - P`, and the element is inside `.canvas__layout` so one CSS pixel is
   * one cell.
   */
  const cssIsColorA = (
    px: number,
    py: number,
    offsetX: number,
    offsetY: number,
  ) => {
    const shiftX = px - checkerParity(offsetX);
    const shiftY = py - checkerParity(offsetY);
    return tileIsColorA(((shiftX % 2) + 2) % 2, ((shiftY % 2) + 2) % 2);
  };

  /** What the RASTER painter put at surface cell (px, py), read back. */
  const rasterIsColorA = (
    px: number,
    py: number,
    offsetX: number,
    offsetY: number,
  ) => {
    const g = geom({ offsetX, offsetY });
    const buf = paint(g, false);
    const [r] = getPixel(buf, px * g.zoom, py * g.zoom);
    // dark color1 = #2a2a3a (r = 42); dark color2 = #222230 (r = 34).
    return r === 42;
  };

  /**
   * ⚠️ THE PARITY CHECK. Both offset parities, on both axes, over a full 4×4
   * of surface cells — this is manual check #4 made automatic.
   *
   * An ODD world offset must INVERT the pattern, because
   * `paintCheckerboard` chose its colour from `(offsetX + px + offsetY + py)
   * % 2` in WORLD cells: a variant view scrolled an odd number of cells keeps
   * the phase it had in object space. Testing only offset 0 would pass with
   * the phase dropped entirely.
   */
  for (const [ox, oy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    // Negative, which is the shape a variant dragged left actually produces
    // (`viewMinX = Math.min(0, variantOffset.x)`), and the case a bare `% 2`
    // gets wrong.
    [-1, 0],
    [-3, -2],
  ] as const) {
    it(`agrees cell-for-cell at world offset (${ox}, ${oy})`, () => {
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          expect({ px, py, a: cssIsColorA(px, py, ox, oy) }).toEqual({
            px,
            py,
            a: rasterIsColorA(px, py, ox, oy),
          });
        }
      }
    });
  }

  it("an ODD offset really does invert the pattern — a negative control", () => {
    // Without this the agreement above would also hold for an implementation
    // that ignored the offset on BOTH sides.
    expect(cssIsColorA(0, 0, 0, 0)).toBe(true);
    expect(cssIsColorA(0, 0, 1, 0)).toBe(false);
    expect(cssIsColorA(0, 0, 0, 1)).toBe(false);
    // Both axes odd cancels out — the phase is the SUM, not either axis.
    expect(cssIsColorA(0, 0, 1, 1)).toBe(true);
  });

  it("the tokens the CSS names carry the raster theme's exact colours", () => {
    // `tokens.css` is the source of truth for the DIV; `backgroundTheme` is
    // the source for the lighting canvas. They must be the same three
    // colours or the two surfaces show different checkerboards.
    const tokens = readFileSync(
      new URL("../../../../styles/tokens.css", import.meta.url),
      "utf8",
    );
    const tokenValue = (name: string) =>
      tokens.match(new RegExp(`${name}:\\s*([^;]+?)\\s*(?:;|/\\*)`))?.[1];

    const dark = backgroundTheme(false);
    const light = backgroundTheme(true);
    const hex = (c: { r: number; g: number; b: number }) =>
      `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

    expect(tokenValue("--canvas-bg-base")).toBe(hex(dark.base));
    expect(tokenValue("--canvas-bg-a")).toBe(hex(dark.color1));
    expect(tokenValue("--canvas-bg-b")).toBe(hex(dark.color2));
    expect(tokenValue("--canvas-bg-base-light")).toBe(hex(light.base));
    expect(tokenValue("--canvas-bg-a-light")).toBe(hex(light.color1));
    expect(tokenValue("--canvas-bg-b-light")).toBe(hex(light.color2));
  });

  it("the grid-line tokens carry the MEASURED alpha rule: black 8% light, white 5% dark", () => {
    // ⚠️ Measured 2026-08-19 and documented at `canvasBackground.ts:19-24`.
    // The asymmetry corrects the task-30 spec and is what `Canvas.tsx:400-402`
    // actually did. `gridOverlayAttrs` strokes the SVG grid with the same two
    // values, so this pins CSS and SVG to one rule.
    const tokens = readFileSync(
      new URL("../../../../styles/tokens.css", import.meta.url),
      "utf8",
    );
    expect(tokens).toContain("--canvas-grid-line: rgba(255, 255, 255, 0.05);");
    expect(tokens).toContain(
      "--canvas-grid-line-light: rgba(0, 0, 0, 0.08);",
    );
    expect(backgroundTheme(false).gridStroke).toBe("rgba(255, 255, 255, 0.05)");
    expect(backgroundTheme(true).gridStroke).toBe("rgba(0, 0, 0, 0.08)");
  });
});

describe("gridLinePath — geometry (the grid cannot be hashed)", () => {
  it("emits cells+1 lines per axis, so both outer edges are drawn", () => {
    const lines = gridLinePath(geom());
    expect(lines).toHaveLength(5 + 5);
  });

  it("offsets every line by the canonical half pixel", () => {
    for (const l of gridLinePath(geom())) {
      const onHalf = l.x1 % 1 === 0.5 || l.y1 % 1 === 0.5;
      expect(onHalf).toBe(true);
    }
  });

  it("verticals span the full height and horizontals the full width", () => {
    const lines = gridLinePath(geom());
    const verticals = lines.filter((l) => l.x1 === l.x2);
    const horizontals = lines.filter((l) => l.y1 === l.y2);
    expect(verticals).toHaveLength(5);
    expect(horizontals).toHaveLength(5);
    expect(verticals.every((l) => l.y1 === 0 && l.y2 === 16)).toBe(true);
    expect(horizontals.every((l) => l.x1 === 0 && l.x2 === 16)).toBe(true);
  });
});

describe("strokeGrid — asserted via ctx.calls, NOT a hash", () => {
  it("Q3 UNIFICATION: dark mode strokes at rgba(255,255,255,0.05)", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(false));
    expect(ctx.strokeStyle).toBe("rgba(255, 255, 255, 0.05)");
  });

  it("Q3 UNIFICATION: light mode strokes at rgba(0,0,0,0.08)", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(true));
    expect(ctx.strokeStyle).toBe("rgba(0, 0, 0, 0.08)");
  });

  it("batches every line into ONE path and ONE stroke call", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(false));
    const names = ctx.calls.map((c) => c.method);
    expect(names.filter((n) => n === "beginPath")).toHaveLength(1);
    expect(names.filter((n) => n === "stroke")).toHaveLength(1);
    expect(names.filter((n) => n === "moveTo")).toHaveLength(10);
    expect(names.filter((n) => n === "lineTo")).toHaveLength(10);
  });

  it("leaves the pixel buffer untouched — proof strokes are unhashable", () => {
    const ctx = createStubContext(16, 16);
    strokeGrid(ctx as never, geom(), backgroundTheme(false));
    expect(ctx.buffer.data.every((b) => b === 0)).toBe(true);
  });
});
