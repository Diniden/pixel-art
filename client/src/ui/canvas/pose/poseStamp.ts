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
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE OUTLINE IS STAMPED, AND IT WRITES THE COLOUR CHANNEL **ONLY**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan 08's locked decision **F1**, owner-decided 2026-09-03. It **reverses**
 * plan 07's E7 ("the outline is display-only, NOT stamped"), which is why the
 * container's stamp callback no longer carries that essay.
 *
 * The rule, exactly:
 *
 * > An outline pixel gets the Edge **colour**. Its **normal and height are
 * > left exactly as they already were** — not zeroed, not invented, not
 * > defaulted.
 *
 * That is not a cop-out, it is the only honest answer. Every other stamped
 * cell carries colour + normal + height because there is geometry under it. An
 * outline pixel is a 2D dilation of a silhouette: there is no surface beneath
 * it, so there is no normal to encode and no depth to normalise. Writing
 * colour alone says *"this pixel is this colour, and I know nothing about its
 * surface"* — which is true. An outline pixel laid over existing artwork keeps
 * that artwork's lighting data; one laid over empty canvas gets colour with no
 * lighting response, and that is correct rather than a bug.
 *
 * ## ⚠️ Why F1 needs {@link BuildStampCellsParams.readExistingCell}
 *
 * `PixelStore.setPixelCells` is **authoritative on all three channels** — the
 * committed cell is exactly `{color, normal, height}`, whatever was there
 * before — and `PixelCellWrite` has **no "leave this alone" representation**:
 * its `0` sentinels mean *empty* and *no data*, not *unchanged*
 * (`types/domain.ts:18-22`). So "untouched" cannot be expressed by a value;
 * it has to be expressed by **reading the existing cell and passing it back
 * through**. `readExistingCell` is that read. It is supplied by the container,
 * which owns the resolved target grid; this module stays pure and never learns
 * what a store is.
 *
 * When no reader is supplied — or it answers `null` for a coordinate — the
 * outline cell falls back to the "no data" pair (`normal {0,0,255}`,
 * `height 0`), which is what an empty cell already holds. Over empty canvas
 * the two are identical; the reader exists so that over *artwork* the real
 * values survive.
 *
 * ## ⚠️ The outline buffer must be the caller's OWN, applied EXACTLY ONCE
 *
 * `applyOutline` mutates in place and is **not idempotent across calls** — it
 * paints at alpha 255, so a second pass reads its own outline as model and
 * rings it again (width 1 twice == width 2 once). And `PoseEngine.render()`
 * **reuses one readback buffer** across frames, so the overlay and the stamp
 * would fight over it.
 *
 * This module therefore **allocates its own copy** of the colour buffer before
 * outlining it, and applies the pass exactly once per call. The caller's
 * `color` array is never written. Both properties are pinned by tests.
 *
 * ## Purity
 *
 * No store, no MobX, no React, no API, no `services/`, no three (MASTER D15).
 * `readExistingCell` is a plain callback of two numbers; the container closes
 * over the grid, this module never sees it.
 */
import { applyOutline } from "@/ui/canvas/pose/poseOutline";
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
  /**
   * Outline width in whole pixels, `0` (the default) for **off**.
   *
   * At `0` this function is byte-for-byte the pre-F1 function: no copy, no
   * silhouette scan, no outline cells. That is deliberate — the off state must
   * cost one comparison, and must be a provable regression pin.
   */
  outlineWidth?: number;
  /**
   * The Edge colour outline pixels are written in. Required in practice
   * whenever `outlineWidth > 0`; absent, the outline is skipped rather than
   * guessed.
   */
  outlineColor?: PoseColor;
  /**
   * Read the cell already in the destination grid at a **final, offset**
   * coordinate — the same `(x + offsetX, y + offsetY)` the cell will be
   * committed at.
   *
   * ⚠️ **This is how F1 is expressed.** `setPixelCells` overwrites all three
   * channels, so "leave the normal and height alone" can only mean "read them
   * and write them back unchanged". See the module header.
   *
   * Return `null` (or omit the callback) for a coordinate with nothing there;
   * the outline cell then gets the "no data" pair — `normal {0,0,255}`,
   * `height 0` — which is what an empty cell holds anyway.
   *
   * The returned object is **copied**, never retained: this module always
   * allocates fresh `color`/`normal` per cell (see {@link buildStampCells}).
   */
  readExistingCell?: (x: number, y: number) => PoseExistingCell | null;
}

/**
 * The lighting data already at a destination coordinate, as
 * {@link BuildStampCellsParams.readExistingCell} reports it.
 *
 * Structurally a subset of the domain `PixelData`, declared here so `ui/` need
 * not import `types/domain.ts` — the same habit `PoseStampCell` follows. The
 * `0` in `normal` is the domain's "no normal" sentinel and is mapped to the
 * straight-at-the-viewer default on the way out, exactly as an absent normal
 * buffer is.
 */
export interface PoseExistingCell {
  normal: PoseNormal | 0;
  height: number;
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
 * ## The outline (F1)
 *
 * When `outlineWidth > 0` and an `outlineColor` is given, the silhouette is
 * dilated by {@link applyOutline} and the resulting ring is emitted as extra
 * cells **in the same array** — so the whole stamp is still ONE
 * `setPixelCells` call and therefore ONE undo entry.
 *
 * Three properties, all pinned by tests:
 *
 *  - **The caller's `color` buffer is never mutated.** `applyOutline` writes
 *    in place, and the engine reuses its readback array across frames, so this
 *    function outlines a **private copy** — the overlay and the stamp can
 *    never fight over one buffer.
 *  - **Applied exactly once.** `applyOutline` is not idempotent (width 1 twice
 *    == width 2 once), and a fresh copy per call is what guarantees it.
 *  - **Outline cells write COLOUR ONLY.** Their normal and height come from
 *    `readExistingCell`, unchanged. Model cells are entirely unaffected —
 *    the model loop reads the ORIGINAL buffer, so a stamp at width 4 has
 *    byte-identical model cells to the same stamp at width 0.
 *
 * The alpha threshold is shared: the same `threshold` gates the model loop and
 * is passed explicitly to `applyOutline`, so the outline traces exactly the
 * silhouette the stamp commits (MASTER E6).
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
    outlineWidth = 0,
    outlineColor,
    readExistingCell,
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

  appendOutlineCells(cells, {
    color,
    w,
    h,
    threshold,
    offsetX,
    offsetY,
    outlineWidth,
    outlineColor,
    readExistingCell,
  });

  return cells;
}

/** Everything {@link appendOutlineCells} needs, already validated. */
interface OutlinePassParams {
  color: Uint8Array;
  w: number;
  h: number;
  threshold: number;
  offsetX: number;
  offsetY: number;
  outlineWidth: number;
  outlineColor: PoseColor | undefined;
  readExistingCell:
    | ((x: number, y: number) => PoseExistingCell | null)
    | undefined;
}

/**
 * Dilate the silhouette and push the ring onto `cells` as **colour-only**
 * cells (F1). Mutates `cells`; returns nothing.
 *
 * ⚠️ **`work` is a private copy.** `applyOutline` writes in place and the
 * engine reuses its readback buffer, so outlining `color` directly would both
 * corrupt the caller's array and let a later frame double-outline it. The copy
 * is allocated here, used once, and dropped — it never escapes.
 *
 * A texel is an outline pixel iff it was **below** the threshold in the
 * ORIGINAL buffer and is **at or above** it after the pass. That difference is
 * the ring exactly: `applyOutline` never touches a model pixel (it is the
 * function's loudest guarantee), so no model cell can be re-emitted here and
 * the "the outline never overwrites a model pixel" property holds by
 * construction rather than by a second alpha test.
 *
 * The off states are all early returns, in cost order: width `<= 0` (the
 * documented OFF state), a missing colour, then a non-finite width. At width 0
 * this costs one comparison and allocates nothing.
 */
function appendOutlineCells(
  cells: PoseStampCell[],
  params: OutlinePassParams,
): void {
  const {
    color,
    w,
    h,
    threshold,
    offsetX,
    offsetY,
    outlineWidth,
    outlineColor,
    readExistingCell,
  } = params;

  if (!Number.isFinite(outlineWidth) || outlineWidth <= 0) return;
  // No Edge colour is "skip", not "guess one". The container always supplies
  // it alongside a non-zero width; a caller that forgets gets the off state.
  if (!outlineColor) return;

  const texels = w * h;

  // ⚠️ THE COPY. See this function's header — do not outline `color` itself.
  const work = Uint8Array.from(color.subarray(0, texels * 4));
  applyOutline(work, w, h, outlineWidth, outlineColor, {
    // Explicit, so the coupling to the model loop's own cutoff (MASTER E6) is
    // visible: both silhouettes must be the same silhouette.
    alphaThreshold: threshold,
  });

  const r = clampByte(outlineColor.r);
  const g = clampByte(outlineColor.g);
  const b = clampByte(outlineColor.b);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (y * w + x) * 4;
      // Was empty, is now painted → this is a ring texel and nothing else can
      // be. Model texels are untouched by `applyOutline`, so they fail the
      // first half of this test.
      if (color[c + 3] >= threshold) continue;
      if (work[c + 3] < threshold) continue;

      const cx = x + offsetX;
      const cy = y + offsetY;

      // ⚠️ F1: the normal and the height are whatever was ALREADY there.
      // Read at the FINAL coordinate — the grid is indexed in committed
      // space, not in render-target space.
      const existing = readExistingCell?.(cx, cy) ?? null;
      // `0` is the domain's "no normal" sentinel, mapped to the
      // straight-at-the-viewer default exactly as an absent normal buffer is.
      const existingNormal =
        existing && existing.normal !== 0 ? existing.normal : null;
      // Fresh objects per cell, always: `setPixelCells` keeps the caller's
      // objects in its history patch without deep-copying them.
      const cellNormal: PoseNormal = existingNormal
        ? { x: existingNormal.x, y: existingNormal.y, z: existingNormal.z }
        : { x: 0, y: 0, z: NORMAL_Z_SCALE };
      const cellHeight = existing ? existing.height : 0;

      cells.push({
        x: cx,
        y: cy,
        // Alpha 255, matching `applyOutline`'s own rule and D8's habit: an
        // outline is opaque by construction, whatever `outlineColor.a` says.
        color: { r, g, b, a: 255 },
        normal: cellNormal,
        height: cellHeight,
      });
    }
  }
}

/**
 * A colour component forced into `0..255`.
 *
 * `PoseColor` carries no runtime validation, so a caller can hand over `-5`,
 * `300` or `NaN`. `applyOutline` clamps identically before writing its bytes
 * (`poseOutline.ts`'s own `clampByte`), and the two MUST agree — the cells
 * emitted here have to carry the same colour the ring in `work` was painted
 * with, or the stamp and the overlay would disagree on a mis-typed colour.
 */
function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
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
