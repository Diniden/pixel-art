/**
 * brushSelection — the brush canvas's selection mask and its gesture (Brush
 * Studio plan, `docs/01-brush-studio`, task 21).
 *
 * ── Why this is NOT `SelectionUIStore` ────────────────────────────────────
 * `stores/ui/SelectionUIStore.ts` keeps the PIXEL studio's mask. Its geometry
 * helpers (`clampBoxToMask`, `computeBounds`, `pack`/`unpack`,
 * `isPointInPolygon`) are module-private (`:53-120`), and every public entry
 * (`setSelection`, `moveSelection`, `selectLasso`, …) is an `action` that
 * REPLACES `this.selection` and publishes it (`:245-251`). There is no way to
 * borrow its maths without also writing its observable — and that observable
 * is the pixel project's, sized by `ApplicationStore.selectionDims`. So the
 * brush keeps its own mask, in the container's React state, expressed in the
 * same packed `y * width + x` form `BrushPixelStore.setCells` consumes
 * (`BrushWriteOptions.mask` / `maskSize`, task 09).
 *
 * Rectangle only. Lasso is DEFERRED: the polygon test lives inside
 * `SelectionUIStore` and would have to be duplicated, not reused.
 *
 * ── The gesture commits on RELEASE, never live ────────────────────────────
 * A press INSIDE the mask opens a MOVE drag; anywhere else opens a RECT drag.
 * Both only preview while the pointer moves (`previewMove` / `previewRect`)
 * and commit ONCE when it lifts, so a move is a single `setCells` — one
 * history entry — and a StrictMode double-invoke of a render can never apply
 * it twice (nothing here runs in an effect). The pixel canvas's
 * `commitSelection` has the same shape.
 *
 * Pure: no React, no MobX, no store instance. Types only from the stores.
 */
import type { BrushCell, Point } from "../../types";
import type {
  BrushCellWrite,
  BrushWriteOptions,
} from "../../stores/domain/BrushPixelStore";
import type { SelectionBounds } from "../../ui/canvas/render/renderSelectionOverlay";

/** The undo label of one selection move — the whole drag is ONE entry. */
export const BRUSH_MOVE_SELECTION_LABEL = "Move selection";

/** The packed key `BrushPixelStore` masks by. */
export function packCell(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * The inclusive rectangle between two corners, clamped to the grid, as a
 * mask. Corners may arrive in any order and off the grid (an unbounded drag);
 * a rectangle entirely outside yields an empty mask.
 */
export function rectMask(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): Set<number> {
  const mask = new Set<number>();
  const box = rectBounds({ x: x0, y: y0 }, { x: x1, y: y1 }, width, height);
  if (!box) return mask;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      mask.add(packCell(x, y, width));
    }
  }
  return mask;
}

/**
 * The clamped inclusive box between two corners — what the rubber band shows
 * while dragging. `null` when nothing of it lies on the grid.
 */
export function rectBounds(
  a: Point,
  b: Point,
  width: number,
  height: number,
): SelectionBounds | null {
  const minX = Math.max(0, Math.min(a.x, b.x));
  const minY = Math.max(0, Math.min(a.y, b.y));
  const maxX = Math.min(width - 1, Math.max(a.x, b.x));
  const maxY = Math.min(height - 1, Math.max(a.y, b.y));
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Slide a mask by `(dx, dy)`. Cells that would leave the grid are DROPPED,
 * not clamped — the same rule `SelectionUIStore.moveSelection` and
 * `BrushPixelStore.moveLayerCells` follow, so the ants and the cells agree.
 */
export function shiftMask(
  mask: ReadonlySet<number>,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Set<number> {
  const moved = new Set<number>();
  for (const idx of mask) {
    const nx = (idx % width) + dx;
    const ny = Math.floor(idx / width) + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    moved.add(packCell(nx, ny, width));
  }
  return moved;
}

/** Unpack a mask into cell coordinates, in the mask's iteration order. */
export function maskToCells(
  mask: ReadonlySet<number>,
  width: number,
): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (const idx of mask) {
    cells.push({ x: idx % width, y: Math.floor(idx / width) });
  }
  return cells;
}

/** The bounding box of a mask; `null` for an empty one. */
export function maskBounds(
  mask: ReadonlySet<number>,
  width: number,
): SelectionBounds | null {
  if (mask.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const idx of mask) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The `BrushWriteOptions` a paint tool passes so its writes respect the
 * mask. `maskSize` is the BRUSH grid: a mask from another size disables
 * masking inside the store rather than blocking the stroke (task 09).
 */
export function brushMaskWriteOptions(
  mask: ReadonlySet<number> | null,
  width: number,
  height: number,
): BrushWriteOptions {
  return mask ? { mask, maskSize: { width, height } } : {};
}

/** The two halves of a selection move, in the order they must be applied. */
export interface BrushMoveWrites {
  /** Every source cell → `0`. */
  clears: BrushCellWrite[];
  /** Every in-bounds destination → a COPY of its source value. */
  writes: BrushCellWrite[];
}

/**
 * The writes that move the masked cells by `(dx, dy)`: every source cell is
 * CLEARED, then every in-bounds destination receives a COPY of its source
 * value (an unpainted source clears its destination, as a real move would).
 * Clears apply first so a destination that is also a source ends up holding
 * the moved value.
 *
 * Two lists rather than one so the container can issue them as TWO
 * `setCells` inside ONE transaction: a brush `HistoryStore` has no patch
 * host, so two commands collapse to a composite that carries the
 * transaction's label (`BRUSH_MOVE_SELECTION_LABEL`), whereas a lone command
 * keeps its own ("Draw"). Either way it is one undo entry.
 */
export function moveMaskWrites(
  grid: readonly (readonly BrushCell[])[],
  mask: ReadonlySet<number>,
  dx: number,
  dy: number,
  width: number,
  height: number,
): BrushMoveWrites {
  const clears: BrushCellWrite[] = [];
  const writes: BrushCellWrite[] = [];
  if (dx === 0 && dy === 0) return { clears, writes };
  for (const { x, y } of maskToCells(mask, width)) {
    clears.push({ x, y, value: 0 });
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const cell = grid[y]?.[x] ?? 0;
    writes.push({
      x: nx,
      y: ny,
      value: cell === 0 ? 0 : [cell[0], cell[1], cell[2], cell[3]],
    });
  }
  return { clears, writes };
}

/* ── the gesture ──────────────────────────────────────────────────────────── */

/** The drag vector of an open move, in cells. */
export interface MoveOffset {
  dx: number;
  dy: number;
}

/** What the controller reaches into — the container wires the state. */
export interface BrushSelectionHost {
  /** The grid extent, read at press time. */
  size: () => { width: number; height: number };
  /** The LIVE mask, read at press time; `null` when there is none. */
  mask: () => ReadonlySet<number> | null;
  /**
   * Opens the drawing gesture (`canvasInteraction.startDrawing`) so the same
   * release path that ends a stroke — window `mouseup`, touch end, pinch
   * abort — reaches {@link BrushSelectionController.end}.
   */
  beginGesture: (coords: Point) => void;
  /** The rubber band while a rect drag is open; `null` clears it. */
  previewRect: (box: SelectionBounds | null) => void;
  /** The drag vector while a move is open; `null` clears it. */
  previewMove: (offset: MoveOffset | null) => void;
  /** Release of a rect drag: the new mask (empty = no selection). */
  commitRect: (mask: Set<number>) => void;
  /** Release of a move with a non-zero vector: the container writes ONCE. */
  commitMove: (dx: number, dy: number) => void;
}

export interface BrushSelectionController {
  /** Pointer-down. Always consumed: a press opens a rect drag or a move. */
  down: (coords: Point) => void;
  /**
   * Pointer-move while open. `null` (off-grid in a bounded mapping) applies
   * nothing. Only previews — nothing is written until `end`.
   */
  move: (coords: Point | null) => void;
  /**
   * Release. `commit: false` ABANDONS the gesture (a pinch, a cancel) — the
   * preview is dropped and nothing is written or selected.
   */
  end: (commit?: boolean) => void;
  /** True between `down` and `end`. */
  readonly isActive: boolean;
}

type Gesture =
  | { kind: "rect"; start: Point; last: Point }
  | { kind: "move"; anchor: Point; dx: number; dy: number };

/**
 * The rect / move state machine. The only state is the open gesture; every
 * effect goes through `host`. A press inside the current mask moves it;
 * anywhere else starts a new rectangle (replacing the mask on release, or —
 * when the rectangle lies entirely off the grid — clearing it).
 */
export function createBrushSelectionController(
  host: BrushSelectionHost,
): BrushSelectionController {
  let gesture: Gesture | null = null;
  return {
    down(coords) {
      const { width, height } = host.size();
      const mask = host.mask();
      const inside =
        mask !== null &&
        coords.x >= 0 &&
        coords.x < width &&
        coords.y >= 0 &&
        coords.y < height &&
        mask.has(packCell(coords.x, coords.y, width));
      const point = { x: coords.x, y: coords.y };
      host.beginGesture(point);
      if (inside) {
        gesture = { kind: "move", anchor: point, dx: 0, dy: 0 };
        host.previewMove({ dx: 0, dy: 0 });
      } else {
        gesture = { kind: "rect", start: point, last: point };
        host.previewRect(rectBounds(point, point, width, height));
      }
    },
    move(coords) {
      if (!gesture || !coords) return;
      if (gesture.kind === "move") {
        const dx = coords.x - gesture.anchor.x;
        const dy = coords.y - gesture.anchor.y;
        if (dx === gesture.dx && dy === gesture.dy) return;
        gesture.dx = dx;
        gesture.dy = dy;
        host.previewMove({ dx, dy });
        return;
      }
      if (coords.x === gesture.last.x && coords.y === gesture.last.y) return;
      gesture.last = { x: coords.x, y: coords.y };
      const { width, height } = host.size();
      host.previewRect(rectBounds(gesture.start, gesture.last, width, height));
    },
    end(commit = true) {
      const open = gesture;
      gesture = null;
      if (!open) return;
      if (open.kind === "move") {
        host.previewMove(null);
        if (commit && (open.dx !== 0 || open.dy !== 0)) {
          host.commitMove(open.dx, open.dy);
        }
        return;
      }
      host.previewRect(null);
      if (!commit) return;
      const { width, height } = host.size();
      const { start, last } = open;
      host.commitRect(
        rectMask(start.x, start.y, last.x, last.y, width, height),
      );
    },
    get isActive() {
      return gesture !== null;
    },
  };
}
