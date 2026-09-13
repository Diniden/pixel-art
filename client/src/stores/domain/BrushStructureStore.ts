/**
 * BrushStructureStore — every STRUCTURAL edit of a brush project (Brush
 * Studio plan, `docs/01-brush-studio`, task 08; multi-brush projects,
 * `docs/14-multi-brush-projects`, task 09; MASTER D5 / D6 / D7 / D8 / D9).
 *
 * A behaviour module over `BrushStore.document`, the brush analogue of
 * `./FrameStore.ts` + `./LayerStore.ts` folded into one. A document is a
 * PROJECT holding many brushes (`doc.brushes`); every frame / layer / applied
 * group / resize op here acts on the SELECTED brush — resolved by
 * `source.selectedBrushId`, else `brushes[0]` (`brushIn`, MASTER D4) — and
 * the "Brushes" section manages the brushes themselves (add / duplicate /
 * delete / rename / move). Each public method is exactly ONE undoable
 * `brush.commit(...)` — one whole-document snapshot entry in `BrushStore`'s
 * own history — or a silent no-op when there is no document or the target
 * does not exist.
 *
 * ── Layers are UNIFORM across frames (D6) ──────────────────────────────────
 * A brush layer's id is stable across every frame of ITS brush: the same ids
 * in the same order in every `frame.layers`. So every layer op here is
 * applied to EVERY frame of the selected brush — "add" appends the same
 * `{id, name, channelType}` with a fresh grid to each frame, "move" swaps the
 * same adjacent pair in each frame, "delete" drops the id from each frame.
 * There is deliberately NO per-frame reorder API (MASTER §1: only layer
 * swapping, uniform). `assertUniformLayers` runs on the result of every
 * brush mutate before it is committed, so a broken invariant throws out of
 * the op and the live document is left untouched. Frame and layer ids are
 * unique WITHIN a brush only — `duplicateBrush` keeps them.
 *
 * ── Immutable spine writes (D8) ────────────────────────────────────────────
 * `mutate` never edits its argument. Every op returns a NEW document built by
 * spine copies — the brushes array, the touched brush, its frames array, each
 * touched frame, its layers array, each touched layer — and grids are copied
 * only when their CONTENTS change (`addFrame(copy)`, `duplicate*`,
 * `resizeBrush`). Every OTHER brush, and every untouched frame, layer and
 * grid, is shared by reference with the previous document, which is what
 * keeps the retained snapshot in history valid (`brushCommands.ts`, "held by
 * reference"). `commitBrush` is the one place `doc.brushes` is replaced
 * element-wise; the brush-list ops rebuild the array themselves.
 *
 * ── Boundaries ─────────────────────────────────────────────────────────────
 * Imports nothing from `stores/ui/**` (ESLint-enforced). The selection is
 * READ through an injected `BrushSelectionSource` and WRITTEN through an
 * injected `BrushSelectionSink` — `ApplicationStore` (task 11) passes
 * `BrushUIStore` for both, exactly the `FrameStore` / `LayerStore` pattern;
 * its `selectBrush(id)` adapter supplies the document to
 * `brushUI.selectBrush(id, doc)`. No `makeObservable` here: every observable
 * write happens inside `BrushStore.commit` (an action) or the sink's own
 * actions.
 */
import {
  assertBrushDocument,
  assertUniformLayers,
  brushIn,
  brushLayerColorSource,
  createBrush,
  createBrushLayer,
  createEmptyBrushGrid,
  generateId,
  type Brush,
  type BrushAppliedGroup,
  type BrushCell,
  type BrushChannelType,
  type BrushColorSource,
  type BrushDocument,
  type BrushFrame,
  type BrushLayer,
} from "../../types";
import type { BrushStore } from "./BrushStore";

/** The selection ids a structural op reads. Injected, never imported. */
export interface BrushSelectionSource {
  readonly selectedBrushId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
}

/** Where a structural op writes the selection after adding or deleting. */
export interface BrushSelectionSink {
  /** `ApplicationStore` adapts this to `brushUI.selectBrush(id, document)`. */
  selectBrush(id: string): void;
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
/**
 * `"up"` = toward index 0. Brushes display in ARRAY order (index 0 on top),
 * unlike layers, whose list is reversed.
 */
export type BrushMoveDirection = "up" | "down";

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

/* ── pure brush helpers ──────────────────────────────────────────────────── */

/** Spine-copy every frame of a brush through `fn`. */
function mapFrames(
  brush: Brush,
  fn: (frame: BrushFrame, index: number) => BrushFrame,
): Brush {
  return { ...brush, frames: brush.frames.map(fn) };
}

/** Spine-copy every layer of every frame through `fn`. */
function mapLayers(
  brush: Brush,
  fn: (layer: BrushLayer, index: number, frame: BrushFrame) => BrushLayer,
): Brush {
  return mapFrames(brush, (frame) => ({
    ...frame,
    layers: frame.layers.map((layer, i) => fn(layer, i, frame)),
  }));
}

/** Spine-copy every layer with id `id` in every frame through `fn`. */
function mapLayer(
  brush: Brush,
  id: string,
  fn: (layer: BrushLayer) => BrushLayer,
): Brush {
  return mapLayers(brush, (layer) => (layer.id === id ? fn(layer) : layer));
}

/** A layer without its `appliedGroupId` key (omitted, not `undefined`). */
function withoutAppliedGroup(layer: BrushLayer): BrushLayer {
  const { appliedGroupId: _dropped, ...rest } = layer;
  return rest;
}

/**
 * A layer without its `colorSource` key (omitted, not `undefined`) — the
 * absent key IS `"selected"` (plan 13 D1), so the default never writes one.
 */
function withoutColorSource(layer: BrushLayer): BrushLayer {
  const { colorSource: _dropped, ...rest } = layer;
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

/** Replace the element at `index` with `item` in a NEW array. */
function replacedAt<T>(items: readonly T[], index: number, item: T): T[] {
  const next = [...items];
  next[index] = item;
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
   * ONE whole-document snapshot commit, used by the brush-list ops. The
   * document invariant (≥ 1 brush, unique ids, every brush uniform) is
   * asserted on every changed result BEFORE it reaches history or the live
   * document; `mutate` returning its argument means "nothing to do" and
   * `BrushStore.commit` records nothing. `bumpPixels` is passed for every op
   * that changes what the canvas or the timeline renders; pure relabels and
   * reorders of the brush list omit it.
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
        if (next !== doc) assertBrushDocument(next);
        return next;
      },
      { bumpPixels },
    );
  }

  /**
   * The selected brush's index in `doc.brushes`: `source.selectedBrushId` if
   * present, else `0`, else `-1` for an empty array — the `brushIn` rule.
   */
  private selectedBrushIndex(doc: BrushDocument): number {
    const id = this.source.selectedBrushId;
    if (id !== null) {
      const index = doc.brushes.findIndex((b) => b.id === id);
      if (index !== -1) return index;
    }
    return doc.brushes.length > 0 ? 0 : -1;
  }

  /**
   * ONE snapshot commit scoped to the SELECTED brush. The index is resolved
   * from the LIVE document inside the commit callback; the brush goes
   * through `mutate`, `assertUniformLayers` runs on a changed result, and
   * the document is spine-copied — `{ ...doc, brushes: replacedAt(...) }` —
   * so every other brush keeps its identity (MASTER R3). `mutate` returning
   * its argument means "nothing to do" and records nothing.
   */
  private commitBrush(
    label: string,
    mutate: (brush: Brush) => Brush,
    bumpPixels: boolean,
  ): void {
    this.brush.commit(
      label,
      (doc) => {
        const index = this.selectedBrushIndex(doc);
        if (index === -1) return doc;
        const before = doc.brushes[index];
        const next = mutate(before);
        if (next === before) return doc;
        assertUniformLayers(next);
        return { ...doc, brushes: replacedAt(doc.brushes, index, next) };
      },
      { bumpPixels },
    );
  }

  /** The selected brush of the live document, or `null` (the pre-check read). */
  private selectedBrush(): Brush | null {
    return brushIn(this.brush.document, this.source.selectedBrushId);
  }

  /** The layer ids are uniform (D6), so frame 0 is THE layer list. */
  private static layerIndexOf(brush: Brush, id: string): number {
    const first = brush.frames[0];
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
    const brush = this.selectedBrush();
    if (!brush || brush.frames.length === 0) return "";

    const selectedIndex = brush.frames.findIndex(
      (f) => f.id === this.source.selectedFrameId,
    );
    const templateIndex =
      selectedIndex >= 0 ? selectedIndex : brush.frames.length - 1;
    const template = brush.frames[templateIndex];
    const frameId = generateId();
    const frameName = name ?? `Frame ${brush.frames.length + 1}`;

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush) return;
    const sourceIndex = brush.frames.findIndex((f) => f.id === id);
    if (sourceIndex === -1) return;
    const source = brush.frames[sourceIndex];
    const frameId = generateId();

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush || brush.frames.length <= 1) return;
    const index = brush.frames.findIndex((f) => f.id === id);
    if (index === -1) return;

    const remaining = brush.frames.filter((f) => f.id !== id);
    const survivor = remaining[Math.max(0, index - 1)] ?? remaining[0];

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush || !brush.frames.some((f) => f.id === id)) return;
    this.commitBrush(
      "Rename frame",
      (current) =>
        mapFrames(current, (f) => (f.id === id ? { ...f, name } : f)),
      false,
    );
  }

  /** Swap with the neighbour on that side; a no-op at either end. */
  moveFrame(id: string, direction: BrushFrameDirection): void {
    const brush = this.selectedBrush();
    if (!brush) return;
    const index = brush.frames.findIndex((f) => f.id === id);
    if (index === -1) return;
    const target = direction === "left" ? index - 1 : index + 1;
    if (target < 0 || target >= brush.frames.length) return;

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush) return;
    const fromIndex = brush.frames.findIndex((f) => f.id === id);
    if (fromIndex === -1) return;
    if (!Number.isInteger(toIndex)) return;
    if (toIndex < 0 || toIndex > brush.frames.length) return;
    if (toIndex === fromIndex || toIndex === fromIndex + 1) return;

    this.commitBrush(
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
   * Append the same `{id, name, channelType, colorSource}` with a fresh empty
   * grid to the TOP (array end) of every frame, and select it. The
   * `colorSource` key is born only for `"target"` (plan 13 D1 / D2). Returns
   * the new id, or `""` with no document.
   */
  addLayer(
    name: string,
    channelType: BrushChannelType,
    colorSource: BrushColorSource = "selected",
  ): string {
    const brush = this.selectedBrush();
    if (!brush) return "";
    const layerId = generateId();

    this.commitBrush(
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
              colorSource,
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
    const brush = this.selectedBrush();
    if (!brush || brush.frames.length === 0) return;
    const layers = brush.frames[0].layers;
    if (layers.length <= 1) return;
    const index = layers.findIndex((l) => l.id === id);
    if (index === -1) return;

    const remaining = layers.filter((l) => l.id !== id);
    const survivor = remaining[Math.max(0, index - 1)] ?? remaining[0];

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush || BrushStructureStore.layerIndexOf(brush, id) === -1) return;
    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush) return;
    const index = BrushStructureStore.layerIndexOf(brush, id);
    if (index === -1) return;
    const visible = !brush.frames[0].layers[index].visible;

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush || brush.frames.length === 0) return;
    const index = BrushStructureStore.layerIndexOf(brush, id);
    if (index === -1) return;
    const target = direction === "up" ? index + 1 : index - 1;
    if (target < 0 || target >= brush.frames[0].layers.length) return;

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush) return "";
    const index = BrushStructureStore.layerIndexOf(brush, id);
    if (index === -1) return "";
    const layerId = generateId();

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush) return;
    const index = BrushStructureStore.layerIndexOf(brush, id);
    if (index === -1) return;
    if (brush.frames[0].layers[index].channelType === channelType) return;

    this.commitBrush(
      "Change channel type",
      (current) => mapLayer(current, id, (l) => ({ ...l, channelType })),
      true,
    );
  }

  /**
   * Relabel: every frame's copy of the layer gets the source; `"selected"`
   * drops the key (the absent key is the default, plan 13 D1). Grids are
   * shared untouched. A colour source changes what FUTURE strokes do, not
   * what the studio renders, so `pixelVersion` is not bumped (D2) — only
   * `domainVersion`, which is what the pixel-studio brush memo keys on.
   */
  setLayerColorSource(id: string, source: BrushColorSource): void {
    const brush = this.selectedBrush();
    if (!brush) return;
    const index = BrushStructureStore.layerIndexOf(brush, id);
    if (index === -1) return;
    if (brushLayerColorSource(brush.frames[0].layers[index]) === source) {
      return;
    }

    this.commitBrush(
      "Change colour source",
      (b) =>
        mapLayer(b, id, (l) =>
          source === "target"
            ? { ...l, colorSource: "target" }
            : withoutColorSource(l),
        ),
      false,
    );
  }

  /**
   * Assign the layer to an applied group in every frame, or clear it with
   * `null`. A `groupId` that is not in `appliedGroups` is ignored.
   */
  setLayerAppliedGroup(id: string, groupId: string | null): void {
    const brush = this.selectedBrush();
    if (!brush) return;
    const index = BrushStructureStore.layerIndexOf(brush, id);
    if (index === -1) return;
    if (
      groupId !== null &&
      !brush.appliedGroups.some((g) => g.id === groupId)
    ) {
      return;
    }
    const current = brush.frames[0].layers[index].appliedGroupId ?? null;
    if (current === groupId) return;

    this.commitBrush(
      "Set applied group",
      (b) =>
        mapLayer(b, id, (l) =>
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
    const brush = this.selectedBrush();
    if (!brush) return "";
    const groupId = generateId();
    const group: BrushAppliedGroup = { id: groupId, name };

    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush || !brush.appliedGroups.some((g) => g.id === id)) return;
    this.commitBrush(
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
    const brush = this.selectedBrush();
    if (!brush || !brush.appliedGroups.some((g) => g.id === id)) return;
    this.commitBrush(
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
   * Top-left anchored crop/pad of EVERY grid in every frame of the selected
   * brush to `width × height`. Non-integer or sub-1 dimensions are ignored,
   * as is a resize to that brush's current size.
   */
  resizeBrush(width: number, height: number): void {
    const brush = this.selectedBrush();
    if (!brush) return;
    if (!isDimension(width) || !isDimension(height)) return;
    if (brush.width === width && brush.height === height) return;

    this.commitBrush(
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

  /* ══ Brushes — the project's brush list (MASTER D5) ═════════════════════ */

  /**
   * Append a fresh `width × height` brush (one frame, one empty rgb layer)
   * and select it. Non-integer or sub-1 dimensions are ignored. Returns the
   * new id, or `""` with no document.
   */
  addBrush(name: string, width = 16, height = 16): string {
    const doc = this.brush.document;
    if (!doc) return "";
    if (!isDimension(width) || !isDimension(height)) return "";
    const brushId = generateId();

    this.commit(
      "Add brush",
      (current) => ({
        ...current,
        brushes: [
          ...current.brushes,
          createBrush(brushId, name, width, height),
        ],
      }),
      true,
    );
    this.select.selectBrush(brushId);
    return brushId;
  }

  /**
   * A deep copy of brush `id` — every grid copied, applied groups copied,
   * frame and layer ids KEPT (they are unique within a brush only) — named
   * `"<name> Copy"`, inserted directly after the source and selected.
   * Returns the new id, or `""` when there is no document or no such brush.
   */
  duplicateBrush(id: string): string {
    const doc = this.brush.document;
    if (!doc) return "";
    const sourceIndex = doc.brushes.findIndex((b) => b.id === id);
    if (sourceIndex === -1) return "";
    const source = doc.brushes[sourceIndex];
    const brushId = generateId();

    this.commit(
      "Duplicate brush",
      (current) => {
        const copy: Brush = {
          ...source,
          id: brushId,
          name: `${source.name} Copy`,
          frames: source.frames.map((frame) => ({
            ...frame,
            layers: frame.layers.map((l) => ({
              ...l,
              pixels: copyGrid(l.pixels),
            })),
          })),
          appliedGroups: source.appliedGroups.map((g) => ({ ...g })),
        };
        return {
          ...current,
          brushes: inserted(current.brushes, sourceIndex + 1, copy),
        };
      },
      true,
    );
    this.select.selectBrush(brushId);
    return brushId;
  }

  /**
   * REFUSES to delete the last remaining brush (no-op). When the deleted
   * brush was the selected one (or nothing was selected), the PREVIOUS brush
   * (or the new first) is selected — the `deleteFrame` rule; deleting an
   * unselected brush leaves the selection alone.
   */
  deleteBrush(id: string): void {
    const doc = this.brush.document;
    if (!doc || doc.brushes.length <= 1) return;
    const index = doc.brushes.findIndex((b) => b.id === id);
    if (index === -1) return;

    const remaining = doc.brushes.filter((b) => b.id !== id);
    const survivor = remaining[Math.max(0, index - 1)] ?? remaining[0];

    this.commit(
      "Delete brush",
      (current) => ({
        ...current,
        brushes: current.brushes.filter((b) => b.id !== id),
      }),
      true,
    );
    if (this.source.selectedBrushId === id || !this.source.selectedBrushId) {
      this.select.selectBrush(survivor.id);
    }
  }

  /** Relabel one brush; every other brush is shared. No pixel bump. */
  renameBrush(id: string, name: string): void {
    const doc = this.brush.document;
    if (!doc || !doc.brushes.some((b) => b.id === id)) return;
    this.commit(
      "Rename brush",
      (current) => ({
        ...current,
        brushes: current.brushes.map((b) => (b.id === id ? { ...b, name } : b)),
      }),
      false,
    );
  }

  /**
   * Swap with the neighbour: `"up"` = index − 1 (toward the top of the
   * displayed list), `"down"` = index + 1; a no-op at either end. The list
   * reorders and nothing painted changes, so no pixel bump.
   */
  moveBrush(id: string, direction: BrushMoveDirection): void {
    const doc = this.brush.document;
    if (!doc) return;
    const index = doc.brushes.findIndex((b) => b.id === id);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= doc.brushes.length) return;

    this.commit(
      "Move brush",
      (current) => ({
        ...current,
        brushes: swapped(current.brushes, index, target),
      }),
      false,
    );
  }
}
