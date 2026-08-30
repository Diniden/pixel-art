/**
 * FrameStore — frame CRUD over `DomainStore.objects` (REFRESH task 25).
 *
 * Nine actions, all undoable, all ported from `store/frameActions.ts` with no
 * behaviour change: `addFrame`, `deleteFrame`, `deleteSelectedFrame`,
 * `renameFrame`, `duplicateFrame`, `moveFrame`, `reorderFrame`,
 * `addFrameTag`, `removeFrameTag`.
 *
 * `selectFrame` is deliberately NOT here — it is UI state (it writes only the
 * selection) and lives on `TimelineUIStore`. That split is why the two stores
 * ship in one task.
 *
 * ── The selection writes go through an injected sink ──────────────────────
 *
 * Five of the nine also move the selection (adding a frame selects it,
 * deleting one selects the survivor). `stores/domain/**` may not import
 * `stores/ui/**` (ESLint, task 05), so the write arrives through the same
 * injected `SelectionSink` callback `ObjectStore` uses. This file imports
 * nothing from `stores/ui/`.
 *
 * ── Behaviours pinned by task 08 and ported verbatim ──────────────────────
 *
 *  - `deleteFrame` REFUSES when the object has one frame left, and selects
 *    `max(0, index - 1)` — the PREVIOUS frame, not the next.
 *  - `deleteSelectedFrame` calls `deleteFrame` intra-module (the legacy
 *    `frameActions.ts:90` did the same via `get()`); harmless, kept.
 *  - `addFrame(name, copyPrevious)` inserts AFTER the selected frame, not at
 *    the end, and falls back to the end when nothing is selected.
 *  - `duplicateFrame` copies `tags` as a NEW array but leaves every other
 *    frame property shared through the spread.
 *  - `reorderFrame`'s insert index is `fromIndex < toIndex ? toIndex - 1 :
 *    toIndex` — the drag-and-drop off-by-one correction. `toIndex ===
 *    obj.frames.length` is ALLOWED (append), `> length` is not.
 *  - `addFrameTag` trims and LOWERCASES, ignores the empty string, and
 *    de-duplicates; `removeFrameTag` sets `tags` back to `undefined` rather
 *    than `[]` when the last tag goes.
 *
 * ⚠️ Grids: `addFrame(copyPrevious)` and `duplicateFrame` build NEW grids via
 * `pixels.map(row => [...row])`. That is a `ref` REPLACEMENT, R2-legal, and
 * neither ever mutates a grid in place or makes one observable.
 */
import { createDefaultFrame, generateId } from "../../types";
import type { Frame } from "../../types";
import type { DomainMutator } from "./DomainMutator";
import type { DomainStore } from "./DomainStore";
import type { SelectionSink } from "./ObjectStore";

/**
 * The selection context a frame action needs. Plain readers, injected, so
 * `stores/domain/` stays free of UI-store imports.
 */
export interface FrameSelectionSource {
  readonly selectedObjectId: string | null;
  readonly selectedFrameId: string | null;
}

export interface FrameStoreDeps {
  domain: DomainStore;
  mutator: DomainMutator;
  selection: SelectionSink;
  /** Reads the current selection ids. Injected, never imported. */
  source: FrameSelectionSource;
}

export class FrameStore {
  private readonly domain: DomainStore;
  private readonly mutator: DomainMutator;
  private readonly selection: SelectionSink;
  private readonly source: FrameSelectionSource;

  constructor(deps: FrameStoreDeps) {
    this.domain = deps.domain;
    this.mutator = deps.mutator;
    this.selection = deps.selection;
    this.source = deps.source;
  }

  /** The selected object, resolved off the tree. `null` when unset. */
  private currentObject() {
    const id = this.source.selectedObjectId;
    return this.domain.objects.find((o) => o.id === id) ?? null;
  }

  /**
   * Selection ids are written WITHOUT touching `selectedObjectId`, so the
   * sink's third field is echoed back unchanged.
   */
  private selectFrameAndLayer(
    frameId: string | null,
    layerId: string | null,
  ): void {
    this.selection.selectObjectTree({
      selectedObjectId: this.source.selectedObjectId,
      selectedFrameId: frameId,
      selectedLayerId: layerId,
    });
  }

  /**
   * Inserts AFTER the selected frame and selects it.
   *
   * Returns the new frame's id (empty string when there is no object). The
   * frames timeline creates a frame from "+ Add" and immediately opens its
   * name for editing, so it needs to know which item to focus — the same
   * `void` → `string` widening `addLayer` took, for the same reason. Existing
   * callers may ignore the return value.
   */
  addFrame(name: string, copyPrevious: boolean = false): string {
    const obj = this.currentObject();
    if (!obj) return "";
    // Read BEFORE the mutation, exactly as the legacy action did.
    const currentFrame =
      obj.frames.find((f) => f.id === this.source.selectedFrameId) ?? null;

    let created: Frame | null = null;
    this.mutator.commit("Add frame", true, () => {
      const frameId = generateId();
      let newFrame: Frame;

      if (copyPrevious && currentFrame) {
        newFrame = {
          id: frameId,
          name,
          layers: currentFrame.layers.map((l) => ({
            ...l,
            id: generateId(),
            // New grid: a `ref` replacement, never an in-place write.
            pixels: l.pixels.map((row) => [...row]),
          })),
        };
      } else {
        newFrame = createDefaultFrame(
          frameId,
          name,
          obj.gridSize.width,
          obj.gridSize.height,
        );
      }

      // Insert AFTER the selected frame; append when nothing is selected.
      const currentFrameIndex = obj.frames.findIndex(
        (f) => f.id === this.source.selectedFrameId,
      );
      const insertIndex =
        currentFrameIndex >= 0 ? currentFrameIndex + 1 : obj.frames.length;

      created = newFrame;
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        const newFrames = [...o.frames];
        newFrames.splice(insertIndex, 0, newFrame);
        return { ...o, frames: newFrames };
      });
    });

    const frame = created as Frame | null;
    if (frame) {
      this.selectFrameAndLayer(frame.id, frame.layers[0].id);
      return frame.id;
    }
    return "";
  }

  deleteFrame(id: string): void {
    const obj = this.currentObject();
    // Verbatim: the last remaining frame cannot be deleted.
    if (!obj || obj.frames.length <= 1) return;

    let selected: Frame | null = null;
    this.mutator.commit("Delete frame", true, () => {
      const frameIndex = obj.frames.findIndex((f) => f.id === id);
      const newFrames = obj.frames.filter((f) => f.id !== id);
      // The PREVIOUS frame, or the first one.
      const newSelectedIndex = Math.max(0, frameIndex - 1);
      selected = newFrames[newSelectedIndex] || newFrames[0];
      this.domain.objects = this.domain.objects.map((o) =>
        o.id === obj.id ? { ...o, frames: newFrames } : o,
      );
    });

    const frame = selected as Frame | null;
    if (frame) {
      this.selectFrameAndLayer(frame.id, frame.layers[0]?.id ?? null);
    }
  }

  /** Intra-store call, exactly as `frameActions.ts:90` did (harmless, kept). */
  deleteSelectedFrame(): void {
    const id = this.source.selectedFrameId;
    if (!id) return;
    this.deleteFrame(id);
  }

  renameFrame(id: string, name: string): void {
    const obj = this.currentObject();
    if (!obj) return;
    this.mutator.commit("Rename frame", true, () => {
      this.domain.objects = this.domain.objects.map((o) =>
        o.id === obj.id
          ? {
              ...o,
              frames: o.frames.map((f) => (f.id === id ? { ...f, name } : f)),
            }
          : o,
      );
    });
  }

  duplicateFrame(id: string): void {
    const obj = this.currentObject();
    if (!obj) return;

    const sourceFrameIndex = obj.frames.findIndex((f) => f.id === id);
    if (sourceFrameIndex === -1) return;
    const sourceFrame = obj.frames[sourceFrameIndex];

    let created: Frame | null = null;
    this.mutator.commit("Duplicate frame", true, () => {
      const newFrame: Frame = {
        ...sourceFrame,
        id: generateId(),
        name: `${sourceFrame.name} Copy`,
        layers: sourceFrame.layers.map((l) => ({
          ...l,
          id: generateId(),
          pixels: l.pixels.map((row) => [...row]),
        })),
        // A NEW array — the one property the spread does not share.
        tags: sourceFrame.tags ? [...sourceFrame.tags] : undefined,
      };
      created = newFrame;
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        const newFrames = [...o.frames];
        newFrames.splice(sourceFrameIndex + 1, 0, newFrame);
        return { ...o, frames: newFrames };
      });
    });

    const frame = created as Frame | null;
    if (frame) {
      this.selectFrameAndLayer(frame.id, frame.layers[0].id);
    }
  }

  moveFrame(id: string, direction: "left" | "right"): void {
    const obj = this.currentObject();
    if (!obj) return;

    const frameIndex = obj.frames.findIndex((f) => f.id === id);
    if (frameIndex === -1) return;

    const newIndex = direction === "left" ? frameIndex - 1 : frameIndex + 1;
    if (newIndex < 0 || newIndex >= obj.frames.length) return;

    this.mutator.commit("Move frame", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        const newFrames = [...o.frames];
        const [removed] = newFrames.splice(frameIndex, 1);
        newFrames.splice(newIndex, 0, removed);
        return { ...o, frames: newFrames };
      });
    });
  }

  /**
   * Drag-and-drop reorder. Note `toIndex === frames.length` is a legal
   * "append" target, and the insert index is corrected by one when dragging
   * rightwards — that correction is what makes the drop indicator land where
   * the user aimed.
   */
  reorderFrame(frameId: string, toIndex: number): void {
    const obj = this.currentObject();
    if (!obj) return;

    const fromIndex = obj.frames.findIndex((f) => f.id === frameId);
    if (fromIndex === -1) return;
    if (toIndex < 0 || toIndex > obj.frames.length) return;
    if (toIndex === fromIndex) return;

    this.mutator.commit("Reorder frame", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        const newFrames = [...o.frames];
        const [removed] = newFrames.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        newFrames.splice(insertIndex, 0, removed);
        return { ...o, frames: newFrames };
      });
    });
  }

  /** Trims, lowercases, ignores empty, de-duplicates. */
  addFrameTag(frameId: string, tag: string): void {
    const obj = this.currentObject();
    if (!obj) return;
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;

    this.mutator.commit("Add frame tag", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f) => {
            if (f.id !== frameId) return f;
            const tags = f.tags ?? [];
            if (tags.includes(trimmed)) return f;
            return { ...f, tags: [...tags, trimmed] };
          }),
        };
      });
    });
  }

  /** The last tag removed leaves `tags: undefined`, NOT `[]`. */
  removeFrameTag(frameId: string, tag: string): void {
    const obj = this.currentObject();
    if (!obj) return;

    this.mutator.commit("Remove frame tag", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f) => {
            if (f.id !== frameId) return f;
            const tags = (f.tags ?? []).filter((t) => t !== tag);
            return { ...f, tags: tags.length ? tags : undefined };
          }),
        };
      });
    });
  }
}
