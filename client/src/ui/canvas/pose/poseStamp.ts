/**
 * Pose tool — turning the engine's raw buffers into stampable cells
 * (MASTER D8).
 *
 * `buildStampCells` is the whole of the double-click stamp's arithmetic:
 * RGBA colour in, RGBA normal in, depth in, `PoseStampCell[]` out. It is pure
 * buffer maths with no GL, no three and no DOM, so unlike the renderer it is
 * fully unit-testable in the node lane (MASTER risk register).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE NORMAL CONVENTION — Y IS FLIPPED, AND THAT IS NOT A BUG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * three's `MeshNormalMaterial` writes a **Y-UP** view-space normal: green
 * increases as the surface tilts toward the top of the screen. That is the
 * OpenGL texture convention.
 *
 * **This project uses Y-DOWN.** Measured 2026-09-02, in three independent
 * places that all agree:
 *
 *  1. `ui/components/LightingStudioPanel/NormalPicker.tsx:227-228` maps the
 *     pointer straight through — `y = (clientY - rect.top) …` feeds
 *     `spherePosToNormal(x, y)` with NO sign flip. Dragging the handle DOWN
 *     the sphere produces a POSITIVE `normal.y`.
 *  2. `utils/lightingRenderer.ts:299` ray-marches the shadow with
 *     `py += stepY`, where `py` is a raster ROW index (top-left origin,
 *     increasing downward) and `stepY` comes from `normal.y / 127`. The two
 *     share one axis, so `normal.y` is in row space.
 *  3. `utils/normalCompute.ts:flipGridVertical` negates `normal.y` when the
 *     grid is mirrored top-to-bottom — which is only correct if `y` is the
 *     screen-vertical axis.
 *
 * So the decode below negates Y. **Getting this wrong ships sprites lit from
 * the wrong vertical direction** — a failure that looks entirely plausible in
 * a screenshot and is therefore easy to miss, which is why it is spelled out
 * here and pinned by a test.
 *
 * X and Z need no flip: the render target's X already runs left-to-right the
 * same way the grid's columns do (the engine's row flip fixes only the
 * vertical readback origin, not the horizontal one), and Z is
 * toward-the-viewer in both conventions.
 *
 * ## The byte encoding (`types/domain.ts:11-15`)
 *
 * `Normal.x` / `.y` are SIGNED bytes scaled by **127**; `.z` is an UNSIGNED
 * byte scaled by **255** and is always positive (toward the viewer). This
 * matches `utils/edgeInterpolate.ts:471-488` (`normalizedToNormal`) exactly —
 * the same scale factors, the same clamps — so a pose-stamped normal is
 * indistinguishable in shape from an edge-interpolated one.
 *
 * ## Height (`types/domain.ts:21`)
 *
 * `height` is `0` for "no height data" and **1–255** for real values.
 * `0` is a SENTINEL, not a floor: `utils/normalCompute.ts:269` raises any
 * non-zero computed height to at least 1 for exactly this reason, and this
 * module does the same. Nearer means taller, matching how the lighting
 * renderer casts shadows off the height field.
 *
 * ## Purity
 *
 * No store, no MobX, no React, no API, no `services/`, no three (MASTER D15).
 */
import type {
  PoseColor,
  PoseNormal,
  PoseStampCell,
} from "@/ui/canvas/pose/poseTypes";

/** The default alpha cutoff: a texel is stamped iff `alpha >= 128` (D8). */
export const DEFAULT_ALPHA_THRESHOLD = 128;

/** `Normal.x` / `.y` are signed bytes scaled by this (`domain.ts:12-13`). */
export const NORMAL_XY_SCALE = 127;

/** `Normal.z` is an unsigned byte scaled by this (`domain.ts:14`). */
export const NORMAL_Z_SCALE = 255;

/**
 * Below this decoded length, a normal texel is treated as "no data".
 *
 * One byte step is `2/255 ≈ 0.00784`, so a texel that is pure rounding dust
 * decodes to a length around `0.0068` (the `(128,128,128)` case). `0.02` sits
 * comfortably above that and far below any real normal, which is unit length
 * before quantisation.
 */
export const NORMAL_EPSILON = 0.02;

/** The project's height range, `1..255`; `0` means "no height data". */
export const HEIGHT_MIN = 1;
export const HEIGHT_MAX = 255;

/** The near/far depth window a stamp's heights are normalised across. */
export interface PoseHeightRange {
  /** The depth value of the CLOSEST surface. Maps to the TALLEST height. */
  near: number;
  /** The depth value of the FURTHEST surface. Maps to the SHORTEST height. */
  far: number;
}

/** Arguments to {@link buildStampCells}. */
export interface BuildStampCellsParams {
  /** Lit RGBA, top-left origin, `width * height * 4` bytes. */
  color: Uint8Array;
  /**
   * RGBA from the `MeshNormalMaterial` pass, same layout. A buffer of the
   * wrong length is treated as absent and every cell gets the
   * straight-at-the-viewer default rather than garbage.
   */
  normal: Uint8Array;
  /**
   * Linearised depth, one value per texel, top-left origin — or `null`.
   *
   * `null` is the **documented fallback** for hardware where depth readback is
   * unavailable (MASTER risk register): every cell's height becomes `0`, the
   * project's "no height data" sentinel, and colour + normal still stamp. It
   * is a supported path, not an error.
   *
   * A `Uint8Array` is interpreted in the same units as `heightRange`, so a
   * caller reading back a depth texture as bytes should pass a range in
   * `0..255`.
   */
  depth: Float32Array | Uint8Array | null;
  width: number;
  height: number;
  /** Alpha cutoff, default {@link DEFAULT_ALPHA_THRESHOLD}. */
  alphaThreshold?: number;
  heightRange: PoseHeightRange;
  /** Added to every cell's `x` — the model's pan offset in cells. */
  offsetX?: number;
  /** Added to every cell's `y`. */
  offsetY?: number;
}

/**
 * Decode one `MeshNormalMaterial` texel into the project's `Normal` byte
 * encoding.
 *
 * `n = rgb / 255 * 2 - 1` (D8), then **Y is negated** for the Y-down
 * convention (see the header), then the vector is renormalised — the byte
 * round-trip drifts it off the unit sphere by up to ~0.4% and the lighting
 * renderer divides by 127/255 without renormalising, so the drift would show
 * up as a subtly wrong `NdotL`.
 *
 * `z` is clamped to `>= 0` before scaling: the project's `Normal.z` is
 * unsigned and "always positive" (`domain.ts:14`). A back-facing texel cannot
 * appear in the stamp anyway (it is occluded), but a silhouette texel can
 * decode to a hair below zero, and `Math.round(-0.001 * 255)` is `-0`, which
 * serialises differently from `0`.
 *
 * A degenerate decode falls back to `{0, 0, 255}` — straight at the viewer,
 * the same default `types/constants.ts:7` uses.
 *
 * ⚠️ "Degenerate" is a **near**-zero test, not `length === 0`. The obvious
 * candidate for an untouched texel is `(128,128,128)`, and `128/255 * 2 - 1`
 * is `0.00392…`, not `0` — an exact-zero guard would never fire, and the texel
 * would amplify that rounding dust into a full-length normal pointing in an
 * arbitrary direction (measured: `{73, -73, 147}`). {@link NORMAL_EPSILON} is
 * set just above the half-byte quantisation step so a texel that is only
 * rounding noise is treated as no data.
 *
 * ⚠️ Every component is normalised through {@link zeroOut} so a `-0` can never
 * escape. `Math.round(-0.0001 * 127)` is `-0`, which is `!== 0` under
 * `Object.is`, serialises as `-0` in JSON, and would make two identical
 * normals compare unequal in a snapshot or a dedupe.
 */
export function decodeNormalTexel(r: number, g: number, b: number): PoseNormal {
  const nx = (r / 255) * 2 - 1;
  // ⚠️ Negated: three is Y-up, this project is Y-down. See the header.
  const ny = -((g / 255) * 2 - 1);
  const nz = (b / 255) * 2 - 1;

  const length = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(length) || length <= NORMAL_EPSILON) {
    return { x: 0, y: 0, z: NORMAL_Z_SCALE };
  }

  const ux = nx / length;
  const uy = ny / length;
  const uz = nz / length;

  return {
    x: zeroOut(Math.round(clamp(ux, -1, 1) * NORMAL_XY_SCALE)),
    y: zeroOut(Math.round(clamp(uy, -1, 1) * NORMAL_XY_SCALE)),
    z: zeroOut(Math.round(clamp(uz, 0, 1) * NORMAL_Z_SCALE)),
  };
}

/**
 * Map a linearised depth onto the project's `1..255` height scale.
 *
 * **Nearer is taller**: `range.near` maps to {@link HEIGHT_MAX} and
 * `range.far` to {@link HEIGHT_MIN}. That is the direction the lighting
 * renderer expects — it ray-marches the height field looking for occluders, so
 * the surface closest to the camera has to be the one that casts.
 *
 * The result never returns `0`, because `0` is the "no height data" sentinel
 * (`domain.ts:21`) and a legitimately-low surface must not be mistaken for a
 * pixel that was never given a height. This mirrors
 * `utils/normalCompute.ts:269`'s floor-at-1 exactly.
 *
 * A degenerate range (`near === far`, or either bound non-finite) has no
 * gradient to map along, so every texel gets {@link HEIGHT_MAX} — a flat slab
 * at full height, which is both harmless and obviously uniform if it happens.
 */
export function depthToHeight(depth: number, range: PoseHeightRange): number {
  const { near, far } = range;
  if (!Number.isFinite(depth)) return HEIGHT_MAX;
  if (!Number.isFinite(near) || !Number.isFinite(far) || near === far) {
    return HEIGHT_MAX;
  }

  // 0 at the near plane, 1 at the far plane.
  const t = clamp((depth - near) / (far - near), 0, 1);
  // Invert: near → HEIGHT_MAX, far → HEIGHT_MIN.
  const value = Math.round(HEIGHT_MAX - t * (HEIGHT_MAX - HEIGHT_MIN));
  return clamp(value, HEIGHT_MIN, HEIGHT_MAX);
}

/**
 * Convert the engine's buffers into the cells the stamp commits (D8/D9).
 *
 * A texel is included **iff `alpha >= alphaThreshold`** — there is no partial
 * alpha in a stamp, a pixel is either drawn or it is not. Included cells carry
 * the lit RGB with `a: 255`.
 *
 * Every cell gets **freshly allocated** `color` and `normal` objects. That is
 * required, not incidental: `PixelStore.setPixelCells` does not deep-copy the
 * caller's objects into its history patch (task 05's note), so a shared object
 * mutated afterwards would corrupt an already-recorded undo entry.
 *
 * Returns an empty array — never `null`, never a throw — for an all
 * transparent buffer, a zero-area canvas, or a mismatched colour buffer. A
 * stamp of nothing is a no-op, and the caller has nothing useful to do with an
 * exception mid-gesture.
 */
export function buildStampCells(
  params: BuildStampCellsParams,
): PoseStampCell[] {
  const {
    color,
    normal,
    depth,
    width,
    height,
    heightRange,
    offsetX = 0,
    offsetY = 0,
  } = params;

  if (!Number.isFinite(width) || !Number.isFinite(height)) return [];
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0) return [];

  const texels = w * h;
  if (color.length < texels * 4) return [];

  const threshold = Number.isFinite(params.alphaThreshold)
    ? (params.alphaThreshold as number)
    : DEFAULT_ALPHA_THRESHOLD;

  // A short or absent normal buffer is tolerated rather than fatal: colour is
  // the channel the user actually sees, and defaulting the normal to
  // straight-at-the-viewer degrades far better than refusing the stamp.
  const hasNormal = normal.length >= texels * 4;
  const hasDepth = depth !== null && depth.length >= texels;

  const cells: PoseStampCell[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = i * 4;

      const a = color[c + 3];
      if (a < threshold) continue;

      const cellColor: PoseColor = {
        r: color[c],
        g: color[c + 1],
        b: color[c + 2],
        // Alpha-thresholded, so an included texel is fully opaque (D8).
        a: 255,
      };

      const cellNormal: PoseNormal = hasNormal
        ? decodeNormalTexel(normal[c], normal[c + 1], normal[c + 2])
        : { x: 0, y: 0, z: NORMAL_Z_SCALE };

      // `depth: null` → height 0 for every cell. The documented fallback for
      // hardware without depth readback (MASTER risk register) — a clean path,
      // not a crash.
      const cellHeight = hasDepth
        ? depthToHeight((depth as Float32Array | Uint8Array)[i], heightRange)
        : 0;

      cells.push({
        x: x + offsetX,
        y: y + offsetY,
        color: cellColor,
        normal: cellNormal,
        height: cellHeight,
      });
    }
  }

  return cells;
}

/** `value` clamped to `[lo, hi]`; a non-finite value falls back to `lo`. */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * `-0` → `0`, everything else unchanged.
 *
 * `Math.round` preserves the sign of zero, so a component that rounds down
 * from a hair below zero comes out as `-0`. It compares `===` to `0` but not
 * under `Object.is`, and `JSON.stringify` writes it as `-0` — enough to make
 * two visually identical normals differ in a snapshot or fail a dedupe.
 */
function zeroOut(value: number): number {
  return value === 0 ? 0 : value;
}
