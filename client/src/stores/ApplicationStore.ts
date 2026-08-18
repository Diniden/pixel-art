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
import { SelectionMirror } from "./SelectionMirror";
import { ObjectStore, type SelectionSink } from "./domain/ObjectStore";
import { PaletteStore } from "./domain/PaletteStore";
import {
  createZustandProjectHost,
  createZustandDomainMirror,
  createZustandSelectionSink,
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
  /** The bridge-era home of the 4 `uiState` selection ids the computeds read. */
  readonly selection: SelectionMirror;

  // Future children — typed and constructed by their own tasks:
  // readonly ui: UIStore;            (task 24)

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
    this.selection = new SelectionMirror();
    const mutator = new DomainMutator({
      domain: this.domain,
      history: this.history,
      mirror: options.domainMirror ?? createZustandDomainMirror(),
    });
    this.palettes = new PaletteStore({ domain: this.domain, mutator });
    this.objects = new ObjectStore({
      domain: this.domain,
      mutator,
      selection: options.selectionSink ?? createZustandSelectionSink(),
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
  }
}
