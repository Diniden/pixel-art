/**
 * BrushPixelStore — cell writes on the selected brush layer (Brush Studio
 * plan, `docs/01-brush-studio`, task 09; MASTER D3 / D8 / D9).
 *
 * The brush twin of `./PixelStore.ts`'s write engine, stripped to what a
 * delta grid needs: `setCells` / `clearCells` (bounds + optional edit mask,
 * de-duplicated, no-op on an unchanged value), `moveLayerCells`, the two
 * flips, and `cellAt`. Every write:
 *
 *   1. copies ONLY the touched rows of the target grid into a NEW grid
 *      (`writeCells`), then rebuilds the document spine down to that layer
 *      (`replaceLayerGrid`) — every other frame, layer and row keeps its
 *      identity, and nothing is ever `structuredClone`d;
 *   2. installs the new document through `brush.adoptDocument` and bumps
 *      `brush.pixelVersion` — NEVER `domainVersion`. `pixelVersion` is what
 *      the brush canvas redraws from and what wakes auto-save (D8/D11); a
 *      `domainVersion` bump is reserved for structural edits;
 *   3. records ONE inverse-patch `BrushPixelCommand` into `brush.history`
 *      (the brush's OWN stack, never the shared editor history) when
 *      `trackHistory !== false` and the history is not replaying.
 *
 * ── `applyPatch` writes the cells IN THE ORDER GIVEN ──────────────────────
 * This store is the `BrushPatchHost` of every command it records.
 * `createBrushPixelCommand.undo()` already hands the cells over REVERSED so
 * that the first-recorded `before` of a cell a stroke revisited is the final
 * write; reversing here again would undo that and leave the cell painted.
 * `PixelStore.applyPatch` reverses because ITS command family does not —
 * the two hosts differ on purpose. See `BrushPatchHost.applyPatch` in
 * `../history/brushCommands.ts`.
 *
 * ── Flips are the snapshot exception ──────────────────────────────────────
 * A flip rewrites every cell, so an inverse patch would be the whole grid
 * twice. Like `PixelStore`, the two flips go through the snapshot family
 * (`brush.commit`), which is O(1) to record because brush documents are
 * immutable by contract.
 *
 * ── Boundaries ─────────────────────────────────────────────────────────────
 * `stores/domain/**` never imports `stores/ui/**`. The selection is an
 * injected {@link BrushSelectionSource}; `ApplicationStore` (task 11) passes
 * `brushUI`, whose `selectedFrameId` / `selectedLayerId` satisfy it
 * structurally.
 */
import { action, makeObservable } from "mobx";
import {
  clampDelta,
  type BrushCell,
  type BrushDocument,
  type BrushLayer,
} from "../../types";
import {
  createBrushPixelCommand,
  type BrushPatch,
  type BrushPatchHost,
  type BrushPixelTarget,
} from "../history/brushCommands";
import type { BrushStore } from "./BrushStore";

/** The UI selection this store writes into. `BrushUIStore` satisfies it. */
export interface BrushSelectionSource {
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
}

/** One cell the caller wants written. */
export interface BrushCellWrite {
  x: number;
  y: number;
  value: BrushCell;
}

/**
 * The UI values a cell write consults, passed IN — never read across the
 * store boundary.
 */
export interface BrushWriteOptions {
  /** An edit mask — packed `y * width + x`. Absent = every cell allowed. */
  mask?: ReadonlySet<number>;
  /**
   * The mask's grid dimensions. A mismatch with the target grid DISABLES
   * masking (the rule `PixelStore.allows` pins): a stale mask from another
   * size never silently blocks a stroke.
   */
  maskSize?: { width: number; height: number };
  /** `false` suppresses the history entry. Default `true`. */
  trackHistory?: boolean;
}

/**
 * A whole-layer move has no mask (a masked move is "move selection" — task
 * 21's), so only the history flag applies.
 */
export type BrushMoveOptions = Pick<BrushWriteOptions, "trackHistory">;

export interface BrushPixelStoreDeps {
  brush: BrushStore;
  source: BrushSelectionSource;
}

/** Everything a write needs to know about where it lands. */
export interface ResolvedBrushTarget {
  target: BrushPixelTarget;
  frameIndex: number;
  layerIndex: number;
  layer: BrushLayer;
  width: number;
  height: number;
}

/* ── pure helpers ────────────────────────────────────────────────────────── */

/** Structural equality of two cells (`0` vs a 4-tuple, then slot by slot). */
export function brushCellsEqual(a: BrushCell, b: BrushCell): boolean {
  if (a === 0 || b === 0) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * Copy a cell into the grid's own tuple, clamping every slot to −255..255 so
 * a caller's buffer is never shared with the document and an out-of-range
 * delta never reaches the wire format.
 */
function copyCell(cell: BrushCell): BrushCell {
  return cell === 0
    ? 0
    : [
        clampDelta(cell[0]),
        clampDelta(cell[1]),
        clampDelta(cell[2]),
        clampDelta(cell[3]),
      ];
}

/**
 * Apply patches onto a grid, copying ONLY the affected rows and returning a
 * NEW grid array (D8: a wholesale `ref` replacement, never an in-place edit).
 * Cells are written in the order given — see the module header.
 */
function writeCells(
  grid: BrushCell[][],
  cells: readonly { x: number; y: number; value: BrushCell }[],
): BrushCell[][] {
  const next = [...grid];
  const touchedRows = new Set<number>();
  for (const cell of cells) touchedRows.add(cell.y);
  for (const y of touchedRows) {
    if (grid[y]) next[y] = [...grid[y]];
  }
  for (const { x, y, value } of cells) {
    if (next[y]) next[y][x] = value;
  }
  return next;
}

/**
 * Rebuild the document spine down to ONE layer with a new grid. Every other
 * frame and layer object is reused by reference.
 */
function replaceLayerGrid(
  doc: BrushDocument,
  frameIndex: number,
  layerIndex: number,
  pixels: BrushCell[][],
): BrushDocument {
  const frame = doc.frames[frameIndex];
  const layers = [...frame.layers];
  layers[layerIndex] = { ...frame.layers[layerIndex], pixels };
  const frames = [...doc.frames];
  frames[frameIndex] = { ...frame, layers };
  return { ...doc, frames };
}

/* ── the store ───────────────────────────────────────────────────────────── */

export class BrushPixelStore implements BrushPatchHost {
  private readonly brush: BrushStore;
  private readonly source: BrushSelectionSource;

  constructor(deps: BrushPixelStoreDeps) {
    this.brush = deps.brush;
    this.source = deps.source;
    // No observable state of its own — the document lives on `BrushStore`.
    // The writers are actions so a document replace and its version bump
    // land in ONE MobX batch (one reaction run, not two).
    makeObservable(this, {
      setCells: action,
      clearCells: action,
      moveLayerCells: action,
      flipHorizontal: action,
      flipVertical: action,
      applyPatch: action,
    });
  }

  /* ── resolution ───────────────────────────────────────────────────────── */

  /**
   * The selected frame and layer in the LIVE document, or `null` when there
   * is no document or either id is unselected / stale. Ids are looked up
   * strictly — a `null` selection is "nowhere to write", not frame 0.
   */
  resolveTarget(): ResolvedBrushTarget | null {
    const doc = this.brush.document;
    if (!doc) return null;
    const { selectedFrameId, selectedLayerId } = this.source;
    if (selectedFrameId === null || selectedLayerId === null) return null;
    const frameIndex = doc.frames.findIndex((f) => f.id === selectedFrameId);
    if (frameIndex < 0) return null;
    const frame = doc.frames[frameIndex];
    const layerIndex = frame.layers.findIndex((l) => l.id === selectedLayerId);
    if (layerIndex < 0) return null;
    return {
      target: { frameId: selectedFrameId, layerId: selectedLayerId },
      frameIndex,
      layerIndex,
      layer: frame.layers[layerIndex],
      width: doc.width,
      height: doc.height,
    };
  }

  /** The selected layer's cell at `(x, y)`; `undefined` off-grid or unselected. */
  cellAt(x: number, y: number): BrushCell | undefined {
    const resolved = this.resolveTarget();
    if (!resolved) return undefined;
    return resolved.layer.pixels[y]?.[x];
  }

  /* ── writes ───────────────────────────────────────────────────────────── */

  /**
   * Write many cells as ONE history entry. Out-of-bounds cells are skipped
   * (not clamped); masked-out cells are skipped; a repeated cell keeps ONE
   * patch whose `after` is the LAST value written and whose `before` is the
   * true pre-write value; a cell whose final value equals what the grid
   * already holds is dropped. An empty result writes and records nothing.
   */
  setCells(
    writes: readonly BrushCellWrite[],
    options: BrushWriteOptions = {},
  ): void {
    const resolved = this.resolveTarget();
    if (!resolved) return;
    const { target, frameIndex, layerIndex, layer, width, height } = resolved;
    const mask = this.effectiveMask(width, height, options);

    // Insertion-ordered so the first touch of a cell fixes its position and
    // its `before`; later touches only overwrite `after`.
    const byCell = new Map<number, BrushPatch>();
    for (const { x, y, value } of writes) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const key = y * width + x;
      if (mask && !mask.has(key)) continue;
      const after = copyCell(value);
      const existing = byCell.get(key);
      if (existing) {
        existing.after = after;
      } else {
        byCell.set(key, { x, y, before: layer.pixels[y][x], after });
      }
    }

    const patches: BrushPatch[] = [];
    for (const patch of byCell.values()) {
      if (!brushCellsEqual(patch.before, patch.after)) patches.push(patch);
    }

    this.commitCells(
      target,
      frameIndex,
      layerIndex,
      layer,
      "Draw",
      patches,
      options.trackHistory ?? true,
    );
  }

  /** Erase: every listed cell becomes `0` (unpainted). Same filters as `setCells`. */
  clearCells(
    cells: readonly { x: number; y: number }[],
    options: BrushWriteOptions = {},
  ): void {
    this.setCells(
      cells.map(({ x, y }) => ({ x, y, value: 0 as const })),
      options,
    );
  }

  /**
   * Shift EVERY cell of the selected layer by `(dx, dy)`. Cells shifted off
   * the grid are dropped; vacated cells become `0`. One history entry made
   * of exactly the cells that changed — a `(0, 0)` move records nothing.
   */
  moveLayerCells(dx: number, dy: number, options: BrushMoveOptions = {}): void {
    const resolved = this.resolveTarget();
    if (!resolved) return;
    const { target, frameIndex, layerIndex, layer, width, height } = resolved;
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return;
    if (dx === 0 && dy === 0) return;

    const grid = layer.pixels;
    const patches: BrushPatch[] = [];
    for (let y = 0; y < height; y++) {
      const sy = y - dy;
      const srcRow = sy >= 0 && sy < height ? grid[sy] : undefined;
      const row = grid[y];
      for (let x = 0; x < width; x++) {
        const sx = x - dx;
        const after: BrushCell =
          srcRow && sx >= 0 && sx < width ? srcRow[sx] : 0;
        const before = row[x];
        if (!brushCellsEqual(before, after)) {
          patches.push({ x, y, before, after: copyCell(after) });
        }
      }
    }

    this.commitCells(
      target,
      frameIndex,
      layerIndex,
      layer,
      "Move layer",
      patches,
      options.trackHistory ?? true,
    );
  }

  /* ── the two flips: SNAPSHOT family ───────────────────────────────────── */

  /**
   * Mirror the selected layer left-to-right. ONE snapshot entry via
   * `brush.commit` (which also bumps `domainVersion` — the snapshot family's
   * contract, not a cell write's).
   */
  flipHorizontal(): void {
    this.flipInto("Flip horizontal", (grid) =>
      grid.map((row) => [...row].reverse()),
    );
  }

  /** Mirror the selected layer top-to-bottom. Rows are reused by reference. */
  flipVertical(): void {
    this.flipInto("Flip vertical", (grid) => [...grid].reverse());
  }

  private flipInto(
    label: string,
    flip: (grid: BrushCell[][]) => BrushCell[][],
  ): void {
    const resolved = this.resolveTarget();
    if (!resolved) return;
    const { frameIndex, layerIndex, layer } = resolved;
    this.brush.commit(
      label,
      (doc) =>
        replaceLayerGrid(doc, frameIndex, layerIndex, flip(layer.pixels)),
      { bumpPixels: true },
    );
  }

  /* ── BrushPatchHost ───────────────────────────────────────────────────── */

  /**
   * Undo/redo re-entry. Re-resolves the target by id from the LIVE document
   * (the command holds ids, never a grid reference), writes the recorded
   * side of each cell back IN THE ORDER GIVEN — the command has already
   * reversed them for `"undo"` — and bumps `pixelVersion` so the canvas
   * repaints. Never records: a replay is not an edit.
   */
  applyPatch(
    target: BrushPixelTarget,
    cells: readonly BrushPatch[],
    direction: "undo" | "redo",
  ): void {
    const doc = this.brush.document;
    if (!doc) return;
    const frameIndex = doc.frames.findIndex((f) => f.id === target.frameId);
    if (frameIndex < 0) return;
    const layerIndex = doc.frames[frameIndex].layers.findIndex(
      (l) => l.id === target.layerId,
    );
    if (layerIndex < 0) return;
    const layer = doc.frames[frameIndex].layers[layerIndex];

    const next = writeCells(
      layer.pixels,
      cells.map((c) => ({
        x: c.x,
        y: c.y,
        value: direction === "undo" ? c.before : c.after,
      })),
    );
    this.brush.adoptDocument(
      replaceLayerGrid(doc, frameIndex, layerIndex, next),
    );
    this.brush.bumpPixelVersion();
  }

  /* ── the write engine ─────────────────────────────────────────────────── */

  /**
   * The mask a write consults, or `null` when masking is off: no mask, no
   * size, or a size that disagrees with the target grid.
   */
  private effectiveMask(
    width: number,
    height: number,
    options: BrushWriteOptions,
  ): ReadonlySet<number> | null {
    const { mask, maskSize } = options;
    if (!mask || !maskSize) return null;
    if (maskSize.width !== width || maskSize.height !== height) return null;
    return mask;
  }

  /**
   * The single path every cell write funnels through: replace the grid (rows
   * touched only), install the document, record ONE inverse-patch command,
   * bump `pixelVersion` exactly once. `domainVersion` is never touched.
   */
  private commitCells(
    target: BrushPixelTarget,
    frameIndex: number,
    layerIndex: number,
    layer: BrushLayer,
    label: string,
    patches: readonly BrushPatch[],
    trackHistory: boolean,
  ): void {
    if (patches.length === 0) return;
    const doc = this.brush.document;
    if (!doc) return;

    const next = writeCells(
      layer.pixels,
      patches.map((p) => ({ x: p.x, y: p.y, value: p.after })),
    );
    this.brush.adoptDocument(
      replaceLayerGrid(doc, frameIndex, layerIndex, next),
    );

    if (trackHistory && !this.brush.history.isReplaying) {
      this.brush.history.record(
        createBrushPixelCommand({
          label,
          target,
          cells: patches,
          host: this,
        }),
      );
    }

    this.brush.bumpPixelVersion();
  }
}
