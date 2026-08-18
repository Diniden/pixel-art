/**
 * ObjectStore — object CRUD over `DomainStore.objects` (REFRESH task 23).
 *
 * The second trivially-extractable module: `store/objectActions.ts` is 233
 * lines and names its `get` parameter `_get`, **unused**. No cross-module
 * dependency, so it carries the same low risk as `PaletteStore`.
 *
 * ── The six that move here ─────────────────────────────────────────────────
 * `addObject`, `deleteObject`, `renameObject`, `resizeObject`,
 * `duplicateObject`, `setObjectOrigin` — all undoable (`trackHistory=true`
 * today), which is preserved.
 *
 * ── The two that deliberately do NOT ───────────────────────────────────────
 *  - `selectObject` is UI state (it only writes `uiState` selection ids) and
 *    moves to a UI store later. It stays in `objectActions.ts`.
 *  - `setOriginColor` is a tool setting, not an object mutation.
 *
 * ── Selection ids: the bridge-era seam ─────────────────────────────────────
 * Four of the six also move the `uiState` selection (adding an object selects
 * it; deleting one selects the survivor). `uiState` is still Zustand-owned
 * this task, and a domain store may not import a UI store — so the selection
 * write is an injected `SelectionSink` callback, exactly the pattern the
 * architecture prescribes for `VariantStore → TimelineUIStore` later. It is a
 * plain callback, so this file imports nothing from `stores/ui/`.
 *
 * ⚠️ The pixel grids: `resizeObject` and `duplicateObject` both build NEW
 * grids. That is a `ref` write (grid REPLACEMENT), which is exactly what the
 * R2 contract allows and propagates correctly. Neither ever mutates a grid in
 * place, and neither makes one observable.
 */
import {
  createDefaultObject,
  createEmptyPixelGrid,
  generateId,
} from "../../types";
import type { PixelObject } from "../../types";
import {
  getAnchorPadding,
  type AnchorPosition,
} from "../../components/AnchorGrid/AnchorGrid";
import type { DomainMutator } from "./DomainMutator";
import type { DomainStore } from "./DomainStore";

/**
 * Where the `uiState` selection ids are written during the bridge era. A
 * plain callback so `stores/domain/` imports no UI store (ESLint-enforced).
 * Task 24+ points this at `TimelineUIStore`.
 */
export interface SelectionSink {
  selectObjectTree(ids: {
    selectedObjectId: string | null;
    selectedFrameId: string | null;
    selectedLayerId: string | null;
  }): void;
}

export interface ObjectStoreDeps {
  domain: DomainStore;
  mutator: DomainMutator;
  selection: SelectionSink;
}

export class ObjectStore {
  private readonly domain: DomainStore;
  private readonly mutator: DomainMutator;
  private readonly selection: SelectionSink;

  constructor(deps: ObjectStoreDeps) {
    this.domain = deps.domain;
    this.mutator = deps.mutator;
    this.selection = deps.selection;
  }

  addObject(name: string, width: number, height: number): void {
    let created: PixelObject | null = null;
    this.mutator.commit("Add object", true, () => {
      created = createDefaultObject(generateId(), name, width, height);
      this.domain.objects = [...this.domain.objects, created];
    });
    // Verbatim from objectActions.ts: a new object becomes the selection.
    const obj = created as PixelObject | null;
    if (obj) {
      this.selection.selectObjectTree({
        selectedObjectId: obj.id,
        selectedFrameId: obj.frames[0].id,
        selectedLayerId: obj.frames[0].layers[0].id,
      });
    }
  }

  deleteObject(id: string): void {
    let survivor: PixelObject | null = null;
    this.mutator.commit("Delete object", true, () => {
      const remaining = this.domain.objects.filter((o) => o.id !== id);
      // Verbatim: deleting the LAST object substitutes a fresh default rather
      // than leaving the project object-less.
      if (remaining.length === 0) {
        remaining.push(createDefaultObject(generateId(), "Object 1"));
      }
      this.domain.objects = remaining;
      survivor = remaining[0];
    });
    const obj = survivor as PixelObject | null;
    if (obj) {
      this.selection.selectObjectTree({
        selectedObjectId: obj.id,
        selectedFrameId: obj.frames[0]?.id ?? null,
        selectedLayerId: obj.frames[0]?.layers[0]?.id ?? null,
      });
    }
  }

  renameObject(id: string, name: string): void {
    this.mutator.commit("Rename object", true, () => {
      this.domain.objects = this.domain.objects.map((o) =>
        o.id === id ? { ...o, name } : o,
      );
    });
  }

  /**
   * Resize every frame of an object, anchoring the existing pixels and
   * adjusting variant-layer offsets. Transcribed from
   * `objectActions.ts:resizeObject` with no behaviour change.
   */
  resizeObject(
    id: string,
    width: number,
    height: number,
    anchor: AnchorPosition = "middle-center",
  ): void {
    this.mutator.commit("Resize object", true, () => {
      this.domain.objects = this.domain.objects.map((obj) => {
        if (obj.id !== id) return obj;

        const oldWidth = obj.gridSize.width;
        const oldHeight = obj.gridSize.height;
        const { left: leftPadding, top: topPadding } = getAnchorPadding(
          anchor,
          width - oldWidth,
          height - oldHeight,
        );

        const newFrames = obj.frames.map((frame) => ({
          ...frame,
          layers: frame.layers.map((layer) => {
            // A brand-new grid: `ref` REPLACEMENT, never an in-place write.
            const newPixels = createEmptyPixelGrid(width, height);
            for (let y = 0; y < oldHeight; y++) {
              for (let x = 0; x < oldWidth; x++) {
                const newX = x + leftPadding;
                const newY = y + topPadding;
                if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
                  newPixels[newY][newX] = layer.pixels[y]?.[x] ?? 0;
                }
              }
            }

            // Keep variants visually put when pixels are added left/top.
            if (layer.isVariant && layer.variantOffsets) {
              const adjustedOffsets: {
                [variantId: string]: { x: number; y: number };
              } = {};
              for (const [variantId, offset] of Object.entries(
                layer.variantOffsets,
              )) {
                adjustedOffsets[variantId] = {
                  x: offset.x - leftPadding,
                  y: offset.y - topPadding,
                };
              }
              return {
                ...layer,
                pixels: newPixels,
                variantOffsets: adjustedOffsets,
              };
            }
            // Legacy single-offset form, still present in old projects.
            if (layer.isVariant && layer.variantOffset) {
              return {
                ...layer,
                pixels: newPixels,
                variantOffset: {
                  x: layer.variantOffset.x - leftPadding,
                  y: layer.variantOffset.y - topPadding,
                },
              };
            }
            return { ...layer, pixels: newPixels };
          }),
        }));

        return { ...obj, gridSize: { width, height }, frames: newFrames };
      });
    });
  }

  duplicateObject(id: string): void {
    let created: PixelObject | null = null;
    this.mutator.commit("Duplicate object", true, () => {
      const source = this.domain.objects.find((o) => o.id === id);
      if (!source) return;

      const copy: PixelObject = {
        ...source,
        id: generateId(),
        name: `${source.name} Copy`,
        frames: source.frames.map((frame) => ({
          ...frame,
          id: generateId(),
          name: frame.name,
          layers: frame.layers.map((layer) => ({
            ...layer,
            id: generateId(),
            // Row-wise copy — a NEW grid, so this is a `ref` replacement.
            pixels: layer.pixels.map((row) => [...row]),
            variantOffsets: layer.variantOffsets
              ? { ...layer.variantOffsets }
              : undefined,
            variantOffset: layer.variantOffset
              ? { ...layer.variantOffset }
              : undefined,
          })),
        })),
      };
      created = copy;
      this.domain.objects = [...this.domain.objects, copy];
    });
    const obj = created as PixelObject | null;
    if (obj) {
      this.selection.selectObjectTree({
        selectedObjectId: obj.id,
        selectedFrameId: obj.frames[0]?.id ?? null,
        selectedLayerId: obj.frames[0]?.layers[0]?.id ?? null,
      });
    }
  }

  setObjectOrigin(id: string, origin: { x: number; y: number }): void {
    this.mutator.commit("Set origin", true, () => {
      this.domain.objects = this.domain.objects.map((o) =>
        o.id === id ? { ...o, origin } : o,
      );
    });
  }
}
