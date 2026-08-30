/**
 * `toolFootprint` — the hover marker's geometry.
 *
 * The property that matters is AGREEMENT: the marker must cover the cells the
 * stroke will actually write. Since both go through `stampAt`, these tests
 * pin the tool→shape routing that decides WHICH stamp is asked for — the part
 * that can silently disagree with `CanvasContainer`'s drawing path.
 */
import { describe, expect, it } from "vitest";
import {
  getCirclePixels,
  getSquarePixels,
} from "../../../../components/Canvas/drawingUtils";
import { stampAt } from "../brushStamp";
import { isBrushTool, toolFootprint } from "../toolFootprint";

const BASE = {
  gridWidth: 16,
  gridHeight: 16,
  brushSize: 5,
  pencilShape: "square" as const,
  eraserShape: "circle" as const,
  circle: getCirclePixels,
  square: getSquarePixels,
};

const key = (cells: ReadonlyArray<{ x: number; y: number }>) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

const SHAPE_COLOR = { r: 0, g: 0, b: 0, a: 0 };

describe("toolFootprint", () => {
  describe("brush tools use their OWN shape setting", () => {
    it("⭐ the pencil follows pencilBrushShape, the eraser follows eraserShape", () => {
      // The two settings are independent in `ToolUIStore` and differ by
      // default (square vs circle). A marker that read one for both would
      // misreport the eraser's footprint on a default install.
      const pencil = toolFootprint({ x: 8, y: 8 }, { ...BASE, tool: "pixel" });
      const eraser = toolFootprint({ x: 8, y: 8 }, { ...BASE, tool: "eraser" });

      expect(key(pencil)).toEqual(
        key(
          stampAt(
            { x: 8, y: 8 },
            {
              brushSize: 5,
              shape: getSquarePixels,
              shapeColor: SHAPE_COLOR,
              gridWidth: 16,
              gridHeight: 16,
            },
          ),
        ),
      );
      expect(key(eraser)).toEqual(
        key(
          stampAt(
            { x: 8, y: 8 },
            {
              brushSize: 5,
              shape: getCirclePixels,
              shapeColor: SHAPE_COLOR,
              gridWidth: 16,
              gridHeight: 16,
            },
          ),
        ),
      );
      // And they genuinely differ at this size — otherwise the test above
      // would pass even if the routing were swapped.
      expect(key(pencil)).not.toEqual(key(eraser));
    });

    it("fill-square is always square, ignoring pencilBrushShape", () => {
      // `CanvasContainer` calls `getSquarePixels` unconditionally for this
      // tool. The marker follows the code, not the setting.
      const withCirclePref = toolFootprint(
        { x: 8, y: 8 },
        { ...BASE, tool: "fill-square", pencilShape: "circle" },
      );
      const square = toolFootprint(
        { x: 8, y: 8 },
        { ...BASE, tool: "pixel", pencilShape: "square" },
      );
      expect(key(withCirclePref)).toEqual(key(square));
    });

    it("scales with brushSize", () => {
      const small = toolFootprint(
        { x: 8, y: 8 },
        { ...BASE, tool: "pixel", brushSize: 1 },
      );
      const large = toolFootprint(
        { x: 8, y: 8 },
        { ...BASE, tool: "pixel", brushSize: 7 },
      );
      expect(small).toHaveLength(1);
      expect(large.length).toBeGreaterThan(small.length);
    });
  });

  describe("non-brush tools resolve to the single cell under the pointer", () => {
    it.each([
      "flood-fill",
      "gaussian-fill",
      "line",
      "rectangle",
      "ellipse",
      "eyedropper",
      "move",
      "selection",
      "origin",
      "reference-trace",
    ])("%s marks exactly one cell, even at brush size 9", (tool) => {
      // Owner decision (2026-08-28): one cell rather than nothing. A flood
      // fill's true extent needs the pixel grid, which may not cross into
      // `ui/`; showing nothing would make the pencil invisible on half the
      // toolbar.
      const cells = toolFootprint(
        { x: 4, y: 6 },
        { ...BASE, tool, brushSize: 9 },
      );
      expect(cells).toEqual([{ x: 4, y: 6 }]);
    });

    it("isBrushTool names exactly the three size-sensitive tools", () => {
      expect(isBrushTool("pixel")).toBe(true);
      expect(isBrushTool("eraser")).toBe(true);
      expect(isBrushTool("fill-square")).toBe(true);
      expect(isBrushTool("flood-fill")).toBe(false);
      expect(isBrushTool("eyedropper")).toBe(false);
    });
  });

  describe("bounds", () => {
    it("clips a brush that overhangs the grid edge", () => {
      const cells = toolFootprint(
        { x: 0, y: 0 },
        { ...BASE, tool: "pixel", brushSize: 5 },
      );
      expect(cells.every((c) => c.x >= 0 && c.y >= 0)).toBe(true);
    });

    it("⭐ a brush centred off-grid still marks the cells it reaches", () => {
      // NOT an empty list, and this matches the drawing path exactly:
      // `stampAt` bounds-filters the STAMP, not the centre, so a wide brush
      // just outside the edge does write the in-bounds part of its footprint.
      // The marker has to agree with that or it would promise nothing and
      // then paint something.
      const cells = toolFootprint(
        { x: -1, y: 4 },
        { ...BASE, tool: "pixel", brushSize: 5 },
      );
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every((c) => c.x >= 0 && c.x < 16)).toBe(true);
    });

    it("returns nothing for a SINGLE-cell tool outside the grid", () => {
      // At size 1 the footprint is the centre itself, so off-grid genuinely
      // means nothing to mark — which is what keeps the marker from appearing
      // when the pointer is beside the sprite rather than on it.
      expect(
        toolFootprint({ x: 4, y: 99 }, { ...BASE, tool: "flood-fill" }),
      ).toEqual([]);
      expect(
        toolFootprint(
          { x: -1, y: 4 },
          { ...BASE, tool: "pixel", brushSize: 1 },
        ),
      ).toEqual([]);
    });
  });
});
