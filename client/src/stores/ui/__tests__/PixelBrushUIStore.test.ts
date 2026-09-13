/**
 * `PixelBrushUIStore` — size, ratio lock and per-axis strategy (plan 13,
 * task 11; MASTER D11).
 *
 * Every rule in the store's header has a test here, hand-computed against a
 * 16×8 native brush (ratio 0.5) unless a test says otherwise. Two things are
 * worth stating up front:
 *
 * - The lock captures the ratio IN FORCE when it engages, not the native
 *   one — so unlocking, shaping the stamp to 32×8 and re-locking gives a
 *   0.25 ratio, and the next width change follows that.
 * - A 2-D pixel-art scaler cannot pair with a per-axis kernel. Picking one
 *   sets both axes; picking a kernel on one axis while the other holds a 2-D
 *   id demotes the other to `nearest`.
 *
 * ⚠️ This task adds NO persisted key. The store is constructed by `UIStore`
 * but never read by `toPersistedUIState()` or `hydrate`; the wire-format
 * proof lives in `persistedUIState.test.ts`, which must stay green and
 * untouched. Nothing here should ever need a snapshot.
 */
import { describe, expect, it } from "vitest";

import {
  PIXEL_BRUSH_MAX_SIZE,
  PixelBrushUIStore,
  pixelBrushSliderMax,
} from "@/stores/ui/PixelBrushUIStore";

const NATIVE = { width: 16, height: 8 };

function store(): PixelBrushUIStore {
  return new PixelBrushUIStore();
}

describe("PixelBrushUIStore — defaults", () => {
  it("starts native, locked, at the native ratio, nearest on both axes", () => {
    const s = store();
    expect(s.width).toBeNull();
    expect(s.height).toBeNull();
    expect(s.isNative).toBe(true);
    expect(s.lockRatio).toBe(true);
    expect(s.lockedRatio).toBeNull();
    expect(s.scaleX).toBe("nearest");
    expect(s.scaleY).toBe("nearest");
  });

  it("effectiveSize at native is the native size", () => {
    expect(store().effectiveSize(NATIVE)).toEqual({ width: 16, height: 8 });
  });

  it("effectiveSize clamps an out-of-range native into 1..MAX", () => {
    expect(store().effectiveSize({ width: 0, height: 1000 })).toEqual({
      width: 1,
      height: PIXEL_BRUSH_MAX_SIZE,
    });
  });
});

describe("PixelBrushUIStore — size with the lock on (native 16×8, ratio 0.5)", () => {
  it("setWidth(32) → height 16", () => {
    const s = store();
    s.setWidth(32, NATIVE);
    expect(s.width).toBe(32);
    expect(s.height).toBe(16);
    expect(s.isNative).toBe(false);
  });

  it("setHeight(4) → width 8", () => {
    const s = store();
    s.setHeight(4, NATIVE);
    expect(s.height).toBe(4);
    expect(s.width).toBe(8);
  });

  it("the derived side is rounded to whole cells", () => {
    const s = store();
    s.setWidth(5, NATIVE); // 5 × 0.5 = 2.5 → round → 3
    expect(s.height).toBe(3);
  });

  it("clamps at 1 on both sides", () => {
    const s = store();
    s.setWidth(-40, NATIVE);
    expect(s.width).toBe(1);
    expect(s.height).toBe(1); // 1 × 0.5 = 0.5 → round → 1 (0 would clamp to 1 anyway)
    s.setHeight(0, NATIVE);
    expect(s.height).toBe(1);
    expect(s.width).toBe(2); // 1 / 0.5
  });

  it("clamps at 256 on both sides", () => {
    const s = store();
    s.setHeight(10_000, NATIVE);
    expect(s.height).toBe(PIXEL_BRUSH_MAX_SIZE);
    expect(s.width).toBe(PIXEL_BRUSH_MAX_SIZE); // 256 / 0.5 = 512 → clamp
    s.setWidth(300, NATIVE);
    expect(s.width).toBe(PIXEL_BRUSH_MAX_SIZE);
    expect(s.height).toBe(128);
  });
});

describe("PixelBrushUIStore — the lock", () => {
  it("unlocked, setWidth leaves height untouched", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    expect(s.lockRatio).toBe(false);
    expect(s.lockedRatio).toBeNull();
    s.setWidth(32, NATIVE);
    expect(s.width).toBe(32);
    expect(s.height).toBeNull();
    expect(s.effectiveSize(NATIVE)).toEqual({ width: 32, height: 8 });
  });

  it("unlocked, setHeight leaves width untouched", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setHeight(4, NATIVE);
    expect(s.height).toBe(4);
    expect(s.width).toBeNull();
  });

  it("re-locking at 32×8 captures ratio 0.25 → setWidth(64) → height 16", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setWidth(32, NATIVE);
    s.setHeight(8, NATIVE);
    s.setLockRatio(true, NATIVE);
    expect(s.lockRatio).toBe(true);
    expect(s.lockedRatio).toBe(0.25);
    s.setWidth(64, NATIVE);
    expect(s.height).toBe(16);
    s.setHeight(4, NATIVE);
    expect(s.width).toBe(16);
  });

  it("locking with the stamp still native captures the native ratio", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setLockRatio(true, NATIVE);
    expect(s.lockedRatio).toBe(0.5);
  });

  it("releasing clears the captured ratio", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setWidth(32, NATIVE);
    s.setHeight(8, NATIVE);
    s.setLockRatio(true, NATIVE);
    expect(s.lockedRatio).toBe(0.25);
    s.setLockRatio(false, NATIVE);
    expect(s.lockedRatio).toBeNull();
  });

  it("locking while already locked is a no-op (does not re-capture)", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setWidth(32, NATIVE);
    s.setHeight(8, NATIVE);
    s.setLockRatio(true, NATIVE); // ratio 0.25
    s.setHeight(32, NATIVE); // width → 128; stamp is now 128×32, still 0.25
    s.setLockRatio(true, NATIVE);
    expect(s.lockedRatio).toBe(0.25);
  });
});

describe("PixelBrushUIStore — setScale (D11)", () => {
  it("locked: a kernel on x sets both axes", () => {
    const s = store();
    s.setScale("x", "bilinear");
    expect(s.scaleX).toBe("bilinear");
    expect(s.scaleY).toBe("bilinear");
  });

  it("locked: a kernel on y sets both axes", () => {
    const s = store();
    s.setScale("y", "box");
    expect(s.scaleX).toBe("box");
    expect(s.scaleY).toBe("box");
  });

  it("unlocked: a kernel on x sets only x", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setScale("x", "bilinear");
    expect(s.scaleX).toBe("bilinear");
    expect(s.scaleY).toBe("nearest");
  });

  it("unlocked: a 2-D scaler on y sets both axes", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setScale("y", "epx");
    expect(s.scaleX).toBe("epx");
    expect(s.scaleY).toBe("epx");
  });

  it("unlocked: a kernel on x demotes a 2-D y to nearest", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setScale("y", "epx");
    s.setScale("x", "lanczos3");
    expect(s.scaleX).toBe("lanczos3");
    expect(s.scaleY).toBe("nearest");
  });

  it("unlocked: a kernel on y demotes a 2-D x to nearest", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setScale("x", "scale3x");
    s.setScale("y", "mitchell");
    expect(s.scaleX).toBe("nearest");
    expect(s.scaleY).toBe("mitchell");
  });

  it("unlocked: a kernel on one axis keeps a kernel on the other", () => {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setScale("y", "bicubic");
    s.setScale("x", "lanczos2");
    expect(s.scaleX).toBe("lanczos2");
    expect(s.scaleY).toBe("bicubic");
  });

  it("locked: a 2-D scaler sets both axes", () => {
    const s = store();
    s.setScale("x", "xbr");
    expect(s.scaleX).toBe("xbr");
    expect(s.scaleY).toBe("xbr");
  });
});

describe("PixelBrushUIStore — resets", () => {
  function shaped(): PixelBrushUIStore {
    const s = store();
    s.setLockRatio(false, NATIVE);
    s.setWidth(32, NATIVE);
    s.setHeight(8, NATIVE);
    s.setLockRatio(true, NATIVE); // 0.25
    s.setScale("x", "lanczos3"); // locked → both
    s.setLockRatio(false, NATIVE);
    s.setScale("y", "bilinear");
    return s;
  }

  it("resetSize nulls the size and the captured ratio but keeps the strategies and the lock state", () => {
    const s = shaped();
    s.resetSize();
    expect(s.width).toBeNull();
    expect(s.height).toBeNull();
    expect(s.isNative).toBe(true);
    expect(s.lockedRatio).toBeNull();
    expect(s.lockRatio).toBe(false);
    expect(s.scaleX).toBe("lanczos3");
    expect(s.scaleY).toBe("bilinear");
  });

  it("resetAll restores every default", () => {
    const s = shaped();
    s.resetAll();
    expect(s.width).toBeNull();
    expect(s.height).toBeNull();
    expect(s.isNative).toBe(true);
    expect(s.lockRatio).toBe(true);
    expect(s.lockedRatio).toBeNull();
    expect(s.scaleX).toBe("nearest");
    expect(s.scaleY).toBe("nearest");
  });
});

describe("pixelBrushSliderMax", () => {
  it("16×16 → 64 (the floor)", () => {
    expect(pixelBrushSliderMax({ width: 16, height: 16 })).toBe(64);
  });

  it("100×20 → 256 (the ceiling)", () => {
    expect(pixelBrushSliderMax({ width: 100, height: 20 })).toBe(256);
  });

  it("40×10 → 160 (4 × the larger side)", () => {
    expect(pixelBrushSliderMax({ width: 40, height: 10 })).toBe(160);
  });

  it("uses the larger side whichever axis it is on", () => {
    expect(pixelBrushSliderMax({ width: 10, height: 40 })).toBe(160);
  });
});
