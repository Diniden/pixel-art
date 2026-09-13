/**
 * Brush history commands (Brush Studio plan, `docs/01-brush-studio`, task 07;
 * MASTER D9).
 *
 * The brush-specific twins of `./commands.ts`'s two families. They exist
 * because `createSnapshotCommand` / `createPixelCommand` are typed to the
 * pixel `Project` and pack `PixelData` cells; a brush document is a separate
 * type family (`types/brush.ts`) with `BrushCell` deltas, so neither can be
 * reused. Both families record ONLY into `BrushStore`'s own `HistoryStore`
 * instance — never the shared `editorHistory` (MASTER §8, mistake 2).
 *
 * ── Snapshots are held BY REFERENCE, never cloned ─────────────────────────
 * `createSnapshotCommand` clones its `before` through a serializer round
 * trip because the legacy pixel tree was mutated in place. A brush document
 * is IMMUTABLE by contract (MASTER D8: every mutation replaces the document
 * — spine copy, touched rows only — and `BrushStore.document` is
 * `observable.ref`). A retained reference can therefore never be corrupted by
 * a later edit, and the snapshot family is O(1) to record. Anything that
 * mutates a brush document in place breaks this contract AND the
 * `observable.ref` redraw contract at the same time; it is the one thing a
 * brush behaviour store must never do.
 *
 * ── The grid is never walked, never proxied ────────────────────────────────
 * `estimateBrushBytes` is O(frames × layers) from `width × height`. A pixel
 * command holds copied `BrushCell` VALUES addressed by `(frameId, layerId)`,
 * never a grid reference — so history can neither pin a grid alive nor see
 * inside one.
 */
import type { BrushCell, BrushDocument } from "../../types";
import type { Command } from "./commands";

/* ══════════════════════════════════════════════════════════════════════════
 *  THE SNAPSHOT FAMILY — structural ops (add/delete layer or frame, swap,
 *  channel type, applied groups, …)
 * ══════════════════════════════════════════════════════════════════════════ */

/** How a snapshot command reaches the live brush document. */
export interface BrushSnapshotHost {
  /** The live document, or `null` when none is loaded. */
  current(): BrushDocument | null;
  /**
   * Install a restored document as the live one. `BrushStore` implements
   * this as `replaceDocument(doc, { bumpPixels: true })` so the canvas
   * redraws after an undo/redo.
   */
  restore(doc: BrushDocument): void;
}

/** Per-cell estimate: a `[n,n,n,n]` tuple ≈ 4 slots + header, amortised. */
const BYTES_PER_BRUSH_CELL = 10;
/** Fixed overhead per snapshot: the document spine plus the command itself. */
const BYTES_SNAPSHOT_BASE = 256;

/**
 * Cheap structural size estimate for the byte budget. O(frames × layers)
 * from the document's `width × height` — NEVER walks cells.
 */
export function estimateBrushBytes(doc: BrushDocument): number {
  const cellsPerLayer = doc.width * doc.height;
  let layers = 0;
  for (const frame of doc.frames) layers += frame.layers.length;
  return layers * cellsPerLayer * BYTES_PER_BRUSH_CELL + BYTES_SNAPSHOT_BASE;
}

export interface BrushSnapshotCommandOptions {
  label: string;
  /** The pre-mutation document, retained by reference (see the header). */
  before: BrushDocument;
  host: BrushSnapshotHost;
}

export interface BrushSnapshotCommand extends Command {
  readonly kind: "brush-snapshot";
  /** The pre-mutation document — the state `undo()` returns to. */
  readonly before: BrushDocument;
}

/**
 * The whole-document snapshot command.
 *
 * `undo()` captures the CURRENT live document as the redo target on the first
 * undo (later undos of the same entry can only ever see that same document
 * again — the redo tail is truncated by the next `record()`, and documents
 * are immutable), then restores `before`. `redo()` restores the captured
 * post-state; it is unreachable before the first `undo()` by `HistoryStore`'s
 * index discipline, and defensively a no-op if that ever changes.
 */
export function createBrushSnapshotCommand(
  options: BrushSnapshotCommandOptions,
): BrushSnapshotCommand {
  const { label, before, host } = options;
  let after: BrushDocument | null = null;

  return {
    kind: "brush-snapshot",
    label,
    bytes: estimateBrushBytes(before),
    before,
    undo() {
      if (after === null) after = host.current();
      host.restore(before);
    },
    redo() {
      if (after !== null) host.restore(after);
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  THE INVERSE-PATCH FAMILY — pixel writes
 * ══════════════════════════════════════════════════════════════════════════ */

/** One changed cell. `before` is what `undo()` restores, `after` what `redo()` re-applies. */
export interface BrushPatch {
  x: number;
  y: number;
  before: BrushCell;
  after: BrushCell;
}

/**
 * Where a patch applies. Addressed by id (MASTER D6: layer ids are stable
 * across frames), never by grid reference.
 */
export interface BrushPixelTarget {
  frameId: string;
  layerId: string;
}

/** How a pixel command reaches the live grid — implemented by `BrushPixelStore` (task 09). */
export interface BrushPatchHost {
  /**
   * Write `cells` to the addressed grid, taking each cell's `before` for
   * `"undo"` and `after` for `"redo"`.
   *
   * ⚠️ THE CELLS ARRIVE ALREADY ORDERED FOR THE DIRECTION. The command
   * reverses them for `"undo"` (see {@link createBrushPixelCommand}), so the
   * host must write them IN THE ORDER GIVEN and must not reverse again — a
   * double reversal would let an intermediate `before` win for a cell a
   * stroke revisited, leaving it painted after undo. The host replaces the
   * touched rows and the grid wholesale (D8) and bumps `pixelVersion`.
   */
  applyPatch(
    target: BrushPixelTarget,
    cells: readonly BrushPatch[],
    direction: "undo" | "redo",
  ): void;
}

export interface BrushPixelCommandOptions {
  label: string;
  target: BrushPixelTarget;
  cells: readonly BrushPatch[];
  host: BrushPatchHost;
}

export interface BrushPixelCommand extends Command {
  readonly kind: "brush-pixel";
  readonly target: BrushPixelTarget;
  readonly cells: readonly BrushPatch[];
}

/** Type guard for the pixel family (a composite may mix both families). */
export function isBrushPixelCommand(
  command: Command,
): command is BrushPixelCommand {
  return (command as BrushPixelCommand).kind === "brush-pixel";
}

/** `{x, y, before, after}` + two 4-tuples, standard object accounting. */
const BYTES_PER_PATCH = 40;
/** Fixed overhead per pixel command: the ids, the label and the array. */
const BYTES_PATCH_BASE = 128;

/** Copy a cell so a command never shares a tuple with a caller's buffer. */
function cloneCell(cell: BrushCell): BrushCell {
  return cell === 0 ? 0 : [cell[0], cell[1], cell[2], cell[3]];
}

/**
 * The inverse-patch command for brush pixel writes.
 *
 * `undo()` hands the host the cells REVERSED with `"undo"`; `redo()` hands
 * them forward with `"redo"` — mirroring `PixelStore.applyPatch`'s ordering
 * rule: a stroke that revisits a cell records several patches for it, and
 * only a reverse walk lets the FIRST recorded `before` (the true pre-stroke
 * value) be the final write. Both are O(changed cells), never O(grid).
 *
 * The cells are copied at construction, so a caller may keep mutating its
 * working buffer during a stroke.
 */
export function createBrushPixelCommand(
  options: BrushPixelCommandOptions,
): BrushPixelCommand {
  const { label, target, host } = options;
  const cells: readonly BrushPatch[] = options.cells.map((c) => ({
    x: c.x,
    y: c.y,
    before: cloneCell(c.before),
    after: cloneCell(c.after),
  }));

  return {
    kind: "brush-pixel",
    label,
    bytes: BYTES_PATCH_BASE + cells.length * BYTES_PER_PATCH,
    target,
    cells,
    undo() {
      host.applyPatch(target, [...cells].reverse(), "undo");
    },
    redo() {
      host.applyPatch(target, cells, "redo");
    },
  };
}
