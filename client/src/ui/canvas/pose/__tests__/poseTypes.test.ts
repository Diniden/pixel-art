/**
 * Tests for the pure parts of the pose engine — the vector helpers and the
 * readback row flip.
 *
 * ⚠️ Deliberately narrow. jsdom has no WebGL, so nothing that constructs a
 * `WebGLRenderer` can run here (MASTER risk register); the GL lifecycle is
 * covered by task 08's manual checks. What IS testable is the maths that would
 * otherwise fail silently, and the row flip is the highest-value case in the
 * whole task: WebGL reads back bottom-left first while `ImageData` starts
 * top-left, and getting it wrong renders the model upside down rather than
 * throwing.
 */
import { describe, expect, it } from "vitest";
import {
  dotVector,
  normalizeVector,
  scaleVector,
  subtractVector,
  vectorLength,
} from "@/ui/canvas/pose/poseTypes";
import { flipRowsInPlace } from "@/ui/canvas/pose/poseEngine";

/**
 * An RGBA buffer whose every texel is `(row, col, 0, 255)`, so a flip is
 * legible by inspection: the R channel names the row it came from.
 */
function rowMarkedBuffer(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[i] = y;
      buf[i + 1] = x;
      buf[i + 2] = 0;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

/** The R channel of every texel, row-major — the flip is visible in one line. */
function rowMarks(buf: Uint8Array, width: number, height: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < height; y++) out.push(buf[y * width * 4]);
  return out;
}

describe("normalizeVector", () => {
  it("returns a unit-length copy", () => {
    const n = normalizeVector({ x: 3, y: 4, z: 0 });
    expect(n).toEqual({ x: 0.6, y: 0.8, z: 0 });
    expect(vectorLength(n)).toBeCloseTo(1, 12);
  });

  it("preserves direction for a vector that is already unit length", () => {
    const n = normalizeVector({ x: 0, y: 1, z: 0 });
    expect(n).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("handles all three components", () => {
    const n = normalizeVector({ x: 1, y: 2, z: 2 });
    expect(n.x).toBeCloseTo(1 / 3, 12);
    expect(n.y).toBeCloseTo(2 / 3, 12);
    expect(n.z).toBeCloseTo(2 / 3, 12);
  });

  it("returns the components unchanged for a zero vector rather than NaN", () => {
    // ⚠️ The whole point: dividing by a zero length would poison the scene
    // with NaN, which presents as a blank frame, not as an error.
    const n = normalizeVector({ x: 0, y: 0, z: 0 });
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isNaN(n.x)).toBe(false);
  });

  it("returns the components unchanged when the length is not finite", () => {
    const n = normalizeVector({ x: Infinity, y: 0, z: 0 });
    expect(n).toEqual({ x: Infinity, y: 0, z: 0 });
  });

  it("does not mutate its input", () => {
    const v = { x: 3, y: 4, z: 0 };
    normalizeVector(v);
    expect(v).toEqual({ x: 3, y: 4, z: 0 });
  });

  it("normalises a negative vector without flipping its sign", () => {
    const n = normalizeVector({ x: -3, y: -4, z: 0 });
    expect(n).toEqual({ x: -0.6, y: -0.8, z: 0 });
  });
});

describe("vector helpers", () => {
  it("dotVector multiplies component-wise and sums", () => {
    expect(dotVector({ x: 1, y: 2, z: 3 }, { x: 4, y: -5, z: 6 })).toBe(12);
  });

  it("dotVector is zero for perpendicular vectors", () => {
    expect(dotVector({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
  });

  it("subtractVector is component-wise a - b", () => {
    expect(subtractVector({ x: 5, y: 5, z: 5 }, { x: 1, y: 2, z: 3 })).toEqual({
      x: 4,
      y: 3,
      z: 2,
    });
  });

  it("scaleVector multiplies every component", () => {
    expect(scaleVector({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it("vectorLength is the Euclidean norm", () => {
    expect(vectorLength({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(vectorLength({ x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe("flipRowsInPlace", () => {
  it("swaps the two rows of a 2x2 buffer", () => {
    const buf = rowMarkedBuffer(2, 2);
    expect(rowMarks(buf, 2, 2)).toEqual([0, 1]);
    flipRowsInPlace(buf, 2, 2);
    expect(rowMarks(buf, 2, 2)).toEqual([1, 0]);
  });

  it("moves whole texels, not just the first channel", () => {
    // 2x2, distinct texels. Row 0 = [A, B], row 1 = [C, D]; after the flip the
    // buffer must read [C, D, A, B] with each texel's four channels intact.
    const A = [10, 11, 12, 13];
    const B = [20, 21, 22, 23];
    const C = [30, 31, 32, 33];
    const D = [40, 41, 42, 43];
    const buf = new Uint8Array([...A, ...B, ...C, ...D]);
    flipRowsInPlace(buf, 2, 2);
    expect(Array.from(buf)).toEqual([...C, ...D, ...A, ...B]);
  });

  it("leaves the middle row alone for an odd height", () => {
    const buf = rowMarkedBuffer(3, 5);
    flipRowsInPlace(buf, 3, 5);
    expect(rowMarks(buf, 3, 5)).toEqual([4, 3, 2, 1, 0]);
  });

  it("is its own inverse", () => {
    const buf = rowMarkedBuffer(4, 7);
    const original = Array.from(buf);
    flipRowsInPlace(buf, 4, 7);
    expect(Array.from(buf)).not.toEqual(original);
    flipRowsInPlace(buf, 4, 7);
    expect(Array.from(buf)).toEqual(original);
  });

  it("preserves column order within a row", () => {
    const buf = rowMarkedBuffer(4, 2);
    flipRowsInPlace(buf, 4, 2);
    // Row 0 now holds what was row 1: G channel still counts up 0,1,2,3.
    expect([buf[1], buf[5], buf[9], buf[13]]).toEqual([0, 1, 2, 3]);
    expect([buf[0], buf[4], buf[8], buf[12]]).toEqual([1, 1, 1, 1]);
  });

  it("is a no-op for a single-row buffer", () => {
    const buf = rowMarkedBuffer(3, 1);
    const original = Array.from(buf);
    flipRowsInPlace(buf, 3, 1);
    expect(Array.from(buf)).toEqual(original);
  });

  it("returns the same array instance it was given", () => {
    const buf = rowMarkedBuffer(2, 2);
    expect(flipRowsInPlace(buf, 2, 2)).toBe(buf);
  });

  it("returns the buffer untouched when the length does not match the dimensions", () => {
    // A partially swapped buffer would be worse than an unswapped one, and
    // there is nothing useful a render path could do with a thrown error.
    const buf = new Uint8Array(9);
    buf.set([1, 2, 3]);
    const original = Array.from(buf);
    expect(flipRowsInPlace(buf, 2, 2)).toBe(buf);
    expect(Array.from(buf)).toEqual(original);
  });

  it("returns the buffer untouched for non-positive dimensions", () => {
    const buf = new Uint8Array(0);
    expect(flipRowsInPlace(buf, 0, 0)).toBe(buf);
    expect(flipRowsInPlace(buf, -1, 4)).toBe(buf);
  });

  it("handles a tall 1-pixel-wide buffer", () => {
    const buf = rowMarkedBuffer(1, 4);
    flipRowsInPlace(buf, 1, 4);
    expect(rowMarks(buf, 1, 4)).toEqual([3, 2, 1, 0]);
  });
});
