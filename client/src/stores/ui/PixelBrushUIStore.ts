/**
 * PixelBrushUIStore — the pixel studio's Brush-tool stamp size, ratio lock and
 * per-axis scaling strategy (plan 13, task 11; MASTER D11).
 *
 * ## What lives here
 *
 * - `width` / `height` in cells; `null` means "the brush's native size". A
 *   loaded brush document decides what native is, so it is never read from a
 *   store here — every setter that needs it takes `native` as an ARGUMENT.
 *   That keeps this store free of `BrushStore` and lets the tests drive it
 *   with a plain `{ width, height }`.
 * - `lockRatio`, on by default. Engaging the lock CAPTURES the ratio in force
 *   at that moment (`lockedRatio = effH / effW`); releasing it clears the
 *   capture. While `lockedRatio` is `null` the native ratio applies, so a
 *   fresh store follows the brush's own proportions until the user shapes it.
 * - `scaleX` / `scaleY`, the strategy id per axis from the task-09 registry.
 *
 * ## ⚠️ NOT PERSISTED, deliberately
 *
 * Nothing in this store reaches `UIStore.toPersistedUIState()`. It is a view
 * state of one tool, not a property of the artwork — the same justification
 * `ToolUIStore.colorTarget` carries — and a brush reopened tomorrow should
 * stamp at its native size. Persisting any of it would add a key to all 151
 * of the owner's corpus snapshots for no benefit; `persistedUIState.test.ts`
 * is the gate that proves no key was added.
 *
 * ## The strategy rules (D11)
 *
 * A 2-D pixel-art scaler (EPX, Scale3x, Eagle, xBR, hq2x…) scales both axes
 * at once, so it can never be paired with a per-axis kernel. `setScale`
 * therefore: sets BOTH axes for a 2-D id; sets both when the ratio is
 * locked; and otherwise sets the one axis, demoting the OTHER axis to
 * `"nearest"` if it currently holds a 2-D id.
 *
 * No React, no `observer`, no reaction — nothing to dispose.
 */
import { action, computed, makeObservable, observable } from "mobx";
import {
  DEFAULT_PIXEL_BRUSH_SCALE,
  isPixelBrush2DStrategy,
} from "@/ui/canvas/tools/pixelBrushScale";
import type { PixelBrushScaleStrategy } from "@/ui/canvas/tools/pixelBrushScale";

/** The largest stamp side, in cells, on either axis. */
export const PIXEL_BRUSH_MAX_SIZE = 256;

/** The loaded brush's own frame size, in cells. */
export interface PixelBrushNativeSize {
  width: number;
  height: number;
}

export type PixelBrushAxis = "x" | "y";

/** Round to whole cells and clamp into `1..PIXEL_BRUSH_MAX_SIZE`. */
function clampSize(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(PIXEL_BRUSH_MAX_SIZE, Math.max(1, Math.round(n)));
}

/** Slider ceiling: min(256, max(64, 4 × the larger native side)). */
export function pixelBrushSliderMax(native: PixelBrushNativeSize): number {
  const side = Math.max(clampSize(native.width), clampSize(native.height));
  return Math.min(PIXEL_BRUSH_MAX_SIZE, Math.max(64, 4 * side));
}

export class PixelBrushUIStore {
  /** Stamp width in cells; `null` = the brush's native width. */
  width: number | null = null;
  /** Stamp height in cells; `null` = the brush's native height. */
  height: number | null = null;
  /** On by default: moving one side moves the other at the ratio in force. */
  lockRatio = true;
  /** `height / width` captured when the lock engaged; `null` = the native ratio. */
  lockedRatio: number | null = null;
  scaleX: PixelBrushScaleStrategy = DEFAULT_PIXEL_BRUSH_SCALE;
  scaleY: PixelBrushScaleStrategy = DEFAULT_PIXEL_BRUSH_SCALE;

  constructor() {
    makeObservable(this, {
      width: observable,
      height: observable,
      lockRatio: observable,
      lockedRatio: observable,
      scaleX: observable,
      scaleY: observable,
      isNative: computed,
      setWidth: action,
      setHeight: action,
      setLockRatio: action,
      setScale: action,
      resetSize: action,
      resetAll: action,
    });
  }

  /** `true` when both sides are unset — the stamp is the brush frame as-is. */
  get isNative(): boolean {
    return this.width === null && this.height === null;
  }

  /** The size the stamp is actually scaled to: nulls fall back to `native`, clamped `1..MAX`. */
  effectiveSize(native: PixelBrushNativeSize): { width: number; height: number } {
    return {
      width: clampSize(this.width ?? native.width),
      height: clampSize(this.height ?? native.height),
    };
  }

  /** The ratio (`height / width`) the lock enforces: the captured one, else native's. */
  private ratioInForce(native: PixelBrushNativeSize): number {
    if (this.lockedRatio !== null) return this.lockedRatio;
    return clampSize(native.height) / clampSize(native.width);
  }

  setWidth(width: number, native: PixelBrushNativeSize): void {
    const w = clampSize(width);
    this.width = w;
    if (this.lockRatio) {
      this.height = clampSize(w * this.ratioInForce(native));
    }
  }

  setHeight(height: number, native: PixelBrushNativeSize): void {
    const h = clampSize(height);
    this.height = h;
    if (this.lockRatio) {
      this.width = clampSize(h / this.ratioInForce(native));
    }
  }

  /**
   * Engaging captures the ratio in force right now (`effH / effW`, so a
   * 32×8 stamp locks at 0.25 whatever the brush's own proportions); releasing
   * clears the capture. Already in the requested state → no-op, so a repeated
   * `true` does not silently re-capture.
   */
  setLockRatio(locked: boolean, native: PixelBrushNativeSize): void {
    if (locked === this.lockRatio) return;
    this.lockRatio = locked;
    if (locked) {
      const eff = this.effectiveSize(native);
      this.lockedRatio = eff.height / eff.width;
    } else {
      this.lockedRatio = null;
    }
  }

  /** D11: 2-D id → both axes; locked → both; else that axis, demoting a 2-D partner to `nearest`. */
  setScale(axis: PixelBrushAxis, id: PixelBrushScaleStrategy): void {
    if (isPixelBrush2DStrategy(id) || this.lockRatio) {
      this.scaleX = id;
      this.scaleY = id;
      return;
    }
    if (axis === "x") {
      this.scaleX = id;
      if (isPixelBrush2DStrategy(this.scaleY)) this.scaleY = "nearest";
    } else {
      this.scaleY = id;
      if (isPixelBrush2DStrategy(this.scaleX)) this.scaleX = "nearest";
    }
  }

  /** Back to native size and the native ratio; the strategies are kept. */
  resetSize(): void {
    this.width = null;
    this.height = null;
    this.lockedRatio = null;
  }

  /** `resetSize`, plus the lock back on and both strategies to the default. */
  resetAll(): void {
    this.resetSize();
    this.lockRatio = true;
    this.scaleX = DEFAULT_PIXEL_BRUSH_SCALE;
    this.scaleY = DEFAULT_PIXEL_BRUSH_SCALE;
  }
}
