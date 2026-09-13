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

  describe("class 4 — the `brush` tool's INJECTED footprint (plan 12, task 05)", () => {
    // A 3×3 brush painted at (0,0), (2,0), (1,1) — origin (1,1).
    const OFFSETS = [
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 0, dy: 0 },
    ];

    it("⭐ translates the offsets to the cursor cell", () => {
      const cells = toolFootprint(
        { x: 5, y: 7 },
        { ...BASE, tool: "brush", pixelBrushOffsets: OFFSETS },
      );
      expect(cells).toEqual([
        { x: 4, y: 6 },
        { x: 6, y: 6 },
        { x: 5, y: 7 },
      ]);
    });

    it("clips the translated cells at the grid edge, keeping the rest", () => {
      // At (0,0) the two `dy: -1` cells fall off the top; the origin stays.
      const cells = toolFootprint(
        { x: 0, y: 0 },
        { ...BASE, tool: "brush", pixelBrushOffsets: OFFSETS },
      );
      expect(cells).toEqual([{ x: 0, y: 0 }]);
      // And at the far corner the `dx: +1` cell falls off the right.
      const far = toolFootprint(
        { x: 15, y: 15 },
        { ...BASE, tool: "brush", pixelBrushOffsets: OFFSETS },
      );
      expect(far).toEqual([
        { x: 14, y: 14 },
        { x: 15, y: 15 },
      ]);
    });

    it("⭐ is EMPTY — not one cell — with no brush loaded (null / undefined)", () => {
      // With no document a stroke writes nothing, so the marker must promise
      // nothing. Class 3's one-cell answer would be a lie here.
      expect(
        toolFootprint(
          { x: 8, y: 8 },
          { ...BASE, tool: "brush", pixelBrushOffsets: null },
        ),
      ).toEqual([]);
      expect(toolFootprint({ x: 8, y: 8 }, { ...BASE, tool: "brush" })).toEqual(
        [],
      );
    });

    it("an empty offsets list is an empty footprint, not a single cell", () => {
      expect(
        toolFootprint(
          { x: 8, y: 8 },
          { ...BASE, tool: "brush", pixelBrushOffsets: [] },
        ),
      ).toEqual([]);
    });

    it("ignores `brushSize` entirely — the stamp does not scale", () => {
      const one = toolFootprint(
        { x: 8, y: 8 },
        { ...BASE, tool: "brush", brushSize: 1, pixelBrushOffsets: OFFSETS },
      );
      const nine = toolFootprint(
        { x: 8, y: 8 },
        { ...BASE, tool: "brush", brushSize: 9, pixelBrushOffsets: OFFSETS },
      );
      expect(nine).toEqual(one);
    });

    it("does not make `brush` a member of isBrushTool", () => {
      // The predicate means "scales with brushSize"; the stamp is a fourth
      // class, not a size-scaled one (MASTER D8).
      expect(isBrushTool("brush")).toBe(false);
    });

    it.each(["pixel", "eraser", "fill-square", "flood-fill", "eyedropper"])(
      "%s ignores pixelBrushOffsets",
      (tool) => {
        const without = toolFootprint({ x: 8, y: 8 }, { ...BASE, tool });
        const withOffsets = toolFootprint(
          { x: 8, y: 8 },
          { ...BASE, tool, pixelBrushOffsets: OFFSETS },
        );
        expect(key(withOffsets)).toEqual(key(without));
      },
    );
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
