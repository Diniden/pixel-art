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
import { flow, makeObservable, observable, runInAction } from "mobx";
import type { Color, Layer, Normal, PixelData, Project } from "../../types";
import { flipGridHorizontal, flipGridVertical } from "../../utils/normalCompute";
import { computeEdgeInterpolatedNormals } from "../../utils/edgeInterpolate";
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
  /**
   * Record a pre-mutation project SNAPSHOT, through the same seam
   * `DomainMutator` uses (`store/index.ts`'s `saveCurrentStateToHistory`).
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ TASK 27 ADDED THIS, AND IT IS THE ONE EXCEPTION TO "NO SNAPSHOTS"
   * ══════════════════════════════════════════════════════════════════════
   *
   * Every other action on this store records an inverse patch, and W18's
   * whole point was that a pixel edit never captures a project. The two
   * FLIPS cannot: a mirror rewrites EVERY cell in the grid, so the "inverse
   * patch" would be the entire grid twice over — strictly worse than the
   * snapshot it was meant to replace. Task 27's spec says so explicitly
   * ("These are snapshot-family commands (an inverse patch is intractable).
   * Charge the real byte cost.").
   *
   * ⚠️ It is therefore also the ONE path on this store where the undo cost
   * is O(project), and nothing else may start using it. The 50-pixel-stroke
   * byte gate covers `setPixel`/`setPixels`, not the flips, and would not
   * notice a regression that routed a stroke through here.
   */
  snapshot(label: string): void;
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

/**
 * Build the patch list for a bulk normal/height write (task 27).
 *
 * Shared by `setNormalPixels` and `setHeightPixels` because the legacy
 * versions were character-identical apart from which cell member they
 * replaced — 130 lines each, four near-copies in total once the variant
 * branches are counted.
 *
 * ⚠️ THE THREE FILTERS ARE THE LEGACY BEHAVIOUR, in this order:
 *   1. out-of-bounds cells are SKIPPED, not clamped;
 *   2. cells with no colour are SKIPPED — a normal/height may only exist
 *      where paint does;
 *   3. the LAST write to a repeated cell wins, and only ONE patch is
 *      recorded for it, so undo restores the true pre-batch value rather
 *      than an intermediate one (the same de-duplication `setPixels` does).
 */
function collectLightingPatches<P extends { x: number; y: number }>(
  layer: Layer,
  width: number,
  height: number,
  writes: readonly P[],
  apply: (before: PixelData, write: P) => PixelData,
): PixelPatch[] {
  const patches: PixelPatch[] = [];
  const seen = new Map<number, number>();

  for (const write of writes) {
    const { x, y } = write;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const existing = layer.pixels[y]?.[x];
    // Only set normal/height where color exists — the legacy guard.
    if (!existing || existing.color === 0) continue;

    const key = y * width + x;
    const already = seen.get(key);
    if (already !== undefined) {
      const patch = patches[already];
      patch.after = apply(patch.before, write);
      continue;
    }
    const before = copyCell(existing);
    seen.set(key, patches.length);
    patches.push({ x, y, before, after: apply(before, write) });
  }

  return patches;
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

    // Task 27. ONLY the normal-computation flow and its progress are
    // observable on this store — the grids emphatically are not (R2), they
    // live on `DomainStore` behind `observableRef` and are replaced
    // wholesale. `makeObservable` with an explicit map (never
    // `makeAutoObservable`) is what keeps that true.
    makeObservable(this, {
      normalComputeProgress: observable,
      computeNormalsForAllFrames: flow,
    });
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
   * Resolve an EXPLICITLY ADDRESSED frame + layer within the selected object
   * — W29d, the seam the all-frames colour adjustment needs.
   *
   * {@link resolveTarget} is hard-wired to the current selection: object,
   * frame and layer all come from `this.source`. That is correct for every
   * gesture-driven write (a brush writes where the user is looking), and it
   * is exactly why the multi-target colour adjustment could not be expressed
   * on this store. This method varies the frame and the layer while keeping
   * the OBJECT from the selection, which is the axis the adjustment needs and
   * the only axis it needs — `colorAdjustmentActions.ts:346` maps over
   * `o.id === obj.id` alone, never across objects.
   *
   * ⚠️ DELIBERATELY NOT the variant branch. `resolveTarget`'s variant path
   * keys off `this.source.selectedLayerId`'s own `variantGroupId` /
   * `selectedVariantId`, and the legacy all-frames variant path
   * (`colorAdjustmentActions.ts:280-333`) does something structurally
   * different: it replays ONE flat `affectedPixels` list into every variant
   * frame rather than a per-frame Map. Expressing that here would be
   * inventing behaviour, so this method returns `null` for a variant layer
   * and {@link adjustColorAcross} refuses the variant case outright rather
   * than half-implementing it. See that method's header.
   *
   * `null` on any missing link — the same silent bail-out as `resolveTarget`.
   */
  private resolveTargetFor(
    frameId: string,
    layerId: string,
  ): { target: PixelTarget; layer: Layer; width: number; height: number } | null {
    const objectId = this.source.selectedObjectId;
    if (!objectId) return null;

    const object = this.domain.objects.find((o) => o.id === objectId);
    if (!object) return null;
    const frame = object.frames.find((f) => f.id === frameId);
    if (!frame) return null;
    const layer = frame.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    if (layer.isVariant) return null; // see the header

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
      // W29h. Was hard-wired to `li === 0`, which made variant layer 0 the
      // only address this engine could reach — the structural blocker W29g
      // found. `?? 0` keeps every pre-W29h target writing exactly where it
      // did. See `PixelTarget.variant.layerIndex`.
      const layerIndex = target.variant.layerIndex ?? 0;
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
                    li === layerIndex ? { ...l, pixels: grid } : l,
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
      // W29h — the UNDO half. `applyPatch` re-resolves the layer from the LIVE
      // tree before writing the recorded side back, so a `layers[0]` here
      // would have sent every undo of a non-zero variant layer onto layer 0
      // even after `writeGridInAction` learned to address it. The two read
      // sites must agree; they are the only two.
      const layerIndex = target.variant.layerIndex ?? 0;
      const group = this.domain.variants.find((vg) => vg.id === variantGroupId);
      const variant = group?.variants.find((v) => v.id === variantId);
      return variant?.frames[frameIndex]?.layers[layerIndex] ?? null;
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

  /**
   * The MULTI-TARGET colour adjustment — W29d, the seam `allFrames` mode
   * needs and the second half of what left `adjustColor` unwired.
   *
   * Recolours a pre-computed set of cells across many frames and many layers
   * of the SELECTED OBJECT, addressed by the
   * `Map<frameId, Map<layerId, {x,y}[]>>` that
   * `startColorAdjustment` snapshots when the mode opens.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ ONE HISTORY ENTRY, HOWEVER MANY LAYERS — AND WHY IT NEEDS A
   *     TRANSACTION RATHER THAN A LOOP
   * ══════════════════════════════════════════════════════════════════════
   *
   * {@link commitCells} calls `publishAndBump()` AND `history.record()` once
   * per invocation. Looping it over N layers would therefore produce N undo
   * entries, where the legacy implementation produces exactly ONE (it is a
   * single `updateProjectAndSave(..., trackHistory)` over the whole tree) and
   * where `colorAdjustment.test.ts` pins one. `HistoryStore`'s
   * `beginTransaction`/`endTransaction` is the primitive that closes that gap:
   * commands recorded while a transaction is open BUFFER into it, and
   * `endTransaction` collapses them to a single entry.
   *
   * The transaction is opened only when `trackHistory` is set. Opening one
   * unconditionally would be wrong in a subtler way than it looks: a
   * transaction opened while another is already open COMMITS the outer one
   * first (the pinned legacy nested-`beginStroke` behaviour), so an untracked
   * adjustment dragged mid-stroke would silently cut the user's stroke in two.
   *
   * `endTransaction` runs from a `finally`, so a throw part-way through the
   * frames cannot strand an open transaction and swallow every subsequent
   * edit into it.
   *
   * ── ⚠️ VARIANTS ARE NOT HANDLED HERE, DELIBERATELY ────────────────────
   *
   * The legacy variant all-frames path replays ONE flat `affectedPixels` list
   * into EVERY variant frame — a different addressing model from the per-frame
   * Map this method takes, not a special case of it. See
   * {@link resolveTargetFor}. A frame/layer pair that resolves to a variant
   * layer is SKIPPED rather than guessed at.
   *
   * ── What this deliberately does NOT do ────────────────────────────────
   *
   * It does not re-match the current colour. The affected set is snapshotted
   * at START and replayed verbatim — that is pin 3 of the W29b contract, and
   * it is what makes slider-dragging recolour the same cells each time. It
   * also writes NO UI field: `uiState.selectedColor` is the caller's to write
   * (`PixelStore` never touches UI state), which is the other half of why
   * `adjustColor` was left unwired.
   *
   * @param byFrame  frameId → layerId → the cells to recolour.
   * @returns the number of layers actually written.
   */
  adjustColorAcross(
    byFrame: ReadonlyMap<string, ReadonlyMap<string, readonly { x: number; y: number }[]>>,
    newColor: Color,
    options: PixelWriteOptions = {},
  ): number {
    const trackHistory = options.trackHistory ?? false;
    if (byFrame.size === 0) return 0;

    // Resolve EVERYTHING before writing anything. A resolve reads the live
    // tree, and `commitCells` replaces the spine down to each layer — so
    // resolving lazily inside the write loop would read a tree that earlier
    // iterations had already rebuilt. The `Layer` objects captured here are
    // the pre-write ones, which is precisely what the inverse patches need.
    const work: {
      target: PixelTarget;
      layer: Layer;
      patches: PixelPatch[];
    }[] = [];

    for (const [frameId, byLayer] of byFrame) {
      for (const [layerId, cells] of byLayer) {
        if (cells.length === 0) continue;
        const resolved = this.resolveTargetFor(frameId, layerId);
        if (!resolved) continue; // missing, or a variant layer — see header
        const { target, layer, width, height } = resolved;

        const patches = this.recolorPatches(
          layer,
          cells,
          newColor,
          width,
          height,
        );
        if (patches.length > 0) work.push({ target, layer, patches });
      }
    }

    if (work.length === 0) return 0;

    return this.commitAdjustment(work, trackHistory);
  }

  /**
   * The VARIANT multi-target colour adjustment — W29h.
   *
   * The variant twin of {@link adjustColorAcross}, and the second half of what
   * kept `ColorPickerContainer` / `LayerColorsContainer` on Zustand.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ WHY THIS IS A SEPARATE METHOD RATHER THAN A BRANCH
   * ══════════════════════════════════════════════════════════════════════
   *
   * The two paths do not share an ADDRESSING MODEL, which is exactly why
   * `adjustColorAcross` refused variants outright (W29d) instead of
   * half-implementing them:
   *
   *  - the object path keys by REAL `frame.id` and matches layers by NAME
   *    across frames;
   *  - the variant path keys by the SYNTHETIC `` `variant-frame-<index>` ``
   *    (`ApplicationStore.startColorAdjustment`) — a string that matches no
   *    `frame.id` anywhere in the tree — and matches layers by ID within one
   *    frame, with no name matching at all (W29g pin: the variant scan
   *    iterates `variantFrame.layers` unconditionally).
   *
   * Folding them together would mean guessing which key space a string is in.
   * They stay two methods with one shared commit tail.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THIS IS WHAT W29h's `layerIndex` EXISTS FOR
   * ══════════════════════════════════════════════════════════════════════
   *
   * W29g pinned that all-frames variant adjustment recolours EVERY layer of
   * every variant frame. Before `PixelTarget.variant.layerIndex`, this store
   * could only ever write `layers[0]` — the pin was inexpressible here. Each
   * matched layer is resolved to its POSITION in `variantFrame.layers` and
   * addressed by that index.
   *
   * A layer id that is not in the addressed frame is SKIPPED, not guessed at
   * — the same silent bail-out every resolve on this store uses.
   *
   * ── The single-history-entry semantic, unchanged (W29d) ───────────────
   *
   * Same transaction rule as {@link adjustColorAcross}, for the same measured
   * reason: the wrapper opens only when `trackHistory` AND more than one
   * layer is written. Opening one unconditionally commits an enclosing stroke
   * and cuts a user's drag in two.
   *
   * ⚠️ It writes NO UI field. `uiState.selectedColor` is the caller's, exactly
   * as on the object path.
   *
   * @param byFrameIndex  variant frame INDEX → variant layer id → cells.
   * @returns the number of layers actually written.
   */
  adjustVariantColorAcross(
    variantGroupId: string,
    variantId: string,
    byFrameIndex: ReadonlyMap<
      number,
      ReadonlyMap<string, readonly { x: number; y: number }[]>
    >,
    newColor: Color,
    options: PixelWriteOptions = {},
  ): number {
    const trackHistory = options.trackHistory ?? false;
    if (byFrameIndex.size === 0) return 0;

    const group = this.domain.variants.find((vg) => vg.id === variantGroupId);
    const variant = group?.variants.find((v) => v.id === variantId);
    if (!variant) return 0;
    const { width, height } = variant.gridSize;

    // Resolve EVERYTHING before writing anything — same reason as the object
    // path: `commitCells` rebuilds the spine, so a lazy resolve inside the
    // loop would read a tree earlier iterations had already replaced.
    const work: {
      target: PixelTarget;
      layer: Layer;
      patches: PixelPatch[];
    }[] = [];

    for (const [frameIndex, byLayer] of byFrameIndex) {
      const variantFrame = variant.frames[frameIndex];
      if (!variantFrame) continue;

      for (const [layerId, cells] of byLayer) {
        if (cells.length === 0) continue;
        // ⚠️ The id → INDEX hop. `layerIndex` is how the write engine
        // addresses a variant layer (positional, like `frameIndex`), while
        // the adjustment snapshot keys by id.
        const layerIndex = variantFrame.layers.findIndex(
          (l) => l.id === layerId,
        );
        if (layerIndex === -1) continue;
        const layer = variantFrame.layers[layerIndex];

        const patches = this.recolorPatches(
          layer,
          cells,
          newColor,
          width,
          height,
        );
        if (patches.length > 0) {
          work.push({
            target: {
              objectId: this.source.selectedObjectId ?? "",
              frameId: this.source.selectedFrameId ?? "",
              layerId: this.source.selectedLayerId ?? "",
              variant: { variantGroupId, variantId, frameIndex, layerIndex },
            },
            layer,
            patches,
          });
        }
      }
    }

    return this.commitAdjustment(work, trackHistory);
  }

  /**
   * The recolour patch builder shared by the object and variant adjustments.
   *
   * Bounds-checks, skips a cell already holding `newColor` (so re-applying an
   * adjustment records nothing), and preserves `normal` / `height` — the
   * `?? 1` height default is the legacy value, transcribed.
   */
  private recolorPatches(
    layer: Layer,
    cells: readonly { x: number; y: number }[],
    newColor: Color,
    width: number,
    height: number,
  ): PixelPatch[] {
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
    return patches;
  }

  /**
   * The commit tail shared by both multi-target adjustments — W29h.
   *
   * ⚠️ THE TRANSACTION IS CONDITIONAL, and that is the load-bearing part.
   * A single layer needs no transaction (`commitCells` already produces
   * exactly one entry), and a transaction opened while another is already
   * open COMMITS the outer one — so wrapping unconditionally would cut a
   * user's in-progress stroke in two (W29d, pinned).
   *
   * `endTransaction` runs from a `finally` so a throw part-way through cannot
   * strand an open transaction and swallow every subsequent edit into it.
   */
  private commitAdjustment(
    work: readonly { target: PixelTarget; layer: Layer; patches: PixelPatch[] }[],
    trackHistory: boolean,
  ): number {
    if (work.length === 0) return 0;

    const needsTransaction = trackHistory && work.length > 1;
    if (needsTransaction) this.history.beginTransaction("Adjust color");
    try {
      for (const { target, layer, patches } of work) {
        this.commitCells(target, layer, "Adjust color", patches, trackHistory);
      }
    } finally {
      if (needsTransaction) this.history.endTransaction();
    }

    return work.length;
  }

  /* ══ THE LIGHTING WRITE PATHS (task 27) ═══════════════════════════════
   *
   * Normals and heights ARE pixel content — `PixelData` is `[colour, normal,
   * height]` — so R2 puts them here, behind the same sole-writer rule as
   * colour. They were the last pixel writes still living outside this store,
   * in `store/lightingActions.ts`.
   *
   * ⚠️ THE ONE GUARD THEY ALL SHARE: a normal or a height may only be
   * written where a COLOUR already exists. Every legacy lighting action
   * checked `pd && pd.color !== 0` before writing, and skipped the cell
   * silently otherwise. This is not defensive coding — an unpainted cell with
   * a normal renders as lit nothing, and the exporter treats
   * `height: 0` / `normal: 0` as "no data". The guard is preserved exactly,
   * including its consequence: painting a normal over transparent pixels is a
   * NO-OP that records no history entry, because the patch list comes out
   * empty and `commitCells` early-returns on that.
   *
   * ⚠️ INVERSE PATCHES, like every other action here. A normal is ~24 B/cell,
   * exactly as a colour is, so nothing about W18's byte win changes.
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Write one cell's normal. The lighting studio's pencil.
   *
   * Ported from `lightingActions.ts:129-228`. The bounds check, the
   * colour-exists guard and the silent bail-out on an unresolvable target are
   * all the legacy behaviour.
   *
   * ⚠️ Unlike `setPixel`, there is NO "already this value" early return —
   * the legacy `setNormalPixel` never had one, so re-stamping the same normal
   * still records an entry. Observed behaviour, preserved deliberately
   * (the same asymmetry `setPixels` carries, and pinned for the same reason).
   */
  setNormalPixel(
    x: number,
    y: number,
    normal: Normal | 0,
    options: PixelWriteOptions = {},
  ): void {
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const existing = layer.pixels[y]?.[x];
    // Can only set normal where color exists.
    if (!existing || existing.color === 0) return;

    const before = copyCell(existing);
    this.commitCells(
      target,
      layer,
      "Set normal",
      [{ x, y, before, after: { ...before, normal } }],
      options.trackHistory ?? true,
    );
  }

  /**
   * Write many cells' normals as ONE history entry. The bulk path the
   * auto-normal (edge-interpolate) tool uses.
   *
   * Ported from `lightingActions.ts:230-354`. Out-of-bounds cells and cells
   * without a colour are FILTERED, not rejected — a partially in-bounds batch
   * writes its valid members, exactly as the legacy loop did.
   */
  setNormalPixels(
    pixels: readonly { x: number; y: number; normal: Normal | 0 }[],
    options: PixelWriteOptions = {},
  ): void {
    if (pixels.length === 0) return;
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    this.commitLighting(
      target,
      layer,
      "Set normals",
      collectLightingPatches(
        layer,
        width,
        height,
        pixels,
        (before, p) => ({ ...before, normal: p.normal }),
      ),
      options.trackHistory ?? true,
    );
  }

  /**
   * Write many cells' heights as ONE history entry.
   *
   * Ported from `lightingActions.ts:619-751`. Structurally identical to
   * {@link setNormalPixels} — same filters, same colour guard — differing
   * only in which member of the cell it replaces.
   */
  setHeightPixels(
    pixels: readonly { x: number; y: number; height: number }[],
    options: PixelWriteOptions = {},
  ): void {
    if (pixels.length === 0) return;
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    this.commitLighting(
      target,
      layer,
      "Set heights",
      collectLightingPatches(
        layer,
        width,
        height,
        pixels,
        (before, p) => ({ ...before, height: p.height }),
      ),
      options.trackHistory ?? true,
    );
  }

  /**
   * `commitCells`, plus the ONE behaviour the bulk lighting writes have that
   * the colour writes do not: **an empty patch list still SAVES.**
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THIS ASYMMETRY IS OBSERVED BEHAVIOUR, PINNED BY TASK 08
   * ══════════════════════════════════════════════════════════════════════
   *
   * The legacy `setNormalPixels`/`setHeightPixels` applied the colour guard
   * INSIDE an `updateProjectAndSave` updater. So when no cell qualified —
   * every target pixel transparent — the grid came out unchanged but the save
   * was still scheduled, because `updateProjectAndSave` schedules
   * unconditionally. `autoSave.test.ts:361` pins exactly that: it writes a
   * height at (0,0) of an EMPTY 4×4 fixture and requires one save.
   *
   * `commitCells` early-returns on an empty patch list (correct for colour:
   * `setPixel` on the colour it already has must record and save nothing), so
   * the bulk lighting paths route through here instead and publish + bump
   * even with nothing to write.
   *
   * ⚠️ It does NOT record a history entry in that case, and must not — the
   * legacy path produced no undoable change either, and task 08's
   * "none of the 8 track history" pin is adjacent to this one.
   *
   * `setNormalPixel` (singular) is deliberately NOT routed here: it bails out
   * BEFORE the updater when the pixel has no colour (`lightingActions.ts:198`
   * returns early), so its no-op genuinely saves nothing.
   */
  private commitLighting(
    target: PixelTarget,
    layer: Layer,
    label: string,
    patches: readonly PixelPatch[],
    trackHistory: boolean,
  ): void {
    if (patches.length === 0) {
      // Nothing to write, but the legacy path still tripped the save trigger.
      this.publishAndBump();
      return;
    }
    this.commitCells(target, layer, label, patches, trackHistory);
  }

  /* ── the two flips: SNAPSHOT-family, and deliberately NOT unified ─────── */

  /**
   * Mirror the active layer left-to-right, negating every normal's x.
   *
   * ⚠️ A SNAPSHOT command, not an inverse patch — see `PixelMirror.snapshot`.
   * A flip rewrites every cell, so the patch would be the whole grid twice.
   *
   * ⚠️ **DO NOT UNIFY WITH {@link flipVertical}.** They are mirror images and
   * one `flipAxis(axis)` is the obvious refactor, but task 08 pinned two
   * properties of the CURRENT pair — `flipHorizontal ∘ flipHorizontal =
   * identity`, and that H and V agree modulo transpose — and task 27's
   * constraints require porting them separately so those pins verify the port
   * rather than the refactor. Unifying is an explicit follow-up.
   */
  flipHorizontal(options: PixelWriteOptions = {}): void {
    this.flipInto(flipGridHorizontal, "Flip horizontal", options);
  }

  /** The vertical twin. See {@link flipHorizontal} — including its warning. */
  flipVertical(options: PixelWriteOptions = {}): void {
    this.flipInto(flipGridVertical, "Flip vertical", options);
  }

  /* ══ computeNormalsForAllFrames — A FLOW (task 27) ═══════════════════════
   *
   * ⚠️ THIS USED TO BLOCK THE MAIN THREAD FROM INSIDE A REACT COMPONENT.
   *
   * `LightingStudioTools.tsx` called the Zustand action synchronously from a
   * modal's confirm handler, and that action ran
   * `computeEdgeInterpolatedNormals` — a gaussian-RBF spherical interpolation
   * over every coloured pixel — once per FRAME, inside a single
   * `updateProjectAndSave` updater. On a 54-frame object nothing repainted
   * until the whole sweep finished.
   *
   * As a `flow` it yields between frames, so React can paint and
   * {@link normalComputeProgress} can drive a progress indicator. The
   * ARITHMETIC IS UNCHANGED: the same pure function, the same arguments, the
   * same per-frame loop and the same colour guard.
   *
   * ── ONE history entry, not one per frame ──────────────────────────────
   *
   * The whole sweep runs inside a HistoryStore transaction, so it collapses
   * into a single undo entry — matching the legacy single
   * `updateProjectAndSave(..., true)` exactly. Each frame's write is an
   * ordinary inverse-patch commit, so the cost stays ~24 B per CHANGED cell
   * rather than a project snapshot per frame.
   *
   * ⚠️ It writes ACROSS frames, which every other action here refuses to do.
   * That is safe only because each frame's target is resolved and written
   * independently, one `PixelTarget` at a time — this is not a multi-target
   * command, it is N single-target commands inside one transaction.
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * `0` when idle, otherwise the fraction of frames processed (0..1).
   * Observable so a container can render progress without polling.
   */
  normalComputeProgress = 0;

  /**
   * Recompute edge-interpolated normals for EVERY frame of the active layer
   * (or of the active variant), yielding between frames.
   *
   * Ported from `lightingActions.ts:482-618`.
   */
  *computeNormalsForAllFrames(params: {
    startAngle: number;
    smoothing: number;
    radius: number;
  }): Generator<Promise<void>, void, unknown> {
    const plan = this.planNormalCompute(params);
    if (plan.length === 0) return;

    this.history.beginTransaction("Compute normals");
    try {
      for (let i = 0; i < plan.length; i++) {
        plan[i]();
        this.normalComputeProgress = (i + 1) / plan.length;
        // ⚠️ YIELD *BETWEEN* FRAMES, NEVER AFTER THE LAST ONE.
        //
        // A generator's body runs synchronously up to its FIRST yield, so
        // with a yield after every frame a single-frame object would suspend
        // before `endTransaction()` and the undo entry would not exist until
        // a microtask later. Task 08 pins `computeNormalsForAllFrames`
        // "TRACKS history" with a SYNCHRONOUS assertion right after the
        // dispatch, and that pin caught exactly this — measured.
        //
        // Skipping the final yield makes the common case (one frame, or the
        // last frame of many) complete synchronously, so the legacy call
        // shape is preserved for every caller that does not await, while a
        // multi-frame sweep still releases the main thread between frames.
        if (i < plan.length - 1) yield Promise.resolve();
      }
    } finally {
      this.history.endTransaction();
      // ⚠️ RE-SYNC AFTER THE COLLAPSE. Inside a transaction `history.record`
      // BUFFERS rather than pushing, so each frame's `commitCells` synced a
      // mirror that had not changed. The entry only exists once
      // `endTransaction` collapses the buffer, and the Phase B
      // `projectHistory`/`historyIndex` mirror must be republished then —
      // otherwise undo works while every consumer reading `projectHistory`
      // reports a depth of zero. Measured: task 08's
      // "computeNormalsForAllFrames TRACKS history" fails without this line.
      this.mirror.syncHistory();
      this.normalComputeProgress = 0;
    }
  }

  /**
   * Resolve every frame the sweep will touch, and return one closure per
   * frame that computes and commits it.
   *
   * Planned UP FRONT, before the first yield, so the set of frames is decided
   * against one consistent tree — the legacy action likewise read the frame
   * list once. Each closure still re-resolves its own layer from the LIVE
   * tree when it runs, because the previous frame's commit replaced part of
   * that tree.
   */
  private planNormalCompute(params: {
    startAngle: number;
    smoothing: number;
    radius: number;
  }): (() => void)[] {
    const resolved = this.resolveTarget();
    if (!resolved) return [];
    const { target, width, height } = resolved;

    const commitFrame = (frameTarget: PixelTarget) => () => {
      const layer = this.findLayer(frameTarget);
      if (!layer) return;
      const normals = computeEdgeInterpolatedNormals(
        layer,
        width,
        height,
        params.startAngle,
        params.smoothing,
        params.radius,
      );
      // `normals` is indexed `y * width + x` — flatten it into the
      // {x, y, normal} shape the shared collector wants, and let that apply
      // the colour guard exactly as `setNormalPixels` does.
      const writes: { x: number; y: number; normal: Normal | 0 }[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // `|| 0` not `?? 0`: the legacy code used `normal || 0`, and an
          // out-of-range index yields `undefined` either way. Transcribed.
          writes.push({ x, y, normal: normals[y * width + x] || 0 });
        }
      }
      this.commitCells(
        frameTarget,
        layer,
        "Compute normals",
        collectLightingPatches(layer, width, height, writes, (before, w) => ({
          ...before,
          normal: w.normal,
        })),
        true,
      );
    };

    // ── the variant branch: every FRAME of the selected variant ───────────
    if (target.variant) {
      const { variantGroupId, variantId } = target.variant;
      const group = this.domain.variants.find((vg) => vg.id === variantGroupId);
      const variant = group?.variants.find((v) => v.id === variantId);
      if (!variant) return [];
      return variant.frames.map((_frame, frameIndex) =>
        commitFrame({
          ...target,
          variant: { variantGroupId, variantId, frameIndex },
        }),
      );
    }

    // ── the regular branch: every frame of the object that HAS this layer ──
    //
    // Frames without a layer of this id are SKIPPED, exactly as the legacy
    // `if (!targetLayer) return f;` did — layers are matched by id across
    // frames, and a frame that never had the layer is left alone.
    const object = this.domain.objects.find((o) => o.id === target.objectId);
    if (!object) return [];
    return object.frames
      .filter((f) => f.layers.some((l) => l.id === target.layerId))
      .map((f) => commitFrame({ ...target, frameId: f.id }));
  }

  /**
   * The shared plumbing behind the two flips: resolve, snapshot, replace the
   * grid wholesale, publish, bump.
   *
   * ⚠️ This is PLUMBING, not the algorithm. The two grid transforms stay
   * separate pure functions in `utils/normalCompute.ts` — sharing the four
   * lines of store bookkeeping is not what "do not unify the flips" forbids,
   * and duplicating them would have been the third and fourth copies of code
   * that already existed four times in the legacy module.
   */
  private flipInto(
    transform: (
      pixels: readonly PixelData[][],
      width: number,
      height: number,
    ) => PixelData[][],
    label: string,
    options: PixelWriteOptions,
  ): void {
    const resolved = this.resolveTarget(options.variantFrameIndex);
    if (!resolved) return;
    const { target, layer, width, height } = resolved;

    const trackHistory = options.trackHistory ?? true;
    if (trackHistory) {
      // Adopt any external write to the legacy mirror first, then capture the
      // PRE state — the same order `commitCells` uses for its patch path.
      this.mirror.reconcile();
      this.mirror.snapshot(label);
    }

    this.writeGrid(target, transform(layer.pixels, width, height));
    this.publishAndBump();
  }
}
