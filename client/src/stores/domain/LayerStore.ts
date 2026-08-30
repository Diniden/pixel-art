/**
 * LayerStore — layer structure, the timeline cell ops and both clipboards
 * (REFRESH task 25). The largest sub-store in the tree: it absorbs THREE
 * legacy modules.
 *
 *   store/layerActions.ts         14 actions  (763 lines)
 *   store/timelineActions.ts       6 actions  (317 lines) — layer ops with a
 *                                             frame scope, not a distinct
 *                                             concern
 *   store/layerClipboardActions.ts 3 actions  (837 lines)
 *
 * `selectLayer` is deliberately NOT here — it writes only the selection, so
 * it is UI and lives on `TimelineUIStore`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  R14 — THE CLIPBOARDS LIVE ON `SessionStore` AND SURVIVE A PROJECT SWITCH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `layerClipboard` and `timelineCellClipboard` are STATE on `SessionStore`
 * (task 14), whose lifetime is the browser tab, not the project. This store
 * holds the clipboard OPERATIONS and reads/writes that state through the
 * injected session reference — it does not own the buffers.
 *
 * That is not an implementation detail. `copyLayerFromObject` exists
 * precisely to move layers between objects and projects, nothing in
 * `store/projectActions.ts` clears either buffer on switch (verified: the
 * `set()` calls at `:67`, `:95` and `:150` touch only `project`,
 * `projectName`, `projectList`, `projectHistory`, `historyIndex`), and task
 * 08 pinned the behaviour with two tests in
 * `src/store/__tests__/layers.test.ts`:
 *
 *     "CROSS-PROJECT: copy in A, switch project, paste in B still works"
 *     "CROSS-PROJECT: createNewProject also leaves the clipboard intact"
 *
 * **Never add a `reset()`, `clear()` or project-switch hook to this store or
 * to `SessionStore`, and never move the clipboard STATE onto a project-scoped
 * store.** Doing so silently deletes a workflow the owner uses.
 *
 * ── ⚠️ THE FOUR `squash*` VARIANTS ARE NOT COLLAPSED — DELIBERATELY ───────
 *
 * They are near-identical and one parameterised core would obviously do. They
 * are nevertheless ported one-for-one, because task 08 measured that they
 * DISAGREE, and collapsing while porting makes any regression impossible to
 * attribute. The pinned differences, all reproduced below:
 *
 *  1. `Down` and `Up` both pass the squashed layer as `src` and the survivor
 *     as `dst`, so **`squashLayerUp` composites the LOWER layer OVER the
 *     upper one** — inverted relative to how the canvas renders. This is a
 *     bug, pinned as observed behaviour, NOT fixed here.
 *  2. The `AcrossAllFrames` pair matches layers **by ARRAY INDEX**, not by id
 *     and not by name. The single-frame pair matches by id.
 *  3. The per-frame skip guards are **asymmetric**: `len <= idx` for Down,
 *     `len <= idx + 1` for Up.
 *  4. **None of the four consults `visible`.** A hidden layer's pixels are
 *     blended in regardless.
 *
 * The call-site callbacks collapse in task 35; the STORE ACTIONS stay four.
 *
 * ── Another divergence ported faithfully: `addLayerToAllFrames` ───────────
 *
 * It generates `layerId` up front, then generates a SEPARATE id for each
 * frame's layer — and selects `layerId`, which belongs to no layer at all.
 * The selection therefore resolves to `null` through `currentLayer`. Observed
 * behaviour, ported unchanged (`timelineActions.ts:15-40`).
 *
 * ── Boundaries ────────────────────────────────────────────────────────────
 *
 * Imports nothing from `stores/ui/**` (ESLint-enforced). Every grid it builds
 * is a NEW array assigned wholesale — a `ref` replacement, R2-legal — and no
 * grid is ever mutated in place or made observable.
 */
import {
  createDefaultLayer,
  createEmptyPixelGrid,
  generateId,
} from "../../types";
import type {
  Frame,
  Layer,
  PixelData,
  Variant,
  VariantGroup,
} from "../../types";
import { blendPixels } from "../../utils/alphaBlend";
import type { LayerClipboard } from "../../store/storeTypes";
import type { SessionStore } from "../session/SessionStore";
import type { DomainMutator } from "./DomainMutator";
import type { DomainStore } from "./DomainStore";
import type { SelectionSink } from "./ObjectStore";

/**
 * The UI values a layer action needs, supplied as READS. `variantFrameIndices`
 * and the selection ids are passed in rather than read across the store
 * boundary — the spec's rule, and what keeps `stores/domain/` free of UI
 * imports.
 */
export interface LayerSelectionSource {
  readonly selectedObjectId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
  readonly variantFrameIndices: { [variantGroupId: string]: number };
  /** `uiState.moveAllLayers` — read by `moveLayerPixels`. */
  readonly moveAllLayers: boolean;
}

export interface LayerStoreDeps {
  domain: DomainStore;
  mutator: DomainMutator;
  /** Where the two clipboards live. NEVER reset on a project switch (R14). */
  session: SessionStore;
  selection: SelectionSink;
  source: LayerSelectionSource;
  /**
   * Writes `variantFrameIndices` back after a variant paste. Injected for the
   * same reason as `SelectionSink`: `stores/domain/` may not import a UI
   * store.
   */
  setVariantFrameIndex(variantGroupId: string, index: number): void;
}

/** Deep-copy one `PixelData`. The exact shape all three legacy modules used. */
function copyPixel(pd: PixelData): PixelData {
  return {
    color:
      pd.color === 0
        ? 0
        : { r: pd.color.r, g: pd.color.g, b: pd.color.b, a: pd.color.a },
    normal:
      pd.normal === 0 ? 0 : { x: pd.normal.x, y: pd.normal.y, z: pd.normal.z },
    height: pd.height,
  } as PixelData;
}

/** Deep-copy a whole grid. Always produces a NEW array (a `ref` replacement). */
function copyGrid(pixels: PixelData[][]): PixelData[][] {
  return pixels.map((row) => row.map(copyPixel));
}

/**
 * Centre-pad or centre-crop `source` into a `width`×`height` grid. Never
 * scales and never refuses. `Math.floor` on the offset is why an ODD size
 * difference biases the content TOP-LEFT (pinned by task 08).
 */
function fitGrid(
  source: PixelData[][],
  width: number,
  height: number,
): PixelData[][] {
  const sourceWidth = source[0]?.length ?? 0;
  const sourceHeight = source.length;

  if (sourceWidth === width && sourceHeight === height) {
    return copyGrid(source);
  }

  const pixels = createEmptyPixelGrid(width, height);
  const offsetX = Math.floor((width - sourceWidth) / 2);
  const offsetY = Math.floor((height - sourceHeight) / 2);
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const targetX = x + offsetX;
      const targetY = y + offsetY;
      if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
        pixels[targetY][targetX] = copyPixel(source[y][x]);
      }
    }
  }
  return pixels;
}

export class LayerStore {
  private readonly domain: DomainStore;
  private readonly mutator: DomainMutator;
  private readonly session: SessionStore;
  private readonly selection: SelectionSink;
  private readonly source: LayerSelectionSource;
  private readonly setVariantFrameIndex: LayerStoreDeps["setVariantFrameIndex"];

  constructor(deps: LayerStoreDeps) {
    this.domain = deps.domain;
    this.mutator = deps.mutator;
    this.session = deps.session;
    this.selection = deps.selection;
    this.source = deps.source;
    this.setVariantFrameIndex = deps.setVariantFrameIndex;
  }

  /* ── resolution helpers, mirroring the legacy `get().getCurrentX()` ────── */

  private currentObject() {
    const id = this.source.selectedObjectId;
    return this.domain.objects.find((o) => o.id === id) ?? null;
  }

  private currentFrame(): Frame | null {
    const obj = this.currentObject();
    if (!obj) return null;
    return obj.frames.find((f) => f.id === this.source.selectedFrameId) ?? null;
  }

  private currentLayer(): Layer | null {
    const frame = this.currentFrame();
    if (!frame) return null;
    return (
      frame.layers.find((l) => l.id === this.source.selectedLayerId) ?? null
    );
  }

  /** Write only `selectedLayerId`, echoing the other two ids unchanged. */
  private selectLayerId(layerId: string | null): void {
    this.selection.selectObjectTree({
      selectedObjectId: this.source.selectedObjectId,
      selectedFrameId: this.source.selectedFrameId,
      selectedLayerId: layerId,
    });
  }

  /** Replace the frames of the selected object. The common write shape. */
  private mapFrames(
    objectId: string,
    fn: (frame: Frame, index: number) => Frame,
  ): void {
    this.domain.objects = this.domain.objects.map((o) =>
      o.id === objectId ? { ...o, frames: o.frames.map(fn) } : o,
    );
  }

  /* ══ from layerActions.ts (14) ═══════════════════════════════════════════ */

  /**
   * Appends to the END of the array — the TOP of the stack.
   *
   * Returns the new layer's id. `LayerPanel` creates a layer from the "+"
   * button and immediately opens its name for editing, so it needs to know
   * which row to focus — widening `void` to `string` is the least-coupled way
   * to say that. Existing callers may ignore the return value.
   */
  addLayer(name: string): string {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return "";

    const layerId = generateId();
    this.mutator.commit("Add layer", true, () => {
      const newLayer = createDefaultLayer(
        layerId,
        name,
        obj.gridSize.width,
        obj.gridSize.height,
      );
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id ? { ...f, layers: [...f.layers, newLayer] } : f,
      );
    });
    this.selectLayerId(layerId);
    return layerId;
  }

  /**
   * Inserts DIRECTLY ABOVE the source, not at the top.
   *
   * ⚠️ Pinned quirk: the copy SHARES `PixelData` objects with the source —
   * `pixels.map(row => [...row])` copies the row arrays but not the cells.
   * Observed behaviour, ported unchanged.
   */
  duplicateLayer(id: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const sourceLayer = frame.layers.find((l) => l.id === id);
    if (!sourceLayer) return;

    const newLayerId = generateId();
    this.mutator.commit("Duplicate layer", true, () => {
      const newLayer = {
        ...sourceLayer,
        id: newLayerId,
        name: `${sourceLayer.name} Copy`,
        pixels: sourceLayer.pixels.map((row) => [...row]),
      };
      const sourceIndex = frame.layers.findIndex((l) => l.id === id);
      const newLayers = [...frame.layers];
      newLayers.splice(sourceIndex + 1, 0, newLayer);
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id ? { ...f, layers: newLayers } : f,
      );
    });
    this.selectLayerId(newLayerId);
  }

  /**
   * REFUSES to delete the last remaining layer, and always selects
   * `layers[0]` — the BOTTOM, not the neighbour (pinned by task 08).
   */
  deleteLayer(id: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame || frame.layers.length <= 1) return;

    let selectedId: string | null = null;
    this.mutator.commit("Delete layer", true, () => {
      const newLayers = frame.layers.filter((l) => l.id !== id);
      selectedId = newLayers[0].id;
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id ? { ...f, layers: newLayers } : f,
      );
    });
    this.selectLayerId(selectedId);
  }

  renameLayer(id: string, name: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;
    this.mutator.commit("Rename layer", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id
          ? {
              ...f,
              layers: f.layers.map((l) => (l.id === id ? { ...l, name } : l)),
            }
          : f,
      );
    });
  }

  toggleLayerVisibility(id: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;
    this.mutator.commit("Toggle layer visibility", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id
          ? {
              ...f,
              layers: f.layers.map((l) =>
                l.id === id ? { ...l, visible: !l.visible } : l,
              ),
            }
          : f,
      );
    });
  }

  /** SETS an absolute value; it does not toggle (pinned by task 08). */
  toggleAllLayersVisibility(visible: boolean): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;
    this.mutator.commit("Toggle all layers visibility", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id
          ? { ...f, layers: f.layers.map((l) => ({ ...l, visible })) }
          : f,
      );
    });
  }

  moveLayer(fromIndex: number, toIndex: number): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;
    this.mutator.commit("Move layer", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.id !== frame.id) return f;
        const newLayers = [...f.layers];
        const [removed] = newLayers.splice(fromIndex, 1);
        newLayers.splice(toIndex, 0, removed);
        return { ...f, layers: newLayers };
      });
    });
  }

  /**
   * ⚠️ Reorders BY INDEX in every frame, ignoring ids in the other frames
   * (pinned by task 08). `"up"` means index + 1; a frame with too few layers
   * is skipped entirely.
   */
  moveLayerAcrossAllFrames(layerId: string, direction: "up" | "down"): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const currentLayerIndex = frame.layers.findIndex((l) => l.id === layerId);
    if (currentLayerIndex === -1) return;

    const targetIndex =
      direction === "up" ? currentLayerIndex + 1 : currentLayerIndex - 1;
    // Bounds are checked against the CURRENT frame: if it cannot move here,
    // it does not move anywhere.
    if (targetIndex < 0 || targetIndex >= frame.layers.length) return;

    this.mutator.commit("Move layer across frames", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.layers.length <= currentLayerIndex) return f;
        const newLayers = [...f.layers];
        if (targetIndex < 0 || targetIndex >= newLayers.length) return f;
        const [removed] = newLayers.splice(currentLayerIndex, 1);
        newLayers.splice(targetIndex, 0, removed);
        return { ...f, layers: newLayers };
      });
    });
  }

  /** Deletes by INDEX in every frame. Refuses when the current frame has one. */
  deleteLayerAcrossAllFrames(layerId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const currentLayerIndex = frame.layers.findIndex((l) => l.id === layerId);
    if (currentLayerIndex === -1) return;
    if (frame.layers.length <= 1) return;

    let newSelectedLayerId: string | null = null;
    this.mutator.commit("Delete layer across frames", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.layers.length <= 1 || f.layers.length <= currentLayerIndex) {
          return f;
        }
        const newLayers = f.layers.filter(
          (_, index) => index !== currentLayerIndex,
        );
        if (f.id === frame.id && newLayers.length > 0) {
          const targetIndex = Math.min(currentLayerIndex, newLayers.length - 1);
          newSelectedLayerId = newLayers[targetIndex].id;
        }
        return { ...f, layers: newLayers };
      });
    });

    // Verbatim `newSelectedLayerId || uiState.selectedLayerId`: an unresolved
    // selection leaves the old one in place.
    this.selectLayerId(newSelectedLayerId || this.source.selectedLayerId);
  }

  /* ── the four squash* variants. NOT collapsed — see the header. ────────── */

  /** Single frame, matched by ID. The layer BELOW survives. */
  squashLayerDown(layerId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
    if (layerIndex === -1 || layerIndex === 0) return; // bottom cannot go down

    const currentLayer = frame.layers[layerIndex];
    const layerBelow = frame.layers[layerIndex - 1];
    if (currentLayer.isVariant || layerBelow.isVariant) return;

    const { width, height } = obj.gridSize;

    this.mutator.commit("Squash layer down", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id
          ? {
              ...f,
              layers: f.layers
                .map((l, idx) => {
                  if (idx === layerIndex - 1) {
                    const newPixels = createEmptyPixelGrid(width, height);
                    for (let y = 0; y < height; y++) {
                      for (let x = 0; x < width; x++) {
                        const belowPixel = l.pixels[y]?.[x] || 0;
                        const currentPixel =
                          f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                        // src = the squashed layer, dst = the survivor.
                        newPixels[y][x] = blendPixels(currentPixel, belowPixel);
                      }
                    }
                    return { ...l, pixels: newPixels };
                  }
                  return l;
                })
                .filter((_l, idx) => idx !== layerIndex),
            }
          : f,
      );
    });
    this.selectLayerId(layerBelow.id);
  }

  /**
   * Single frame, matched by ID. The layer ABOVE survives.
   *
   * ⚠️ DIVERGENCE (pinned): the blend arguments are the SAME as `Down`'s —
   * the squashed layer is `src`, the survivor is `dst` — so this composites
   * the LOWER layer OVER the upper one, inverted relative to the canvas.
   * Ported unchanged; do not "fix" it here.
   */
  squashLayerUp(layerId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
    if (layerIndex === -1 || layerIndex === frame.layers.length - 1) return;

    const currentLayer = frame.layers[layerIndex];
    const layerAbove = frame.layers[layerIndex + 1];
    if (currentLayer.isVariant || layerAbove.isVariant) return;

    const { width, height } = obj.gridSize;

    this.mutator.commit("Squash layer up", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id
          ? {
              ...f,
              layers: f.layers
                .map((l, idx) => {
                  if (idx === layerIndex + 1) {
                    const newPixels = createEmptyPixelGrid(width, height);
                    for (let y = 0; y < height; y++) {
                      for (let x = 0; x < width; x++) {
                        const abovePixel = l.pixels[y]?.[x] || 0;
                        const currentPixel =
                          f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                        newPixels[y][x] = blendPixels(currentPixel, abovePixel);
                      }
                    }
                    return { ...l, pixels: newPixels };
                  }
                  return l;
                })
                .filter((_l, idx) => idx !== layerIndex),
            }
          : f,
      );
    });
    this.selectLayerId(layerAbove.id);
  }

  /**
   * All frames, matched by ARRAY INDEX. Skip guard: `len <= idx`.
   * (The `Up` variant's guard is `len <= idx + 1` — the asymmetry is pinned.)
   */
  squashLayerDownAcrossAllFrames(layerId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
    if (layerIndex === -1 || layerIndex === 0) return;

    const currentLayer = frame.layers[layerIndex];
    const layerBelow = frame.layers[layerIndex - 1];
    if (currentLayer.isVariant || layerBelow.isVariant) return;

    const { width, height } = obj.gridSize;

    this.mutator.commit("Squash layer down across frames", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.layers.length <= layerIndex) return f;

        const fCurrentLayer = f.layers[layerIndex];
        const fLayerBelow = f.layers[layerIndex - 1];
        if (fCurrentLayer.isVariant || fLayerBelow.isVariant) return f;

        return {
          ...f,
          layers: f.layers
            .map((l, idx) => {
              if (idx === layerIndex - 1) {
                const newPixels = createEmptyPixelGrid(width, height);
                for (let y = 0; y < height; y++) {
                  for (let x = 0; x < width; x++) {
                    const belowPixel = l.pixels[y]?.[x] || 0;
                    const currentPixel =
                      f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                    newPixels[y][x] = blendPixels(currentPixel, belowPixel);
                  }
                }
                return { ...l, pixels: newPixels };
              }
              return l;
            })
            .filter((_l, idx) => idx !== layerIndex),
        };
      });
    });
    this.selectLayerId(layerBelow.id);
  }

  /**
   * All frames, matched by ARRAY INDEX. Skip guard: `len <= idx + 1`.
   * Carries the same inverted-blend divergence as `squashLayerUp`.
   */
  squashLayerUpAcrossAllFrames(layerId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const layerIndex = frame.layers.findIndex((l) => l.id === layerId);
    if (layerIndex === -1 || layerIndex === frame.layers.length - 1) return;

    const currentLayer = frame.layers[layerIndex];
    const layerAbove = frame.layers[layerIndex + 1];
    if (currentLayer.isVariant || layerAbove.isVariant) return;

    const { width, height } = obj.gridSize;

    this.mutator.commit("Squash layer up across frames", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.layers.length <= layerIndex + 1) return f;

        const fCurrentLayer = f.layers[layerIndex];
        const fLayerAbove = f.layers[layerIndex + 1];
        if (fCurrentLayer.isVariant || fLayerAbove.isVariant) return f;

        return {
          ...f,
          layers: f.layers
            .map((l, idx) => {
              if (idx === layerIndex + 1) {
                const newPixels = createEmptyPixelGrid(width, height);
                for (let y = 0; y < height; y++) {
                  for (let x = 0; x < width; x++) {
                    const abovePixel = l.pixels[y]?.[x] || 0;
                    const currentPixel =
                      f.layers[layerIndex]?.pixels[y]?.[x] || 0;
                    newPixels[y][x] = blendPixels(currentPixel, abovePixel);
                  }
                }
                return { ...l, pixels: newPixels };
              }
              return l;
            })
            .filter((_l, idx) => idx !== layerIndex),
        };
      });
    });
    this.selectLayerId(layerAbove.id);
  }

  /**
   * Translate pixels WITHOUT wrapping, clipping what falls off the edge.
   *
   * Two paths, exactly as the legacy action: a variant layer moves the
   * VARIANT's frame pixels, a regular layer moves the object's. The variant
   * path resolves its frame index from `variantFrameIndices`, which is passed
   * in through {@link LayerSelectionSource} rather than read across the store
   * boundary.
   */
  moveLayerPixels(dx: number, dy: number): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    const layer = this.currentLayer();
    if (!obj || !frame || !layer) return;

    if (layer.isVariant && layer.variantGroupId && layer.selectedVariantId) {
      const variantGroupId = layer.variantGroupId;
      const variantId = layer.selectedVariantId;
      const variantGroup = this.domain.variants.find(
        (vg) => vg.id === variantGroupId,
      );
      const variant = variantGroup?.variants.find((v) => v.id === variantId);
      // The legacy action bailed when `getCurrentVariant()` was null; the
      // group/variant lookup is the same resolution, so the same guard.
      if (!variantGroup || !variant) return;

      const { width, height } = variant.gridSize;
      const frameIndex = this.source.variantFrameIndices?.[variantGroupId] ?? 0;

      this.mutator.commit("Move layer pixels", true, () => {
        this.domain.variants = this.domain.variants.map((vg) => {
          if (vg.id !== variantGroupId) return vg;
          return {
            ...vg,
            variants: vg.variants.map((v) => {
              if (v.id !== variantId) return v;
              return {
                ...v,
                frames: v.frames.map((f, idx) => {
                  if (idx !== frameIndex % v.frames.length) return f;
                  return {
                    ...f,
                    layers: f.layers.map((l) => ({
                      ...l,
                      pixels: shiftGrid(l.pixels, dx, dy, width, height),
                    })),
                  };
                }),
              };
            }),
          };
        });
      });
      return;
    }

    const { width, height } = obj.gridSize;
    const moveAll = this.source.moveAllLayers;

    this.mutator.commit("Move layer pixels", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frame.id
          ? {
              ...f,
              layers: f.layers.map((l) => {
                if (!moveAll && l.id !== layer.id) return l;
                return {
                  ...l,
                  pixels: shiftGrid(l.pixels, dx, dy, width, height),
                };
              }),
            }
          : f,
      );
    });
  }

  /* ══ from timelineActions.ts (4 layer ops + 2 clipboard) ═════════════════ */

  /**
   * ⚠️ DIVERGENCE ported faithfully: `layerId` is generated up front and
   * SELECTED, but each frame's layer gets its own `generateId()`. The
   * selected id therefore matches no layer. Observed behaviour
   * (`timelineActions.ts:15-40`), not a transcription slip.
   */
  addLayerToAllFrames(name: string): string {
    const obj = this.currentObject();
    if (!obj) return "";

    const layerId = generateId();
    this.mutator.commit("Add layer to all frames", true, () => {
      this.mapFrames(obj.id, (f) => {
        const newLayer = createDefaultLayer(
          generateId(),
          name,
          obj.gridSize.width,
          obj.gridSize.height,
        );
        return { ...f, layers: [...f.layers, newLayer] };
      });
    });
    this.selectLayerId(layerId);
    return name;
  }

  /**
   * Rename every layer called `oldName` across ALL frames.
   *
   * The timeline is keyed by NAME, not by id: one header row stands for the
   * layers of that name in every frame, and `moveLayerAcrossAllFrames` and the
   * header colours match by name too. Renaming a single frame's layer would
   * therefore split one header into two and desynchronise the move ops, so the
   * timeline's inline rename has to hit every frame at once.
   *
   * A no-op when `newName` is already taken by a different layer name — merging
   * two header rows is not a rename, and the timeline has no way to undo it.
   */
  renameLayerAcrossAllFrames(oldName: string, newName: string): void {
    const obj = this.currentObject();
    if (!obj) return;
    if (oldName === newName) return;

    const nameExists = obj.frames.some((f) =>
      f.layers.some((l) => l.name === newName),
    );
    if (nameExists) return;

    this.mutator.commit("Rename layer across all frames", true, () => {
      this.mapFrames(obj.id, (f) => ({
        ...f,
        layers: f.layers.map((l) =>
          l.name === oldName ? { ...l, name: newName } : l,
        ),
      }));
    });
  }

  /** Returns the new layer's id, or `""` when there is no selected object. */
  addLayerToFrameAtPosition(
    frameId: string,
    name: string,
    position: number,
    variantInfo?: {
      isVariant?: boolean;
      variantGroupId?: string;
      selectedVariantId?: string;
      variantOffsets?: { [variantId: string]: { x: number; y: number } };
      variantOffset?: { x: number; y: number };
    },
  ): string {
    const obj = this.currentObject();
    if (!obj) return "";

    const layerId = generateId();
    this.mutator.commit("Add layer to frame", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.id !== frameId) return f;
        const newLayer: Layer = {
          ...createDefaultLayer(
            layerId,
            name,
            obj.gridSize.width,
            obj.gridSize.height,
          ),
          ...(variantInfo?.isVariant
            ? {
                isVariant: true,
                variantGroupId: variantInfo.variantGroupId,
                selectedVariantId: variantInfo.selectedVariantId,
                variantOffsets: variantInfo.variantOffsets,
                variantOffset: variantInfo.variantOffset,
              }
            : {}),
        };
        const newLayers = [...f.layers];
        newLayers.splice(position, 0, newLayer);
        return { ...f, layers: newLayers };
      });
    });
    this.selectLayerId(layerId);
    return layerId;
  }

  deleteLayerFromFrame(frameId: string, layerId: string): void {
    const obj = this.currentObject();
    if (!obj) return;

    const frame = obj.frames.find((f) => f.id === frameId);
    if (!frame || frame.layers.length <= 1) return;

    this.mutator.commit("Delete layer from frame", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frameId
          ? { ...f, layers: f.layers.filter((l) => l.id !== layerId) }
          : f,
      );
    });

    // Only re-select when the DELETED layer was the selected one, and pick
    // the first survivor from the PRE-delete frame — verbatim.
    if (this.source.selectedLayerId === layerId) {
      this.selectLayerId(
        frame.layers.find((l) => l.id !== layerId)?.id ?? null,
      );
    }
  }

  reorderLayerInFrame(
    frameId: string,
    layerId: string,
    newIndex: number,
  ): void {
    const obj = this.currentObject();
    if (!obj) return;

    this.mutator.commit("Reorder layer in frame", true, () => {
      this.mapFrames(obj.id, (f) => {
        if (f.id !== frameId) return f;
        const currentIndex = f.layers.findIndex((l) => l.id === layerId);
        if (currentIndex === -1 || currentIndex === newIndex) return f;
        const newLayers = [...f.layers];
        const [removed] = newLayers.splice(currentIndex, 1);
        newLayers.splice(newIndex, 0, removed);
        return { ...f, layers: newLayers };
      });
    });
  }

  /**
   * Copy one timeline cell into `SessionStore.timelineCellClipboard`.
   * Touches neither the project nor history — it is a pure read.
   */
  copyTimelineCell(frameId: string, layerId: string): void {
    const obj = this.currentObject();
    if (!obj) return;

    const frame = obj.frames.find((f) => f.id === frameId);
    if (!frame) return;

    const layer = frame.layers.find((l) => l.id === layerId);
    if (!layer) return;

    this.session.setTimelineCellClipboard({
      layerName: layer.name,
      pixels: copyGrid(layer.pixels),
      isVariant: layer.isVariant,
      variantGroupId: layer.variantGroupId,
      selectedVariantId: layer.selectedVariantId,
      variantOffsets: layer.variantOffsets,
      variantOffset: layer.variantOffset,
    });
  }

  /**
   * Paste a timeline cell over an existing layer. A non-variant clipboard
   * STRIPS the target's variant properties — pasting a normal layer over a
   * variant one clears the variant metadata rather than leaving it stale.
   */
  pasteTimelineCell(frameId: string, targetLayerId: string): void {
    const clipboard = this.session.timelineCellClipboard;
    if (!clipboard) return;

    const obj = this.currentObject();
    if (!obj) return;

    const frame = obj.frames.find((f) => f.id === frameId);
    if (!frame) return;

    const targetLayer = frame.layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const newPixels = copyGrid(clipboard.pixels);

    let updatedLayer: Layer;
    if (clipboard.isVariant) {
      updatedLayer = {
        ...targetLayer,
        pixels: newPixels,
        isVariant: true,
        variantGroupId: clipboard.variantGroupId,
        selectedVariantId: clipboard.selectedVariantId,
        variantOffsets: clipboard.variantOffsets,
        variantOffset: clipboard.variantOffset,
      };
    } else {
      const {
        isVariant: _isVariant,
        variantGroupId: _variantGroupId,
        selectedVariantId: _selectedVariantId,
        variantOffsets: _variantOffsets,
        variantOffset: _variantOffset,
        ...rest
      } = targetLayer;
      updatedLayer = { ...rest, pixels: newPixels } as Layer;
    }

    this.mutator.commit("Paste timeline cell", true, () => {
      this.mapFrames(obj.id, (f) =>
        f.id === frameId
          ? {
              ...f,
              layers: f.layers.map((l) =>
                l.id === targetLayerId ? updatedLayer : l,
              ),
            }
          : f,
      );
    });
  }

  /* ══ from layerClipboardActions.ts (3) ═══════════════════════════════════ */

  /**
   * Copy a layer into `SessionStore.layerClipboard` — the CROSS-PROJECT
   * buffer (R14). Touches neither the project nor history.
   *
   * Two shapes: a variant layer copies the ENTIRE variant group with all its
   * variants; a regular layer collects the same-NAMED layer from EVERY frame,
   * substituting an empty grid where a frame has none.
   */
  copyLayerToClipboard(layerId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const layer = frame.layers.find((l) => l.id === layerId);
    if (!layer) return;

    if (layer.isVariant && layer.variantGroupId) {
      const variantGroup = this.domain.variants.find(
        (vg) => vg.id === layer.variantGroupId,
      );
      if (!variantGroup) return;

      const copiedVariantGroup: VariantGroup = {
        id: generateId(),
        name: variantGroup.name,
        variants: variantGroup.variants.map((variant) => ({
          id: generateId(),
          name: variant.name,
          gridSize: { ...variant.gridSize },
          frames: variant.frames.map((f) => ({
            id: generateId(),
            layers: f.layers.map((l) => ({
              ...l,
              id: generateId(),
              pixels: copyGrid(l.pixels),
            })),
          })),
          baseFrameOffsets: { ...variant.baseFrameOffsets },
        })),
      };

      this.session.setLayerClipboard({
        type: "variant",
        variantGroup: copiedVariantGroup,
        variantId: copiedVariantGroup.variants[0].id,
      });
      return;
    }

    const layerName = layer.name;
    const layerFrames: LayerClipboard["layerFrames"] = [];
    // Remembered so a later `currentFrameOnly` paste uses the frame the user
    // copied FROM, not whichever frame is selected at paste time.
    const sourceFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

    for (const f of obj.frames) {
      const matchingLayer = f.layers.find(
        (l) => l.name === layerName && !l.isVariant,
      );
      if (matchingLayer) {
        layerFrames.push({
          name: matchingLayer.name,
          pixels: copyGrid(matchingLayer.pixels),
          visible: matchingLayer.visible,
        });
      } else {
        layerFrames.push({
          name: layerName,
          pixels: createEmptyPixelGrid(obj.gridSize.width, obj.gridSize.height),
          visible: true,
        });
      }
    }

    this.session.setLayerClipboard({
      type: "layer",
      layerFrames,
      sourceFrameIndex,
    });
  }

  /**
   * Paste from the cross-project clipboard. Appends to the TOP of the stack
   * and — pinned by task 08 — does NOT change the selected layer.
   *
   * `currentFrameOnly=false` (the default) pastes into every frame, ADDING
   * frames to the object when the clipboard holds more than it has.
   */
  pasteLayerFromClipboard(currentFrameOnly: boolean = false): void {
    const clipboard = this.session.layerClipboard;
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!clipboard || !obj || !frame) return;

    const currentFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

    if (clipboard.type === "variant" && clipboard.variantGroup) {
      const sourceVariantGroup = clipboard.variantGroup;
      if (sourceVariantGroup.variants.length === 0) return;

      const newVariantGroupId = generateId();
      const newVariants: Variant[] = sourceVariantGroup.variants.map(
        (sourceVariant) => ({
          id: generateId(),
          name: sourceVariant.name,
          gridSize: { ...sourceVariant.gridSize },
          frames: sourceVariant.frames.map((f) => ({
            id: generateId(),
            layers: f.layers.map((l) => ({
              ...l,
              id: generateId(),
              pixels: copyGrid(l.pixels),
            })),
          })),
          baseFrameOffsets: { ...sourceVariant.baseFrameOffsets },
        }),
      );

      const newVariantGroup: VariantGroup = {
        id: newVariantGroupId,
        name: sourceVariantGroup.name,
        variants: newVariants,
      };
      const selectedVariantId = newVariants[0].id;

      const getOffsetsForFrame = (frameIndex: number) => {
        const offsets: { [variantId: string]: { x: number; y: number } } = {};
        for (const sourceVariant of sourceVariantGroup.variants) {
          const newVariant = newVariants.find(
            (_, i) => sourceVariantGroup.variants[i].id === sourceVariant.id,
          );
          if (newVariant) {
            offsets[newVariant.id] = sourceVariant.baseFrameOffsets?.[
              frameIndex
            ] ?? { x: 0, y: 0 };
          }
        }
        return offsets;
      };

      const makeVariantLayer = (idx: number): Layer => ({
        id: generateId(),
        name: sourceVariantGroup.name,
        pixels: createEmptyPixelGrid(obj.gridSize.width, obj.gridSize.height),
        visible: true,
        isVariant: true,
        variantGroupId: newVariantGroupId,
        selectedVariantId,
        variantOffsets: getOffsetsForFrame(idx),
      });

      this.mutator.commit("Paste layer", true, () => {
        this.domain.variants = [...this.domain.variants, newVariantGroup];
        this.mapFrames(obj.id, (f, idx) => {
          if (currentFrameOnly && idx !== currentFrameIndex) return f;
          return { ...f, layers: [...f.layers, makeVariantLayer(idx)] };
        });
      });
      this.setVariantFrameIndex(newVariantGroupId, 0);
      return;
    }

    if (clipboard.type === "layer" && clipboard.layerFrames) {
      const sourceFrames = clipboard.layerFrames;
      if (sourceFrames.length === 0) return;

      const layerName = sourceFrames[0].name;
      const { width, height } = obj.gridSize;

      if (currentFrameOnly) {
        // Use the index captured at COPY time, not the current selection.
        const clipboardSourceFrameIndex =
          clipboard.sourceFrameIndex ?? currentFrameIndex;
        const sourceFrameIndex = Math.min(
          clipboardSourceFrameIndex,
          sourceFrames.length - 1,
        );
        const sourceData = sourceFrames[sourceFrameIndex];

        this.mutator.commit("Paste layer", true, () => {
          const newLayer: Layer = {
            id: generateId(),
            name: layerName,
            pixels: fitGrid(sourceData.pixels, width, height),
            visible: sourceData.visible,
          };
          this.mapFrames(obj.id, (f, idx) =>
            idx === currentFrameIndex
              ? { ...f, layers: [...f.layers, newLayer] }
              : f,
          );
        });
        return;
      }

      const neededFrames = sourceFrames.length;
      const currentFrames = obj.frames.length;

      this.mutator.commit("Paste layer", true, () => {
        this.domain.objects = this.domain.objects.map((o) => {
          if (o.id !== obj.id) return o;

          let newFrames = [...o.frames];
          // The clipboard may hold more frames than the object has: extend by
          // DUPLICATING the last frame, exactly as the legacy action did.
          if (neededFrames > currentFrames) {
            const lastFrame = newFrames[newFrames.length - 1];
            for (let i = currentFrames; i < neededFrames; i++) {
              newFrames.push({
                id: generateId(),
                name: `Frame ${i + 1}`,
                layers: lastFrame.layers.map((l) => ({
                  ...l,
                  id: generateId(),
                  pixels: l.pixels.map((row) => [...row]),
                })),
              } as Frame);
            }
          }

          newFrames = newFrames.map((f, frameIndex) => {
            // An object with MORE frames than the source reuses the last one.
            const sourceData =
              sourceFrames[frameIndex] ?? sourceFrames[sourceFrames.length - 1];
            const newLayer: Layer = {
              id: generateId(),
              name: layerName,
              pixels: fitGrid(sourceData.pixels, width, height),
              visible: sourceData.visible,
            };
            return { ...f, layers: [...f.layers, newLayer] };
          });

          return { ...o, frames: newFrames };
        });
      });
    }
  }

  /**
   * Copy a layer directly from another object, BYPASSING the clipboard —
   * this is the cross-object move `CopyFromModal` drives.
   *
   * ⚠️ Pinned quirk: the regular-layer branch resolves `sourceLayerId`
   * against the source object's **FIRST frame only**. A layer that exists
   * only on a later frame is not found and the action is a no-op.
   */
  copyLayerFromObject(
    sourceObjectId: string,
    sourceLayerId: string,
    isVariant: boolean,
    variantGroupId?: string,
    _variantId?: string,
  ): void {
    const targetObj = this.currentObject();
    const targetFrame = this.currentFrame();
    if (!targetObj || !targetFrame) return;

    const sourceObj = this.domain.objects.find((o) => o.id === sourceObjectId);
    if (!sourceObj) return;

    if (isVariant && variantGroupId) {
      const sourceVariantGroup = this.domain.variants.find(
        (vg) => vg.id === variantGroupId,
      );
      if (!sourceVariantGroup || sourceVariantGroup.variants.length === 0) {
        return;
      }

      const newVariantGroupId = generateId();
      const newVariants: Variant[] = sourceVariantGroup.variants.map(
        (sourceVariant) => ({
          id: generateId(),
          name: sourceVariant.name,
          gridSize: { ...sourceVariant.gridSize },
          frames: sourceVariant.frames.map((f) => ({
            id: generateId(),
            layers: f.layers.map((l) => ({
              ...l,
              id: generateId(),
              pixels: copyGrid(l.pixels),
            })),
          })),
          baseFrameOffsets: { ...sourceVariant.baseFrameOffsets },
        }),
      );

      const newVariantGroup: VariantGroup = {
        id: newVariantGroupId,
        name: sourceVariantGroup.name,
        variants: newVariants,
      };
      const selectedVariantId = newVariants[0].id;

      const getOffsetsForFrame = (frameIndex: number) => {
        const offsets: { [variantId: string]: { x: number; y: number } } = {};
        for (const sourceVariant of sourceVariantGroup.variants) {
          const newVariant = newVariants.find(
            (_, i) => sourceVariantGroup.variants[i].id === sourceVariant.id,
          );
          if (newVariant) {
            offsets[newVariant.id] = sourceVariant.baseFrameOffsets?.[
              frameIndex
            ] ?? { x: 0, y: 0 };
          }
        }
        return offsets;
      };

      this.mutator.commit("Copy layer from object", true, () => {
        this.domain.variants = [...this.domain.variants, newVariantGroup];
        this.mapFrames(targetObj.id, (f, idx) => ({
          ...f,
          layers: [
            ...f.layers,
            {
              id: generateId(),
              name: sourceVariantGroup.name,
              pixels: createEmptyPixelGrid(
                targetObj.gridSize.width,
                targetObj.gridSize.height,
              ),
              visible: true,
              isVariant: true,
              variantGroupId: newVariantGroupId,
              selectedVariantId,
              variantOffsets: getOffsetsForFrame(idx),
            } as Layer,
          ],
        }));
      });
      this.setVariantFrameIndex(newVariantGroupId, 0);
      return;
    }

    // ── the regular-layer branch: FIRST FRAME ONLY (see the doc comment) ──
    const sourceFrame = sourceObj.frames[0];
    if (!sourceFrame) return;

    const sourceLayer = sourceFrame.layers.find((l) => l.id === sourceLayerId);
    if (!sourceLayer) return;

    const layerName = sourceLayer.name;
    const { width: targetWidth, height: targetHeight } = targetObj.gridSize;

    const sourceFrames: { pixels: PixelData[][]; visible: boolean }[] = [];
    for (const f of sourceObj.frames) {
      const matchingLayer = f.layers.find(
        (l) => l.name === layerName && !l.isVariant,
      );
      if (matchingLayer) {
        sourceFrames.push({
          pixels: matchingLayer.pixels,
          visible: matchingLayer.visible,
        });
      } else {
        sourceFrames.push({
          pixels: createEmptyPixelGrid(
            sourceObj.gridSize.width,
            sourceObj.gridSize.height,
          ),
          visible: true,
        });
      }
    }

    const neededFrames = sourceFrames.length;
    const currentFrames = targetObj.frames.length;

    this.mutator.commit("Copy layer from object", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== targetObj.id) return o;

        let newFrames = [...o.frames];
        if (neededFrames > currentFrames) {
          const lastFrame = newFrames[newFrames.length - 1];
          for (let i = currentFrames; i < neededFrames; i++) {
            newFrames.push({
              id: generateId(),
              name: `Frame ${i + 1}`,
              layers: lastFrame.layers.map((l) => ({
                ...l,
                id: generateId(),
                pixels: l.pixels.map((row) => [...row]),
              })),
            } as Frame);
          }
        }

        newFrames = newFrames.map((f, frameIndex) => {
          const sourceData =
            sourceFrames[frameIndex] ?? sourceFrames[sourceFrames.length - 1];
          const newLayer: Layer = {
            id: generateId(),
            name: layerName,
            pixels: fitGrid(sourceData.pixels, targetWidth, targetHeight),
            visible: sourceData.visible,
          };
          return { ...f, layers: [...f.layers, newLayer] };
        });

        return { ...o, frames: newFrames };
      });
    });
  }
}

/**
 * Translate a grid by (dx, dy) without wrapping. Always returns a NEW grid,
 * so this is a `ref` replacement and never an in-place pixel write.
 */
function shiftGrid(
  pixels: PixelData[][],
  dx: number,
  dy: number,
  width: number,
  height: number,
): PixelData[][] {
  const newPixels = createEmptyPixelGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - dx;
      const srcY = y - dy;
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        newPixels[y][x] = pixels[srcY][srcX];
      }
    }
  }
  return newPixels;
}
