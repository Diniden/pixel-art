/**
 * thumbnailCache — a bounded LRU of already-painted thumbnail canvases.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE CACHE STORES THUMBNAILS, NEVER SOURCE GRIDS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The layer siderail paints one thumbnail per layer, and the timeline paints
 * one per cell — the same layer at the same revision can be asked for many
 * times per second while the panel re-renders on unrelated state (a rename,
 * a visibility toggle, a drag). Re-walking `layer.pixels` for each of those
 * is the cost this cache removes: on the owner's real project a grid is part
 * of 300,249 cells (R2), and the thumbnail derived from it is at most
 * {@link MAX_THUMBNAIL_SIZE}².
 *
 * That asymmetry is the whole memory argument. An entry's footprint is
 * `side² × 4` bytes and is INDEPENDENT of the canvas the thumbnail came
 * from, so a 512×512 project costs exactly what a 32×32 one does. Callers
 * that ask for a larger side are clamped rather than trusted —
 * {@link clampThumbnailSize} — because a `size` prop is one typo away from
 * putting a full-resolution canvas per layer into a Map that outlives the
 * component.
 *
 * ── The two bounds ────────────────────────────────────────────────────────
 *
 * Eviction is least-recently-USED (a `Map`'s insertion order, re-inserted on
 * every hit), bounded by BOTH
 *
 *  - {@link MAX_ENTRIES} — so a long editing session cannot accumulate one
 *    canvas per (layer × revision) forever, and
 *  - {@link MAX_TOTAL_PIXELS} — the real budget, because entries differ in
 *    size. 4 MB of RGBA at the default sizes.
 *
 * Count alone is not enough (128 entries of 128² is 8 MB); pixels alone are
 * not enough (a flood of tiny 20² entries is cheap but unbounded in objects).
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * No store, no MobX, no API, no domain type — it takes a key, a size and a
 * `draw` callback. The CALLER composes the key, and the caller is what knows
 * when content changed (`pixelVersion`), exactly as `ThumbnailCanvas`'s
 * `revision` contract already requires.
 */

/**
 * The largest thumbnail edge the cache will ever hold, in CSS px.
 *
 * 128 is comfortably above every call site (the timeline cell is 20, the
 * siderail row 32, the object library 64) and is the backstop against a
 * caller passing a canvas-sized `size` — see the header.
 */
export const MAX_THUMBNAIL_SIZE = 128;

/** Upper bound on cached canvases, regardless of how small they are. */
export const MAX_ENTRIES = 256;

/**
 * Upper bound on total cached pixels. 1M px ≈ 4 MB RGBA — the memory budget
 * the cache exists to keep flat as projects grow.
 */
export const MAX_TOTAL_PIXELS = 1_024 * 1_024;

/** Clamp to `[1, MAX_THUMBNAIL_SIZE]` and to whole pixels. */
export function clampThumbnailSize(size: number): number {
  if (!Number.isFinite(size)) return MAX_THUMBNAIL_SIZE;
  return Math.max(1, Math.min(MAX_THUMBNAIL_SIZE, Math.floor(size)));
}

interface CacheEntry {
  canvas: HTMLCanvasElement;
  /** `side²` — this entry's contribution to {@link MAX_TOTAL_PIXELS}. */
  pixels: number;
}

/**
 * Insertion order IS the LRU order: a hit deletes and re-inserts, so the
 * oldest key is always `keys().next()`.
 */
const entries = new Map<string, CacheEntry>();
let totalPixels = 0;

/**
 * Compose the cache key.
 *
 * `revision` is the caller's content-change counter — the SAME number
 * `ThumbnailCanvas` takes as `revision`. Two thumbnails of one layer at one
 * revision and one size are identical by construction; if they are not, the
 * caller's revision is wrong and no key shape here can rescue it.
 */
export function thumbnailCacheKey(
  id: string,
  revision: number,
  size: number,
): string {
  return `${id}@${revision}@${clampThumbnailSize(size)}`;
}

function evictWhileOverBudget(): void {
  while (
    entries.size > MAX_ENTRIES ||
    (totalPixels > MAX_TOTAL_PIXELS && entries.size > 1)
  ) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    const evicted = entries.get(oldest.value);
    entries.delete(oldest.value);
    if (evicted) totalPixels -= evicted.pixels;
  }
}

/**
 * Return the cached thumbnail for `key`, painting it with `draw` on a miss.
 *
 * Returns `null` when no 2d context is obtainable (jsdom, or a browser that
 * refused the context) — callers must fall back to drawing directly.
 */
export function getCachedThumbnail(
  key: string,
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
): HTMLCanvasElement | null {
  const side = clampThumbnailSize(size);

  const hit = entries.get(key);
  if (hit && hit.canvas.width === side) {
    // Re-insert: this is what makes Map order the LRU order.
    entries.delete(key);
    entries.set(key, hit);
    return hit.canvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) return null;

  ctx.clearRect(0, 0, side, side);
  draw(ctx, side);

  if (hit) totalPixels -= hit.pixels;
  const pixels = side * side;
  entries.set(key, { canvas, pixels });
  totalPixels += pixels;
  evictWhileOverBudget();

  return canvas;
}

/**
 * Drop every entry. Called when a project is unloaded — the keys carry layer
 * ids, and ids are not guaranteed unique across projects.
 */
export function clearThumbnailCache(): void {
  entries.clear();
  totalPixels = 0;
}

/** Introspection for tests and debugging. Not a rendering path. */
export function thumbnailCacheStats(): {
  entries: number;
  pixels: number;
  maxEntries: number;
  maxPixels: number;
} {
  return {
    entries: entries.size,
    pixels: totalPixels,
    maxEntries: MAX_ENTRIES,
    maxPixels: MAX_TOTAL_PIXELS,
  };
}
