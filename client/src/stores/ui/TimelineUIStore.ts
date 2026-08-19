/**
 * TimelineUIStore — the timeline/layer SELECTION state (REFRESH task 25).
 *
 * It owns the 6 persisted UI fields the timeline and layer panel read, and it
 * is the home of `selectFrame` and `selectLayer` — which are **UI actions,
 * not domain mutations**: they move the selection and nothing else, and both
 * pass `trackHistory=false` today (pinned by task 08:
 * `selectLayer` "does NOT track history (the lone `false` in this file)").
 *
 * ── THE 6 FIELDS ──────────────────────────────────────────────────────────
 *
 *   selectedObjectId / selectedFrameId / selectedLayerId
 *       feed the `currentObject` / `currentFrame` / `currentLayer` computeds
 *       on `ApplicationStore` (task 23).
 *   variantFrameIndices
 *       the most load-bearing UI field in the app: read in 6 modules' pixel
 *       WRITE paths. It is passed INTO domain actions as an argument and is
 *       never read across the store boundary.
 *   layerSelectionCounter
 *       a monotonic click counter. `FrameTimeline.tsx:116` compares it against
 *       a ref to distinguish "the user clicked a layer" from "the frame
 *       changed" — re-selecting the SAME layer must still be detectable, which
 *       is why it is a counter and not a boolean. Task 08 pinned it
 *       ("INCREMENTS layerSelectionCounter on every call, re-selection
 *       included").
 *   objectLibraryViewMode / timelineThumbnailMode
 *       plain view-mode flags.
 *
 * ── ⚠️ WHERE THE FIELDS PHYSICALLY LIVE — read before "tidying" this ──────
 *
 * Three of the six (`layerSelectionCounter`, `objectLibraryViewMode`,
 * `timelineThumbnailMode`) were already declared on `ViewportUIStore` by task
 * 24, because `toPersistedUIState()` had to emit all 43 persisted fields from
 * one place before this store existed. Moving the DECLARATIONS here would
 * churn `ViewportUIStore`, `UIStore.toPersistedUIState()` and
 * `persistedUIState.test.ts` for no behavioural gain, and R3 forbids touching
 * the builder without a wire-format reason.
 *
 * So this store OWNS those three as **actions and reads**, delegating storage
 * to `ViewportUIStore`. `TimelineUIStore` is the API surface; `ViewportUIStore`
 * is the field. One writer either way. The three selection ids and
 * `variantFrameIndices` are genuinely declared here.
 *
 * ── ⚠️ SELECTION IDS ARE STILL PHASE A — and why (R6) ─────────────────────
 *
 * `selectedObjectId`/`selectedFrameId`/`selectedLayerId` and
 * `variantFrameIndices` are NOT flipped to Phase B by this task, because they
 * do not have a single writer yet:
 *
 *   - `store/objectActions.ts:58` (`selectObject`) writes all three ids;
 *   - `store/variantActions.ts` writes `variantFrameIndices` at 8 sites and
 *     the ids at `:851-853`.
 *
 * Both files are outside this task's `Touches` (they belong to later tasks).
 * Flipping without migrating them would give every one of those fields TWO
 * writers, which is exactly what R6 forbids — the same reasoning that made
 * task 24 defer its own flip. `adopt()` therefore remains the bridge's
 * single Phase A write path for the four, exactly as `SelectionMirror` had
 * it. See the task 25 report.
 *
 * `layerSelectionCounter`, `objectLibraryViewMode` and `timelineThumbnailMode`
 * DO have a single writer after this task (the legacy Zustand setters become
 * bridge-installed delegates into this store) and are flipped A→B here.
 *
 * ── INJECTION, NOT IMPORTS ────────────────────────────────────────────────
 *
 * `selectFrame`'s variant-sync branch needs the project's variant groups and
 * the target frame. It gets them from an injected `TimelineContext` rather
 * than importing `DomainStore`, for two reasons: `stores/ui/**` staying free
 * of domain imports keeps the dependency arrow one-way, and it makes
 * `selectLayer` trivially injectable into `VariantStore` later —
 * `variantActions.ts:446` and `:1407` are the store graph's ONLY cross-module
 * edge, and task 28 retires it by handing `VariantStore` a
 * `() => timelineUI.selectLayer(id)` callback rather than a store reference.
 *
 * Nothing here imports `stores/domain/**`, and nothing here touches a pixel
 * grid.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import type { Frame, PixelObject, VariantGroup } from "../../types";
import type { ViewportUIStore } from "./ViewportUIStore";

/**
 * Everything `selectFrame`/`selectLayer` need from outside the UI slice,
 * supplied as plain functions. No store type crosses this boundary.
 */
export interface TimelineContext {
  /** The selected object, or `null`. `ApplicationStore.currentObject`. */
  currentObject(): PixelObject | null;
  /** The selected layer, or `null`. `ApplicationStore.currentLayer`. */
  currentLayer(): Frame["layers"][number] | null;
  /** The project's variant groups. `DomainStore.variants`. */
  variants(): VariantGroup[];
  /**
   * Publish the new selection wherever it currently lives. During the bridge
   * era this writes `project.uiState` in Zustand (Phase A for the ids); after
   * the flip it becomes a no-op. `trackHistory` is always `false` for
   * selection — pinned by task 08.
   */
  publishSelection(patch: {
    selectedFrameId?: string | null;
    selectedLayerId?: string | null;
    selectedObjectId?: string | null;
    variantFrameIndices?: { [variantGroupId: string]: number };
    layerSelectionCounter?: number;
  }): void;
  /**
   * `selectLayer` clears the pending colour adjustment, verbatim from
   * `layerActions.ts:210` (`set({ colorAdjustment: null })`). Injected
   * because `colorAdjustment` is Zustand scratch state owned by a later task.
   */
  clearColorAdjustment(): void;
}

export interface TimelineUIStoreDeps {
  viewport: ViewportUIStore;
  context: TimelineContext;
}

export class TimelineUIStore {
  /* ── the three selection ids (persisted; Phase A — see the header) ────── */
  selectedObjectId: string | null = null;
  selectedFrameId: string | null = null;
  selectedLayerId: string | null = null;

  /**
   * `observableRef`: replaced wholesale on every change, so per-key
   * granularity would only cost proxies. Read by 6 modules' pixel-write paths
   * and PASSED AS AN ARGUMENT into domain actions, never read across the
   * store boundary.
   */
  variantFrameIndices: { [variantGroupId: string]: number } = {};

  private readonly viewport: ViewportUIStore;
  private readonly context: TimelineContext;

  constructor(deps: TimelineUIStoreDeps) {
    this.viewport = deps.viewport;
    this.context = deps.context;
    makeObservable(this, {
      selectedObjectId: observable,
      selectedFrameId: observable,
      selectedLayerId: observable,
      variantFrameIndices: observableRef,
      adopt: action,
      selectFrame: action,
      selectLayer: action,
      setObjectLibraryViewMode: action,
      setTimelineThumbnailMode: action,
      setVariantFrameIndex: action,
    });
  }

  /* ── the three fields stored on ViewportUIStore (see the header) ──────── */

  get layerSelectionCounter(): number | undefined {
    return this.viewport.layerSelectionCounter;
  }

  get objectLibraryViewMode(): "normal" | "small-rows" | "grid" {
    return this.viewport.objectLibraryViewMode;
  }

  get timelineThumbnailMode(): boolean {
    return this.viewport.timelineThumbnailMode;
  }

  setObjectLibraryViewMode(mode: "normal" | "small-rows" | "grid"): void {
    this.viewport.setObjectLibraryViewMode(mode);
  }

  setTimelineThumbnailMode(enabled: boolean): void {
    this.viewport.setTimelineThumbnailMode(enabled);
  }

  /**
   * Set ONE variant group's frame index, leaving the rest untouched.
   *
   * `LayerStore` calls this through an injected callback after a variant
   * paste (`pasteLayerFromClipboard` / `copyLayerFromObject` both seed the
   * new group at index 0), because `stores/domain/**` may not import a UI
   * store. `variantFrameIndices` is `observableRef`, so the record is REBUILT
   * rather than mutated in place.
   */
  setVariantFrameIndex(variantGroupId: string, index: number): void {
    const next = { ...this.variantFrameIndices, [variantGroupId]: index };
    this.variantFrameIndices = next;
    this.context.publishSelection({ variantFrameIndices: next });
  }

  /**
   * The bridge's Phase A write path for the four ids (see the header).
   * Carried over unchanged from `SelectionMirror.adopt`, which this store
   * replaces.
   */
  adopt(next: {
    selectedObjectId: string | null;
    selectedFrameId: string | null;
    selectedLayerId: string | null;
    variantFrameIndices: { [variantGroupId: string]: number };
  }): void {
    this.selectedObjectId = next.selectedObjectId;
    this.selectedFrameId = next.selectedFrameId;
    this.selectedLayerId = next.selectedLayerId;
    this.variantFrameIndices = next.variantFrameIndices;
  }

  /**
   * Select a frame — ported from `frameActions.ts:112-200` with no behaviour
   * change.
   *
   * The three quirks task 08 pinned, all preserved verbatim:
   *
   *  1. **The layer-carry-over ladder.** When a variant layer is selected, the
   *     new frame's layer with the same `variantGroupId` is chosen; otherwise
   *     a layer with the same NAME; otherwise `layers[0]`. The final
   *     `?? selectedLayerId` fallback means an unresolvable frame leaves the
   *     selection alone rather than nulling it.
   *  2. **`syncVariants` maps base frame index → variant frame index by
   *     MODULO**, and the frame count comes from the target frame's variant
   *     LAYER's `selectedVariantId` — not from the group's first variant. The
   *     `vg.variants[0]` path is only the fallback when no such layer exists.
   *  3. **Selection is never undoable** (`trackHistory=false`).
   */
  selectFrame(id: string, syncVariants: boolean = true): void {
    const obj = this.context.currentObject();
    if (!obj) return;

    const currentLayer = this.context.currentLayer();
    const frame = obj.frames.find((f) => f.id === id);
    const baseFrameIndex = obj.frames.findIndex((f) => f.id === id);

    // If currently editing a variant, keep the same variant layer selected.
    const isEditingVariant = currentLayer?.isVariant === true;
    let newLayerId: string | null = this.selectedLayerId;

    if (isEditingVariant && currentLayer && frame) {
      const variantLayer = frame.layers.find(
        (l) => l.isVariant && l.variantGroupId === currentLayer.variantGroupId,
      );
      if (variantLayer) {
        newLayerId = variantLayer.id;
      }
    } else if (frame && currentLayer) {
      const matchingLayer = frame.layers.find(
        (l) => l.name === currentLayer.name,
      );
      if (matchingLayer) {
        newLayerId = matchingLayer.id;
      } else if (frame.layers.length > 0) {
        newLayerId = frame.layers[0].id;
      }
    } else if (frame && frame.layers && frame.layers.length > 0) {
      newLayerId = frame.layers[0].id;
    }

    // Sync variant frame indices with the base frame index. The frame count
    // depends on the LAYER's selectedVariantId, not on the group's first
    // variant — see quirk 2 in the doc comment.
    const newVariantFrameIndices: { [key: string]: number } = {};
    const variants = this.context.variants();
    if (syncVariants && variants && baseFrameIndex >= 0 && frame) {
      for (const vg of variants) {
        const variantLayer = frame.layers.find(
          (l) => l.isVariant && l.variantGroupId === vg.id,
        );

        let variantFrameCount = 1;
        if (variantLayer?.selectedVariantId) {
          const selectedVariant = vg.variants.find(
            (v) => v.id === variantLayer.selectedVariantId,
          );
          variantFrameCount = selectedVariant?.frames.length ?? 1;
        } else {
          variantFrameCount = vg.variants[0]?.frames.length ?? 1;
        }

        if (variantFrameCount > 0) {
          newVariantFrameIndices[vg.id] = baseFrameIndex % variantFrameCount;
        }
      }
    }

    const nextLayerId = newLayerId ?? this.selectedLayerId;
    const nextIndices = syncVariants
      ? { ...this.variantFrameIndices, ...newVariantFrameIndices }
      : this.variantFrameIndices;

    this.selectedFrameId = id;
    this.selectedLayerId = nextLayerId;
    this.variantFrameIndices = nextIndices;

    this.context.publishSelection({
      selectedFrameId: id,
      selectedLayerId: nextLayerId,
      variantFrameIndices: nextIndices,
    });
  }

  /**
   * Select a layer — ported from `layerActions.ts:208-224`.
   *
   * Three pinned behaviours: it clears the pending colour adjustment, it
   * increments `layerSelectionCounter` on EVERY call (re-selection included),
   * and it accepts an id that does not exist (task 08:
   * "OBSERVED: accepts an id that does not exist"). Do not add a guard.
   *
   * ⚠️ This is the method `VariantStore` will receive by injection in task 28,
   * retiring `variantActions.ts:446`/`:1407` — the store graph's only
   * cross-module edge. It takes a plain id and returns void precisely so a
   * `(id: string) => void` callback is a complete substitute.
   */
  selectLayer(id: string): void {
    this.context.clearColorAdjustment();
    this.selectedLayerId = id;
    this.viewport.bumpLayerSelectionCounter();
    this.context.publishSelection({
      selectedLayerId: id,
      layerSelectionCounter: this.viewport.layerSelectionCounter,
    });
  }
}
