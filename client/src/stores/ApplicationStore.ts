/**
 * ApplicationStore — the root of the MobX store tree (task 14).
 *
 * It constructs and wires the child stores and will host the cross-store
 * computeds (`currentObject`, `currentFrame`, …) when they arrive with task
 * 23. Children land incrementally:
 *
 *   session  — task 14 (SessionStore)
 *   domain   — task 16 (DomainStore load lifecycle + AutoSaveController)
 *   history  — HERE (task 17: HistoryStore — command stack, byte budget,
 *              undo/redo, the `isReplaying` auto-save guard)
 *   ui       — task 24 (UIStore + sub-stores, toPersistedUIState())
 *
 * ── Never a module-level singleton ─────────────────────────────────────────
 * The store is constructed ONCE, in `main.tsx`, and passed into React via
 * `StoreProvider`. Storybook and Vitest construct a fresh instance per story
 * and per test. A module-level singleton is exactly the defect the deleted
 * `services/autoSave.ts` had, and it is not carried forward.
 *
 * ⚠️ Bridge-era exception, task 17: `history` ADOPTS the shared
 * `editorHistory` instance from `store/index.ts` rather than constructing its
 * own — the Zustand actions (undo/redo/commit) and the MobX tree must share
 * ONE command stack so `AutoSaveController`'s replay guard observes the same
 * `isReplaying` the undo path sets. Same temporariness and rationale as
 * `createZustandProjectHost()`; per-instance construction arrives when the
 * Zustand store is retired.
 */
// ⚠️ Side-effect import FIRST: configures MobX strict mode
// (`enforceActions: "always"` + the dev-only strictness flags) before any
// observable in this tree is created.
import "./configure";
import { computed, makeObservable } from "mobx";
import { SessionStore } from "./session/SessionStore";
import {
  AutoSaveController,
  type AutoSaveControllerOptions,
} from "./session/AutoSaveController";
import { DomainStore, type ProjectHost } from "./domain/DomainStore";
import { DomainMutator, type DomainMirror } from "./domain/DomainMutator";
import { UIStore } from "./ui/UIStore";
import { ViewportUIStore } from "./ui/ViewportUIStore";
import { ToolUIStore } from "./ui/ToolUIStore";
import { LightingUIStore } from "./ui/LightingUIStore";
import { TimelineUIStore, type TimelineContext } from "./ui/TimelineUIStore";
import { ObjectStore, type SelectionSink } from "./domain/ObjectStore";
import { PaletteStore } from "./domain/PaletteStore";
import { FrameStore } from "./domain/FrameStore";
import { LayerStore } from "./domain/LayerStore";
import { PixelStore } from "./domain/PixelStore";
import type { PixelMirror } from "./domain/PixelStore";
import { SelectionUIStore } from "./ui/SelectionUIStore";
import {
  createZustandProjectHost,
  createZustandDomainMirror,
  createZustandSelectionSink,
  createZustandTimelineContext,
  createZustandPixelMirror,
  createZustandSelectionPublisher,
} from "./bridge/zustandProjectHost";
import { editorHistory } from "../store";
import type { HistoryStore } from "./history/HistoryStore";
import type {
  Frame,
  Layer,
  PixelObject,
  Variant,
  VariantFrame,
  VariantGroup,
} from "../types";
import type { SelectionState } from "../store/storeTypes";

/** The resolved variant context — the shape `helpers.getCurrentVariant` returned. */
export interface CurrentVariant {
  variantGroup: VariantGroup;
  variant: Variant;
  variantFrame: VariantFrame;
  baseFrameIndex: number;
  offset: { x: number; y: number };
}

/**
 * The UI selection the computeds read. Until the UIStore lands (task 24)
 * these ids live in Zustand's `project.uiState`, so `ApplicationStore` reads
 * them through this injected seam rather than importing the Zustand store.
 */
export interface SelectionSource {
  readonly selectedObjectId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
  readonly variantFrameIndices: { [variantGroupId: string]: number };
}

export interface ApplicationStoreOptions {
  /**
   * The typed API layer (task 15). Untyped until that task lands; tests pass
   * a mock here so no store ever reaches for a module-level API import.
   */
  api?: unknown;
  /** Tests set `false` so no save reaction is ever wired (task 16). */
  autoSaveEnabled?: boolean;
  /**
   * Tests shrink this to exercise history eviction (task 17). Applied to the
   * shared `editorHistory` instance — tests that set it must restore
   * `MAX_HISTORY_BYTES` afterwards (bridge-era sharing, see the header).
   */
  historyBudgetBytes?: number;
  /**
   * Where the project TREE lives during the bridge era. Defaults to the
   * Zustand-backed host; tests may substitute an in-memory one.
   */
  projectHost?: ProjectHost;
  /** Auto-save transport/clock overrides for tests. */
  autoSave?: AutoSaveControllerOptions;
  /**
   * Where a committed domain mutation is published for the not-yet-migrated
   * Zustand consumers (task 23). Defaults to the Zustand mirror; tests
   * substitute a recorder.
   */
  domainMirror?: DomainMirror;
  /**
   * Where `ObjectStore` writes the `uiState` selection ids during the bridge
   * era (task 23). Defaults to the Zustand sink.
   */
  selectionSink?: SelectionSink;
  /**
   * How `TimelineUIStore` publishes a selection change and clears the pending
   * colour adjustment during the bridge era (task 25). Defaults to the
   * Zustand context; tests substitute a recorder. The `currentObject` /
   * `currentLayer` / `variants` readers are always supplied by
   * `ApplicationStore` itself, never overridden.
   */
  timelineContext?: Pick<
    TimelineContext,
    "publishSelection" | "clearColorAdjustment"
  >;
  /**
   * Where `PixelStore` publishes a committed tree during the bridge era
   * (task 26). Defaults to the Zustand mirror; tests substitute a recorder.
   */
  pixelMirror?: PixelMirror;
  /**
   * Where `SelectionUIStore` publishes the selection during the bridge era
   * (task 26). Defaults to the Zustand `selection` field.
   */
  selectionPublisher?: (selection: SelectionState | null) => void;
}

const DEFAULT_HISTORY_BUDGET_BYTES = 64 * 1024 * 1024;

export class ApplicationStore {
  readonly session: SessionStore;
  readonly domain: DomainStore;
  /** The undo/redo owner (task 17) — bridge-era shared instance, see header. */
  readonly history: HistoryStore;
  /** `null` when `autoSaveEnabled: false` (the test default). */
  readonly autoSave: AutoSaveController | null;

  /* ── task 23 ───────────────────────────────────────────────────────────── */
  /** Behaviour modules over `DomainStore`'s tree (see `DomainMutator`). */
  readonly palettes: PaletteStore;
  readonly objects: ObjectStore;
  /**
   * The 4 `uiState` selection ids the computeds read. Task 25 replaced the
   * `SelectionMirror` placeholder with the real `TimelineUIStore`, which is
   * structurally identical for these four fields and additionally owns
   * `selectFrame`/`selectLayer` and the three view-mode fields.
   */
  readonly selection: TimelineUIStore;

  /* ── task 24 ───────────────────────────────────────────────────────────── */
  /**
   * The UI slice: `ToolUIStore` + `ViewportUIStore`, and the owner of
   * `toPersistedUIState()` — the explicit field-by-field builder that keeps
   * the save payload wire-identical (R3).
   */
  readonly ui: UIStore;

  /* ── task 25 ───────────────────────────────────────────────────────────── */
  /** Frame CRUD (9 actions) over the tree. */
  readonly frames: FrameStore;
  /**
   * Layer structure, the timeline cell ops and both clipboards (23 actions,
   * absorbing `layerActions` + `timelineActions` + `layerClipboardActions`).
   */
  readonly layers: LayerStore;
  /**
   * The timeline/layer SELECTION state — the same instance as
   * {@link selection}, exposed under its own name so consumers read
   * `app.timelineUI.selectFrame(...)` rather than `app.selection`.
   */
  readonly timelineUI: TimelineUIStore;

  /* ── task 26 ───────────────────────────────────────────────────────────── */
  /**
   * THE SOLE WRITER OF PIXEL GRIDS. Every pixel mutation in the application
   * goes through here, records an inverse-patch command (~24 B/changed cell
   * rather than a 6.9 MB project clone) and ends with `bumpPixelVersion()`.
   */
  readonly pixels: PixelStore;
  /**
   * The selection mask (`observableRef`, raw `Set`) and the 9 selection
   * actions. `mode`/`behavior` are DELEGATED to `ToolUIStore`, which has
   * owned them since task 24 — see `SelectionUIStore`'s header.
   */
  readonly selectionUI: SelectionUIStore;

  /* ── task 27 ───────────────────────────────────────────────────────────── */
  /**
   * The lighting studio's 9 persisted settings.
   *
   * ⚠️ It is the STRUCTURAL fix for live bug #2: eight of the nine never
   * scheduled a save at all, because `store/lightingActions.ts` did not
   * import `services/autoSave`. Here they are observables the
   * `persistedUIVersion` reaction reads through `toPersistedUIState()`, so a
   * save is scheduled by construction and cannot be forgotten. See
   * `LightingUIStore`'s header.
   */
  readonly lightingUI: LightingUIStore;

  readonly options: Readonly<{
    api: unknown;
    autoSaveEnabled: boolean;
    historyBudgetBytes: number;
  }>;

  constructor(options: ApplicationStoreOptions = {}) {
    this.options = {
      api: options.api ?? null,
      autoSaveEnabled: options.autoSaveEnabled ?? true,
      historyBudgetBytes:
        options.historyBudgetBytes ?? DEFAULT_HISTORY_BUDGET_BYTES,
    };
    this.session = new SessionStore();
    this.domain = new DomainStore({
      session: this.session,
      host: options.projectHost ?? createZustandProjectHost(),
    });
    this.history = editorHistory;
    this.history.setBudgetBytes(this.options.historyBudgetBytes);

    // ── task 23: the tree's behaviour modules and the cross-store computeds ─
    const mutator = new DomainMutator({
      domain: this.domain,
      history: this.history,
      mirror: options.domainMirror ?? createZustandDomainMirror(),
    });

    // ── task 25: TimelineUIStore replaces the SelectionMirror placeholder ──
    //
    // ⚠️ CONSTRUCTION ORDER IS LOAD-BEARING: viewport → timeline → ui.
    //
    // There is a genuine cycle. `TimelineUIStore` delegates its three
    // view-mode fields to `ViewportUIStore`, and `UIStore` reads the four
    // selection ids OFF `TimelineUIStore` for `toPersistedUIState()`.
    //
    // It cannot be broken with a forward reference, which was tried first and
    // measured to fail: `UIStore`'s constructor starts the
    // `persistedUIVersion` reaction, and that reaction evaluates
    // `persistedSignature` — hence every selection id — EAGERLY, before the
    // constructor returns. A `let timelineUI!` still undefined at that moment
    // throws inside the reaction.
    //
    // Building `ViewportUIStore` here and handing it to BOTH stores removes
    // the cycle outright: by the time `UIStore` runs its reaction,
    // `TimelineUIStore` is fully built.
    //
    // The `currentObject`/`currentLayer`/`variants` readers close over `this`
    // so `selectFrame` sees the same computeds every consumer does — that is
    // the injection seam `VariantStore` will reuse in task 28 to retire
    // `variantActions.ts`'s `selectLayer` import.
    const viewport = new ViewportUIStore();
    // ── task 27 ────────────────────────────────────────────────────────────
    // `ToolUIStore` is hoisted out of `UIStore` for the same reason
    // `ViewportUIStore` was in task 25: `LightingUIStore.setStudioMode` also
    // writes `selectedTool`, and `UIStore`'s `persistedUIVersion` reaction
    // reads the lighting store EAGERLY during construction. Building tool →
    // lighting → UI removes the cycle outright.
    const tool = new ToolUIStore();
    const lightingUI = new LightingUIStore({ tool });
    this.lightingUI = lightingUI;
    const zustandTimeline = createZustandTimelineContext();
    const timelineUI = new TimelineUIStore({
      viewport,
      context: {
        currentObject: () => this.currentObject,
        currentLayer: () => this.currentLayer,
        variants: () => this.domain.variants,
        publishSelection:
          options.timelineContext?.publishSelection ??
          zustandTimeline.publishSelection,
        clearColorAdjustment:
          options.timelineContext?.clearColorAdjustment ??
          zustandTimeline.clearColorAdjustment,
      },
    });
    this.timelineUI = timelineUI;
    this.selection = timelineUI;
    this.ui = new UIStore({
      session: this.session,
      selection: timelineUI,
      viewport,
      tool,
      lighting: lightingUI,
    });
    const uiRef = this.ui;
    // ⚠️ INJECTED, not imported: `DomainStore` may not depend on
    // `stores/ui/**` (ESLint, task 05). This is the seam that lets
    // `serialize()` emit the 43 UI fields without a domain→UI dependency.
    this.domain.setUIStateProvider(() => this.ui.toPersistedUIState());

    this.palettes = new PaletteStore({ domain: this.domain, mutator });
    const selectionSink = options.selectionSink ?? createZustandSelectionSink();
    this.objects = new ObjectStore({
      domain: this.domain,
      mutator,
      selection: selectionSink,
    });

    // ── task 25 ────────────────────────────────────────────────────────────
    // Both take `DomainStore` + `HistoryStore` (through `DomainMutator`) by
    // injection, and read the UI selection through plain getters rather than
    // importing a UI store — `stores/domain/**` may not depend on
    // `stores/ui/**` (ESLint, task 05).
    this.frames = new FrameStore({
      domain: this.domain,
      mutator,
      selection: selectionSink,
      source: timelineUI,
    });
    this.layers = new LayerStore({
      domain: this.domain,
      mutator,
      session: this.session,
      selection: selectionSink,
      source: {
        get selectedObjectId() {
          return timelineUI.selectedObjectId;
        },
        get selectedFrameId() {
          return timelineUI.selectedFrameId;
        },
        get selectedLayerId() {
          return timelineUI.selectedLayerId;
        },
        get variantFrameIndices() {
          return timelineUI.variantFrameIndices;
        },
        // `moveAllLayers` is a TOOL setting, read (never written) here.
        get moveAllLayers() {
          return uiRef.tool.moveAllLayers;
        },
      },
      setVariantFrameIndex: (variantGroupId, index) =>
        timelineUI.setVariantFrameIndex(variantGroupId, index),
    });

    // ── task 26: the hot path ──────────────────────────────────────────────
    //
    // `PixelStore` is THE SOLE WRITER of pixel grids. It takes `HistoryStore`
    // DIRECTLY rather than going through `DomainMutator`, and that is the
    // whole point of this task: `DomainMutator.commit()` always records a
    // full-project SNAPSHOT (`mirror.snapshot(label)`), which is exactly the
    // 6.9 MB-per-edit cost the inverse-patch family exists to remove. A pixel
    // edit records its own ~24 B/cell `PixelCommand` and publishes the tree
    // itself.
    //
    // It reads the selection ids through the same one-way getter seam
    // `LayerStore` uses — `stores/domain/**` may not import `stores/ui/**`
    // (ESLint, task 05), so mask/behaviour/variant-frame-index arrive as
    // ARGUMENTS at each call site instead.
    this.pixels = new PixelStore({
      domain: this.domain,
      history: this.history,
      mirror: options.pixelMirror ?? createZustandPixelMirror(),
      source: {
        get selectedObjectId() {
          return timelineUI.selectedObjectId;
        },
        get selectedFrameId() {
          return timelineUI.selectedFrameId;
        },
        get selectedLayerId() {
          return timelineUI.selectedLayerId;
        },
        get variantFrameIndices() {
          return timelineUI.variantFrameIndices;
        },
      },
    });

    // `mode`/`behavior` are DELEGATED to `ToolUIStore` (which has owned them
    // since task 24) rather than duplicated — see `SelectionUIStore`'s header
    // for why the spec's "add them to toPersistedUIState()" step is already
    // satisfied and must not be repeated.
    this.selectionUI = new SelectionUIStore({
      tool: this.ui.tool,
      publish: options.selectionPublisher ?? createZustandSelectionPublisher(),
    });

    makeObservable(this, {
      currentObject: computed,
      currentFrame: computed,
      currentLayer: computed,
      currentVariant: computed,
      selectedVariantLayer: computed,
      isEditingVariant: computed,
    });

    // The save reaction — constructed LAST so it observes fully-built stores.
    // `history` is the live replay guard (task 17): the trigger is `null`
    // while `isReplaying` is set, so undo/redo never schedules a save.
    this.autoSave = this.options.autoSaveEnabled
      ? new AutoSaveController(
          this.domain,
          this.session,
          this.history,
          options.autoSave,
        )
      : null;
  }

  /* ── THE 6 COMPUTEDS — the replacement for `store/helpers.ts` (task 23) ──
   *
   * `helpers.ts` is 93 lines, pure, writes nothing, and is called ~120 times
   * across 9 store modules and 8 components — the only shared dependency in
   * the whole store graph. Every call re-runs the work; as `computed`s they
   * are cached and invalidated only by their real inputs.
   *
   * They live HERE, not on `DomainStore` or a UI store, because they span
   * both: they read the domain tree AND the UI selection ids. The selection
   * arrives through `SelectionMirror` until `TimelineUIStore` lands.
   *
   * Each is behaviour-identical to the helper it replaces. Where the legacy
   * code has a quirk, the quirk is preserved and commented — this is a
   * migration, not a cleanup.
   */

  /** Replaces `helpers.getCurrentObject`. */
  get currentObject(): PixelObject | null {
    const id = this.selection.selectedObjectId;
    return this.domain.objects.find((o) => o.id === id) ?? null;
  }

  /** Replaces `helpers.getCurrentFrame`. */
  get currentFrame(): Frame | null {
    const obj = this.currentObject;
    if (!obj) return null;
    const id = this.selection.selectedFrameId;
    return obj.frames.find((f) => f.id === id) ?? null;
  }

  /** Replaces `helpers.getCurrentLayer`. */
  get currentLayer(): Layer | null {
    const frame = this.currentFrame;
    if (!frame) return null;
    const id = this.selection.selectedLayerId;
    return frame.layers.find((l) => l.id === id) ?? null;
  }

  /**
   * Replaces `helpers.getCurrentVariant` — the 60-line scan at
   * `helpers.ts:33-79` that runs on EVERY call today.
   *
   * ⚠️ THE OFFSET PRECEDENCE IS LOAD-BEARING (`helpers.ts:69-77`). Getting it
   * wrong misplaces every variant on canvas, and all four levels are pinned
   * by task 08:
   *
   *     1. layer.variantOffsets[selectedVariantId]   per-variant-type offset
   *     2. layer.variantOffset                       legacy single offset
   *     3. variant.baseFrameOffsets[baseFrameIndex]  legacy per-base-frame
   *     4. { x: 0, y: 0 }                            the floor
   *
   * Two quirks preserved verbatim:
   *  - the `??` chain means a level is skipped only when it is null/undefined,
   *    so an explicit `{x:0,y:0}` at level 1 WINS over level 2;
   *  - `baseFrameIndex` falls back to index 0 when the selected frame is not
   *    found (`findIndex` returning -1), rather than bailing out.
   */
  get currentVariant(): CurrentVariant | null {
    const obj = this.currentObject;
    const layer = this.currentLayer;
    if (!obj || !layer || !layer.isVariant || !layer.variantGroupId) {
      return null;
    }

    // Project-level variants first; object-level is the legacy location.
    const variantGroup = this.domain.variants.find(
      (vg) => vg.id === layer.variantGroupId,
    );
    if (!variantGroup) return null;

    const variant = variantGroup.variants.find(
      (v) => v.id === layer.selectedVariantId,
    );
    if (!variant) return null;

    const variantFrameIndex =
      this.selection.variantFrameIndices?.[variantGroup.id] ?? 0;
    const variantFrame =
      variant.frames[variantFrameIndex % variant.frames.length];

    const currentFrameId = this.selection.selectedFrameId;
    const baseFrameIndex = obj.frames.findIndex((f) => f.id === currentFrameId);

    const selectedVariantId = layer.selectedVariantId;
    const offset = layer.variantOffsets?.[selectedVariantId ?? ""] ??
      layer.variantOffset ??
      variant.baseFrameOffsets?.[
        baseFrameIndex >= 0 ? baseFrameIndex : 0
      ] ?? { x: 0, y: 0 };

    return { variantGroup, variant, variantFrame, baseFrameIndex, offset };
  }

  /** Replaces `helpers.getSelectedVariantLayer`. */
  get selectedVariantLayer(): Layer | null {
    return this.currentVariant?.variantFrame.layers[0] ?? null;
  }

  /**
   * Replaces `helpers.isEditingVariant`.
   *
   * ⚠️ Note it reads `currentLayer`, NOT `currentVariant`: the legacy helper
   * returns true for a variant LAYER even when the variant group/variant
   * cannot be resolved (so `isEditingVariant && !currentVariant` is a
   * reachable state the consumers already handle). The spec's table lists
   * `currentVariant` as the input; the code is the authority here.
   */
  get isEditingVariant(): boolean {
    return this.currentLayer?.isVariant === true;
  }

  /** Storybook/Vitest teardown: stop the save reaction and its timers. */
  dispose(): void {
    this.autoSave?.dispose();
    this.ui.dispose();
  }
}
