/**
 * BrushStructureStore — every STRUCTURAL edit of a brush document (Brush
 * Studio plan, `docs/01-brush-studio`, task 08; MASTER D6 / D7 / D8 / D9).
 *
 * A behaviour module over `BrushStore.document`, the brush analogue of
 * `./FrameStore.ts` + `./LayerStore.ts` folded into one: frames (add /
 * duplicate / delete / rename / move / reorder), layers (add / delete / rename
 * / visibility / move / duplicate / channel type / applied group), applied
 * groups (add / rename / delete) and the document resize. Each public method
 * is exactly ONE undoable `brush.commit(...)` — one whole-document snapshot
 * entry in `BrushStore`'s own history — or a silent no-op when there is no
 * document or the target does not exist.
 *
 * ── Layers are UNIFORM across frames (D6) ──────────────────────────────────
 * A brush layer's id is stable across every frame: the same ids in the same
 * order in every `frame.layers`. So every layer op here is applied to EVERY
 * frame — "add" appends the same `{id, name, channelType}` with a fresh grid
 * to each frame, "move" swaps the same adjacent pair in each frame, "delete"
 * drops the id from each frame. There is deliberately NO per-frame reorder
 * API (MASTER §1: only layer swapping, uniform). `assertUniformLayers` runs on
 * the result of every mutate before it is committed, so a broken invariant
 * throws out of the op and the live document is left untouched.
 *
 * ── Immutable spine writes (D8) ────────────────────────────────────────────
 * `mutate` never edits its argument. Every op returns a NEW document built by
 * spine copies — the frames array, each touched frame, its layers array, each
 * touched layer — and grids are copied only when their CONTENTS change
 * (`addFrame(copy)`, `duplicate*`, `resizeBrush`). Untouched grids are shared
 * by reference with the previous document, which is what keeps the retained
 * snapshot in history valid (`brushCommands.ts`, "held by reference").
 *
 * ── Boundaries ─────────────────────────────────────────────────────────────
 * Imports nothing from `stores/ui/**` (ESLint-enforced). The selection is
 * READ through an injected `BrushSelectionSource` and WRITTEN through an
 * injected `BrushSelectionSink` — `ApplicationStore` (task 11) passes
 * `BrushUIStore` for both, exactly the `FrameStore` / `LayerStore` pattern.
 * No `makeObservable` here: every observable write happens inside
 * `BrushStore.commit` (an action) or the sink's own actions.
 */
import {
  assertUniformLayers,
  createBrushLayer,
  createEmptyBrushGrid,
  generateId,
  type BrushAppliedGroup,
  type BrushCell,
  type BrushChannelType,
  type BrushDocument,
  type BrushFrame,
  type BrushLayer,
} from "../../types";
import type { BrushStore } from "./BrushStore";

/** The selection ids a structural op reads. Injected, never imported. */
export interface BrushSelectionSource {
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
}

/** Where a structural op writes the selection after adding or deleting. */
export interface BrushSelectionSink {
  selectFrame(id: string | null): void;
  selectLayer(id: string | null): void;
}

export interface BrushStructureStoreDeps {
  brush: BrushStore;
  source: BrushSelectionSource;
  select: BrushSelectionSink;
}

export type BrushFrameDirection = "left" | "right";
export type BrushLayerDirection = "up" | "down";

/* ── pure grid helpers ───────────────────────────────────────────────────── */

/** Copy one cell so a new grid never shares a tuple with its source. */
function cloneCell(cell: BrushCell): BrushCell {
  return cell === 0 ? 0 : [cell[0], cell[1], cell[2], cell[3]];
}

/** Deep-copy a grid: new rows, new cell tuples. Always a `ref` replacement. */
function copyGrid(pixels: BrushCell[][]): BrushCell[][] {
  return pixels.map((row) => row.map(cloneCell));
}

/**
 * Top-left anchored crop/pad of `pixels` into `width × height`. Cells inside
 * both rectangles are copied; new area is unpainted (`0`).
 */
function resizeGrid(
  pixels: BrushCell[][],
  width: number,
  height: number,
): BrushCell[][] {
  return Array.from({ length: height }, (_, y) => {
    const row = pixels[y];
    return Array.from({ length: width }, (_, x): BrushCell =>
      row === undefined || x >= row.length ? 0 : cloneCell(row[x]),
    );
  });
}

/* ── pure document helpers ───────────────────────────────────────────────── */

/** Spine-copy every frame through `fn`. */
function mapFrames(
  doc: BrushDocument,
  fn: (frame: BrushFrame, index: number) => BrushFrame,
): BrushDocument {
  return { ...doc, frames: doc.frames.map(fn) };
}

/** Spine-copy every layer of every frame through `fn`. */
function mapLayers(
  doc: BrushDocument,
  fn: (layer: BrushLayer, index: number, frame: BrushFrame) => BrushLayer,
): BrushDocument {
  return mapFrames(doc, (frame) => ({
    ...frame,
    layers: frame.layers.map((layer, i) => fn(layer, i, frame)),
  }));
}

/** Spine-copy every layer with id `id` in every frame through `fn`. */
function mapLayer(
  doc: BrushDocument,
  id: string,
  fn: (layer: BrushLayer) => BrushLayer,
): BrushDocument {
  return mapLayers(doc, (layer) => (layer.id === id ? fn(layer) : layer));
}

/** A layer without its `appliedGroupId` key (omitted, not `undefined`). */
function withoutAppliedGroup(layer: BrushLayer): BrushLayer {
  const { appliedGroupId: _dropped, ...rest } = layer;
  return rest;
}

/** Swap the elements at `a` and `b` in a NEW array. */
function swapped<T>(items: readonly T[], a: number, b: number): T[] {
  const next = [...items];
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}

/** Insert `item` at `index` in a NEW array. */
function inserted<T>(items: readonly T[], index: number, item: T): T[] {
  const next = [...items];
  next.splice(index, 0, item);
  return next;
}

/** Is `n` a usable brush dimension? Integers ≥ 1 only. */
function isDimension(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}

export class BrushStructureStore {
  private readonly brush: BrushStore;
  private readonly source: BrushSelectionSource;
  private readonly select: BrushSelectionSink;

  constructor(deps: BrushStructureStoreDeps) {
    this.brush = deps.brush;
    this.source = deps.source;
    this.select = deps.select;
  }

  /* ── plumbing ─────────────────────────────────────────────────────────── */

  /**
   * ONE snapshot commit. The invariant is asserted on every changed result
   * BEFORE it reaches history or the live document; `mutate` returning its
   * argument means "nothing to do" and `BrushStore.commit` records nothing.
   * `bumpPixels` is passed for every op that changes what the canvas or the
   * timeline renders; pure relabels (rename, applied group) omit it.
   */
  private commit(
    label: string,
    mutate: (doc: BrushDocument) => BrushDocument,
    bumpPixels: boolean,
  ): void {
    this.brush.commit(
      label,
      (doc) => {
        const next = mutate(doc);
        if (next !== doc) assertUniformLayers(next);
        return next;
      },
      { bumpPixels },
    );
  }

  /** The layer ids are uniform (D6), so frame 0 is THE layer list. */
  private static layerIndexOf(doc: BrushDocument, id: string): number {
    const first = doc.frames[0];
    return first ? first.layers.findIndex((l) => l.id === id) : -1;
  }

  /* ══ Frames ═════════════════════════════════════════════════════════════ */

  /**
   * Insert a new frame AFTER the selected one (append when nothing is
   * selected) carrying the SAME layer ids, names, channel types, visibility
   * and applied groups as the frame it follows. Grids are empty unless
   * `copyPrevious`, in which case they are deep copies of that frame's.
   * Selects the new frame. Returns its id, or `""` with no document.
   */
  addFrame(name?: string, copyPrevious = false): string {
    const doc = this.brush.document;
    if (!doc || doc.frames.length === 0) return "";

    const selectedIndex = doc.frames.findIndex(
      (f) => f.id === this.source.selectedFrameId,
    );
    const templateIndex =
      selectedIndex >= 0 ? selectedIndex : doc.frames.length - 1;
    const template = doc.frames[templateIndex];
    const frameId = generateId();
    const frameName = name ?? `Frame ${doc.frames.length + 1}`;

    this.commit(
      "Add frame",
      (current) => {
        const newFrame: BrushFrame = {
          id: frameId,
          name: frameName,
          layers: template.layers.map((l) => ({
            ...l,
            pixels: copyPrevious
              ? copyGrid(l.pixels)
              : createEmptyBrushGrid(current.width, current.height),
          })),
        };
        return {
          ...current,
          frames: inserted(current.frames, templateIndex + 1, newFrame),
        };
      },
      true,
    );
    this.select.selectFrame(frameId);
    return frameId;
  }

  /** A deep copy of frame `id` named `"<name> Copy"`, inserted after it and selected. */
  duplicateFrame(id: string): void {
    const doc = this.brush.document;
    if (!doc) return;
    const sourceIndex = doc.frames.findIndex((f) => f.id === id);
    if (sourceIndex === -1) return;
    const source = doc.frames[sourceIndex];
    const frameId = generateId();

    this.commit(
      "Duplicate frame",
      (current) => {
        const newFrame: BrushFrame = {
          id: frameId,
          name: `${source.name} Copy`,
          layers: source.layers.map((l) => ({
            ...l,
            pixels: copyGrid(l.pixels),
          })),
        };
        return {
          ...current,
          frames: inserted(current.frames, sourceIndex + 1, newFrame),
        };
      },
      true,
    );
    this.select.selectFrame(frameId);
  }

  /**
   * REFUSES to delete the last remaining frame (no-op). When the deleted
   * frame was the selected one, the PREVIOUS frame (or the new first) is
   * selected; deleting an unselected frame leaves the selection alone.
   */
  deleteFrame(id: string): void {
    const doc = this.brush.document;
    if (!doc || doc.frames.length <= 1) return;
    const index = doc.frames.findIndex((f) => f.id === id);
    if (index === -1) return;

    const remaining = doc.frames.filter((f) => f.id !== id);
    const survivor = remaining[Math.max(0, index - 1)] ?? remaining[0];

    this.commit(
      "Delete frame",
      (current) => ({
        ...current,
        frames: current.frames.filter((f) => f.id !== id),
      }),
      true,
    );
    if (this.source.selectedFrameId === id || !this.source.selectedFrameId) {
      this.select.selectFrame(survivor.id);
    }
  }

  renameFrame(id: string, name: string): void {
    const doc = this.brush.document;
    if (!doc || !doc.frames.some((f) => f.id === id)) return;
    this.commit(
      "Rename frame",
      (current) =>
        mapFrames(current, (f) => (f.id === id ? { ...f, name } : f)),
      false,
    );
  }

  /** Swap with the neighbour on that side; a no-op at either end. */
  moveFrame(id: string, direction: BrushFrameDirection): void {
    const doc = this.brush.document;
    if (!doc) return;
    const index = doc.frames.findIndex((f) => f.id === id);
    if (index === -1) return;
    const target = direction === "left" ? index - 1 : index + 1;
    if (target < 0 || target >= doc.frames.length) return;

    this.commit(
      "Move frame",
      (current) => ({
        ...current,
        frames: swapped(current.frames, index, target),
      }),
      true,
    );
  }

  /**
   * Drag-and-drop reorder with `FrameStore.reorderFrame`'s semantics:
   * `toIndex === frames.length` is a legal "append" target, and the insert
   * index is corrected by one when moving rightwards so the frame lands where
   * the drop indicator pointed.
   */
  reorderFrame(id: string, toIndex: number): void {
    const doc = this.brush.document;
    if (!doc) return;
    const fromIndex = doc.frames.findIndex((f) => f.id === id);
    if (fromIndex === -1) return;
    if (!Number.isInteger(toIndex)) return;
    if (toIndex < 0 || toIndex > doc.frames.length) return;
    if (toIndex === fromIndex || toIndex === fromIndex + 1) return;

    this.commit(
      "Reorder frame",
      (current) => {
        const frames = [...current.frames];
        const [moved] = frames.splice(fromIndex, 1);
        frames.splice(fromIndex < toIndex ? toIndex - 1 : toIndex, 0, moved);
        return { ...current, frames };
      },
      true,
    );
  }

  /* ══ Layers — every op touches EVERY frame (D6) ═════════════════════════ */

  /**
   * Append the same `{id, name, channelType}` with a fresh empty grid to the
   * TOP (array end) of every frame, and select it. Returns the new id, or
   * `""` with no document.
   */
  addLayer(name: string, channelType: BrushChannelType): string {
    const doc = this.brush.document;
    if (!doc) return "";
    const layerId = generateId();

    this.commit(
      "Add layer",
      (current) =>
        mapFrames(current, (frame) => ({
          ...frame,
          layers: [
            ...frame.layers,
            createBrushLayer(
              layerId,
              name,
              current.width,
              current.height,
              channelType,
            ),
          ],
        })),
      true,
    );
    this.select.selectLayer(layerId);
    return layerId;
  }

  /**
   * REFUSES to delete the last remaining layer (no-op). Removes the id from
   * every frame. When the deleted layer was the selected one, the layer
   * BELOW it (or the new bottom) is selected; otherwise the selection is
   * left alone.
   */
  deleteLayer(id: string): void {
    const doc = this.brush.document;
    if (!doc || doc.frames.length === 0) return;
    const layers = doc.frames[0].layers;
    if (layers.length <= 1) return;
    const index = layers.findIndex((l) => l.id === id);
    if (index === -1) return;

    const remaining = layers.filter((l) => l.id !== id);
    const survivor = remaining[Math.max(0, index - 1)] ?? remaining[0];

    this.commit(
      "Delete layer",
      (current) =>
        mapFrames(current, (frame) => ({
          ...frame,
          layers: frame.layers.filter((l) => l.id !== id),
        })),
      true,
    );
    if (this.source.selectedLayerId === id || !this.source.selectedLayerId) {
      this.select.selectLayer(survivor.id);
    }
  }

  renameLayer(id: string, name: string): void {
    const doc = this.brush.document;
    if (!doc || BrushStructureStore.layerIndexOf(doc, id) === -1) return;
    this.commit(
      "Rename layer",
      (current) => mapLayer(current, id, (l) => ({ ...l, name })),
      false,
    );
  }

  /**
   * Flip `visible` for the layer in every frame. The new value is the
   * inverse of frame 0's, applied uniformly — so a file whose frames
   * disagreed is brought back into agreement rather than flipped per frame.
   */
  toggleLayerVisibility(id: string): void {
    const doc = this.brush.document;
    if (!doc) return;
    const index = BrushStructureStore.layerIndexOf(doc, id);
    if (index === -1) return;
    const visible = !doc.frames[0].layers[index].visible;

    this.commit(
      visible ? "Show layer" : "Hide layer",
      (current) => mapLayer(current, id, (l) => ({ ...l, visible })),
      true,
    );
  }

  /**
   * Swap with the adjacent layer in EVERY frame. `"up"` moves toward the top
   * of the stack (the array end); a no-op at either end.
   */
  moveLayer(id: string, direction: BrushLayerDirection): void {
    const doc = this.brush.document;
    if (!doc || doc.frames.length === 0) return;
    const index = BrushStructureStore.layerIndexOf(doc, id);
    if (index === -1) return;
    const target = direction === "up" ? index + 1 : index - 1;
    if (target < 0 || target >= doc.frames[0].layers.length) return;

    this.commit(
      "Move layer",
      (current) =>
        mapFrames(current, (frame) => ({
          ...frame,
          layers: swapped(frame.layers, index, target),
        })),
      true,
    );
  }

  /**
   * A copy of layer `id` — same name + `" Copy"`, channel type, visibility
   * and applied group, deep-copied grid — inserted DIRECTLY ABOVE the source
   * in every frame, and selected. Returns the new id, or `""` when there is
   * no document or no such layer.
   */
  duplicateLayer(id: string): string {
    const doc = this.brush.document;
    if (!doc) return "";
    const index = BrushStructureStore.layerIndexOf(doc, id);
    if (index === -1) return "";
    const layerId = generateId();

    this.commit(
      "Duplicate layer",
      (current) =>
        mapFrames(current, (frame) => {
          const source = frame.layers[index];
          const copy: BrushLayer = {
            ...source,
            id: layerId,
            name: `${source.name} Copy`,
            pixels: copyGrid(source.pixels),
          };
          return { ...frame, layers: inserted(frame.layers, index + 1, copy) };
        }),
      true,
    );
    this.select.selectLayer(layerId);
    return layerId;
  }

  /**
   * Relabel only: the layer's `channelType` changes in every frame and the
   * grids are shared untouched — every cell keeps its four delta values and
   * simply colourises differently.
   */
  setLayerChannelType(id: string, channelType: BrushChannelType): void {
    const doc = this.brush.document;
    if (!doc) return;
    const index = BrushStructureStore.layerIndexOf(doc, id);
    if (index === -1) return;
    if (doc.frames[0].layers[index].channelType === channelType) return;

    this.commit(
      "Change channel type",
      (current) => mapLayer(current, id, (l) => ({ ...l, channelType })),
      true,
    );
  }

  /**
   * Assign the layer to an applied group in every frame, or clear it with
   * `null`. A `groupId` that is not in `appliedGroups` is ignored.
   */
  setLayerAppliedGroup(id: string, groupId: string | null): void {
    const doc = this.brush.document;
    if (!doc) return;
    const index = BrushStructureStore.layerIndexOf(doc, id);
    if (index === -1) return;
    if (groupId !== null && !doc.appliedGroups.some((g) => g.id === groupId)) {
      return;
    }
    const current = doc.frames[0].layers[index].appliedGroupId ?? null;
    if (current === groupId) return;

    this.commit(
      "Set applied group",
      (d) =>
        mapLayer(d, id, (l) =>
          groupId === null
            ? withoutAppliedGroup(l)
            : { ...l, appliedGroupId: groupId },
        ),
      false,
    );
  }

  /* ══ Applied groups ═════════════════════════════════════════════════════ */

  /** Append a group. Returns its id, or `""` with no document. */
  addAppliedGroup(name: string): string {
    const doc = this.brush.document;
    if (!doc) return "";
    const groupId = generateId();
    const group: BrushAppliedGroup = { id: groupId, name };

    this.commit(
      "Add applied group",
      (current) => ({
        ...current,
        appliedGroups: [...current.appliedGroups, group],
      }),
      false,
    );
    return groupId;
  }

  renameAppliedGroup(id: string, name: string): void {
    const doc = this.brush.document;
    if (!doc || !doc.appliedGroups.some((g) => g.id === id)) return;
    this.commit(
      "Rename applied group",
      (current) => ({
        ...current,
        appliedGroups: current.appliedGroups.map((g) =>
          g.id === id ? { ...g, name } : g,
        ),
      }),
      false,
    );
  }

  /** Remove the group and clear `appliedGroupId` on every layer that used it. */
  deleteAppliedGroup(id: string): void {
    const doc = this.brush.document;
    if (!doc || !doc.appliedGroups.some((g) => g.id === id)) return;
    this.commit(
      "Delete applied group",
      (current) => {
        const cleared = mapLayers(current, (l) =>
          l.appliedGroupId === id ? withoutAppliedGroup(l) : l,
        );
        return {
          ...cleared,
          appliedGroups: cleared.appliedGroups.filter((g) => g.id !== id),
        };
      },
      false,
    );
  }

  /* ══ Document ═══════════════════════════════════════════════════════════ */

  /**
   * Top-left anchored crop/pad of EVERY grid in every frame to
   * `width × height`. Non-integer or sub-1 dimensions are ignored, as is a
   * resize to the current size.
   */
  resizeBrush(width: number, height: number): void {
    const doc = this.brush.document;
    if (!doc) return;
    if (!isDimension(width) || !isDimension(height)) return;
    if (doc.width === width && doc.height === height) return;

    this.commit(
      "Resize brush",
      (current) => ({
        ...mapLayers(current, (l) => ({
          ...l,
          pixels: resizeGrid(l.pixels, width, height),
        })),
        width,
        height,
      }),
      true,
    );
  }
}
