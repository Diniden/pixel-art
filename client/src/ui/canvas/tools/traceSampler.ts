/**
 * Trace stamping — one interface over the reference and frame samplers.
 *
 * ## Why this module exists
 *
 * `Canvas.tsx` carried the reference-trace and frame-trace stamping bodies four
 * times: down and move, for each of the two sources. Task 31's spec measures the
 * pair at ~110 duplicated lines. They differ in exactly ONE respect — which
 * sampler function is consulted (`getRefPixelAtCoord` vs
 * `getFrameTracePixelAtCoord`). Everything else, including the variant-space
 * conversion and the alpha test, was character-for-character identical.
 *
 * Parameterising the sampler collapses all four to one implementation.
 *
 * ## The variant-space conversion is load-bearing
 *
 * Stamp coordinates are VARIANT-LOCAL while a variant is being edited (that is
 * what `coords.ts`'s `"pixel"` mode produces), but both samplers read from
 * OBJECT space. Every legacy copy therefore added `variantOffset` before
 * sampling, and wrote the result back at the UNCONVERTED coordinate. Both halves
 * of that asymmetry are preserved here: `sampleAt` receives the object-space
 * point, and the emitted write keeps the original grid-local one.
 *
 * ## Purity
 *
 * No store, no MobX, no DOM. The samplers close over reference-image data and
 * frame pixels in `Canvas.tsx`; they arrive here as plain functions.
 */

import { stampSegment } from "./brushStamp";
import type {
  LineFn,
  StampColor,
  StampOptions,
  StampPoint,
} from "./brushStamp";

/**
 * A colour sample in the shape both trace sources return. `null` means "no
 * pixel here"; a fully transparent sample is treated the same way (see
 * `TRACE_ALPHA_FLOOR`).
 */
export type TraceSample = StampColor;

/**
 * Reads a pixel in OBJECT space. `getRefPixelAtCoord` and
 * `getFrameTracePixelAtCoord` both already have this signature.
 *
 * ⚠️ The `0` in the return type is the domain's "empty cell" sentinel
 * (`ReferencePixel = {r,g,b,a} | 0`), not a colour. The legacy alpha test was
 * `refPixel && refPixel.a > 0`, in which `0` is falsy and therefore skipped —
 * `stampTrace` reproduces that by testing truthiness before reading `.a`.
 */
export type TraceSamplerFn = (x: number, y: number) => TraceSample | null | 0;

/**
 * The legacy alpha test was `refPixel && refPixel.a > 0` in all four copies —
 * strictly greater than zero, so a fully transparent source pixel stamps
 * nothing. Named rather than inlined so the threshold is visible.
 */
const TRACE_ALPHA_FLOOR = 0;

/** How a variant-local stamp coordinate maps into the sampler's object space. */
export interface TraceSpace {
  /** True only when a variant is being edited AND its data resolved. */
  editingVariant: boolean;
  /** Offset of the variant being edited, in object cells. */
  variantOffset: StampPoint;
}

/** One pixel to write: grid-local coordinate plus the sampled colour. */
export interface TraceWrite {
  x: number;
  y: number;
  color: TraceSample;
}

/**
 * Stamp one trace step — the body shared by the down and move handlers of both
 * trace tools.
 *
 * `prev` is `null` on pointer-down (stamp just `next`) and the previous stroke
 * cell on drag, exactly as `stampSegment` expects; that single call replaces the
 * hand-rolled segment/dedupe loops the four legacy copies each carried.
 *
 * Returns only the cells that sampled to a visible colour, so the caller keeps
 * the legacy `if (out.length > 0) setPixels(out)` guard meaningful — an empty
 * result must not open a history entry.
 */
export function stampTrace(
  prev: StampPoint | null,
  next: StampPoint,
  line: LineFn,
  options: StampOptions,
  space: TraceSpace,
  sample: TraceSamplerFn,
): TraceWrite[] {
  const cells = stampSegment(prev, next, line, options);
  const out: TraceWrite[] = [];

  for (const p of cells) {
    // Grid-local → object space for the sampler only. The write below keeps the
    // grid-local coordinate, which is what the legacy code did.
    const objectX = space.editingVariant ? p.x + space.variantOffset.x : p.x;
    const objectY = space.editingVariant ? p.y + space.variantOffset.y : p.y;

    const sampled = sample(objectX, objectY);
    // `sampled` may be the `0` empty-cell sentinel; truthiness screens it out
    // exactly as the legacy `refPixel && refPixel.a > 0` did.
    if (sampled && sampled.a > TRACE_ALPHA_FLOOR) {
      out.push({ x: p.x, y: p.y, color: sampled });
    }
  }

  return out;
}
