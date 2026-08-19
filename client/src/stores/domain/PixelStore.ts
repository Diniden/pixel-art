/**
 * PixelStore — THE SOLE WRITER OF PIXEL GRIDS (REFRESH task 26).
 *
 * This is the hot path. Every pixel that changes in the application changes
 * here, and the two rules below are what keep the editor fast and the undo
 * stack small enough to exist.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  R2 — `layer.pixels` IS `observableRef`, ALWAYS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The owner's real project holds **300,249 `PixelData` cells**. MobX's default
 * `observable` is DEEP, so one wrong annotation builds ~1M proxies and the
 * symptom presents as "MobX is slow" rather than as the modelling error it is.
 *
 * Every write in this file therefore:
 *
 *   1. copies ONLY the affected rows (`[...grid]`, then `[...grid[y]]` per
 *      touched row) — never the whole grid, never `structuredClone`;
 *   2. assigns the new grid WHOLESALE onto the layer, so MobX observes a new
 *      array IDENTITY and never looks inside it;
 *   3. ends with `domain.bumpPixelVersion()`.
 *
 * Step 3 is not bookkeeping. Canvases are imperative renderers driven by a
 * `reaction` on `pixelVersion`, and `AutoSaveController`'s trigger reads it —
 * a missed bump is a stale canvas, and a missed bump on the save trigger is
 * SILENT DATA LOSS. `bumpPixelVersion()` fires exactly once per write action
 * (not once per pixel), which is what the `PixelStore` suite pins.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BOUNDARY IS ONE-DIRECTIONAL: MASK/BEHAVIOUR/VARIANT ARE ARGUMENTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Three UI values gate domain writes and are consulted on EVERY
 * `setPixel`/`setPixels`:
 *
 *   - `selection.mask` (a `Set<number>`) and `selectionBehavior` — the legacy
 *     `drawingActions.ts:11-24` (`isEditMaskActiveFor`) consulted them on
 *     every call when `selectionBehavior === "editMask"`;
 *   - `variantFrameIndices` — read in 6 modules' pixel-write paths.
 *
 * They arrive as ARGUMENTS ({@link PixelWriteOptions}), never as a cross-store
 * read. `stores/domain/**` may not import `stores/ui/**` at all — task 05's
 * ESLint rule enforces it mechanically, so a violation fails lint rather than
 * being discovered as a cycle at runtime.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  INVERSE PATCHES, NOT SNAPSHOTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Each action collects the cells it actually changed and records ONE
 * {@link createPixelCommand} of ~24 B/cell instead of a 6.9 MB project clone.
 * During a stroke transaction those per-move commands buffer into the open
 * transaction and `endStroke` collapses them into a single `CompositeCommand`
 * — one drag stays exactly one undo entry, the invariant task 08 pins.
 *
 * ── Ported behaviour, deliberately unchanged ──────────────────────────────
 *
 * The legacy no-op guards are preserved exactly, because they are observable:
 * a `setPixel` whose colour already matches records NOTHING (no history entry,
 * no save). `setPixels` filters out-of-bounds and mask-excluded cells before
 * deciding whether there is anything to do at all.
 */
import { runInAction } from "mobx";
import type { Color, Layer, PixelData, Project } from "../../types";
import { createPixelCommand } from "../history/commands";
import type {
  PixelPatch,
  PixelPatchHost,
  PixelTarget,
} from "../history/commands";
import type { HistoryStore } from "../history/HistoryStore";
import type { DomainStore } from "./DomainStore";

/** The empty cell. Matches `selectionActions.ts`'s `EMPTY` exactly. */
const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };

/**
 * The UI values a pixel write consults, passed IN. Never read across the
 * store boundary — see the module header.
 */
export interface PixelWriteOptions {
  /** `selection.mask` — packed `y * width + x`. */
  mask?: ReadonlySet<number>;
  /** The mask's grid dimensions; a mismatch disables masking (legacy rule). */
  maskSize?: { width: number; height: number };
  /** `uiState.selectionBehavior`. Only `"editMask"` gates writes. */
  behavior?: string;
  /** `uiState.variantFrameIndices[variantGroupId]` for the active group. */
  variantFrameIndex?: number;
  /** `false` suppresses the history entry (the `trackHistory` parameter). */
  trackHistory?: boolean;
}

/** One cell the caller wants written. */
export interface PixelWrite {
  x: number;
  y: number;
  color: Color | 0;
}

/**
 * How `PixelStore` publishes a committed tree to the bridge-era Zustand
 * mirror. Injected for the same reason `DomainMutator` injects one: the
 * domain layer may not import the legacy store.
 */
export interface PixelMirror {
  /** Push the recombined project into Zustand (Phase B, by reference). */
  publish(project: Project): void;
  /**
   * Re-publish the `projectHistory`/`historyIndex` Phase B mirror after this
   * store has recorded a command.
   *
   * ⚠️ REQUIRED, not optional bookkeeping. `HistoryStore` is the source of
   * truth for undo, but the legacy `projectHistory` array is a MIRROR written
   * by exactly one writer — the glue in `store/index.ts` (R6, task 17). A
   * `record()` that skips this leaves the mirror stale, so undo works while
   * every consumer reading `projectHistory` disagrees about the depth.
   * Measured directly: without it, `getHistoryLength()` stays 0 after a real
   * edit and 21 task-08 tests fail.
   */
  syncHistory(): void;
  /**
   * Adopt an external write to the legacy mirror back into `HistoryStore`
   * BEFORE this store records. The task 08 harness writes `projectHistory`
   * directly in `load()`/`reset()`, so a store that skips this records onto a
   * stale stack — measured as an off-by-one entry count that appeared only
   * when a whole suite file ran, never in isolation.
   */
  reconcile(): void;
}

/**
 * The selection/target context a write needs, supplied as READS. Structurally
 * identical to `LayerStore`'s `LayerSelectionSource` — the same one-way seam.
 */
export interface PixelSelectionSource {
  readonly selectedObjectId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
  readonly variantFrameIndices: { [variantGroupId: string]: number };
}

export interface PixelStoreDeps {
  domain: DomainStore;
  history: HistoryStore;
  mirror: PixelMirror;
  source: PixelSelectionSource;
}

/** Are two colours the same? The legacy comparison, field by field. */
function sameColor(a: Color | 0 | undefined, b: Color | 0 | undefined) {
  if (a === 0 || a === undefined) return b === 0 || b === undefined;
  if (b === 0 || b === undefined) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/** Copy one cell out of a grid, so a patch never aliases live data. */
function copyCell(pd: PixelData | undefined): PixelData {
  if (!pd) return { ...EMPTY };
  return {
    color:
      pd.color === 0
        ? 0
        : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
    normal:
      pd.normal === 0
        ? 0
        : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
    height: pd.height,
  } as PixelData;
}

/**
 * Build the cell a draw produces, preserving normal/height exactly as the
 * legacy path did: erasing clears everything; drawing keeps the existing
 * normal and height, defaulting height to 1 on a previously-empty cell.
 */
function nextCell(existing: PixelData | undefined, color: Color | 0): PixelData {
  if (color === 0) return { color: 0, normal: 0, height: 0 };
  return {
    color,
    normal: existing?.normal ?? 0,
    height: existing?.height ?? 1,
  };
}

/**
 * Apply patches onto a grid, copying ONLY the affected rows and returning a
 * NEW grid array (R2: a wholesale `ref` replacement, never an in-place edit).
 */
function writeCells(
  grid: PixelData[][],
  cells: readonly { x: number; y: number; value: PixelData }[],
): PixelData[][] {
  const next = [...grid];
  const touchedRows = new Set(cells.map((c) => c.y));
  for (const y of touchedRows) {
    if (grid[y]) next[y] = [...grid[y]];
  }
  for (const { x, y, value } of cells) {
    if (next[y]) next[y][x] = value;
  }
  return next;
}

export class PixelStore {
  private readonly domain: DomainStore;
  private readonly history: HistoryStore;
  private readonly mirror: PixelMirror;
  private readonly source: PixelSelectionSource;

  /**
   * The patch host. Undo/redo re-enter here, write the recorded cells back,
   * and go through the same publish + bump path a live edit does.
   */
  private readonly patchHost: PixelPatchHost;

  constructor(deps: PixelStoreDeps) {
    this.domain = deps.domain;
    this.history = deps.history;
    this.mirror = deps.mirror;
    this.source = deps.source;
    this.patchHost = {
      applyPatch: (target, cells, direction) => {
        this.applyPatch(target, cells, direction);
      },
    };
    // Task 26: `HistoryStore` needs this host to rebuild a COALESCED pixel
    // command when a stroke transaction collapses (see
    // `coalescePixelCommands`). `PixelStore` is the only producer of the
    // family, so it is the only sensible injector.
    this.history.setPatchHost(this.patchHost);
  }

  /* ── resolution ────────────────────────────────────────────────────────── */

  /**
   * Resolve where a write lands: the selected layer, or the variant layer
   * when the selected layer is a variant layer. Returns `null` when anything
   * in the chain is missing — every legacy action bailed out silently in that
   * case and that is preserved.
   */
  private resolveTarget(
    variantFrameIndexOverride?: number,
  ): { target: PixelTarget; layer: Layer; width: number; height: number } | null {
    const objectId = this.source.selectedObjectId;
    const frameId = this.source.selectedFrameId;
    const layerId = this.source.selectedLayerId;
    if (!objectId || !frameId || !layerId) return null;

    const object = this.domain.objects.find((o) => o.id === objectId);
    if (!object) return null;
    const frame = object.frames.find((f) => f.id === frameId);
    if (!frame) return null;
    const layer = frame.layers.find((l) => l.id === layerId);
    if (!layer) return null;

    // ── the variant branch ────────────────────────────────────────────────
    if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
      const group = this.domain.variants.find(
        (vg) => vg.id === layer.variantGroupId,
      );
      if (!group) return null;
      const variant = group.variants.find(
        (v) => v.id === layer.selectedVariantId,
      );
      if (!variant || variant.frames.length === 0) return null;

      const rawIndex =
        variantFrameIndexOverride ??
        this.source.variantFrameIndices?.[group.id] ??
        0;
      const frameIndex = rawIndex % variant.frames.length;
      const variantFrame = variant.frames[frameIndex];
      const variantLayer = variantFrame?.layers[0];
      if (!variantLayer) return null;

      return {
        target: {
          objectId,
          frameId,
          layerId,
          variant: {
            variantGroupId: group.id,
            variantId: variant.id,
            frameIndex,
          },
        },
        layer: variantLayer,
        width: variant.gridSize.width,
        height: variant.gridSize.height,
      };
    }

    return {
      target: { objectId, frameId, layerId },
      layer,
      width: object.gridSize.width,
      height: object.gridSize.height,
    };
  }

  /**
   * The edit-mask gate, ported verbatim from `drawingActions.ts:11-24`.
   * Returns true when the write is ALLOWED.
   *
   * Note the three legacy escape hatches, all preserved: a behaviour other
   * than `"editMask"` allows everything; no mask allows everything; and a
   * mask whose dimensions disagree with the target grid allows everything.
   */
  private allows(
    x: number,
    y: number,
    width: number,
    height: number,
    options: PixelWriteOptions,
  ): boolean {
    if ((options.behavior ?? "movePixels") !== "editMask") return true;
    const mask = options.mask;
    if (!mask) return true;
    const size = options.maskSize;
    if (!size || size.width !== width || size.height !== height) return true;
    return mask.has(y * width + x);
  }

  /* ── the write engine ──────────────────────────────────────────────────── */

  /**
   * The single path every action funnels through: replace the grid wholesale,
   * record ONE inverse-patch command, publish, and bump `pixelVersion` exactly
   * once.
   *
   * ⚠️ ORDER MATTERS. The command is recorded BEFORE the tree changes only in
   * the sense that its `before` cells are read off the live grid first; the
   * record itself happens after the write so a failed write records nothing.
   */
  private commitCells(
    target: PixelTarget,
    layer: Layer,
    label: string,
    patches: readonly PixelPatch[],
    trackHistory: boolean,
  ): void {
    if (patches.length === 0) return;

    this.writeGrid(
      target,
      writeCells(
        layer.pixels,
        patches.map((p) => ({ x: p.x, y: p.y, value: p.after })),
      ),
    );

    if (trackHistory) {
      // Adopt any external write to the legacy mirror first — see
      // `PixelMirror.reconcile`.
      this.mirror.reconcile();
      this.history.record(
        createPixelCommand({
          label,
          target,
          cells: patches,
          host: this.patchHost,
        }),
      );
    }

    this.publishAndBump();
    // AFTER the publish: the mirror reconstructs each entry's pre-state by
    // rewinding from the LIVE project, so it must see the post-write tree.
    if (trackHistory) this.mirror.syncHistory();
  }

  /**
   * Install a new grid onto the addressed layer. Rebuilds only the spine of
   * the tree down to that layer — every other object/frame/layer keeps its
   * identity, and no grid other than the target is even referenced.
   */
  private writeGrid(target: PixelTarget, grid: PixelData[][]): void {
    runInAction(() => this.writeGridInAction(target, grid));
  }

  /** The actual tree write. Always called inside an action (see above). */
  private writeGridInAction(target: PixelTarget, grid: PixelData[][]): void {
    if (target.variant) {
      const { variantGroupId, variantId, frameIndex } = target.variant;
      this.domain.variants = this.domain.variants.map((vg) => {
        if (vg.id !== variantGroupId) return vg;
        return {
          ...vg,
          variants: vg.variants.map((v) => {
            if (v.id !== variantId) return v;
            return {
              ...v,
              frames: v.frames.map((f, idx) => {
                if (idx !== frameIndex) return f;
                return {
                  ...f,
                  layers: f.layers.map((l, li) =>
                    li === 0 ? { ...l, pixels: grid } : l,
                  ),
                };
              }),
            };
          }),
        };
      });
      return;
    }

    this.domain.objects = this.domain.objects.map((o) => {
      if (o.id !== target.objectId) return o;
      return {
        ...o,
        frames: o.frames.map((f) => {
          if (f.id !== target.frameId) return f;
          return {
            ...f,
            layers: f.layers.map((l) =>
              l.id === target.layerId ? { ...l, pixels: grid } : l,
            ),
          };
        }),
      };
    });
  }

  /**
   * Mirror out to the bridge, then trip the save trigger. Exactly once per
   * write action — not once per pixel.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THE BUMP IS GATED ON `isReplaying` — THE NO-SAVE-ON-UNDO MECHANISM
   * ══════════════════════════════════════════════════════════════════════
   *
   * `AutoSaveController`'s trigger observes `pixelVersion`, so an unguarded
   * bump here makes UNDO schedule a save. That is the exact behaviour the
   * owner decided against on 2026-08-16 and task 17 implemented: a replay
   * NEVER saves; the next real edit does.
   *
   * The bridge already gates its `domainVersion` bump the same way, but this
   * store bumps `pixelVersion` DIRECTLY — it is the first production caller
   * of `bumpPixelVersion()` — so it needs its own guard. Measured: without
   * it, `autoSave.test.ts:225` ("FLIPPED (task 17): undo schedules NO save")
   * fails, which is the regression this comment exists to prevent.
   *
   * The tree is still PUBLISHED during a replay — the undone pixels must
   * reach the canvas — only the save trigger is suppressed.
   */
  private publishAndBump(): void {
    const project = this.domain.currentProject();
    if (project) this.mirror.publish(project);
    if (this.history.isReplaying) return;
    runInAction(() => this.domain.bumpPixelVersion());
  }

  /**
   * Undo/redo re-entry. Re-resolves the target from the CURRENT tree (the
   * command holds ids, never a grid reference) and writes the recorded side
   * of each cell back.
   */
  private applyPatch(
    target: PixelTarget,
    cells: readonly PixelPatch[],
    direction: "undo" | "redo",
  ): void {
    const layer = this.findLayer(target);
    if (!layer) return;
    // ⚠️ UNDO APPLIES IN REVERSE ORDER — and this is load-bearing.
    //
    // A coalesced command (see `coalescePixelCommands`) may hold SEVERAL
    // writes to the same cell, because a pencil drag revisits pixels. Applied
    // forwards, undo would let the LAST recorded `before` win — an
    // intermediate painted value — instead of the FIRST, which is the true
    // pre-stroke state.
    //
    // Reversing makes the earliest `before` the final write, exactly as
    // replaying the un-merged child commands in reverse would. Measured: a
    // 50-move drag over a 4×4 grid left all 16 cells painted after undo until
    // this was reversed (`historyIntegration.test.ts:138`).
    //
    // `redo` stays FORWARD: there the LAST `after` is correct.
    const ordered = direction === "undo" ? [...cells].reverse() : cells;
    this.writeGrid(
      target,
      writeCells(
        layer.pixels,
        ordered.map((c) => ({
          x: c.x,
          y: c.y,
          value: direction === "undo" ? c.before : c.after,
        })),
      ),
    );
    this.publishAndBump();
  }

  /** Locate a patch target's layer in the live tree, or `null` if it is gone. */
  private findLayer(target: PixelTarget): Layer | null {
    if (target.variant) {
      const { variantGroupId, variantId, frameIndex } = target.variant;
      const group = this.domain.variants.find((vg) => vg.id === variantGroupId);
      const variant = group?.variants.find((v) => v.id === variantId);
      return variant?.frames[frameIndex]?.layers[0] ?? null;
    }
    const object = this.domain.objects.find((o) => o.id === target.objectId);
    const frame = object?.frames.find((f) => f.id === target.frameId);
    return frame?.layers.find((l) => l.id === target.layerId) ?? null;
  }

  /* ══ ACTIONS ═══════════════════════════════════════════════════════════ */

  /**
   * Write one cell. A no-op — recording NOTHING — when the colour already
   * matches, when the point is out of bounds, or when the edit mask excludes
   * it. All three are legacy behaviours the drawing suite pins.
   */
  setPixel(
    x: number,
    y: number,
    color: Color | 0,
    options: PixelWriteOptions = {},
  ): void {
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    if (x < 0 || x >= width || y < 0 || y >= height) return;
    if (!this.allows(x, y, width, height, options)) return;

    const existing = layer.pixels[y]?.[x];
    if (sameColor(existing?.color, color === 0 ? 0 : color)) return;

    const patch: PixelPatch = {
      x,
      y,
      before: copyCell(existing),
      after: nextCell(existing, color),
    };
    this.commitCells(
      target,
      layer,
      "Draw",
      [patch],
      options.trackHistory ?? true,
    );
  }

  /**
   * Write many cells as ONE history entry. The bulk path every shape tool,
   * flood fill and brush > 1 uses.
   */
  setPixels(
    pixels: readonly PixelWrite[],
    options: PixelWriteOptions = {},
  ): void {
    if (pixels.length === 0) return;
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    const patches: PixelPatch[] = [];
    // Later writes to the same cell win, and only ONE patch is recorded for
    // it — otherwise undo would restore an intermediate value.
    const seen = new Map<number, number>();
    for (const { x, y, color } of pixels) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (!this.allows(x, y, width, height, options)) continue;

      const key = y * width + x;
      const already = seen.get(key);
      if (already !== undefined) {
        const patch = patches[already];
        patch.after = nextCell(patch.before, color);
        continue;
      }
      const existing = layer.pixels[y]?.[x];
      seen.set(key, patches.length);
      patches.push({
        x,
        y,
        before: copyCell(existing),
        after: nextCell(existing, color),
      });
    }

    // ⚠️ NO same-colour filter here. `setPixel` has an explicit "already this
    // colour" early return; `setPixels` NEVER had one, so a redundant batch
    // still records an entry. Pinned by task 08 as observed behaviour
    // ("OBSERVED: unlike setPixel, it does NOT skip same-colour writes") and
    // deliberately NOT unified — fixing the asymmetry is a behaviour change
    // that needs its own task and owner sign-off.
    this.commitCells(
      target,
      layer,
      "Draw",
      patches,
      options.trackHistory ?? true,
    );
  }

  /**
   * Clear every selected cell. `mask` and its dimensions are REQUIRED — this
   * action is meaningless without a selection, and the legacy code bailed out
   * when the mask's size disagreed with the grid.
   */
  deleteSelectionPixels(options: PixelWriteOptions = {}): void {
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    const mask = options.mask;
    const size = options.maskSize;
    if (!mask || !size) return;
    if (size.width !== width || size.height !== height) return;

    const patches: PixelPatch[] = [];
    for (const idx of mask) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      patches.push({
        x,
        y,
        before: copyCell(layer.pixels[y]?.[x]),
        after: { ...EMPTY },
      });
    }

    this.commitCells(
      target,
      layer,
      "Delete selection",
      patches,
      options.trackHistory ?? true,
    );
  }

  /**
   * Move the selected pixels by (dx, dy): clear the source cells, then paste
   * them at the destination — the legacy two-pass order, which matters where
   * source and destination overlap (the destination write wins).
   *
   * Moving the selection MASK is the caller's job (`SelectionUIStore`
   * `moveSelection`) — this store writes pixels only.
   */
  moveSelectedPixels(
    dx: number,
    dy: number,
    options: PixelWriteOptions = {},
  ): void {
    if (dx === 0 && dy === 0) return;
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    const mask = options.mask;
    const size = options.maskSize;
    if (!mask || !size) return;
    if (size.width !== width || size.height !== height) return;

    // The final value of every cell this move touches, source and
    // destination alike, computed against the ORIGINAL grid.
    const result = new Map<number, PixelData>();
    const inBounds = (x: number, y: number) =>
      x >= 0 && x < width && y >= 0 && y < height;

    for (const idx of mask) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (inBounds(x, y)) result.set(idx, { ...EMPTY });
    }
    for (const idx of mask) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      const destX = x + dx;
      const destY = y + dy;
      if (!inBounds(x, y) || !inBounds(destX, destY)) continue;
      result.set(destY * width + destX, copyCell(layer.pixels[y]?.[x]));
    }

    const patches: PixelPatch[] = [];
    for (const [idx, value] of result) {
      const x = idx % width;
      const y = Math.floor(idx / width);
      const before = copyCell(layer.pixels[y]?.[x]);
      patches.push({ x, y, before, after: value });
    }

    this.commitCells(
      target,
      layer,
      "Move selection",
      patches,
      options.trackHistory ?? true,
    );
  }

  /**
   * Recolour a set of already-located cells (the colour-adjustment slider).
   *
   * ⚠️ `trackHistory` is passed THROUGH from the caller and defaults to
   * FALSE here — `ColorPicker.tsx` passes `true` only on debounce settle, so
   * dragging the slider produces one history entry, not one per frame. That
   * timing is a pinned behaviour ("the 5th trackHistory semantic",
   * `history.test.ts:439`) and must not change.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ NOT YET WIRED — `store/colorAdjustmentActions.ts` IS STILL LIVE
   * ══════════════════════════════════════════════════════════════════════
   *
   * This action is implemented and tested, but the legacy Zustand
   * `adjustColor` was deliberately NOT replaced by a bridge delegate, unlike
   * the other four pixel actions. Two reasons, both measured:
   *
   *  1. **`allFrames` mode is a MULTI-TARGET write.** It recolours matching
   *     pixels across every frame AND every same-named layer at once
   *     (`colorAdjustmentActions.ts:207-442`, driven by
   *     `colorAdjustment.affectedPixelsByFrame`, a
   *     `Map<frameKey, Map<layerId, {x,y}[]>>`). Every action on this store
   *     writes ONE target, resolved from the current selection. Expressing
   *     the all-frames case needs either a multi-target action or one command
   *     per layer collapsed into a transaction — a different shape from the
   *     four actions here, not a wiring change.
   *
   *  2. **It also writes `uiState.selectedColor`** in the same commit, which
   *     is a UI field this store must not touch.
   *
   * The single-target path above is correct and covers the common case; it is
   * left ready for the task that migrates `ColorPicker` and the
   * colour-adjustment lifecycle (`startColorAdjustment` /
   * `clearColorAdjustment` are UI state and belong with it). Wiring only the
   * single-frame branch would have given `adjustColor` TWO implementations
   * with different capabilities — exactly what R6 forbids.
   */
  adjustColor(
    cells: readonly { x: number; y: number }[],
    newColor: Color,
    options: PixelWriteOptions = {},
  ): void {
    if (cells.length === 0) return;
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    const patches: PixelPatch[] = [];
    for (const { x, y } of cells) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const existing = layer.pixels[y]?.[x];
      if (sameColor(existing?.color, newColor)) continue;
      patches.push({
        x,
        y,
        before: copyCell(existing),
        after: {
          color: newColor,
          normal: existing?.normal ?? 0,
          height: existing?.height ?? 1,
        },
      });
    }

    this.commitCells(
      target,
      layer,
      "Adjust color",
      patches,
      options.trackHistory ?? false,
    );
  }
}
