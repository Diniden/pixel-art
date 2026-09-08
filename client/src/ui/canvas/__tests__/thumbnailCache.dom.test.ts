/**
 * thumbnailCache — the two bounds and the clamp.
 *
 * jsdom has no canvas implementation, so `getContext` returns null and the
 * module's real paint path cannot run here. These tests install a minimal
 * stub returning a truthy context object: what is under test is the CACHE
 * policy (hit/miss, LRU order, both eviction bounds, the size clamp), not
 * the pixels, and the policy is what the memory budget rests on.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ENTRIES,
  MAX_THUMBNAIL_SIZE,
  MAX_TOTAL_PIXELS,
  clampThumbnailSize,
  clearThumbnailCache,
  getCachedThumbnail,
  thumbnailCacheKey,
  thumbnailCacheStats,
} from "../thumbnailCache";

const original = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  clearThumbnailCache();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
  })) as unknown as typeof original;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = original;
  clearThumbnailCache();
});

describe("clampThumbnailSize", () => {
  it("clamps a canvas-sized request down to the max", () => {
    expect(clampThumbnailSize(512)).toBe(MAX_THUMBNAIL_SIZE);
  });

  it("floors, and floors to at least 1", () => {
    expect(clampThumbnailSize(20.9)).toBe(20);
    expect(clampThumbnailSize(0)).toBe(1);
    expect(clampThumbnailSize(-5)).toBe(1);
  });

  it("falls back to the max on a non-finite size", () => {
    expect(clampThumbnailSize(Number.NaN)).toBe(MAX_THUMBNAIL_SIZE);
  });
});

describe("thumbnailCacheKey", () => {
  it("separates revisions and sizes of the same id", () => {
    expect(thumbnailCacheKey("a", 1, 32)).not.toBe(
      thumbnailCacheKey("a", 2, 32),
    );
    expect(thumbnailCacheKey("a", 1, 32)).not.toBe(
      thumbnailCacheKey("a", 1, 20),
    );
  });

  it("clamps the size it encodes, so an over-large key is not a distinct entry", () => {
    expect(thumbnailCacheKey("a", 1, 4096)).toBe(
      thumbnailCacheKey("a", 1, MAX_THUMBNAIL_SIZE),
    );
  });
});

describe("getCachedThumbnail", () => {
  it("paints on a miss and blits on a hit", () => {
    const draw = vi.fn();
    const key = thumbnailCacheKey("layer-1", 3, 32);

    const first = getCachedThumbnail(key, 32, draw);
    expect(draw).toHaveBeenCalledTimes(1);

    const second = getCachedThumbnail(key, 32, draw);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("repaints when the revision moves", () => {
    const draw = vi.fn();
    getCachedThumbnail(thumbnailCacheKey("layer-1", 1, 32), 32, draw);
    getCachedThumbnail(thumbnailCacheKey("layer-1", 2, 32), 32, draw);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("stores at the CLAMPED side, never the requested one", () => {
    const canvas = getCachedThumbnail(
      thumbnailCacheKey("big", 1, 4096),
      4096,
      () => {},
    );
    expect(canvas?.width).toBe(MAX_THUMBNAIL_SIZE);
    expect(canvas?.height).toBe(MAX_THUMBNAIL_SIZE);
  });

  it("returns null when no 2d context is obtainable", () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null,
    ) as unknown as typeof original;
    expect(
      getCachedThumbnail(thumbnailCacheKey("x", 1, 32), 32, () => {}),
    ).toBeNull();
  });
});

describe("the two bounds", () => {
  it("evicts by count when entries are small", () => {
    // 1px entries: MAX_TOTAL_PIXELS is unreachable, so only MAX_ENTRIES bites.
    for (let i = 0; i < MAX_ENTRIES + 40; i++) {
      getCachedThumbnail(thumbnailCacheKey(`tiny-${i}`, 1, 1), 1, () => {});
    }
    expect(thumbnailCacheStats().entries).toBe(MAX_ENTRIES);
  });

  it("evicts by pixels when entries are large", () => {
    // 128² = 16,384 px, so MAX_TOTAL_PIXELS (1,048,576) allows 64 — far
    // fewer than MAX_ENTRIES. The pixel bound is what must bite here.
    const side = MAX_THUMBNAIL_SIZE;
    for (let i = 0; i < 200; i++) {
      getCachedThumbnail(thumbnailCacheKey(`big-${i}`, 1, side), side, () => {});
    }
    const stats = thumbnailCacheStats();
    expect(stats.entries).toBeLessThan(MAX_ENTRIES);
    expect(stats.pixels).toBeLessThanOrEqual(MAX_TOTAL_PIXELS);
  });

  it("evicts least-recently-USED, not least-recently-inserted", () => {
    const side = MAX_THUMBNAIL_SIZE;
    const capacity = Math.floor(MAX_TOTAL_PIXELS / (side * side));
    const oldest = thumbnailCacheKey("oldest", 1, side);

    getCachedThumbnail(oldest, side, () => {});
    for (let i = 0; i < capacity - 1; i++) {
      getCachedThumbnail(thumbnailCacheKey(`f-${i}`, 1, side), side, () => {});
    }
    // Touch the oldest key: it must now be the most recently used.
    expect(getCachedThumbnail(oldest, side, () => {})).not.toBeNull();

    // One more insert forces an eviction — and it must not be `oldest`.
    getCachedThumbnail(thumbnailCacheKey("newest", 1, side), side, () => {});
    const drawAgain = vi.fn();
    getCachedThumbnail(oldest, side, drawAgain);
    expect(drawAgain).not.toHaveBeenCalled();
  });

  it("clearThumbnailCache resets both counters", () => {
    getCachedThumbnail(thumbnailCacheKey("a", 1, 32), 32, () => {});
    clearThumbnailCache();
    expect(thumbnailCacheStats()).toMatchObject({ entries: 0, pixels: 0 });
  });
});
