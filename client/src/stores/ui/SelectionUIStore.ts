/**
 * SelectionUIStore — the pixel selection mask and its two modes (REFRESH
 * task 26).
 *
 * Replaces `store/selectionActions.ts` (651 lines). The selection is the
 * value that GATES the hot path: `selectionBehavior === "editMask"` means
 * every `setPixel` in the application consults `selection.mask` before
 * writing, so this store's shape is a performance decision, not a style one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `selection` IS `observableRef`, AND ITS `Set` IS NOT OBSERVABLE AT ALL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `SelectionState` is `{ width, height, mask: Set<number>, bounds }`. On the
 * owner's real 300k-cell project a select-all mask holds 300,249 entries.
 *
 * Every action below REPLACES the whole `SelectionState` — nothing ever
 * mutates a mask in place — so `observableRef` is exactly right: consumers
 * re-read on identity change and MobX never proxies the `Set`. It also dodges
 * the `Set`-serialization hazard outright: an observable `Set` is a MobX
 * proxy, and nothing here is persisted, so the raw `Set` stays a raw `Set`.
 *
 * ── `mode` and `behavior` are NOT owned here ──────────────────────────────
 *
 * ⚠️ SPEC CORRECTION. The task spec lists `mode` (`selectionMode`) and
 * `behavior` (`selectionBehavior`) as fields of this store, to be ADDED to
 * `toPersistedUIState()`. Both were already migrated by task 24: they live on
 * `ToolUIStore` (`:73-74`) and are already emitted by `toPersistedUIState()`
 * at wire slots 6 and 7. Duplicating them here would give each field TWO
 * writers — precisely what R6 forbids — and re-adding them to the persisted
 * builder would emit each key twice.
 *
 * They are therefore DELEGATED: `mode` and `behavior` are accessors onto the
 * injected `ToolUIStore`, so consumers can read `selectionUI.behavior` while
 * exactly one store owns the value. This is the same technique
 * `TimelineUIStore` uses for its three view-mode fields via `ViewportUIStore`.
 *
 * ── The three pixel-sampling selects take the GRID as an argument ─────────
 *
 * `selectFloodFillAt`, `selectAllByColorAt` and (for its dimensions)
 * `selectLasso` need pixel CONTENT. They receive it as an argument rather
 * than reaching into the domain tree, which keeps this store free of a
 * domain dependency and — more importantly — means nothing here ever holds a
 * grid reference alive.
 */
import { action, computed, makeObservable, observableRef } from "mobx";
import type { Pixel, PixelData, Point, SelectionBox } from "../../types";
import type { SelectionState } from "../../store/storeTypes";
import type { ToolUIStore } from "./ToolUIStore";

/* ── the pure geometry helpers, ported verbatim from selectionActions.ts ─── */

function samePixelColor(a: Pixel | 0 | undefined, b: Pixel | 0 | undefined) {
  if (a === 0 || a === undefined) return b === 0 || b === undefined;
  if (b === 0 || b === undefined) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function pack(x: number, y: number, width: number) {
  return y * width + x;
}

function unpack(idx: number, width: number) {
  return { x: idx % width, y: Math.floor(idx / width) };
}

function computeBounds(mask: Set<number>, width: number): SelectionBox | null {
  if (mask.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const idx of mask) {
    const { x, y } = unpack(idx, width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function clampBoxToMask(
  box: SelectionBox,
  width: number,
  height: number,
): Set<number> {
  const mask = new Set<number>();
  const startX = Math.max(0, box.x);
  const startY = Math.max(0, box.y);
  const endX = Math.min(width - 1, box.x + box.width - 1);
  const endY = Math.min(height - 1, box.y + box.height - 1);
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      mask.add(pack(x, y, width));
    }
  }
  return mask;
}

function isPointInPolygon(
  px: number,
  py: number,
  poly: { x: number; y: number }[],
) {
  // Ray casting. `poly` is in continuous coords.
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** The grid dimensions a selection is expressed against. */
export interface SelectionDims {
  width: number;
  height: number;
}

export interface SelectionUIStoreDeps {
  /** Owns `selectionMode` / `selectionBehavior` — see the module header. */
  tool: ToolUIStore;
  /**
   * How a selection change reaches the bridge-era Zustand mirror. Injected
   * rather than imported so this store never depends on the legacy store.
   */
  publish?: (selection: SelectionState | null) => void;
}

export class SelectionUIStore {
  /**
   * ⚠️ `observableRef`, ALWAYS — and the `Set` inside is a raw `Set`. See the
   * module header. Replaced wholesale by every action; never mutated.
   */
  selection: SelectionState | null = null;

  private readonly tool: ToolUIStore;
  private readonly publishSelection: (s: SelectionState | null) => void;

  constructor(deps: SelectionUIStoreDeps) {
    this.tool = deps.tool;
    this.publishSelection = deps.publish ?? (() => {});
    makeObservable(this, {
      selection: observableRef,
      bounds: computed,
      hasSelection: computed,
      setSelection: action,
      setSelectionMask: action,
      clearSelection: action,
      moveSelection: action,
      expandSelection: action,
      shrinkSelection: action,
      selectFloodFillAt: action,
      selectAllByColorAt: action,
      selectLasso: action,
      adopt: action,
    });
  }

  /* ── the two DELEGATED fields (one writer: ToolUIStore) ────────────────── */

  /** `uiState.selectionMode`. Owned by `ToolUIStore`; see the header. */
  get mode() {
    return this.tool.selectionMode;
  }

  /** `uiState.selectionBehavior`. Owned by `ToolUIStore`; see the header. */
  get behavior() {
    return this.tool.selectionBehavior;
  }

  /* ── reads ─────────────────────────────────────────────────────────────── */

  get bounds(): SelectionBox | null {
    return this.selection?.bounds ?? null;
  }

  get hasSelection(): boolean {
    return this.selection !== null;
  }

  /**
   * The arguments a pixel write needs from this store, in the shape
   * `PixelStore` accepts. This is the ONE-DIRECTIONAL seam: the caller reads
   * it here and passes it DOWN, so `stores/domain/**` never imports a UI
   * store.
   */
  get writeOptions(): {
    mask?: ReadonlySet<number>;
    maskSize?: SelectionDims;
    behavior: string;
  } {
    const selection = this.selection;
    return {
      mask: selection?.mask,
      maskSize: selection
        ? { width: selection.width, height: selection.height }
        : undefined,
      behavior: this.behavior,
    };
  }

  /**
   * The options `moveSelectedPixels` / `deleteSelectionPixels` need — W29d.
   *
   * Identical to {@link writeOptions} except that `behavior` is DELIBERATELY
   * omitted. `selectionBehavior` does not gate these two: the legacy actions
   * (`selectionActions.ts`) never consulted it in either, and including it
   * would make a `"editMask"` behaviour silently filter the very pixels the
   * action exists to move.
   *
   * Moved here from `zustandBridge.ts:1007`'s `selectionWriteOptions()`
   * closure, which was its only home. It belongs on this store for the same
   * reason `writeOptions` does: it is a projection of THIS store's selection
   * into the shape `PixelStore` accepts, and the one-directional boundary
   * requires the UI side to assemble it and pass it DOWN.
   */
  get maskWriteOptions(): {
    mask?: ReadonlySet<number>;
    maskSize?: SelectionDims;
  } {
    const selection = this.selection;
    return {
      mask: selection?.mask,
      maskSize: selection
        ? { width: selection.width, height: selection.height }
        : undefined,
    };
  }

  /* ── the single write path ─────────────────────────────────────────────── */

  /**
   * Replace the selection wholesale. A mask with no bounds (empty) collapses
   * to `null`, which is the legacy "no selection" representation.
   */
  private commit(
    mask: Set<number>,
    dims: SelectionDims,
  ): void {
    const bounds = computeBounds(mask, dims.width);
    this.selection = bounds
      ? { width: dims.width, height: dims.height, mask, bounds }
      : null;
    this.publishSelection(this.selection);
  }

  /* ══ THE 9 ACTIONS ═════════════════════════════════════════════════════ */

  /** Rectangular select. `dims` is the target grid, passed IN. */
  setSelection(box: SelectionBox | null, dims: SelectionDims): void {
    if (!box) {
      this.clearSelection();
      return;
    }
    this.commit(clampBoxToMask(box, dims.width, dims.height), dims);
  }

  /**
   * Set/replace/add/subtract a mask directly (flood, lasso and colour select
   * route through here). A dimension change forces `replace`, exactly as the
   * legacy code did.
   */
  setSelectionMask(
    mask: Set<number> | null,
    dims: SelectionDims,
    op: "replace" | "add" | "subtract" = "replace",
  ): void {
    if (!mask || mask.size === 0) {
      this.clearSelection();
      return;
    }
    const prev = this.selection;
    let next: Set<number>;
    if (
      op === "replace" ||
      !prev ||
      prev.width !== dims.width ||
      prev.height !== dims.height
    ) {
      next = new Set(mask);
    } else if (op === "add") {
      next = new Set(prev.mask);
      for (const idx of mask) next.add(idx);
    } else {
      next = new Set(prev.mask);
      for (const idx of mask) next.delete(idx);
    }
    this.commit(next, dims);
  }

  clearSelection(): void {
    this.selection = null;
    this.publishSelection(null);
  }

  /**
   * Slide the mask. Cells that would leave the grid are DROPPED (not
   * clamped) — the legacy behaviour, and why repeatedly nudging a selection
   * off an edge shrinks it.
   */
  moveSelection(dx: number, dy: number): void {
    const selection = this.selection;
    if (!selection) return;
    if (dx === 0 && dy === 0) return;
    const { width, height } = selection;
    const moved = new Set<number>();
    for (const idx of selection.mask) {
      const { x, y } = unpack(idx, width);
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      moved.add(pack(nx, ny, width));
    }
    this.commit(moved, { width, height });
  }

  /** Grow by 4-connectivity, `steps` times. */
  expandSelection(steps: number = 1): void {
    const selection = this.selection;
    if (!selection) return;
    const { width, height } = selection;
    let mask = new Set(selection.mask);
    for (let s = 0; s < Math.max(0, steps); s++) {
      const next = new Set(mask);
      for (const idx of mask) {
        const { x, y } = unpack(idx, width);
        for (const p of [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x, y: y + 1 },
        ]) {
          if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
          next.add(pack(p.x, p.y, width));
        }
      }
      mask = next;
    }
    this.commit(mask, { width, height });
  }

  /**
   * Shrink by 4-connectivity. A cell survives only if all four neighbours are
   * in-bounds AND selected — so the grid edge erodes the selection, which is
   * the legacy behaviour.
   */
  shrinkSelection(steps: number = 1): void {
    const selection = this.selection;
    if (!selection) return;
    const { width, height } = selection;
    let mask = new Set(selection.mask);
    for (let s = 0; s < Math.max(0, steps); s++) {
      const next = new Set<number>();
      for (const idx of mask) {
        const { x, y } = unpack(idx, width);
        let keep = true;
        for (const p of [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x, y: y + 1 },
        ]) {
          if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
            keep = false;
            break;
          }
          if (!mask.has(pack(p.x, p.y, width))) {
            keep = false;
            break;
          }
        }
        if (keep) next.add(idx);
      }
      mask = next;
      if (mask.size === 0) break;
    }
    this.commit(mask, { width, height });
  }

  /**
   * Contiguous same-colour select. The GRID IS AN ARGUMENT — this store never
   * reads the domain tree.
   *
   * ⚠️ The traversal is ported verbatim, including its quirk: neighbours are
   * marked visited when ENQUEUED but colour-tested when POPPED, and the queue
   * is used as a STACK (`pop()`). That makes it depth-first and means a cell
   * reached first by a wrong-coloured path is never revisited. Observed
   * behaviour, pinned by task 08 — not corrected here.
   */
  selectFloodFillAt(
    x: number,
    y: number,
    grid: readonly PixelData[][],
    dims: SelectionDims,
  ): void {
    const { width, height } = dims;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const target = grid[y]?.[x]?.color;

    const visited = new Uint8Array(width * height);
    const q: number[] = [pack(x, y, width)];
    visited[pack(x, y, width)] = 1;
    const mask = new Set<number>();

    while (q.length) {
      const idx = q.pop()!;
      const { x: cx, y: cy } = unpack(idx, width);
      const c = grid[cy]?.[cx]?.color;
      if (!samePixelColor(c, target)) continue;
      mask.add(idx);
      for (const p of [
        { x: cx - 1, y: cy },
        { x: cx + 1, y: cy },
        { x: cx, y: cy - 1 },
        { x: cx, y: cy + 1 },
      ]) {
        if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
        const ni = pack(p.x, p.y, width);
        if (visited[ni]) continue;
        visited[ni] = 1;
        q.push(ni);
      }
    }
    this.commit(mask, dims);
  }

  /** Global same-colour select. The GRID IS AN ARGUMENT. */
  selectAllByColorAt(
    x: number,
    y: number,
    grid: readonly PixelData[][],
    dims: SelectionDims,
  ): void {
    const { width, height } = dims;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const target = grid[y]?.[x]?.color;
    const mask = new Set<number>();
    for (let yy = 0; yy < height; yy++) {
      const row = grid[yy];
      if (!row) continue;
      for (let xx = 0; xx < width; xx++) {
        if (samePixelColor(row[xx]?.color, target)) mask.add(pack(xx, yy, width));
      }
    }
    this.commit(mask, dims);
  }

  /**
   * Freehand polygon select. Tests pixel CENTRES against the polygon, so a
   * single point selects exactly that cell (special-cased, as in the legacy
   * code, because a 1-point polygon contains nothing).
   */
  selectLasso(points: readonly Point[], dims: SelectionDims): void {
    const { width, height } = dims;
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      this.commit(new Set([pack(points[0].x, points[0].y, width)]), dims);
      return;
    }
    const poly = points.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    maxX = Math.min(width - 1, Math.ceil(maxX));
    maxY = Math.min(height - 1, Math.ceil(maxY));

    const mask = new Set<number>();
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (isPointInPolygon(x + 0.5, y + 0.5, poly)) mask.add(pack(x, y, width));
      }
    }
    this.commit(mask, dims);
  }

  /**
   * Bridge-era adoption: install a selection written by the legacy Zustand
   * path without publishing it back (which would be a second writer, R6).
   */
  adopt(selection: SelectionState | null): void {
    this.selection = selection;
  }
}
