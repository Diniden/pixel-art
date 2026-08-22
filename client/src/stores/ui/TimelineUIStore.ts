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
  /** The selected frame, or `null`. `ApplicationStore.currentFrame`. */
  currentFrame(): Frame | null;
  /** The selected layer, or `null`. `ApplicationStore.currentLayer`. */
  currentLayer(): Frame["layers"][number] | null;
  /** The project's variant groups. `DomainStore.variants`. */
  variants(): VariantGroup[];
  /**
   * The project's objects. `DomainStore.objects`.
   *
   * Needed by {@link TimelineUIStore.selectObject}, which resolves an
   * ARBITRARY object id — unlike `currentObject()`, which only ever returns
   * the already-selected one. Same injection shape as `variants()`: a plain
   * function, so `stores/ui/**` still imports nothing from `stores/domain/**`.
   */
  objects(): PixelObject[];
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
      selectObject: action,
      selectFrame: action,
      selectLayer: action,
      setObjectLibraryViewMode: action,
      setTimelineThumbnailMode: action,
      setVariantFrameIndex: action,
      replaceVariantFrameIndices: action,
      selectVariantFrame: action,
      advanceVariantFrames: action,
      adoptVariantFrameIndices: action,
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
   * REPLACE the whole record rather than merging into it.
   *
   * `setVariantFrameIndex` above merges, which cannot express a REMOVAL —
   * and `VariantStore.deleteVariantGroup` needs exactly that: the legacy
   * `variantActions.ts:424-430` rebuilt `variantFrameIndices` from
   * `Object.entries(...).filter(([key]) => key !== variantGroupId)`, dropping
   * the deleted group's key. Without a replacing setter the stale entry would
   * survive every group deletion and accumulate in the save payload.
   *
   * `variantFrameIndices` is `observableRef`, so the caller's record is
   * adopted wholesale, exactly as `setVariantFrameIndex` adopts its rebuild.
   */
  replaceVariantFrameIndices(next: { [variantGroupId: string]: number }): void {
    this.variantFrameIndices = next;
    this.context.publishSelection({ variantFrameIndices: next });
  }

  /**
   * The bridge's Phase A write path for the three ids (see the header).
   * Carried over from `SelectionMirror.adopt`, which this store replaces.
   *
   * ⚠️ Task 28 REMOVED `variantFrameIndices` from this method. That field
   * flipped to Phase B — MobX owns it — so adopting Zustand's copy on every
   * store change would make Zustand a second writer and revert a fresh
   * variant-frame selection on the next unrelated tick. External writes to it
   * (a project load) arrive through the bridge's `adoptVariantFrameIndices`
   * echo-check seam instead, and land on {@link adoptVariantFrameIndices}.
   */
  adopt(next: {
    selectedObjectId: string | null;
    selectedFrameId: string | null;
    selectedLayerId: string | null;
  }): void {
    this.selectedObjectId = next.selectedObjectId;
    this.selectedFrameId = next.selectedFrameId;
    this.selectedLayerId = next.selectedLayerId;
  }

  /**
   * Adopt an EXTERNAL `variantFrameIndices` write — a project load, or the
   * migration chain filling in a default (task 28).
   *
   * Distinct from {@link replaceVariantFrameIndices} because it must NOT
   * publish back into Zustand: the value came FROM Zustand, and echoing it
   * would restart the loop. Same shape as `UIStore.hydrateLighting`.
   */
  adoptVariantFrameIndices(next: { [variantGroupId: string]: number }): void {
    this.variantFrameIndices = next;
  }

  /**
   * Select an object — ported from `store/objectActions.ts:58-71` (W29f,
   * task 38) with NO behaviour change. It writes ONLY the three selection
   * ids, which is why it belongs here and not on `ObjectStore`.
   *
   * ── This is the flip the bridge waited five waves for ──────────────────
   *
   * `objectActions.ts`'s `selectObject` was the LAST unbridged writer of
   * `selectedObjectId`/`selectedFrameId`/`selectedLayerId`, and the bridge's
   * Phase A note names it as the sole remaining blocker. Moving it here and
   * installing the delegate makes `TimelineUIStore` the single writer of all
   * three, so the same change moves them A→B (R6: move, never copy).
   *
   * The three pinned behaviours, preserved verbatim:
   *
   *  1. **An unknown id still selects.** The legacy body does
   *     `objects.find(...)` and uses `obj?.frames[0]?.id ?? null` — so
   *     `selectObject("nope")` sets `selectedObjectId` to `"nope"` and NULLS
   *     the frame and layer ids. There is no guard and none may be added;
   *     this is the same "accepts an id that does not exist" shape task 08
   *     pinned for `selectLayer`.
   *  2. **It always resets to `frames[0]` / `layers[0]`**, never to a
   *     name-matched layer — unlike `selectFrame`'s carry-over ladder.
   *  3. **Selection is never undoable** (`trackHistory=false`), which is why
   *     it publishes through `publishSelection` rather than a tracked commit.
   *
   * ⚠️ It does NOT touch `variantFrameIndices`, and must not start: the
   * legacy body left them alone, and that field is Phase B with
   * `TimelineUIStore` already its single writer.
   */
  selectObject(id: string): void {
    const obj = this.context.objects().find((o) => o.id === id);
    const nextFrameId = obj?.frames[0]?.id ?? null;
    const nextLayerId = obj?.frames[0]?.layers[0]?.id ?? null;

    this.selectedObjectId = id;
    this.selectedFrameId = nextFrameId;
    this.selectedLayerId = nextLayerId;

    this.context.publishSelection({
      selectedObjectId: id,
      selectedFrameId: nextFrameId,
      selectedLayerId: nextLayerId,
    });
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

  /* ══ Task 28: the two VARIANT-TIMELINE selection actions ═══════════════
   *
   * Moved off `store/variantActions.ts`, where they were two of twenty. They
   * belong here and not on `VariantStore` because they write NOTHING but UI
   * selection — `variantFrameIndices` plus, for `selectVariantFrame`, the
   * base frame and layer ids. Neither touches `project.objects` or
   * `project.variants`, and both were already `trackHistory=false`.
   *
   * `selectVariant` is NOT here: it writes `layer.selectedVariantId` on the
   * objects tree and is a domain action on `VariantStore`. The task spec
   * lists it among the three that move; that is a spec error, recorded in
   * `VariantStore`'s header.
   */

  /**
   * Click a frame in a VARIANT timeline: move the variant to that frame, pull
   * the BASE timeline along with it, and sync every other variant group.
   *
   * Ported from `variantActions.ts:773-855` with no behaviour change. The
   * four pinned subtleties:
   *
   *  1. The base frame is chosen by `frameIndex % baseFrameCount` — the
   *     variant timeline can be LONGER than the base one and wraps.
   *  2. The clicked group gets the EXACT `frameIndex`, unwrapped. Only the
   *     other groups are taken modulo their own frame counts. So a variant
   *     with 3 frames clicked at index 5 stores 5, and every reader is
   *     expected to wrap on read (`currentVariant` does:
   *     `variant.frames[i % variant.frames.length]`).
   *  3. Each other group's frame count comes from the TARGET frame's variant
   *     LAYER's `selectedVariantId`, falling back to `vg.variants[0]` only
   *     when no such layer exists — the same rule `selectFrame` uses.
   *  4. When editing a variant, the layer selection is carried to the new
   *     frame's layer with the same `variantGroupId`; otherwise the layer
   *     selection is left exactly as it was.
   *
   * ⚠️ Unlike `selectFrame` this does NOT run the name-match / `layers[0]`
   * carry-over ladder. A non-variant selection simply stays put.
   */
  selectVariantFrame(variantGroupId: string, frameIndex: number): void {
    const obj = this.context.currentObject();
    if (!obj) return;

    const currentLayer = this.context.currentLayer();
    const isEditingVariant =
      currentLayer?.isVariant === true &&
      currentLayer?.variantGroupId === variantGroupId;

    // Sync base frame to match variant frame index.
    const baseFrameCount = obj.frames.length;
    let newBaseFrameId = this.selectedFrameId;
    let newLayerId = this.selectedLayerId;
    let targetFrame: Frame | null = null;

    if (baseFrameCount > 0) {
      const baseFrameIndex = frameIndex % baseFrameCount;
      targetFrame = obj.frames[baseFrameIndex] ?? null;
      if (targetFrame) {
        newBaseFrameId = targetFrame.id;

        if (isEditingVariant && currentLayer) {
          const variantLayer = targetFrame.layers.find(
            (l) => l.isVariant && l.variantGroupId === variantGroupId,
          );
          if (variantLayer) {
            newLayerId = variantLayer.id;
          }
        }
      }
    }

    // Sync ALL other variant groups to the same index, wrapped per group.
    const newVariantFrameIndices: { [key: string]: number } = {
      [variantGroupId]: frameIndex,
    };

    const variants = this.context.variants();
    if (targetFrame && variants) {
      for (const vg of variants) {
        if (vg.id === variantGroupId) continue;

        const variantLayer = targetFrame.layers.find(
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
          newVariantFrameIndices[vg.id] = frameIndex % variantFrameCount;
        }
      }
    }

    const nextLayerId = newLayerId ?? this.selectedLayerId;
    const nextIndices = {
      ...this.variantFrameIndices,
      ...newVariantFrameIndices,
    };

    this.selectedFrameId = newBaseFrameId;
    this.selectedLayerId = nextLayerId;
    this.variantFrameIndices = nextIndices;

    this.context.publishSelection({
      selectedFrameId: newBaseFrameId,
      selectedLayerId: nextLayerId,
      variantFrameIndices: nextIndices,
    });
  }

  /**
   * Step every variant timeline by `delta`, wrapping within each group's own
   * frame count. Drives variant playback.
   *
   * Ported from `variantActions.ts:857-901`. Two pinned details:
   *
   *  1. The wrap is `(current + delta + max * |delta|) % max`, not a plain
   *     `%`. The `max * |delta|` term is what keeps a NEGATIVE delta positive
   *     before the modulo — JavaScript's `%` returns a negative remainder for
   *     a negative dividend, so a plain `%` would produce negative indices on
   *     reverse playback.
   *  2. Each group's frame count comes from the CURRENT frame's variant
   *     layer's `selectedVariantId`, falling back to `vg.variants[0]`.
   *
   * It bails out entirely when there is no current frame, so a group with no
   * host layer in view never advances.
   */
  advanceVariantFrames(delta: number): void {
    const currentFrame = this.context.currentFrame();
    if (!currentFrame) return;

    const newIndices: { [key: string]: number } = {};
    const currentIndices = this.variantFrameIndices ?? {};

    for (const vg of this.context.variants() ?? []) {
      const currentIdx = currentIndices[vg.id] ?? 0;

      const variantLayer = currentFrame.layers.find(
        (l) => l.isVariant && l.variantGroupId === vg.id,
      );

      let maxFrames = 1;
      if (variantLayer?.selectedVariantId) {
        const selectedVariant = vg.variants.find(
          (v) => v.id === variantLayer.selectedVariantId,
        );
        maxFrames = selectedVariant?.frames.length ?? 1;
      } else {
        // Fallback to first variant if no layer found.
        maxFrames = vg.variants[0]?.frames.length ?? 1;
      }

      const newIdx =
        (currentIdx + delta + maxFrames * Math.abs(delta)) % maxFrames;
      newIndices[vg.id] = newIdx;
    }

    const nextIndices = { ...this.variantFrameIndices, ...newIndices };
    this.variantFrameIndices = nextIndices;
    this.context.publishSelection({ variantFrameIndices: nextIndices });
  }
}
