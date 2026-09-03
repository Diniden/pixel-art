/**
 * Tests for the stamp mapping — RGBA buffers in, `PoseStampCell[]` out
 * (MASTER D8).
 *
 * Pure buffer arithmetic, so all of it runs in the **node** lane. The two
 * highest-value cases here are the ones whose failure mode is *plausible
 * output* rather than a crash:
 *
 *  - the **normal Y flip**. three writes Y-up, this project reads Y-down. Get
 *    it wrong and every stamped sprite is lit from the wrong vertical
 *    direction, which looks fine in isolation and only reveals itself next to
 *    hand-authored art.
 *  - the **`depth: null` fallback**. It is a supported path for hardware
 *    without depth readback (MASTER risk register), not an error, and it must
 *    still stamp colour and normal.
 */
import { describe, expect, it } from "vitest";
import {
  buildStampCells,
  decodeNormalTexel,
  DEFAULT_ALPHA_THRESHOLD,
  depthToHeight,
  HEIGHT_MAX,
  HEIGHT_MIN,
  NORMAL_XY_SCALE,
  NORMAL_Z_SCALE,
  type BuildStampCellsParams,
} from "@/ui/canvas/pose/poseStamp";

const RANGE = { near: 0, far: 1 };

/** An RGBA buffer of `width*height` texels, all `fill`. */
function solid(
  width: number,
  height: number,
  fill: [number, number, number, number],
): Uint8Array {
  // Degenerate dimensions are clamped HERE so the helper never throws before
  // the code under test runs — the guard being exercised is
  // `buildStampCells`', not `new Uint8Array`'s.
  const texels = Number.isFinite(width * height)
    ? Math.max(0, Math.floor(width * height))
    : 0;
  const buf = new Uint8Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    buf[i * 4] = fill[0];
    buf[i * 4 + 1] = fill[1];
    buf[i * 4 + 2] = fill[2];
    buf[i * 4 + 3] = fill[3];
  }
  return buf;
}

/** The `MeshNormalMaterial` encoding of a flat +Z (straight at viewer) normal. */
const FLAT_Z_TEXEL: [number, number, number, number] = [128, 128, 255, 255];

function build(overrides: Partial<BuildStampCellsParams> = {}) {
  const width = overrides.width ?? 2;
  const height = overrides.height ?? 2;
  return buildStampCells({
    color: solid(width, height, [10, 20, 30, 255]),
    normal: solid(width, height, FLAT_Z_TEXEL),
    depth: null,
    width,
    height,
    heightRange: RANGE,
    ...overrides,
  });
}

/* ══ decodeNormalTexel — the Y-flip convention ═══════════════════════════ */

describe("decodeNormalTexel", () => {
  it("decodes a flat +Z texel to the project's 'facing the viewer' normal", () => {
    // `types/constants.ts:7` DEFAULT_NORMAL is exactly this.
    expect(decodeNormalTexel(128, 128, 255)).toEqual({ x: 0, y: 0, z: 255 });
  });

  it("decodes a hard +X texel to a positive x, matching NormalPicker's axis", () => {
    const n = decodeNormalTexel(255, 128, 128);
    expect(n.x).toBeGreaterThan(120);
    expect(n.y).toBe(0);
  });

  it("NEGATES Y — three is Y-up, this project is Y-down", () => {
    // ⚠️ THE test of this module. `g = 255` is three's "surface tilts toward
    // the TOP of the screen". `NormalPicker.tsx:227` maps a pointer DRAG DOWN
    // to a POSITIVE normal.y and `lightingRenderer.ts:299` marches `py` (a
    // raster row index, increasing downward) by `normal.y / 127` — so this
    // project's +y is screen-DOWN and the decode must invert.
    const up = decodeNormalTexel(128, 255, 128);
    expect(up.y).toBeLessThan(0);

    const down = decodeNormalTexel(128, 0, 128);
    expect(down.y).toBeGreaterThan(0);
  });

  it("uses the project's byte scales: 127 for x/y, 255 for z", () => {
    expect(NORMAL_XY_SCALE).toBe(127);
    expect(NORMAL_Z_SCALE).toBe(255);
    // A hard +X normal saturates x at the signed-byte scale, not at 255.
    expect(decodeNormalTexel(255, 128, 128).x).toBe(127);
  });

  it("renormalises, so an off-unit texel still yields a unit-length normal", () => {
    // (255, 255, 255) decodes to (1, -1, 1), length sqrt(3).
    const n = decodeNormalTexel(255, 255, 255);
    const length = Math.hypot(n.x / 127, n.y / 127, n.z / 255);
    expect(length).toBeCloseTo(1, 2);
  });

  it("never returns a negative z — the project's z is unsigned", () => {
    for (const b of [0, 1, 64, 127, 128, 200, 255]) {
      expect(decodeNormalTexel(200, 40, b).z).toBeGreaterThanOrEqual(0);
      // And never a signed -0, which serialises differently from 0.
      expect(Object.is(decodeNormalTexel(200, 40, b).z, -0)).toBe(false);
    }
  });

  it("falls back to facing-the-viewer for a NEAR-zero decode", () => {
    // ⚠️ `(128,128,128)` is the obvious "untouched texel", and it does NOT
    // decode to exactly (0,0,0): `128/255*2-1` is 0.00392, not 0. Measured,
    // an exact-zero guard leaves that rounding dust to be renormalised into
    // `{73,-73,147}` — a confident-looking normal pointing nowhere real.
    expect(decodeNormalTexel(128, 128, 128)).toEqual({ x: 0, y: 0, z: 255 });
  });

  it("falls back for a literally zero decode too", () => {
    // (127.5, 127.5, 127.5) is not expressible as bytes, so the closest real
    // all-equal texels are 127 and 128; both must be treated as no data.
    expect(decodeNormalTexel(127, 127, 127)).toEqual({ x: 0, y: 0, z: 255 });
  });

  it("still decodes a genuine normal that happens to be short on one axis", () => {
    // The epsilon must not swallow real data: a normal one byte off flat is
    // still a normal.
    const n = decodeNormalTexel(160, 128, 255);
    expect(n.x).toBeGreaterThan(0);
    expect(n.z).toBeGreaterThan(200);
  });

  it("never returns a signed -0 on any component", () => {
    for (const [r, g, b] of [
      [128, 128, 255],
      [255, 128, 128],
      [128, 127, 255],
      [127, 128, 255],
      [0, 0, 0],
    ]) {
      const n = decodeNormalTexel(r, g, b);
      expect(Object.is(n.x, -0), `x for ${r},${g},${b}`).toBe(false);
      expect(Object.is(n.y, -0), `y for ${r},${g},${b}`).toBe(false);
      expect(Object.is(n.z, -0), `z for ${r},${g},${b}`).toBe(false);
    }
  });

  it("round-trips the six axis directions to the expected signs", () => {
    expect(decodeNormalTexel(255, 128, 128).x).toBeGreaterThan(0); // +X
    expect(decodeNormalTexel(0, 128, 128).x).toBeLessThan(0); // -X
    expect(decodeNormalTexel(128, 0, 128).y).toBeGreaterThan(0); // screen-down
    expect(decodeNormalTexel(128, 255, 128).y).toBeLessThan(0); // screen-up
    expect(decodeNormalTexel(128, 128, 255).z).toBe(255); // toward viewer
  });
});

/* ══ depthToHeight ═══════════════════════════════════════════════════════ */

describe("depthToHeight", () => {
  it("maps the NEAR bound to the tallest height", () => {
    expect(depthToHeight(0, { near: 0, far: 1 })).toBe(HEIGHT_MAX);
    expect(HEIGHT_MAX).toBe(255);
  });

  it("maps the FAR bound to the shortest height, never to 0", () => {
    expect(depthToHeight(1, { near: 0, far: 1 })).toBe(HEIGHT_MIN);
    expect(HEIGHT_MIN).toBe(1);
    // 0 is the "no height data" SENTINEL (`domain.ts:21`), not a floor —
    // exactly the rule `normalCompute.ts:269` follows.
    expect(depthToHeight(1, { near: 0, far: 1 })).not.toBe(0);
  });

  it("maps the midpoint to the middle of the scale", () => {
    expect(depthToHeight(0.5, { near: 0, far: 1 })).toBe(128);
  });

  it("makes NEARER mean TALLER, monotonically", () => {
    const heights = [0, 0.25, 0.5, 0.75, 1].map((d) => depthToHeight(d, RANGE));
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeLessThan(heights[i - 1]);
    }
  });

  it("clamps depths outside the range instead of extrapolating", () => {
    expect(depthToHeight(-5, RANGE)).toBe(HEIGHT_MAX);
    expect(depthToHeight(99, RANGE)).toBe(HEIGHT_MIN);
  });

  it("handles a non-zero-based range", () => {
    expect(depthToHeight(4, { near: 4, far: 9 })).toBe(HEIGHT_MAX);
    expect(depthToHeight(9, { near: 4, far: 9 })).toBe(HEIGHT_MIN);
    expect(depthToHeight(6.5, { near: 4, far: 9 })).toBe(128);
  });

  it("handles an INVERTED range (far numerically below near)", () => {
    // A caller reading non-linear device depth can legitimately hand these
    // over reversed; the mapping is defined by the named bounds, not by order.
    expect(depthToHeight(1, { near: 1, far: 0 })).toBe(HEIGHT_MAX);
    expect(depthToHeight(0, { near: 1, far: 0 })).toBe(HEIGHT_MIN);
  });

  it("returns a flat full height for a degenerate range rather than NaN", () => {
    expect(depthToHeight(0.5, { near: 1, far: 1 })).toBe(HEIGHT_MAX);
    expect(depthToHeight(0.5, { near: Number.NaN, far: 1 })).toBe(HEIGHT_MAX);
  });

  it("never returns a value outside 1..255", () => {
    for (const d of [-1e6, -1, 0, 0.3, 1, 2, 1e6, Number.NaN, Infinity]) {
      const h = depthToHeight(d, RANGE);
      expect(h).toBeGreaterThanOrEqual(HEIGHT_MIN);
      expect(h).toBeLessThanOrEqual(HEIGHT_MAX);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

/* ══ buildStampCells — the alpha threshold ═══════════════════════════════ */

describe("buildStampCells alpha threshold", () => {
  it("defaults the threshold to 128 (D8)", () => {
    expect(DEFAULT_ALPHA_THRESHOLD).toBe(128);
  });

  it("EXCLUDES a texel at alpha 127 and INCLUDES one at 128", () => {
    // The boundary is the whole point: D8 says `alpha >= threshold`.
    expect(build({ color: solid(1, 1, [9, 9, 9, 127]), width: 1, height: 1 })).toHaveLength(0);
    expect(build({ color: solid(1, 1, [9, 9, 9, 128]), width: 1, height: 1 })).toHaveLength(1);
  });

  it("yields an EMPTY array for an all-transparent buffer", () => {
    expect(build({ color: solid(4, 4, [255, 0, 0, 0]), width: 4, height: 4 })).toEqual([]);
  });

  it("honours a custom threshold", () => {
    const color = solid(1, 1, [9, 9, 9, 40]);
    expect(build({ color, width: 1, height: 1, alphaThreshold: 32 })).toHaveLength(1);
    expect(build({ color, width: 1, height: 1, alphaThreshold: 41 })).toHaveLength(0);
  });

  it("includes everything at threshold 0, including fully transparent texels", () => {
    const cells = build({
      color: solid(3, 3, [1, 2, 3, 0]),
      width: 3,
      height: 3,
      alphaThreshold: 0,
    });
    expect(cells).toHaveLength(9);
  });

  it("falls back to the default for a non-finite threshold", () => {
    const color = solid(1, 1, [9, 9, 9, 200]);
    expect(
      build({ color, width: 1, height: 1, alphaThreshold: Number.NaN }),
    ).toHaveLength(1);
  });

  it("keeps only the texels that pass, at the right coordinates", () => {
    // A 3x1 strip: opaque, transparent, opaque.
    const color = new Uint8Array([
      1, 1, 1, 255,
      2, 2, 2, 0,
      3, 3, 3, 255,
    ]);
    const cells = build({ color, normal: solid(3, 1, FLAT_Z_TEXEL), width: 3, height: 1 });
    expect(cells.map((c) => c.x)).toEqual([0, 2]);
    expect(cells.map((c) => c.color.r)).toEqual([1, 3]);
  });
});

/* ══ buildStampCells — colour ════════════════════════════════════════════ */

describe("buildStampCells colour", () => {
  it("passes the lit RGB through and forces a: 255", () => {
    const cells = build({
      color: solid(1, 1, [12, 34, 56, 200]),
      width: 1,
      height: 1,
    });
    // Alpha-thresholded, so an included texel is fully opaque (D8) — the
    // SOURCE alpha of 200 must not survive into the cell.
    expect(cells[0].color).toEqual({ r: 12, g: 34, b: 56, a: 255 });
  });

  it("walks the buffer in row-major top-left order", () => {
    // R channel encodes the index, so the ordering is readable.
    const color = new Uint8Array(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      color[i * 4] = i;
      color[i * 4 + 3] = 255;
    }
    const cells = build({ color, width: 2, height: 2 });
    expect(cells.map((c) => [c.x, c.y, c.color.r])).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [0, 1, 2],
      [1, 1, 3],
    ]);
  });

  it("gives every cell its OWN color and normal objects", () => {
    // Task 05's note: `setPixelCells` does not deep-copy into its history
    // patch, so a shared object would let one mutation corrupt an undo entry.
    const cells = build({ width: 2, height: 2 });
    expect(cells).toHaveLength(4);
    expect(cells[0].color).not.toBe(cells[1].color);
    expect(cells[0].normal).not.toBe(cells[1].normal);
    cells[0].color.r = 99;
    expect(cells[1].color.r).toBe(10);
  });
});

/* ══ buildStampCells — normal ════════════════════════════════════════════ */

describe("buildStampCells normal", () => {
  it("decodes a flat +Z normal pass to the facing-the-viewer normal", () => {
    const cells = build({ width: 1, height: 1 });
    expect(cells[0].normal).toEqual({ x: 0, y: 0, z: 255 });
  });

  it("applies the Y flip through the full pipeline, not just in the helper", () => {
    const cells = build({
      normal: solid(1, 1, [128, 255, 128, 255]),
      width: 1,
      height: 1,
    });
    expect(cells[0].normal.y).toBeLessThan(0);
  });

  it("defaults to facing-the-viewer when the normal buffer is the wrong size", () => {
    const cells = build({ normal: new Uint8Array(0), width: 2, height: 2 });
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell.normal).toEqual({ x: 0, y: 0, z: 255 });
  });

  it("reads each texel's OWN normal, not the first one", () => {
    const normal = new Uint8Array([
      255, 128, 128, 255, // +X
      0, 128, 128, 255, // -X
    ]);
    const cells = build({
      color: solid(2, 1, [1, 1, 1, 255]),
      normal,
      width: 2,
      height: 1,
    });
    expect(cells[0].normal.x).toBeGreaterThan(0);
    expect(cells[1].normal.x).toBeLessThan(0);
  });
});

/* ══ buildStampCells — height, including the depth:null fallback ═════════ */

describe("buildStampCells height", () => {
  it("gives EVERY cell height 0 when depth is null", () => {
    // ⚠️ The documented fallback for hardware without depth readback (MASTER
    // risk register). A clean, supported path — colour and normal still stamp.
    const cells = build({ depth: null, width: 3, height: 3 });
    expect(cells).toHaveLength(9);
    for (const cell of cells) expect(cell.height).toBe(0);
    // ...and the other two channels survived.
    expect(cells[0].color).toEqual({ r: 10, g: 20, b: 30, a: 255 });
    expect(cells[0].normal).toEqual({ x: 0, y: 0, z: 255 });
  });

  it("maps a Float32Array depth at near, mid and far", () => {
    const depth = new Float32Array([0, 0.5, 1]);
    const cells = build({
      color: solid(3, 1, [1, 1, 1, 255]),
      normal: solid(3, 1, FLAT_Z_TEXEL),
      depth,
      width: 3,
      height: 1,
      heightRange: { near: 0, far: 1 },
    });
    expect(cells.map((c) => c.height)).toEqual([255, 128, 1]);
  });

  it("accepts a Uint8Array depth in the same units as the range", () => {
    const cells = build({
      color: solid(2, 1, [1, 1, 1, 255]),
      normal: solid(2, 1, FLAT_Z_TEXEL),
      depth: new Uint8Array([0, 255]),
      width: 2,
      height: 1,
      heightRange: { near: 0, far: 255 },
    });
    expect(cells.map((c) => c.height)).toEqual([255, 1]);
  });

  it("falls back to height 0 when the depth buffer is too short", () => {
    const cells = build({
      depth: new Float32Array([0]),
      width: 2,
      height: 2,
    });
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell.height).toBe(0);
  });

  it("indexes depth per texel, not per RGBA byte", () => {
    // One value per texel, so cell (1,0) must read depth[1] and cell (0,1)
    // depth[2] — an off-by-four here would read colour bytes as depth.
    const depth = new Float32Array([0, 1, 1, 0]);
    const cells = build({
      depth,
      width: 2,
      height: 2,
      heightRange: { near: 0, far: 1 },
    });
    expect(cells.map((c) => c.height)).toEqual([255, 1, 1, 255]);
  });
});

/* ══ buildStampCells — offsets and degenerate inputs ═════════════════════ */

describe("buildStampCells offsets and guards", () => {
  it("adds the pan offset to every coordinate", () => {
    const cells = build({ width: 2, height: 1, offsetX: 5, offsetY: -3 });
    expect(cells.map((c) => [c.x, c.y])).toEqual([
      [5, -3],
      [6, -3],
    ]);
  });

  it("defaults the offsets to zero", () => {
    expect(build({ width: 1, height: 1 })[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("returns an empty array for a zero-area canvas", () => {
    expect(build({ width: 0, height: 4 })).toEqual([]);
    expect(build({ width: 4, height: 0 })).toEqual([]);
    expect(build({ width: -2, height: 2 })).toEqual([]);
  });

  it("returns an empty array for non-finite dimensions", () => {
    expect(build({ width: Number.NaN, height: 2 })).toEqual([]);
    expect(build({ width: 2, height: Infinity })).toEqual([]);
  });

  it("returns an empty array rather than throwing on a short colour buffer", () => {
    expect(
      buildStampCells({
        color: new Uint8Array(4),
        normal: new Uint8Array(4),
        depth: null,
        width: 4,
        height: 4,
        heightRange: RANGE,
      }),
    ).toEqual([]);
  });

  it("does not mutate the buffers it is handed", () => {
    const color = solid(2, 2, [1, 2, 3, 255]);
    const normal = solid(2, 2, FLAT_Z_TEXEL);
    const depth = new Float32Array([0, 0.3, 0.6, 1]);
    const before = [
      Array.from(color),
      Array.from(normal),
      Array.from(depth),
    ];
    build({ color, normal, depth, width: 2, height: 2 });
    expect(Array.from(color)).toEqual(before[0]);
    expect(Array.from(normal)).toEqual(before[1]);
    expect(Array.from(depth)).toEqual(before[2]);
  });

  it("produces cells matching the PoseStampCell shape exactly", () => {
    const cell = build({ width: 1, height: 1, depth: new Float32Array([0]) })[0];
    expect(Object.keys(cell).sort()).toEqual(["color", "height", "normal", "x", "y"]);
    expect(Object.keys(cell.color).sort()).toEqual(["a", "b", "g", "r"]);
    expect(Object.keys(cell.normal).sort()).toEqual(["x", "y", "z"]);
  });
});
