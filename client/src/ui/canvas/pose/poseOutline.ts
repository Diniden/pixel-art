/**
 * Pose tool — the silhouette outline post-pass (MASTER E3/E4/E5/E6).
 *
 * `applyOutline` is the whole of the Edge-colour outline: an RGBA buffer in,
 * the same buffer with an N-pixel border drawn around the model's silhouette
 * out. It is pure array maths with no GL, no three, no canvas and no DOM, so
 * unlike the renderer it is fully unit-testable in the node lane (jsdom has no
 * WebGL context — the same split that made `poseCamera`/`poseStamp` testable).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS BUFFER IS MUTATED IN PLACE. THE CALLER'S ARRAY IS MODIFIED.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `applyOutline` writes into `rgba` and returns that **same reference** — it
 * does not allocate a copy. The decision (the task spec requires it be made
 * loudly, either way):
 *
 *  - This runs **once per rendered frame** over `cellWidth * cellHeight * 4`
 *    bytes. A copy would allocate a second buffer every frame and hand the GC
 *    a steady stream of short-lived typed arrays on a path that is already
 *    doing a GPU readback.
 *  - The caller (task 06) owns a **freshly-read-back scratch buffer** whose
 *    only consumer is the overlay `ImageData` write immediately afterwards.
 *    Nobody else holds a reference to alias, so in-place has no aliasing
 *    hazard here.
 *  - A caller that genuinely needs the original keeps it with one
 *    `rgba.slice()` at the call site — cheaper to opt in than to pay for
 *    always.
 *
 * ⚠️ The obvious in-place bug is the outline **growing into itself**: write an
 * outline pixel, then a later pixel *in the same pass* sees that opaque pixel
 * as "model" and outlines it in turn, so a width-1 request creeps outward a
 * row at a time and the result depends on scan order. This module cannot hit
 * that, because the silhouette is captured into a separate
 * {@link buildSilhouette} bitmask read from the **ORIGINAL** alpha before a
 * single byte is written, and every distance test is made against that
 * snapshot. The RGBA buffer is only ever written to, never read back as
 * geometry. So one call is exact, order-independent and produces a ring of
 * exactly `outlineWidth` — pinned at widths 1–4.
 *
 * ⚠️ **`applyOutline` is NOT idempotent ACROSS calls, and must be applied at
 * most once per rendered buffer.** The snapshot protects a single pass, not a
 * buffer that has already been outlined: the pixels the first call painted are
 * opaque (alpha 255) by the time a second call reads the alpha, so the second
 * call sees them as model and rings *them*. Measured: applying width 1 twice
 * gives exactly the same result as applying width 2 once. That is a correct
 * consequence of "model means alpha >= 128" — the function has no way to tell
 * a painted outline pixel from a rendered one, and inventing a marker channel
 * to do so would be worse than the rule it protects.
 *
 * For the caller (task 06) this is not a constraint in practice: each frame
 * reads back a fresh buffer from the render target and outlines it once. It
 * matters only if someone later caches an outlined buffer and re-runs the pass
 * over it, which is why it is stated here and pinned by a test rather than
 * left to be discovered as "the slider is one notch too thick".
 *
 * ## The kernel is CHEBYSHEV (square), not Euclidean (MASTER E5)
 *
 * A pixel is outlined iff it is transparent and within `outlineWidth` in
 * **Chebyshev distance** — `max(|dx|, |dy|)` — of an opaque pixel. So the
 * outline of a single pixel at width N is an exact `(2N+1) x (2N+1)` square
 * ring, and a corner of the model gets a square corner rather than a rounded
 * one.
 *
 * Why square: the owner draws **pixel art**, and this runs at 1:1 with the
 * artwork (D5 fixes the render target at exactly `cellWidth x cellHeight`, one
 * texel per art pixel). At the widths this feature offers — 1 to 4 px (E4) — a
 * Euclidean kernel does not read as "round", because there are not enough
 * pixels for a curve; it reads as a square with **notched corners**, which is
 * the classic look of an anti-aliased outline that has been posterised. The
 * Chebyshev ring is what a human drawing an outline by hand in a pixel editor
 * produces, and it is what the surrounding hard-edged, alpha-thresholded,
 * unfiltered pipeline is already committed to. Chebyshev is also separable and
 * exact in integers, so there is no rounding rule to argue about at the
 * boundary (a Euclidean kernel at width 2 has to decide whether `dx=2, dy=1`
 * at distance `2.236` is in or out, and the answer changes the silhouette).
 *
 * The kernel is pinned by tests at widths 1–4 and by an explicit
 * "diagonal neighbours count, so a corner is square not notched" case.
 *
 * ## The alpha threshold is COUPLED to the stamp's `>= 128` (MASTER E6)
 *
 * {@link DEFAULT_OUTLINE_ALPHA_THRESHOLD} is `128`, deliberately the same
 * value as `poseStamp.ts`'s `DEFAULT_ALPHA_THRESHOLD` (D8).
 * That is not a coincidence to be tidied away later:
 *
 * > The outline must trace **the same silhouette the stamp writes.**
 *
 * The stamp includes a texel iff `alpha >= 128`. If this module used a
 * different cutoff, the two would disagree along every anti-aliased edge
 * texel: the outline would sit half a pixel inside or outside the shape that
 * actually gets committed, and the error would only appear on the diagonal
 * edges of a rounded primitive — plausible-looking, hard to attribute.
 *
 * The two constants are duplicated rather than imported so that neither module
 * depends on the other (this one imports nothing but a type). **If one moves,
 * move the other in the same commit**; a test in this suite asserts the
 * numeric value so a silent drift fails the gate.
 *
 * ## Holes INSIDE the model are outlined (pinned)
 *
 * The rule is purely local — "transparent, and near an opaque pixel" — with no
 * notion of inside or outside. A transparent hole in the middle of the model
 * is therefore outlined on its **inner** edge, exactly as the exterior is. The
 * spec asks for this to be decided and pinned rather than left to fall out;
 * it is chosen because it is what a pixel artist means by "outline the
 * shape" (a donut has two edges), because distinguishing inside from outside
 * would need a flood fill from the border and a decision about what to do with
 * a hole that touches the border, and because it keeps the function total,
 * order-independent and O(w*h*N).
 *
 * ## Purity
 *
 * No store, no MobX, no React, no API, no `services/`, no DOM, no canvas —
 * and **not even three**. This is plain typed-array arithmetic and is the
 * purest module in the directory. The only import is a type.
 */
import type { PoseColor } from "@/ui/canvas/pose/poseTypes";

/**
 * The alpha cutoff separating "model" from "empty", default `128`.
 *
 * ⚠️ **Coupled to `poseStamp.ts`'s `DEFAULT_ALPHA_THRESHOLD` (MASTER E6/D8).**
 * Both are `128` so the outline traces the same silhouette the stamp commits.
 * They are duplicated to keep this module dependency-free; change them
 * together. See the header.
 */
export const DEFAULT_OUTLINE_ALPHA_THRESHOLD = 128;

/**
 * The widest outline that will ever be drawn, in whole pixels.
 *
 * The rail offers 1–4 (MASTER E4); this is a **safety clamp**, not the UI
 * range. Its job is to stop a nonsense value — a width larger than the canvas,
 * or `1e9` from a mis-parsed slider — from turning an O(w*h*N) loop into a
 * hang. 64 is far past anything useful at pixel-art resolutions while still
 * being obviously finite.
 */
export const MAX_OUTLINE_WIDTH = 64;

/** Options for {@link applyOutline}. */
export interface ApplyOutlineOptions {
  /**
   * Alpha cutoff for "this pixel is part of the model", default
   * {@link DEFAULT_OUTLINE_ALPHA_THRESHOLD}. A non-finite value falls back to
   * the default. See the header for why overriding this is usually wrong.
   */
  alphaThreshold?: number;
}

/**
 * Draw a hard-edged outline of `outlineWidth` whole pixels around every opaque
 * region of `rgba`, in `color`, at full alpha.
 *
 * **MUTATES `rgba` IN PLACE** and returns that same reference for convenience.
 * See the header for the reasoning.
 *
 * ⚠️ **Apply at most ONCE per rendered buffer.** A single call is exact and
 * order-independent, but the outline it writes is opaque, so a second call
 * over the same buffer treats that outline as model and rings it again (width
 * 1 twice == width 2 once). The frame loop reads back a fresh buffer each
 * frame, so this is a note for future callers, not a live hazard.
 *
 * The rules, all pinned by tests:
 *
 *  - A pixel is **model** iff `alpha >= alphaThreshold` (default `128`,
 *    coupled to the stamp — MASTER E6).
 *  - A pixel is **outlined** iff it is *not* model and lies within
 *    `outlineWidth` in **Chebyshev distance** of a model pixel, measured
 *    against the ORIGINAL alpha (MASTER E5).
 *  - **Model pixels are never touched.** The outline goes *around* the model,
 *    never on top of it — the single most important property here, and the one
 *    the owner would notice first if it broke.
 *  - Outlined pixels are written as `color.rgb` with **alpha 255**,
 *    regardless of `color.a`: an outline is opaque by construction, the same
 *    way the stamp forces `a: 255` on an included texel (D8).
 *  - The buffer's edges **clip**; nothing wraps and nothing is read out of
 *    bounds. A model flush against a border simply has less room for its
 *    outline on that side.
 *
 * Total and non-throwing by design. Every degenerate input is a no-op that
 * returns the buffer unchanged: `outlineWidth <= 0`, a non-finite width or
 * dimension, a zero-or-negative dimension, a buffer shorter than
 * `width * height * 4`, an all-transparent buffer (nothing to outline) and an
 * all-opaque buffer (nowhere to put it). This runs mid-frame inside a render
 * loop; a throw there would kill the overlay, and there is nothing useful the
 * caller could do with the exception anyway.
 */
export function applyOutline<T extends Uint8Array | Uint8ClampedArray>(
  rgba: T,
  width: number,
  height: number,
  outlineWidth: number,
  color: PoseColor,
  options: ApplyOutlineOptions = {},
): T {
  // ── guards: every bad input is a no-op, never a throw ──────────────────
  if (!Number.isFinite(width) || !Number.isFinite(height)) return rgba;
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w <= 0 || h <= 0) return rgba;

  const pixels = w * h;
  if (rgba.length < pixels * 4) return rgba;

  // `outlineWidth <= 0` is the documented OFF state (MASTER E4), and
  // non-finite (NaN from a mis-parsed slider, Infinity) must not spin.
  if (!Number.isFinite(outlineWidth) || outlineWidth <= 0) return rgba;
  // Clamped, not just floored: an absurd width must not make the inner loops
  // run for ever. Beyond the canvas the result is identical anyway.
  const radius = Math.min(Math.floor(outlineWidth), MAX_OUTLINE_WIDTH);
  if (radius <= 0) return rgba;

  const threshold = Number.isFinite(options.alphaThreshold)
    ? (options.alphaThreshold as number)
    : DEFAULT_OUTLINE_ALPHA_THRESHOLD;

  // ⚠️ The silhouette is snapshotted from the ORIGINAL alpha BEFORE any write.
  // This is what stops the outline growing into itself. See the header.
  const silhouette = buildSilhouette(rgba, pixels, threshold);

  // Nothing opaque → nothing to outline. Everything opaque → nowhere to put
  // it. Both are early exits rather than a wasted full scan.
  let opaqueCount = 0;
  for (let i = 0; i < pixels; i++) if (silhouette[i] === 1) opaqueCount++;
  if (opaqueCount === 0 || opaqueCount === pixels) return rgba;

  const r = clampByte(color.r);
  const g = clampByte(color.g);
  const b = clampByte(color.b);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // Model pixels are never overwritten — the outline goes AROUND.
      if (silhouette[i] === 1) continue;

      if (!hasModelWithin(silhouette, w, h, x, y, radius)) continue;

      const c = i * 4;
      rgba[c] = r;
      rgba[c + 1] = g;
      rgba[c + 2] = b;
      // Full alpha regardless of `color.a`: an outline is opaque (D8's habit).
      rgba[c + 3] = 255;
    }
  }

  return rgba;
}

/**
 * One byte per pixel: `1` where `alpha >= threshold`, `0` elsewhere.
 *
 * Exported for tests and for a caller that wants the same silhouette rule
 * without drawing anything. It reads only alpha, so it is unaffected by
 * whatever colour the pass later writes.
 */
export function buildSilhouette(
  rgba: Uint8Array | Uint8ClampedArray,
  pixels: number,
  threshold: number = DEFAULT_OUTLINE_ALPHA_THRESHOLD,
): Uint8Array {
  const count = Number.isFinite(pixels) ? Math.max(0, Math.floor(pixels)) : 0;
  const mask = new Uint8Array(count);
  const cutoff = Number.isFinite(threshold)
    ? threshold
    : DEFAULT_OUTLINE_ALPHA_THRESHOLD;
  for (let i = 0; i < count; i++) {
    mask[i] = rgba[i * 4 + 3] >= cutoff ? 1 : 0;
  }
  return mask;
}

/**
 * Is any model pixel within `radius` of `(x, y)` in **Chebyshev** distance?
 *
 * The scan window is clamped to the buffer, which is the whole of the
 * edge handling: a model against the left border reads columns `0..x+radius`
 * and never index `-1`, so nothing wraps onto the previous row and nothing is
 * read out of bounds.
 *
 * Chebyshev falls out of the shape of the window itself — every cell in the
 * `(2*radius+1)^2` square is at distance `<= radius`, so the box scan *is* the
 * kernel with no distance arithmetic at all. A Euclidean kernel would need an
 * `dx*dx + dy*dy <= radius*radius` test inside this loop (see the header for
 * why it is not wanted).
 */
function hasModelWithin(
  silhouette: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  radius: number,
): boolean {
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(h - 1, y + radius);
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(w - 1, x + radius);

  for (let sy = y0; sy <= y1; sy++) {
    const row = sy * w;
    for (let sx = x0; sx <= x1; sx++) {
      if (silhouette[row + sx] === 1) return true;
    }
  }
  return false;
}

/**
 * A colour component forced into `0..255`.
 *
 * `PoseColor` is a plain structural interface with no runtime validation, so a
 * caller can hand over `-5`, `300` or `NaN`. A `Uint8ClampedArray` would clamp
 * for us but a `Uint8Array` wraps (`rgba[c] = 300` stores `44`), so the two
 * accepted buffer types would disagree about the outline colour. Clamping here
 * makes them identical. `NaN` becomes `0` rather than propagating.
 */
function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = Math.round(value);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
