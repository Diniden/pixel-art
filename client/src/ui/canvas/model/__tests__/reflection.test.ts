/**
 * Tests for the reflection geometry — the maths behind "draw on one side, the
 * same thing appears on the other".
 *
 * The cases that matter are the ones where the locked decisions could quietly
 * drift: reflecting the cell CENTRE rather than the corner (D3), the sequential
 * closure that makes two perpendicular lines 4-fold rather than 3-fold (D4), and
 * the originals-first / keep-first ordering that stops an image overwriting the
 * original it came from once `PixelStore.setPixels` lets later writes win.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_REFLECTION_LINES,
  describeLine,
  expandWrites,
  isDegenerate,
  presetLines,
  reflectCell,
  reflectPoint,
} from "@/ui/canvas/model/reflection";
import type { ReflectionLine } from "@/ui/canvas/model/reflection";

/** A line helper — ids are irrelevant to the geometry. */
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  id = "L",
): ReflectionLine => ({ id, x1, y1, x2, y2 });

/** Ids for presets: deterministic and countable. */
const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("isDegenerate", () => {
  it("is true only when both endpoints coincide", () => {
    expect(isDegenerate(line(2, 2, 2, 2))).toBe(true);
    expect(isDegenerate(line(0, 0, 0, 0))).toBe(true);
    expect(isDegenerate(line(2, 2, 2, 3))).toBe(false);
    expect(isDegenerate(line(2, 2, 3, 2))).toBe(false);
  });
});

describe("reflectPoint", () => {
  it("mirrors across a vertical line", () => {
    expect(reflectPoint(1, 5, line(4, 0, 4, 10))).toEqual({ x: 7, y: 5 });
  });

  it("mirrors across a horizontal line", () => {
    expect(reflectPoint(5, 1, line(0, 4, 10, 4))).toEqual({ x: 5, y: 7 });
  });

  it("swaps the axes across the 45° diagonal through the origin", () => {
    const p = reflectPoint(1.5, 3.5, line(0, 0, 8, 8));
    expect(p.x).toBeCloseTo(3.5, 10);
    expect(p.y).toBeCloseTo(1.5, 10);
  });

  it("uses the INFINITE line — the segment's extent is irrelevant", () => {
    // A one-cell-long stub of the same vertical line gives the same answer.
    expect(reflectPoint(1, 5, line(4, 0, 4, 1))).toEqual({ x: 7, y: 5 });
  });

  it("returns the point unchanged for a degenerate line rather than NaN", () => {
    expect(reflectPoint(3, 4, line(2, 2, 2, 2))).toEqual({ x: 3, y: 4 });
  });
});

describe("reflectCell — exactness on an even grid", () => {
  // 8×8 grid, vertical centre line at x = 4 (a corner-lattice position).
  const centre = line(4, 0, 4, 8);

  it("maps column c to column w-1-c across the vertical centre", () => {
    expect(reflectCell({ x: 0, y: 3 }, centre, 8, 8)).toEqual({ x: 7, y: 3 });
    expect(reflectCell({ x: 1, y: 3 }, centre, 8, 8)).toEqual({ x: 6, y: 3 });
    expect(reflectCell({ x: 3, y: 0 }, centre, 8, 8)).toEqual({ x: 4, y: 0 });
    expect(reflectCell({ x: 4, y: 0 }, centre, 8, 8)).toEqual({ x: 3, y: 0 });
    expect(reflectCell({ x: 7, y: 7 }, centre, 8, 8)).toEqual({ x: 0, y: 7 });
  });

  it("is an involution — reflecting twice returns the original cell", () => {
    for (let x = 0; x < 8; x++) {
      const once = reflectCell({ x, y: 2 }, centre, 8, 8);
      expect(once).not.toBeNull();
      expect(reflectCell(once!, centre, 8, 8)).toEqual({ x, y: 2 });
    }
  });

  it("maps row r to row h-1-r across the horizontal centre", () => {
    const h = line(0, 4, 8, 4);
    expect(reflectCell({ x: 2, y: 0 }, h, 8, 8)).toEqual({ x: 2, y: 7 });
    expect(reflectCell({ x: 2, y: 5 }, h, 8, 8)).toEqual({ x: 2, y: 2 });
  });
});

describe("reflectCell — odd grid, half-integer line", () => {
  // 7 wide: the vertical centre is x = 3.5, and column 3 is its own mirror.
  const centre = line(3.5, 0, 3.5, 7);

  it("maps the middle column onto ITSELF", () => {
    expect(reflectCell({ x: 3, y: 2 }, centre, 7, 7)).toEqual({ x: 3, y: 2 });
  });

  it("still mirrors the columns either side of it", () => {
    expect(reflectCell({ x: 0, y: 2 }, centre, 7, 7)).toEqual({ x: 6, y: 2 });
    expect(reflectCell({ x: 2, y: 2 }, centre, 7, 7)).toEqual({ x: 4, y: 2 });
  });
});

describe("reflectCell — 45° diagonal", () => {
  const diag = line(0, 0, 4, 4);

  it("swaps x and y on a square grid", () => {
    expect(reflectCell({ x: 0, y: 3 }, diag, 4, 4)).toEqual({ x: 3, y: 0 });
    expect(reflectCell({ x: 3, y: 0 }, diag, 4, 4)).toEqual({ x: 0, y: 3 });
  });

  it("leaves cells ON the diagonal where they are", () => {
    expect(reflectCell({ x: 2, y: 2 }, diag, 4, 4)).toEqual({ x: 2, y: 2 });
  });

  it("survives the floating-point floor (epsilon, not truncation)", () => {
    // Every cell of a 5×5 grid must map to an exact cell across the diagonal;
    // without the epsilon some of these floor one short.
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(reflectCell({ x, y }, line(0, 0, 5, 5), 5, 5)).toEqual({
          x: y,
          y: x,
        });
      }
    }
  });
});

describe("reflectCell — bounds and degenerate input", () => {
  it("DROPS images that land off the grid", () => {
    // Mirror at x = 1 on an 8-wide grid: cell 5 reflects to -4.
    const l = line(1, 0, 1, 8);
    expect(reflectCell({ x: 5, y: 0 }, l, 8, 8)).toBeNull();
    // Mirror at x = 7: cell 1 reflects to 12.
    expect(reflectCell({ x: 1, y: 0 }, line(7, 0, 7, 8), 8, 8)).toBeNull();
    // Vertically too.
    expect(reflectCell({ x: 0, y: 5 }, line(0, 1, 8, 1), 8, 8)).toBeNull();
  });

  it("returns null for a degenerate line", () => {
    expect(reflectCell({ x: 1, y: 1 }, line(2, 2, 2, 2), 8, 8)).toBeNull();
  });
});

describe("expandWrites — single line", () => {
  const centre = line(4, 0, 4, 8);

  it("appends the image after the original", () => {
    expect(expandWrites([{ x: 1, y: 1 }], [centre], 8, 8)).toEqual([
      { x: 1, y: 1 },
      { x: 6, y: 1 },
    ]);
  });

  it("returns an array EQUAL to the input when there are no lines", () => {
    const writes = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(expandWrites(writes, [], 8, 8)).toEqual(writes);
  });

  it("ignores degenerate lines", () => {
    expect(expandWrites([{ x: 1, y: 1 }], [line(2, 2, 2, 2)], 8, 8)).toEqual([
      { x: 1, y: 1 },
    ]);
  });

  it("drops images that fall off the grid, keeping the original", () => {
    expect(expandWrites([{ x: 5, y: 0 }], [line(1, 0, 1, 8)], 8, 8)).toEqual([
      { x: 5, y: 0 },
    ]);
  });
});

describe("expandWrites — ordering and dedupe", () => {
  it("puts ALL originals first, then the images", () => {
    const out = expandWrites(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [line(4, 0, 4, 8)],
      8,
      8,
    );
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 7, y: 0 },
      { x: 6, y: 0 },
    ]);
  });

  it("keeps the FIRST occurrence, so an image never displaces an original", () => {
    // The 7×7 grid's middle column reflects onto itself across x = 3.5. The
    // original carries the payload that must survive to `setPixels`.
    const out = expandWrites(
      [{ x: 3, y: 1, color: "#fff" }],
      [line(3.5, 0, 3.5, 7)],
      7,
      7,
    );
    expect(out).toEqual([{ x: 3, y: 1, color: "#fff" }]);
  });

  it("de-duplicates originals a stroke revisited", () => {
    const out = expandWrites(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      [],
      8,
      8,
    );
    expect(out).toEqual([{ x: 1, y: 1 }]);
  });

  it("does not emit an image that collides with a LATER original", () => {
    // Cells 1 and 6 are each other's mirror across x = 4, so the pair is closed.
    const out = expandWrites(
      [
        { x: 1, y: 0 },
        { x: 6, y: 0 },
      ],
      [line(4, 0, 4, 8)],
      8,
      8,
    );
    expect(out).toEqual([
      { x: 1, y: 0 },
      { x: 6, y: 0 },
    ]);
  });
});

describe("expandWrites — multiple lines (sequential closure)", () => {
  it("turns 1 cell into 4 across two perpendicular lines", () => {
    const out = expandWrites(
      [{ x: 1, y: 1 }],
      [line(4, 0, 4, 8, "v"), line(0, 4, 8, 4, "h")],
      8,
      8,
    );
    expect(out).toEqual([
      { x: 1, y: 1 },
      { x: 6, y: 1 },
      { x: 1, y: 6 },
      { x: 6, y: 6 },
    ]);
  });

  it("reaches 8-fold symmetry with the two centre lines plus a diagonal", () => {
    const out = expandWrites(
      [{ x: 1, y: 0 }],
      [line(4, 0, 4, 8, "v"), line(0, 4, 8, 4, "h"), line(0, 0, 8, 8, "d")],
      8,
      8,
    );
    expect(out).toHaveLength(8);
    expect(out).toEqual(
      expect.arrayContaining([
        { x: 1, y: 0 },
        { x: 6, y: 0 },
        { x: 1, y: 7 },
        { x: 6, y: 7 },
        { x: 0, y: 1 },
        { x: 7, y: 1 },
        { x: 0, y: 6 },
        { x: 7, y: 6 },
      ]),
    );
    // The original is still first — the ordering rule holds across lines.
    expect(out[0]).toEqual({ x: 1, y: 0 });
  });

  it("ignores lines past MAX_REFLECTION_LINES", () => {
    // 9 distinct vertical mirrors on a wide grid; only the first 8 may apply.
    const many = Array.from({ length: MAX_REFLECTION_LINES + 1 }, (_, i) =>
      line(i + 1, 0, i + 1, 4, `L${i}`),
    );
    const capped = expandWrites([{ x: 0, y: 0 }], many, 64, 4);
    const uncapped = expandWrites(
      [{ x: 0, y: 0 }],
      many.slice(0, MAX_REFLECTION_LINES),
      64,
      4,
    );
    expect(capped).toEqual(uncapped);
  });

  it("caps at 8", () => {
    expect(MAX_REFLECTION_LINES).toBe(8);
  });
});

describe("expandWrites — generic payload", () => {
  it("preserves every non-coordinate field on each image", () => {
    const out = expandWrites(
      [{ x: 1, y: 1, color: "#ff0000", normal: 42 }],
      [line(4, 0, 4, 8)],
      8,
      8,
    );
    expect(out).toEqual([
      { x: 1, y: 1, color: "#ff0000", normal: 42 },
      { x: 6, y: 1, color: "#ff0000", normal: 42 },
    ]);
  });

  it("does not mutate the input records", () => {
    const original = { x: 1, y: 1, color: "#fff" };
    expandWrites([original], [line(4, 0, 4, 8)], 8, 8);
    expect(original).toEqual({ x: 1, y: 1, color: "#fff" });
  });
});

describe("presetLines", () => {
  it("puts the vertical centre line at w/2, spanning the full height", () => {
    expect(presetLines("vertical", 16, 12, counter())).toEqual([
      { id: "id-1", x1: 8, y1: 0, x2: 8, y2: 12 },
    ]);
  });

  it("puts the horizontal centre line at h/2, spanning the full width", () => {
    expect(presetLines("horizontal", 16, 12, counter())).toEqual([
      { id: "id-1", x1: 0, y1: 6, x2: 16, y2: 6 },
    ]);
  });

  it('"both" is vertical then horizontal', () => {
    const both = presetLines("both", 16, 12, counter());
    expect(both).toHaveLength(2);
    expect(both.map((l) => l.id)).toEqual(["id-1", "id-2"]);
    expect(both[0]).toMatchObject({ x1: 8, y1: 0, x2: 8, y2: 12 });
    expect(both[1]).toMatchObject({ x1: 0, y1: 6, x2: 16, y2: 6 });
  });

  it('"diagonals" is the two corner-to-corner lines', () => {
    expect(presetLines("diagonals", 8, 8, counter())).toEqual([
      { id: "id-1", x1: 0, y1: 0, x2: 8, y2: 8 },
      { id: "id-2", x1: 8, y1: 0, x2: 0, y2: 8 },
    ]);
  });

  it('"all" is four lines with four distinct ids', () => {
    const all = presetLines("all", 8, 8, counter());
    expect(all).toHaveLength(4);
    expect(new Set(all.map((l) => l.id)).size).toBe(4);
  });

  it("uses HALF-INTEGERS on an odd grid so the middle row/column self-mirrors", () => {
    const [v] = presetLines("vertical", 17, 17, counter());
    expect(v.x1).toBe(8.5);
    expect(reflectCell({ x: 8, y: 0 }, v, 17, 17)).toEqual({ x: 8, y: 0 });
  });

  it("produces no degenerate lines on a normal grid", () => {
    for (const l of presetLines("all", 16, 16, counter())) {
      expect(isDegenerate(l)).toBe(false);
    }
  });
});

describe("describeLine", () => {
  it("formats integer endpoints plainly", () => {
    expect(describeLine(line(0, 8, 16, 8))).toBe("(0,8) → (16,8)");
  });

  it("keeps half-integers visible", () => {
    expect(describeLine(line(8.5, 0, 8.5, 17))).toBe("(8.5,0) → (8.5,17)");
  });
});
