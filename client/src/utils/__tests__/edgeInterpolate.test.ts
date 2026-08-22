/**
 * Characterisation tests for `utils/edgeInterpolate.ts`.
 *
 * 506 lines implementing one algorithm behind one export. Per the task spec the
 * 12 private math helpers (the weighted spherical mean at :347-412 especially)
 * are OUT of scope: transcribing their arithmetic into assertions would pin the
 * implementation rather than the behaviour. Instead the normal grid is packed
 * into a `PixelBuffer` and hashed with the shared `hashBuffer` helper, exactly
 * as the renderer tests do.
 *
 * Every hash below was produced by RUNNING the function (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import { computeEdgeInterpolatedNormals } from "@/utils/edgeInterpolate";
import { createBuffer, hashBuffer } from "@test/canvasStub";
import type { Layer, Normal, PixelData } from "@/types";

/* ── fixtures ────────────────────────────────────────────────────────────── */

const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };
const SOLID: PixelData = {
  color: { r: 200, g: 100, b: 50, a: 255 },
  normal: 0,
  height: 0,
};

function layerOf(
  width: number,
  height: number,
  filled: (x: number, y: number) => boolean,
): Layer {
  return {
    id: "layer-fixture",
    name: "fixture",
    visible: true,
    pixels: Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) =>
        filled(x, y) ? { ...SOLID } : { ...EMPTY },
      ),
    ),
  };
}

/**
 * Pack `Array<Normal | 0>` into an RGBA buffer so the shared `hashBuffer`
 * tripwire applies. The encoding is arbitrary but FIXED: it only has to be
 * injective, which it is — `x + 128`, `y + 128`, `z`, and an alpha byte that
 * distinguishes the `0` sentinel (0) from a real normal (255).
 */
function hashNormals(
  normals: Array<Normal | 0>,
  width: number,
  height: number,
): string {
  const buf = createBuffer(width, height);
  for (let i = 0; i < normals.length; i++) {
    const n = normals[i];
    const o = i * 4;
    if (n === 0) {
      buf.data[o] = 0;
      buf.data[o + 1] = 0;
      buf.data[o + 2] = 0;
      buf.data[o + 3] = 0;
    } else {
      buf.data[o] = n.x + 128;
      buf.data[o + 1] = n.y + 128;
      buf.data[o + 2] = n.z;
      buf.data[o + 3] = 255;
    }
  }
  return hashBuffer(buf);
}

const DEFAULT_NORMAL_VALUE: Normal = { x: 0, y: 0, z: 255 };

/* ────────────────────────────────────────────────────────────────────────── */

describe("computeEdgeInterpolatedNormals", () => {
  it("emits one entry per grid cell, in row-major order", () => {
    const result = computeEdgeInterpolatedNormals(
      layerOf(5, 3, () => true),
      5,
      3,
      45,
      1.0,
      3.0,
    );
    expect(result).toHaveLength(15);
  });

  it("returns the 0 sentinel for every cell of an EMPTY layer", () => {
    const result = computeEdgeInterpolatedNormals(
      layerOf(4, 4, () => false),
      4,
      4,
      45,
      1.0,
      3.0,
    );
    expect(result).toHaveLength(16);
    expect(result.every((n) => n === 0)).toBe(true);
  });

  it("returns a defined normal for a single-pixel layer, 0 everywhere else", () => {
    const result = computeEdgeInterpolatedNormals(
      layerOf(3, 3, (x, y) => x === 1 && y === 1),
      3,
      3,
      45,
      1.0,
      3.0,
    );
    expect(result.filter((n) => n !== 0)).toHaveLength(1);
    // OBSERVED: a lone pixel has four empty neighbours whose direction vectors
    // sum to zero, so `computeEdgeNormal` produces no usable edge direction and
    // the caller substitutes DEFAULT_NORMAL.
    expect(result[4]).toEqual(DEFAULT_NORMAL_VALUE);
  });

  it("OBSERVED: startAngle 0 makes a solid square entirely DEFAULT_NORMAL", () => {
    // The doc comment at edgeInterpolate.ts:60-67 says 0° means "normal points
    // straight up (z direction, no x/y component)". Confirmed empirically: a
    // filled 5×5 at 0° has no lateral component anywhere, edges included.
    const result = computeEdgeInterpolatedNormals(
      layerOf(5, 5, () => true),
      5,
      5,
      0,
      1.0,
      3.0,
    );
    expect(result).toHaveLength(25);
    expect(
      result.every((n) => n !== 0 && n.x === 0 && n.y === 0 && n.z === 255),
    ).toBe(true);
  });

  it("at startAngle 90 the edges point OUTWARD and the centre stays DEFAULT_NORMAL", () => {
    const w = 5;
    const h = 5;
    const result = computeEdgeInterpolatedNormals(
      layerOf(w, h, () => true),
      w,
      h,
      90,
      1.0,
      3.0,
    );
    const at = (x: number, y: number) => result[y * w + x];

    // Interior (2,2) — the only cell with no empty neighbour within the fixture.
    expect(at(2, 2)).toEqual(DEFAULT_NORMAL_VALUE);

    // Left edge points -x; right edge +x; top -y; bottom +y.
    const left = at(0, 2) as Normal;
    const right = at(4, 2) as Normal;
    const top = at(2, 0) as Normal;
    const bottom = at(2, 4) as Normal;
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(top.y).toBeLessThan(0);
    expect(bottom.y).toBeGreaterThan(0);
    // Edge midpoints have no component along the edge itself.
    // `Math.abs` on purpose: `normalizedToNormal` rounds -0.0 to a NEGATIVE
    // zero, and `toBe(0)` uses Object.is, which distinguishes 0 from -0. That
    // signed zero is real observed output, so it is normalised rather than
    // asserted away.
    expect(Math.abs(left.y)).toBe(0);
    expect(Math.abs(right.y)).toBe(0);
    expect(Math.abs(top.x)).toBe(0);
    expect(Math.abs(bottom.x)).toBe(0);
  });

  it("is left/right and top/bottom mirror-symmetric on a symmetric fixture", () => {
    const w = 5;
    const h = 5;
    const result = computeEdgeInterpolatedNormals(
      layerOf(w, h, () => true),
      w,
      h,
      90,
      1.0,
      3.0,
    ) as Normal[];
    // `+ 0` collapses -0 to 0; see the note above.
    const at = (x: number, y: number) => {
      const n = result[y * w + x];
      return { x: n.x + 0, y: n.y + 0, z: n.z + 0 };
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = at(x, y);
        expect(at(w - 1 - x, y)).toEqual({ x: -a.x + 0, y: a.y, z: a.z });
        expect(at(x, h - 1 - y)).toEqual({ x: a.x, y: -a.y + 0, z: a.z });
      }
    }
  });

  it("is deterministic across repeated runs on the same input", () => {
    const layer = layerOf(7, 7, (x, y) => (x + y) % 3 !== 0);
    const a = computeEdgeInterpolatedNormals(layer, 7, 7, 60, 0.8, 4.0);
    const b = computeEdgeInterpolatedNormals(layer, 7, 7, 60, 0.8, 4.0);
    const c = computeEdgeInterpolatedNormals(layer, 7, 7, 60, 0.8, 4.0);
    const h = hashNormals(a, 7, 7);
    expect(hashNormals(b, 7, 7)).toBe(h);
    expect(hashNormals(c, 7, 7)).toBe(h);
  });

  it("does not mutate the input layer", () => {
    const layer = layerOf(4, 4, () => true);
    const before = JSON.stringify(layer);
    computeEdgeInterpolatedNormals(layer, 4, 4, 90, 1.0, 3.0);
    expect(JSON.stringify(layer)).toBe(before);
  });

  // ── HASH TRIPWIRES ─────────────────────────────────────────────────────
  //
  // Golden values recorded from a real run. A refactor that produces the same
  // pixels produces the same hash; anything else fails loudly.

  it("hash tripwire — solid 5×5 square at 90°", () => {
    const result = computeEdgeInterpolatedNormals(
      layerOf(5, 5, () => true),
      5,
      5,
      90,
      1.0,
      3.0,
    );
    expect(hashNormals(result, 5, 5)).toBe("5x5:5e7acd97");
  });

  it("hash tripwire — L-shape at 45°, smoothing 0.5, radius 2", () => {
    const layer = layerOf(6, 6, (x, y) => x < 3 || y >= 3);
    const result = computeEdgeInterpolatedNormals(layer, 6, 6, 45, 0.5, 2.0);
    expect(hashNormals(result, 6, 6)).toBe("6x6:6aede5a8");
  });

  it("hash tripwire — a hollow ring at 90°", () => {
    const layer = layerOf(
      7,
      7,
      (x, y) => !(x >= 2 && x <= 4 && y >= 2 && y <= 4),
    );
    const result = computeEdgeInterpolatedNormals(layer, 7, 7, 90, 1.0, 3.0);
    expect(hashNormals(result, 7, 7)).toBe("7x7:f74038cd");
  });

  it("smoothing and radius both change the result", () => {
    const layer = layerOf(6, 6, (x, y) => x < 4 && y < 4);
    const base = hashNormals(
      computeEdgeInterpolatedNormals(layer, 6, 6, 90, 1.0, 3.0),
      6,
      6,
    );
    const otherSmoothing = hashNormals(
      computeEdgeInterpolatedNormals(layer, 6, 6, 90, 0.2, 3.0),
      6,
      6,
    );
    const otherRadius = hashNormals(
      computeEdgeInterpolatedNormals(layer, 6, 6, 90, 1.0, 8.0),
      6,
      6,
    );
    expect(otherSmoothing).not.toBe(base);
    expect(otherRadius).not.toBe(base);
  });

  it("clamps the start angle at ±89.5° (±90 and ±180 collapse onto it)", () => {
    const layer = layerOf(5, 5, () => true);
    const at90 = hashNormals(
      computeEdgeInterpolatedNormals(layer, 5, 5, 90, 1.0, 3.0),
      5,
      5,
    );
    const at180 = hashNormals(
      computeEdgeInterpolatedNormals(layer, 5, 5, 180, 1.0, 3.0),
      5,
      5,
    );
    // 89.5 is the clamp ceiling (edgeInterpolate.ts:78-79), so both saturate.
    expect(at180).toBe(at90);
  });

  it("a negative start angle points normals INWARD (mirror of the positive case)", () => {
    const w = 5;
    const result = computeEdgeInterpolatedNormals(
      layerOf(w, 5, () => true),
      w,
      5,
      -90,
      1.0,
      3.0,
    ) as Normal[];
    const left = result[2 * w + 0];
    const right = result[2 * w + 4];
    // Inverted relative to the +90 case asserted above.
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(0);
  });
});
