/**
 * VariantStore — the 17 variant DOMAIN actions (REFRESH task 28).
 *
 * The last and largest slice of the store migration: `store/variantActions.ts`
 * is **1,412 lines and 20 actions**, the biggest single module in the store.
 * Seventeen of the twenty are domain mutations and live here. The other
 * three — `selectVariant`… no: **`selectVariant` is one of the seventeen**,
 * because it writes `layer.selectedVariantId` on the OBJECTS tree. The three
 * that left are `selectVariantFrame`, `advanceVariantFrames` and (per the
 * task spec's list) `selectVariant` — and the spec is wrong on that last one.
 *
 * ⚠️ SPEC CORRECTION. Task 28 lists `selectVariant` among the three actions
 * moving to `TimelineUIStore` "because they write UI state". It does not: it
 * writes `selectedVariantId` on every host LAYER of the group, which is
 * domain data on `project.objects`, and it writes no `uiState` field at all.
 * Moving it to a UI store would have made `stores/ui/**` a writer of the
 * objects tree. It stays a domain action; only `selectVariantFrame` and
 * `advanceVariantFrames` — which write `variantFrameIndices` and the
 * selection ids and nothing else — moved.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS STORE MUTATES BOTH `objects` AND `variants`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Variants are the most entangled domain in the codebase: `makeVariant`,
 * `deleteVariant`, `deleteVariantGroup`, `resizeVariant`, `setVariantOffset`,
 * `selectVariant`, `addVariantLayerFromExisting` and `removeVariantLayer` all
 * write `project.objects` **and** `project.variants` in a single operation —
 * a variant group is meaningless without the host layers that point at it.
 *
 * That is exactly why the architecture keeps ONE observable tree with
 * behaviour modules over it rather than splitting the data across sub-stores
 * (`mobx-architecture.md`, "why domain sub-stores mutate DomainStore's
 * tree"; `DomainMutator`'s header cites this very module as the measurement
 * behind the decision). Splitting the DATA would have turned this file's
 * ordinary two-field write into a cross-store transaction.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TWO INJECTED CALLBACKS — the store graph's last cross-module edge
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `stores/domain/**` may not import `stores/ui/**` (ESLint, task 05), so the
 * two UI writes arrive as plain functions:
 *
 *   `selectLayer(id)`
 *       Retires the store graph's ONLY true cross-module call. The spec
 *       (task 28 §"The last cross-module edge") places it in `makeVariant`
 *       and `removeVariantLayer`; **the spec is wrong about the first** —
 *       reading `variantActions.ts` at HEAD, the two `get().selectLayer`
 *       call sites are in `deleteVariantGroup` (after the group is removed)
 *       and `removeVariantLayer`. `makeVariant` never calls it. Both real
 *       sites are ported below, verbatim, and both go through this callback.
 *
 *   `setVariantFrameIndex(groupId, index)`
 *       `variantFrameIndices` is UI state owned by `TimelineUIStore`. Eight
 *       legacy sites wrote it inline inside the same `updateProjectAndSave`
 *       that mutated the domain; here the UI write is a separate, explicit
 *       call.
 *
 * ⚠️ **ORDERING IS LOAD-BEARING.** `setVariantFrameIndex` must run BEFORE
 * `mutator.commit()`, never after. `DomainMutator.commit()` publishes
 * `domain.currentProject()`, which recombines the MobX tree with the
 * `uiState` the Zustand host holds AT THAT MOMENT. Writing the index
 * afterwards still lands in Zustand, but the project object the commit
 * already published carries the stale index — and any consumer holding that
 * reference (every memoised thumbnail) shows the old variant frame. Running
 * it first makes the committed tree and the published `uiState` agree.
 *
 * The legacy code got this for free by writing both inside one project
 * rebuild; splitting the ownership is what makes the order explicit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  BEHAVIOURS PORTED VERBATIM — pinned by task 08 (`store/__tests__/variants.test.ts`)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  - `makeVariant` sizes the variant grid to the LARGEST single-frame
 *    bounding box (not the union), records each base frame's box origin in
 *    `baseFrameOffsets`, repositions every frame's pixels to the variant
 *    grid's top-left, and replaces the source layer with a host layer AT THE
 *    SAME INDEX. A layer with no pixels yields a minimum 1×1 variant.
 *  - `deleteVariant` REFUSES to remove the last variant in a group, and
 *    repoints every host layer that pointed at the deleted one.
 *  - `deleteVariantFrame` REFUSES to remove the last frame, and selects
 *    `max(0, index - 1)` — the PREVIOUS frame.
 *  - `resizeVariant` compensates `baseFrameOffsets` AND per-layer
 *    `variantOffsets`/`variantOffset` for padding added left/top, so a resize
 *    leaves the art visually put.
 *  - `setVariantOffset` implements the 4-level fallback as an if/return
 *    ladder using a **TRUTHINESS check**, not `??`. That is a real divergence
 *    from `ApplicationStore.currentVariant` (which uses `??`), pinned by task
 *    08's "DIVERGENCE: uses a TRUTHINESS check, so a {0,0} level-1 entry
 *    FALLS THROUGH". It is ported unchanged — see the note at the method.
 *  - `addVariantFrameTag` trims and LOWERCASES, ignores the empty string and
 *    de-duplicates; `removeVariantFrameTag` sets `tags` back to `undefined`
 *    rather than `[]` when the last tag goes.
 *  - `reorderVariantFrame`'s insert index is
 *    `fromIndex < toIndex ? toIndex - 1 : toIndex`, and it shifts the
 *    selected index by the same three-branch rule.
 *  - `addVariantLayerFromExisting` appends the host layer to the END of
 *    `layers` despite its comment saying "Add to top" — observed, not fixed.
 *  - Every one of the seventeen is UNDOABLE except `selectVariant`
 *    (`trackHistory=false` today, preserved).
 *
 * ── ⚠️ Do NOT re-implement the 4-level offset fallback for READS ──────────
 *
 * `ApplicationStore.currentVariant` is the one resolver (task 23), with all
 * four branches tested. Nothing here reads an offset for rendering;
 * `setVariantOffset`'s ladder is a WRITE-path base-value lookup with its own
 * pinned divergence and is not the same function.
 *
 * ── ⚠️ Object-level `variantGroups` is NEVER read or written ──────────────
 *
 * `project.variants` has been the source of truth since v1.1.0; the migration
 * sets `obj.variantGroups` to `undefined` on load.
 *
 * ── R2: grids ─────────────────────────────────────────────────────────────
 *
 * Every grid this store produces is a NEW array assigned wholesale — a `ref`
 * REPLACEMENT. Nothing is mutated in place, nothing is made observable, and
 * no grid is ever structurally compared.
 */
import { createEmptyPixelGrid, generateId } from "../../types";
import type {
  Frame,
  Layer,
  Pixel,
  PixelData,
  Variant,
  VariantFrame,
  VariantGroup,
} from "../../types";
import {
  getAnchorPadding,
  type AnchorPosition,
} from "../../utils/variantHelpers";
import type { DomainMutator } from "./DomainMutator";
import type { DomainStore } from "./DomainStore";

/**
 * The UI selection a variant action needs, supplied as READS — the same
 * one-way getter seam `FrameStore`, `LayerStore` and `PixelStore` use.
 */
export interface VariantSelectionSource {
  readonly selectedObjectId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
  readonly variantFrameIndices: { [variantGroupId: string]: number };
}

export interface VariantStoreDeps {
  domain: DomainStore;
  mutator: DomainMutator;
  /** Reads the current selection. Injected, never imported. */
  source: VariantSelectionSource;
  /**
   * `TimelineUIStore.selectLayer`, as a plain `(id: string) => void`. THE
   * store graph's last cross-module edge, now an injected callback.
   */
  selectLayer(id: string): void;
  /**
   * `TimelineUIStore.setVariantFrameIndex`. ⚠️ Call BEFORE `commit()` — see
   * the ordering note in the module header.
   */
  setVariantFrameIndex(variantGroupId: string, index: number): void;
  /**
   * `TimelineUIStore.replaceVariantFrameIndices` — REPLACES the whole record
   * rather than merging into it. `deleteVariantGroup` needs to REMOVE a key,
   * which a merging setter cannot express.
   */
  replaceVariantFrameIndices(next: { [variantGroupId: string]: number }): void;
}

export class VariantStore {
  private readonly domain: DomainStore;
  private readonly mutator: DomainMutator;
  private readonly source: VariantSelectionSource;
  private readonly selectLayerCallback: VariantStoreDeps["selectLayer"];
  private readonly setVariantFrameIndex: VariantStoreDeps["setVariantFrameIndex"];
  private readonly replaceVariantFrameIndices: VariantStoreDeps["replaceVariantFrameIndices"];

  constructor(deps: VariantStoreDeps) {
    this.domain = deps.domain;
    this.mutator = deps.mutator;
    this.source = deps.source;
    this.selectLayerCallback = deps.selectLayer;
    this.setVariantFrameIndex = deps.setVariantFrameIndex;
    this.replaceVariantFrameIndices = deps.replaceVariantFrameIndices;
  }

  /* ── resolution helpers (reads only; no fallback logic lives here) ────── */

  private currentObject() {
    const id = this.source.selectedObjectId;
    return this.domain.objects.find((o) => o.id === id) ?? null;
  }

  private currentFrame(): Frame | null {
    const obj = this.currentObject();
    if (!obj) return null;
    const id = this.source.selectedFrameId;
    return obj.frames.find((f) => f.id === id) ?? null;
  }

  private currentLayer(): Layer | null {
    const frame = this.currentFrame();
    if (!frame) return null;
    const id = this.source.selectedLayerId;
    return frame.layers.find((l) => l.id === id) ?? null;
  }

  private group(variantGroupId: string): VariantGroup | undefined {
    return this.domain.variants.find((vg) => vg.id === variantGroupId);
  }

  private variant(
    variantGroupId: string,
    variantId: string,
  ): Variant | undefined {
    return this.group(variantGroupId)?.variants.find((v) => v.id === variantId);
  }

  /**
   * Rewrite ONE variant inside `domain.variants`. Every group-scoped action
   * below funnels through here, which is what keeps the seventeen ports from
   * each re-deriving the `variants.map(vg => …).map(v => …)` shape.
   */
  private mapVariant(
    variantGroupId: string,
    variantId: string,
    fn: (v: Variant) => Variant,
  ): void {
    this.domain.variants = this.domain.variants.map((vg) => {
      if (vg.id !== variantGroupId) return vg;
      return {
        ...vg,
        variants: vg.variants.map((v) => (v.id === variantId ? fn(v) : v)),
      };
    });
  }

  /** Rewrite every layer of every frame of every object. */
  private mapAllLayers(fn: (l: Layer) => Layer): void {
    this.domain.objects = this.domain.objects.map((o) => ({
      ...o,
      frames: o.frames.map((f) => ({ ...f, layers: f.layers.map(fn) })),
    }));
  }

  /* ══ 1. makeVariant — 259 lines at `variantActions.ts:23-282` ═══════════ */

  /**
   * Convert every same-named layer across every frame into ONE variant group.
   *
   * Ported line-for-line. The three measured subtleties, all preserved:
   *
   *  1. The variant grid is sized to the LARGEST SINGLE-FRAME bounding box,
   *     not to the union of all frames' boxes.
   *  2. Each base frame's own box ORIGIN becomes `baseFrameOffsets[i]`, which
   *     is what keeps the variant rendering where the layer used to be.
   *  3. The host layer is inserted at the index of the FIRST matching layer
   *     (or appended when there is none), so z-order is preserved.
   *
   * Note it reads pixels through `pd.color !== 0 && (pd.color as Pixel).a > 0`
   * — the `0` sentinel is "empty" and a zero-alpha pixel does not count as
   * content. Same test in both passes.
   */
  makeVariant(layerId: string): void {
    const obj = this.currentObject();
    if (!obj) return;

    const currentFrame = this.currentFrame();
    if (!currentFrame) return;

    const layerToConvert = currentFrame.layers.find((l) => l.id === layerId);
    if (!layerToConvert || layerToConvert.isVariant) return;

    const layerName = layerToConvert.name;
    const { width: objWidth, height: objHeight } = obj.gridSize;

    const framesPixelData: {
      frameId: string;
      layerIds: string[];
      pixels: PixelData[][];
      frameMinX: number;
      frameMinY: number;
      frameMaxX: number;
      frameMaxY: number;
    }[] = [];

    // First pass: collect pixel data and calculate per-frame bounding boxes
    let maxFrameWidth = 0;
    let maxFrameHeight = 0;
    let hasPixels = false;

    for (const frame of obj.frames) {
      const matchingLayers = frame.layers.filter((l) => l.name === layerName);
      if (matchingLayers.length === 0) {
        // No matching layers in this frame, but we still need an entry
        framesPixelData.push({
          frameId: frame.id,
          layerIds: [],
          pixels: createEmptyPixelGrid(objWidth, objHeight),
          frameMinX: 0,
          frameMinY: 0,
          frameMaxX: 0,
          frameMaxY: 0,
        });
        continue;
      }

      // Combine all matching layers' pixels
      const combinedPixels = createEmptyPixelGrid(objWidth, objHeight);
      let frameMinX = objWidth,
        frameMinY = objHeight,
        frameMaxX = 0,
        frameMaxY = 0;
      let frameHasPixels = false;

      for (const layer of matchingLayers) {
        for (let y = 0; y < objHeight; y++) {
          for (let x = 0; x < objWidth; x++) {
            const pd = layer.pixels[y]?.[x];
            if (pd && pd.color !== 0 && (pd.color as Pixel).a > 0) {
              combinedPixels[y][x] = pd;
              frameMinX = Math.min(frameMinX, x);
              frameMinY = Math.min(frameMinY, y);
              frameMaxX = Math.max(frameMaxX, x);
              frameMaxY = Math.max(frameMaxY, y);
              frameHasPixels = true;
              hasPixels = true;
            }
          }
        }
      }

      // Calculate this frame's bounding box dimensions
      if (frameHasPixels) {
        const frameWidth = frameMaxX - frameMinX + 1;
        const frameHeight = frameMaxY - frameMinY + 1;
        maxFrameWidth = Math.max(maxFrameWidth, frameWidth);
        maxFrameHeight = Math.max(maxFrameHeight, frameHeight);
      }

      framesPixelData.push({
        frameId: frame.id,
        layerIds: matchingLayers.map((l) => l.id),
        pixels: combinedPixels,
        frameMinX: frameHasPixels ? frameMinX : 0,
        frameMinY: frameHasPixels ? frameMinY : 0,
        frameMaxX: frameHasPixels ? frameMaxX : 0,
        frameMaxY: frameHasPixels ? frameMaxY : 0,
      });
    }

    // If no pixels found, use minimum 1x1 size at origin
    if (!hasPixels) {
      maxFrameWidth = 1;
      maxFrameHeight = 1;
    }

    // Variant grid size is the largest single-frame bounding box
    const variantWidth = maxFrameWidth;
    const variantHeight = maxFrameHeight;

    // Create variant frames and base frame offsets
    const variantFrames: VariantFrame[] = [];
    const baseFrameOffsets: {
      [baseFrameIndex: number]: { x: number; y: number };
    } = {};

    for (let i = 0; i < obj.frames.length; i++) {
      const frame: Frame = obj.frames[i];
      const frameData = framesPixelData.find((fd) => fd.frameId === frame.id);

      if (!frameData) {
        // Fallback: create empty frame with default offset
        variantFrames.push({
          id: generateId(),
          layers: [
            {
              id: generateId(),
              name: "Layer 1",
              pixels: createEmptyPixelGrid(variantWidth, variantHeight),
              visible: true,
            },
          ],
        });
        baseFrameOffsets[i] = { x: 0, y: 0 };
        continue;
      }

      // Use this frame's specific bounding box for the offset (preserves position relative to parent)
      const frameOffsetX = frameData.frameMinX;
      const frameOffsetY = frameData.frameMinY;
      const frameWidth = frameData.frameMaxX - frameData.frameMinX + 1;
      const frameHeight = frameData.frameMaxY - frameData.frameMinY + 1;

      // Store offset per base frame index (new system)
      baseFrameOffsets[i] = { x: frameOffsetX, y: frameOffsetY };

      // Extract pixels for this frame, positioned within the variant grid
      const variantPixels = createEmptyPixelGrid(variantWidth, variantHeight);

      if (
        frameData.frameMaxX >= frameData.frameMinX &&
        frameData.frameMaxY >= frameData.frameMinY
      ) {
        // Position pixels at the top-left of the variant grid; the offset
        // preserves their position relative to the parent object.
        for (let y = 0; y < frameHeight; y++) {
          for (let x = 0; x < frameWidth; x++) {
            const srcX = frameData.frameMinX + x;
            const srcY = frameData.frameMinY + y;
            const pd = frameData.pixels[srcY]?.[srcX];
            if (pd && pd.color !== 0 && (pd.color as Pixel).a > 0) {
              if (x < variantWidth && y < variantHeight) {
                variantPixels[y][x] = pd;
              }
            }
          }
        }
      }

      variantFrames.push({
        id: generateId(),
        layers: [
          {
            id: generateId(),
            name: "Layer 1",
            pixels: variantPixels,
            visible: true,
          },
        ],
      });
    }

    const variantGroupId = generateId();
    const variantId = generateId();

    const newVariant: Variant = {
      id: variantId,
      name: layerName,
      gridSize: { width: variantWidth, height: variantHeight },
      frames: variantFrames,
      baseFrameOffsets,
    };

    const newVariantGroup: VariantGroup = {
      id: variantGroupId,
      name: layerName,
      variants: [newVariant],
    };

    // ⚠️ BEFORE the commit — see the ordering note in the module header.
    this.setVariantFrameIndex(variantGroupId, 0);

    this.mutator.commit("Make variant", true, () => {
      this.domain.variants = [...this.domain.variants, newVariantGroup];
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f, frameIndex) => {
            // Preserve the position of the first layer with a matching name.
            const firstMatchingIndex = f.layers.findIndex(
              (l) => l.name === layerName,
            );
            const filteredLayers = f.layers.filter((l) => l.name !== layerName);

            const variantLayer: Layer = {
              id: generateId(),
              name: layerName,
              // Not used for rendering — the host layer's own grid is inert.
              pixels: createEmptyPixelGrid(objWidth, objHeight),
              visible: true,
              isVariant: true,
              variantGroupId,
              selectedVariantId: variantId,
              variantOffsets: {
                [variantId]: baseFrameOffsets[frameIndex] ?? { x: 0, y: 0 },
              },
            };

            const insertIndex =
              firstMatchingIndex >= 0
                ? firstMatchingIndex
                : filteredLayers.length;
            const newLayers = [...filteredLayers];
            newLayers.splice(insertIndex, 0, variantLayer);

            return { ...f, layers: newLayers };
          }),
        };
      });
    });
  }

  /* ══ 2. addVariant ═════════════════════════════════════════════════════ */

  /**
   * Add a variant to a group — empty, or a deep copy of an existing one.
   *
   * The copy path clones each grid row-wise (`pixels.map(row => [...row])`),
   * a `ref` replacement. The empty path takes its geometry from
   * `variants[0]`, the TEMPLATE — not from the copy source and not from the
   * group.
   */
  addVariant(variantGroupId: string, copyFromVariantId?: string): void {
    const variantGroup = this.group(variantGroupId);
    if (!variantGroup) return;

    let newVariant: Variant;

    if (copyFromVariantId) {
      const sourceVariant = variantGroup.variants.find(
        (v) => v.id === copyFromVariantId,
      );
      if (!sourceVariant) return;
      newVariant = {
        id: generateId(),
        name: `${sourceVariant.name} Copy`,
        gridSize: { ...sourceVariant.gridSize },
        frames: sourceVariant.frames.map((f) => ({
          id: generateId(),
          layers: f.layers.map((l) => ({
            ...l,
            id: generateId(),
            pixels: l.pixels.map((row) => [...row]),
          })),
        })),
        baseFrameOffsets: { ...sourceVariant.baseFrameOffsets },
      };
    } else {
      const templateVariant = variantGroup.variants[0];
      newVariant = {
        id: generateId(),
        name: `${variantGroup.name} ${variantGroup.variants.length + 1}`,
        gridSize: { ...templateVariant.gridSize },
        frames: templateVariant.frames.map((_f) => ({
          id: generateId(),
          layers: [
            {
              id: generateId(),
              name: "Layer 1",
              pixels: createEmptyPixelGrid(
                templateVariant.gridSize.width,
                templateVariant.gridSize.height,
              ),
              visible: true,
            },
          ],
        })),
        baseFrameOffsets: { ...templateVariant.baseFrameOffsets },
      };
    }

    this.mutator.commit("Add variant", true, () => {
      this.domain.variants = this.domain.variants.map((vg) =>
        vg.id === variantGroupId
          ? { ...vg, variants: [...vg.variants, newVariant] }
          : vg,
      );
    });
  }

  /* ══ 3. deleteVariant ══════════════════════════════════════════════════ */

  /**
   * Remove one variant and repoint every host layer that selected it.
   *
   * ⚠️ REFUSES when the group has one variant left (`length <= 1`) — pinned.
   * The survivors' FIRST entry becomes the new selection for every affected
   * layer, across every object, not just the current one.
   */
  deleteVariant(variantGroupId: string, variantId: string): void {
    const variantGroup = this.group(variantGroupId);
    if (!variantGroup || variantGroup.variants.length <= 1) return;

    const remainingVariants = variantGroup.variants.filter(
      (v) => v.id !== variantId,
    );
    const newSelectedId = remainingVariants[0].id;

    this.mutator.commit("Delete variant", true, () => {
      this.domain.variants = this.domain.variants.map((vg) =>
        vg.id === variantGroupId ? { ...vg, variants: remainingVariants } : vg,
      );
      this.mapAllLayers((l) =>
        l.isVariant &&
        l.variantGroupId === variantGroupId &&
        l.selectedVariantId === variantId
          ? { ...l, selectedVariantId: newSelectedId }
          : l,
      );
    });
  }

  /* ══ 4. deleteVariantGroup ═════════════════════════════════════════════ */

  /**
   * Remove a whole group, every host layer that referenced it, and its
   * `variantFrameIndices` entry.
   *
   * ⚠️ ONE OF THE TWO `selectLayer` SITES (`variantActions.ts:436-441`). The
   * legacy code re-reads the CURRENT frame **after** the commit and selects
   * its LAST layer, so the selection lands on the frame as it now stands
   * (with the variant hosts gone). Ported with that ordering intact.
   */
  deleteVariantGroup(variantGroupId: string): void {
    const variantGroup = this.group(variantGroupId);
    if (!variantGroup) return;

    // The uiState half: drop this group's entry. Done before the commit so
    // the published project carries the cleaned-up record.
    this.removeVariantFrameIndex(variantGroupId);

    this.mutator.commit("Delete variant group", true, () => {
      this.domain.variants = this.domain.variants.filter(
        (vg) => vg.id !== variantGroupId,
      );
      this.domain.objects = this.domain.objects.map((o) => ({
        ...o,
        frames: o.frames.map((f) => ({
          ...f,
          layers: f.layers.filter(
            (l) => !(l.isVariant && l.variantGroupId === variantGroupId),
          ),
        })),
      }));
    });

    // Select another layer if the deleted one was selected — verbatim, and
    // deliberately AFTER the commit so `currentFrame()` sees the new tree.
    const frame = this.currentFrame();
    if (frame && frame.layers.length > 0) {
      this.selectLayerCallback(frame.layers[frame.layers.length - 1].id);
    }
  }

  /**
   * `deleteVariantGroup`'s uiState half — the one variant action that REMOVES
   * a `variantFrameIndices` key rather than setting one, which is why
   * `TimelineUIStore` grew a replacing setter alongside its merging one.
   *
   * Verbatim from `variantActions.ts:424-430`: the record is rebuilt from
   * `Object.entries(...).filter(([key]) => key !== variantGroupId)`, so a
   * group that was never in the record leaves it untouched.
   */
  private removeVariantFrameIndex(variantGroupId: string): void {
    const current = this.source.variantFrameIndices ?? {};
    if (!(variantGroupId in current)) return;
    const next = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== variantGroupId),
    );
    this.replaceVariantFrameIndices(next);
  }

  /* ══ 5. selectVariant ══════════════════════════════════════════════════ */

  /**
   * Point every host layer of a group at `variantId`.
   *
   * ⚠️ The ONE non-undoable action of the seventeen (`trackHistory=false`
   * today, pinned by task 08: "selectVariant repoints the host layer and does
   * NOT track history"). It is nevertheless a DOMAIN mutation — it writes
   * `layer.selectedVariantId` on the objects tree, not `uiState` — which is
   * why it lives here and not on `TimelineUIStore`.
   *
   * It updates every frame of the CURRENT object only, and resolves the group
   * from the layer rather than taking it as an argument.
   */
  selectVariant(layerId: string, variantId: string): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const variantLayer = frame.layers.find(
      (l) => l.id === layerId && l.isVariant,
    );
    if (!variantLayer || !variantLayer.variantGroupId) return;

    const variantGroupId = variantLayer.variantGroupId;

    this.mutator.commit("Select variant", false, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f) => ({
            ...f,
            layers: f.layers.map((l) =>
              l.isVariant && l.variantGroupId === variantGroupId
                ? { ...l, selectedVariantId: variantId }
                : l,
            ),
          })),
        };
      });
    });
  }

  /* ══ 6 + 7. renameVariant / renameVariantGroup ═════════════════════════ */

  renameVariant(variantGroupId: string, variantId: string, name: string): void {
    this.mutator.commit("Rename variant", true, () => {
      this.mapVariant(variantGroupId, variantId, (v) => ({ ...v, name }));
    });
  }

  renameVariantGroup(variantGroupId: string, name: string): void {
    this.mutator.commit("Rename variant group", true, () => {
      this.domain.variants = this.domain.variants.map((vg) =>
        vg.id === variantGroupId ? { ...vg, name } : vg,
      );
    });
  }

  /* ══ 8. resizeVariant ══════════════════════════════════════════════════ */

  /**
   * Resize every frame of one variant, anchoring the existing pixels.
   *
   * Three compensations, all pinned by task 08 and all preserved:
   *
   *  1. Pixels are copied into a NEW grid at `+leftPadding/+topPadding`, and
   *     anything landing outside the new bounds is CLIPPED (the shrink case).
   *     Cells with no source read the `{color:0,normal:0,height:0}` literal —
   *     note that is the OBJECT form, not the `0` sentinel `resizeObject`
   *     uses. Ported as written.
   *  2. `baseFrameOffsets` are shifted by `-leftPadding/-topPadding`, and the
   *     result REPLACES the record — a variant with no `baseFrameOffsets`
   *     ends up with `{}`, not `undefined`.
   *  3. Per-layer offsets across ALL objects are shifted the same way:
   *     `variantOffsets[variantId]` when present, else the legacy
   *     `variantOffset` **only when this variant is the selected one**. The
   *     two branches are exclusive and the first wins.
   */
  resizeVariant(
    variantGroupId: string,
    variantId: string,
    width: number,
    height: number,
    anchor: AnchorPosition = "middle-center",
  ): void {
    const variant = this.variant(variantGroupId, variantId);
    if (!variant) return;

    const oldWidth = variant.gridSize.width;
    const oldHeight = variant.gridSize.height;
    const widthDiff = width - oldWidth;
    const heightDiff = height - oldHeight;
    const { left: leftPadding, top: topPadding } = getAnchorPadding(
      anchor,
      widthDiff,
      heightDiff,
    );

    this.mutator.commit("Resize variant", true, () => {
      this.mapVariant(variantGroupId, variantId, (v) => {
        const newFrames = v.frames.map((f) => ({
          ...f,
          layers: f.layers.map((l) => {
            // A brand-new grid: `ref` REPLACEMENT, never an in-place write.
            const newPixels = createEmptyPixelGrid(width, height);
            for (let y = 0; y < oldHeight; y++) {
              for (let x = 0; x < oldWidth; x++) {
                const newX = x + leftPadding;
                const newY = y + topPadding;
                if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
                  newPixels[newY][newX] = l.pixels[y]?.[x] ?? {
                    color: 0,
                    normal: 0,
                    height: 0,
                  };
                }
              }
            }
            return { ...l, pixels: newPixels };
          }),
        }));

        // Compensate for pixels added to the left/top.
        const newBaseFrameOffsets: {
          [baseFrameIndex: number]: { x: number; y: number };
        } = {};
        if (v.baseFrameOffsets) {
          for (const [baseFrameIndexStr, offset] of Object.entries(
            v.baseFrameOffsets,
          )) {
            const baseFrameIndex = parseInt(baseFrameIndexStr, 10);
            newBaseFrameOffsets[baseFrameIndex] = {
              x: offset.x - leftPadding,
              y: offset.y - topPadding,
            };
          }
        }

        return {
          ...v,
          gridSize: { width, height },
          frames: newFrames,
          baseFrameOffsets: newBaseFrameOffsets,
        };
      });

      // Also adjust per-layer offsets across all objects.
      this.mapAllLayers((l) => {
        if (l.isVariant && l.variantGroupId === variantGroupId) {
          if (l.variantOffsets?.[variantId]) {
            return {
              ...l,
              variantOffsets: {
                ...l.variantOffsets,
                [variantId]: {
                  x: l.variantOffsets[variantId].x - leftPadding,
                  y: l.variantOffsets[variantId].y - topPadding,
                },
              },
            };
          }
          // Legacy single-offset form, only for the SELECTED variant.
          if (l.variantOffset && l.selectedVariantId === variantId) {
            return {
              ...l,
              variantOffset: {
                x: l.variantOffset.x - leftPadding,
                y: l.variantOffset.y - topPadding,
              },
            };
          }
        }
        return l;
      });
    });
  }

  /* ══ 9. setVariantOffset ═══════════════════════════════════════════════ */

  /**
   * Nudge the current variant layer's offset by `dx`/`dy`.
   *
   * ══ ⚠️ THE TRUTHINESS DIVERGENCE — DO NOT "UNIFY" THIS WITH `currentVariant`
   *
   * The base value comes from a 4-level ladder written as `if` statements
   * over TRUTHINESS, whereas `ApplicationStore.currentVariant` resolves the
   * same four levels with `??`. Task 08 pinned the disagreement as
   * "DIVERGENCE: uses a TRUTHINESS check, so a {0,0} level-1 entry FALLS
   * THROUGH", and that test is the arbiter — the ladder below is transcribed
   * exactly as it stood, brace for brace.
   *
   * ⚠️ This is a WRITE-path BASE lookup, not the read resolver. §9.12 and the
   * task spec forbid re-implementing the render-time 4-level fallback here;
   * `currentVariant` remains the single resolver for that, and nothing in
   * this store reads an offset for rendering.
   *
   * ⚠️ It does NOT clamp the result to the base grid (pinned: "OBSERVED: does
   * NOT clamp the offset").
   *
   * `allFrames` widens the write to every layer of the group across the
   * current object's frames; the default touches only the current layer in
   * the current frame. Both write ONLY the currently-selected variant's key.
   */
  setVariantOffset(dx: number, dy: number, allFrames: boolean = false): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    const layer = this.currentLayer();
    if (
      !obj ||
      !frame ||
      !layer ||
      !layer.isVariant ||
      !layer.variantGroupId ||
      !layer.selectedVariantId
    ) {
      return;
    }

    const currentSelectedVariantId = layer.selectedVariantId;
    const variant = this.variant(
      layer.variantGroupId,
      currentSelectedVariantId,
    );
    const baseFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

    // The 4-level ladder, verbatim — see the divergence note above.
    const getLayerOffset = (
      l: Layer,
      frameIdx: number,
    ): { x: number; y: number } => {
      // 1. the new per-variant-type offset
      if (l.variantOffsets?.[currentSelectedVariantId]) {
        return l.variantOffsets[currentSelectedVariantId];
      }
      // 2. the legacy single offset
      if (l.variantOffset) {
        return l.variantOffset;
      }
      // 3. the variant's per-base-frame offset, 4. the floor
      return (
        variant?.baseFrameOffsets?.[frameIdx >= 0 ? frameIdx : 0] ?? {
          x: 0,
          y: 0,
        }
      );
    };

    this.mutator.commit("Set variant offset", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f) => {
            const frameIndex = obj.frames.findIndex((bf) => bf.id === f.id);
            return {
              ...f,
              layers: f.layers.map((l) => {
                if (allFrames) {
                  if (
                    l.isVariant &&
                    l.variantGroupId === layer.variantGroupId
                  ) {
                    const currentOffset = getLayerOffset(l, frameIndex);
                    return {
                      ...l,
                      variantOffsets: {
                        ...l.variantOffsets,
                        [currentSelectedVariantId]: {
                          x: currentOffset.x + dx,
                          y: currentOffset.y + dy,
                        },
                      },
                    };
                  }
                } else {
                  // Original behaviour: only the current layer.
                  if (f.id !== frame.id || l.id !== layer.id) return l;
                  const currentOffset = getLayerOffset(l, baseFrameIndex);
                  return {
                    ...l,
                    variantOffsets: {
                      ...l.variantOffsets,
                      [currentSelectedVariantId]: {
                        x: currentOffset.x + dx,
                        y: currentOffset.y + dy,
                      },
                    },
                  };
                }
                return l;
              }),
            };
          }),
        };
      });
    });
  }

  /* ══ 10. duplicateVariantFrame ═════════════════════════════════════════ */

  /** Insert a copy of `frameId` directly AFTER it, and select the copy. */
  duplicateVariantFrame(
    variantGroupId: string,
    variantId: string,
    frameId: string,
  ): void {
    const variant = this.variant(variantGroupId, variantId);
    if (!variant) return;

    const sourceFrame = variant.frames.find((f) => f.id === frameId);
    if (!sourceFrame) return;

    const frameIndex = variant.frames.findIndex((f) => f.id === frameId);
    const newFrame: VariantFrame = {
      id: generateId(),
      layers: sourceFrame.layers.map((l) => ({
        ...l,
        id: generateId(),
        pixels: l.pixels.map((row) => [...row]),
      })),
      // `tags` copied as a NEW array; `undefined` stays `undefined`.
      tags: sourceFrame.tags ? [...sourceFrame.tags] : undefined,
    };

    this.setVariantFrameIndex(variantGroupId, frameIndex + 1);
    this.mutator.commit("Duplicate variant frame", true, () => {
      const newFrames = [...variant.frames];
      newFrames.splice(frameIndex + 1, 0, newFrame);
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: newFrames,
      }));
    });
  }

  /* ══ 11. deleteVariantFrame ════════════════════════════════════════════ */

  /**
   * Remove one variant frame.
   *
   * ⚠️ REFUSES when one frame is left, and selects `max(0, index - 1)` — the
   * PREVIOUS frame, not the next. Both pinned.
   */
  deleteVariantFrame(
    variantGroupId: string,
    variantId: string,
    frameId: string,
  ): void {
    const variant = this.variant(variantGroupId, variantId);
    if (!variant || variant.frames.length <= 1) return;

    const frameIndex = variant.frames.findIndex((f) => f.id === frameId);
    const newFrames = variant.frames.filter((f) => f.id !== frameId);
    const newSelectedIndex = Math.max(0, frameIndex - 1);

    this.setVariantFrameIndex(variantGroupId, newSelectedIndex);
    this.mutator.commit("Delete variant frame", true, () => {
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: newFrames,
      }));
    });
  }

  /* ══ 12 + 13. addVariantFrameTag / removeVariantFrameTag ═══════════════ */

  /** Trims, LOWERCASES, ignores the empty string, de-duplicates. */
  addVariantFrameTag(
    variantGroupId: string,
    variantId: string,
    frameId: string,
    tag: string,
  ): void {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;

    this.mutator.commit("Add variant frame tag", true, () => {
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: v.frames.map((f) => {
          if (f.id !== frameId) return f;
          const tags = f.tags ?? [];
          if (tags.includes(trimmed)) return f;
          return { ...f, tags: [...tags, trimmed] };
        }),
      }));
    });
  }

  /** ⚠️ Sets `tags` back to `undefined`, not `[]`, when the last tag goes. */
  removeVariantFrameTag(
    variantGroupId: string,
    variantId: string,
    frameId: string,
    tag: string,
  ): void {
    this.mutator.commit("Remove variant frame tag", true, () => {
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: v.frames.map((f) => {
          if (f.id !== frameId) return f;
          const tags = (f.tags ?? []).filter((t) => t !== tag);
          return { ...f, tags: tags.length ? tags : undefined };
        }),
      }));
    });
  }

  /* ══ 14. addVariantFrame ═══════════════════════════════════════════════ */

  /**
   * Insert a frame after the CURRENTLY SELECTED one (not at the end) and
   * select it. `copyPrevious` defaults to `true`; the empty path builds a
   * single "Layer 1" at the variant's grid size.
   */
  addVariantFrame(
    variantGroupId: string,
    variantId: string,
    copyPrevious: boolean = true,
  ): void {
    const variant = this.variant(variantGroupId, variantId);
    if (!variant) return;

    const currentFrameIndex =
      this.source.variantFrameIndices?.[variantGroupId] ?? 0;
    const currentFrame = variant.frames[currentFrameIndex];

    let newFrame: VariantFrame;
    if (copyPrevious && currentFrame) {
      newFrame = {
        id: generateId(),
        layers: currentFrame.layers.map((l) => ({
          ...l,
          id: generateId(),
          pixels: l.pixels.map((row) => [...row]),
        })),
      };
    } else {
      newFrame = {
        id: generateId(),
        layers: [
          {
            id: generateId(),
            name: "Layer 1",
            pixels: createEmptyPixelGrid(
              variant.gridSize.width,
              variant.gridSize.height,
            ),
            visible: true,
          },
        ],
      };
    }

    this.setVariantFrameIndex(variantGroupId, currentFrameIndex + 1);
    this.mutator.commit("Add variant frame", true, () => {
      const newFrames = [...variant.frames];
      newFrames.splice(currentFrameIndex + 1, 0, newFrame);
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: newFrames,
      }));
    });
  }

  /* ══ 15. moveVariantFrame ══════════════════════════════════════════════ */

  /** Nudge a frame one slot left or right; a no-op at either end. */
  moveVariantFrame(
    variantGroupId: string,
    variantId: string,
    frameId: string,
    direction: "left" | "right",
  ): void {
    const variant = this.variant(variantGroupId, variantId);
    if (!variant) return;

    const frameIndex = variant.frames.findIndex((f) => f.id === frameId);
    if (frameIndex === -1) return;

    const newIndex = direction === "left" ? frameIndex - 1 : frameIndex + 1;
    if (newIndex < 0 || newIndex >= variant.frames.length) return;

    this.setVariantFrameIndex(variantGroupId, newIndex);
    this.mutator.commit("Move variant frame", true, () => {
      const newFrames = [...variant.frames];
      const [movedFrame] = newFrames.splice(frameIndex, 1);
      newFrames.splice(newIndex, 0, movedFrame);
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: newFrames,
      }));
    });
  }

  /* ══ 16. reorderVariantFrame ═══════════════════════════════════════════ */

  /**
   * Drag-and-drop reorder.
   *
   * ⚠️ The insert index is `fromIndex < toIndex ? toIndex - 1 : toIndex` —
   * the drag-and-drop off-by-one correction, the same one `FrameStore`
   * carries. `toIndex === frames.length` is ALLOWED (append); `> length` is
   * not, and `toIndex === fromIndex` is a no-op.
   *
   * The SELECTED index then shifts by a three-branch rule: it follows the
   * moved frame when it was the one moved, and otherwise slides by one when
   * the move crossed it.
   */
  reorderVariantFrame(
    variantGroupId: string,
    variantId: string,
    frameId: string,
    toIndex: number,
  ): void {
    const variant = this.variant(variantGroupId, variantId);
    if (!variant) return;

    const fromIndex = variant.frames.findIndex((f) => f.id === frameId);
    if (fromIndex === -1) return;
    if (toIndex < 0 || toIndex > variant.frames.length) return;
    if (toIndex === fromIndex) return;

    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    const newIndex = insertIndex;
    const currentVariantIndex =
      this.source.variantFrameIndices?.[variantGroupId] ?? 0;
    let updatedVariantIndex = currentVariantIndex;
    if (currentVariantIndex === fromIndex) {
      updatedVariantIndex = newIndex;
    } else if (
      fromIndex < currentVariantIndex &&
      newIndex >= currentVariantIndex
    ) {
      updatedVariantIndex = currentVariantIndex - 1;
    } else if (
      fromIndex > currentVariantIndex &&
      newIndex <= currentVariantIndex
    ) {
      updatedVariantIndex = currentVariantIndex + 1;
    }

    this.setVariantFrameIndex(variantGroupId, updatedVariantIndex);
    this.mutator.commit("Reorder variant frame", true, () => {
      const newFrames = [...variant.frames];
      const [movedFrame] = newFrames.splice(fromIndex, 1);
      newFrames.splice(insertIndex, 0, movedFrame);
      this.mapVariant(variantGroupId, variantId, (v) => ({
        ...v,
        frames: newFrames,
      }));
    });
  }

  /* ══ 17. addVariantLayerFromExisting ═══════════════════════════════════ */

  /**
   * Add a host layer for an EXISTING variant group to the current frame, or
   * to every frame of the current object.
   *
   * ⚠️ OBSERVED, NOT FIXED: the legacy comment says "Add to top of layers
   * array" but the code APPENDS (`[...f.layers, variantLayer]`). Whether
   * "top" means the array end or the render top, the behaviour on disk is
   * append, and it is ported as such.
   *
   * It seeds the group's frame index at 0 — even when the group already had
   * one — which is also what the legacy code did.
   */
  addVariantLayerFromExisting(
    variantGroupId: string,
    selectedVariantId: string,
    addToAllFrames: boolean,
  ): void {
    const obj = this.currentObject();
    const frame = this.currentFrame();
    if (!obj || !frame) return;

    const variantGroup = this.group(variantGroupId);
    if (!variantGroup) return;

    const currentFrameIndex = obj.frames.findIndex((f) => f.id === frame.id);

    this.setVariantFrameIndex(variantGroupId, 0);
    this.mutator.commit("Add variant layer", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f, idx) => {
            if (!addToAllFrames && idx !== currentFrameIndex) return f;

            const variantLayer: Layer = {
              id: generateId(),
              name: variantGroup.name,
              pixels: createEmptyPixelGrid(
                obj.gridSize.width,
                obj.gridSize.height,
              ),
              visible: true,
              isVariant: true,
              variantGroupId,
              selectedVariantId,
              variantOffset: { x: 0, y: 0 },
            };

            return { ...f, layers: [...f.layers, variantLayer] };
          }),
        };
      });
    });
  }

  /* ══ 18. removeVariantLayer ════════════════════════════════════════════ */

  /**
   * Strip one host layer from every frame of the current object.
   *
   * ⚠️ The variant GROUP is deliberately left alone — variant groups persist
   * independently of the layers hosting them.
   *
   * ⚠️ THE SECOND `selectLayer` SITE (`variantActions.ts:1403-1409`), with
   * the same post-commit ordering as `deleteVariantGroup`.
   */
  removeVariantLayer(layerId: string): void {
    const obj = this.currentObject();
    if (!obj) return;

    this.mutator.commit("Remove variant layer", true, () => {
      this.domain.objects = this.domain.objects.map((o) => {
        if (o.id !== obj.id) return o;
        return {
          ...o,
          frames: o.frames.map((f) => ({
            ...f,
            layers: f.layers.filter((l) => l.id !== layerId),
          })),
        };
      });
    });

    // Select another layer if needed — verbatim, after the commit.
    const frame = this.currentFrame();
    if (frame && frame.layers.length > 0) {
      this.selectLayerCallback(frame.layers[frame.layers.length - 1].id);
    }
  }
}
