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
import { computed, makeObservable, reaction, runInAction } from "mobx";
import { SessionStore } from "./session/SessionStore";
import {
  AutoSaveController,
  type AutoSaveControllerOptions,
} from "./session/AutoSaveController";
import {
  SyncController,
  type SyncControllerOptions,
} from "./session/SyncController";
import { SyncClient, type ProjectSavedEvent } from "../api";
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
import { VariantStore } from "./domain/VariantStore";
import { PixelStore } from "./domain/PixelStore";
import type { PixelMirror } from "./domain/PixelStore";
import { SelectionUIStore } from "./ui/SelectionUIStore";
import {
  applyInterpolation as applyInterpolationAction,
  type ApplyInterpolationInput,
} from "./domain/applyInterpolation";
import { ReferenceUIStore } from "./ui/ReferenceUIStore";
import { CanvasInteractionStore } from "./ui/CanvasInteractionStore";
import { CanvasViewsUIStore } from "./ui/CanvasViewsUIStore";
import { LightingViewsUIStore } from "./ui/LightingViewsUIStore";
import { ReflectionUIStore } from "./ui/ReflectionUIStore";
import { PoseUIStore } from "./ui/PoseUIStore";
import { editorHistory } from "./history/editorHistory";
import { createSnapshotCommand } from "./history/commands";
import type { Command, SnapshotHost } from "./history/commands";
import type { HistoryStore } from "./history/HistoryStore";
import type {
  Color,
  CurrentVariant,
  Frame,
  Layer,
  PixelData,
  PixelObject,
  Project,
  UIState,
} from "../types";
import type { ColorAdjustmentState, SelectionState } from "../store/storeTypes";
import type { ReferenceImageData } from "../types/referenceImage";

/**
 * The resolved variant context — the shape `helpers.getCurrentVariant` returned.
 *
 * Moved to `types/domain.ts` in REFRESH task 36 so `ui/` components may name
 * it (the purity boundary bans `stores/` even for type imports). Re-exported
 * here so existing importers are unaffected.
 */
export type { CurrentVariant };

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
   * Cross-instance sync: reload this tab when ANOTHER tab saves.
   *
   * Defaults to `false` — a websocket is a side effect no test or Storybook
   * story should acquire implicitly. `main.tsx` opts the real app in.
   */
  syncEnabled?: boolean;
  /** Sync reload override for tests. */
  sync?: SyncControllerOptions;
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
   * Where {@link ApplicationStore.setAiServiceUrl} writes the PERSISTING half
   * (W29d). Defaults to the Zustand host, which writes the Phase A source
   * `project.uiState.aiServiceUrl`; tests substitute a recorder.
   */
  publishAiServiceUrl?: (url: string) => void;
  /**
   * The bridge-era undo/redo glue (W29d). Defaults to `store/index.ts`'s
   * published `historyControl`, the single writer of the Phase B history
   * mirror; tests substitute a recorder. See {@link ApplicationStore.undo}.
   */
  historyControl?: {
    undo(): void;
    redo(): void;
    /** W29h. Optional so an existing test double still type-checks. */
    snapshot?(label?: string): void;
  };
  /**
   * Where {@link ApplicationStore.setColorAndAddToHistory} writes the
   * Zustand-sourced half (W29d). Defaults to the Zustand host; tests
   * substitute a recorder.
   */
  publishColorAndHistory?: (color: Color) => void;
  /**
   * Where {@link ApplicationStore.adjustColor} writes `uiState.selectedColor`
   * WITHOUT touching `colorHistory` (W29h). Defaults to the Zustand host;
   * tests substitute a recorder. See `publishSelectedColor`'s header for why
   * it is not `publishColorAndHistory`.
   */
  publishSelectedColor?: (color: Color) => void;
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
  /**
   * Cross-instance sync (`null` unless `syncEnabled: true`).
   *
   * `syncController` decides what a peer's save does; `syncClient` owns the
   * socket. Split so the decision is testable without a websocket.
   */
  readonly syncController: SyncController | null;
  private readonly syncClient: SyncClient | null;

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

  /* ── task 28 ───────────────────────────────────────────────────────────── */
  /**
   * The 17 variant DOMAIN actions — the largest slice of the migration
   * (`store/variantActions.ts`, 1,412 lines).
   *
   * ⚠️ It mutates `domain.objects` AND `domain.variants` in the same
   * operation, which is the measurement behind the whole "behaviour modules
   * over ONE tree" decision (see `DomainMutator`'s header). It reaches
   * `TimelineUIStore` only through two injected callbacks — `selectLayer`
   * (the store graph's last cross-module edge) and the two
   * `variantFrameIndices` setters — so `stores/domain/**` still imports
   * nothing from `stores/ui/**`.
   */
  readonly variants: VariantStore;

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

  /**
   * The Zustand half of the paired colour-adjustment clear (W29i).
   * See {@link clearBothColorAdjustments}; a no-op once task 38 lands.
   */
  private readonly legacyClearColorAdjustment: () => void;

  /* ── task 34 ───────────────────────────────────────────────────────────── */
  /**
   * The shared write seam, retained so {@link applyInterpolation} can reach
   * it. Every other consumer receives it by constructor injection; this one
   * is an ApplicationStore-level ACTION rather than a sub-store because it
   * spans both `objects` and `variants` (the same cross-slice reason
   * `DomainMutator`'s header gives for not splitting the data).
   */
  private readonly mutator: DomainMutator;

  /* ── task 38: the hosted project — the Zustand mirror's replacement ────── */
  /**
   * The recombined `Project` this app currently hosts, held BY REFERENCE.
   *
   * This is what the bridge-era Zustand `project` field was once the 34
   * legacy consumers were migrated off it: the box `DomainMirror.publish` and
   * `PixelMirror.publish` land a committed tree in, and the record
   * `DomainStore.currentProject()` reads its `uiState` ride-alongs from.
   * Plain and non-observable, deliberately — it carries 300k-cell grids, and
   * every live consumer observes the MobX stores instead (R2).
   */
  private readonly hosted: { current: Project | null } = { current: null };

  /** Task 38 — restored by {@link ApplicationStore.dispose}. */
  private previousSnapshotProvider: ((label: string) => Command | null) | null =
    null;

  /**
   * How a `SnapshotCommand` reads and restores the live project (task 38 —
   * the legacy glue's `snapshotHost`, re-homed). `restore` re-attaches the
   * LIVE `referenceImage`: it never travels through history (task 17), so
   * commands are captured with it stripped.
   */
  private readonly snapshotHost: SnapshotHost = {
    current: () => this.hosted.current,
    restore: (project) => {
      this.adoptProject({
        ...project,
        referenceImage: this.hosted.current?.referenceImage,
      });
    },
  };

  /** W29d — see {@link ApplicationStore.setAiServiceUrl}. */
  private readonly aiServiceUrlSink: (url: string) => void;

  /** W29d — see {@link ApplicationStore.undo}. */
  private readonly historyOps: {
    undo(): void;
    redo(): void;
    snapshot(label?: string): void;
  };

  /** W29d — see {@link ApplicationStore.setColorAndAddToHistory}. */
  private readonly colorSink: (color: Color) => void;
  /** W29h — see {@link ApplicationStore.adjustColor}. */
  private readonly selectedColorSink: (color: Color) => void;

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

  /**
   * Task 29: the reference-image + trace-overlay slice, and the replacement
   * for the module-level `persistentState` singleton that lived inside
   * `ReferenceImageModal.tsx`.
   *
   * ⚠️ Constructed BEFORE `UIStore`, because `UIStore.traceNudgeAmount` is now
   * a delegating accessor onto this store (one storage location, R6) and
   * `UIStore`'s `persistedUIVersion` reaction reads `persistedSignature` — and
   * therefore `traceNudgeAmount` — EAGERLY during construction. The same
   * measured ordering constraint that hoisted `ViewportUIStore` (task 25) and
   * `ToolUIStore` (task 27) out of `UIStore`.
   */
  readonly referenceUI: ReferenceUIStore;

  /* ── task 32 ───────────────────────────────────────────────────────────── */
  /**
   * The three TRANSIENT canvas-gesture fields (`isDrawing`, `drawStartPoint`,
   * `previewPixels`).
   *
   * ⚠️ It is NOT part of `UIStore` and is NOT read by `toPersistedUIState()`.
   * Nothing here is persisted, nothing here enters history, and
   * `previewPixels` is `observableRef` because it is rewritten on every
   * mousemove (R2). See `CanvasInteractionStore`'s header.
   *
   * Construction order is unconstrained — it has no dependencies and nothing
   * depends on it, which is exactly what a store of pure gesture scratch
   * state should look like.
   */
  readonly canvasInteraction: CanvasInteractionStore;

  /**
   * Which canvas render modes (Full / Layer) are open, which is on the left,
   * and the Layer pane's own camera. Session-only — nothing persisted, nothing
   * deep. No dependencies in either direction, like `canvasInteraction`.
   */
  readonly canvasViews: CanvasViewsUIStore;

  /**
   * Which lighting render modes (Edit / Preview) are open, which is on the
   * left, and an independent camera for EACH pane. Session-only — nothing
   * persisted, nothing deep. No dependencies in either direction, like
   * `canvasViews`.
   */
  readonly lightingViews: LightingViewsUIStore;

  /**
   * The reflection tool's guide lines and in-flight draft (reflection-tool
   * task 03). Session-only: not in `toPersistedUIState()`, not in history,
   * never schedules a save. No dependencies in either direction, like
   * `canvasViews`.
   *
   * Lines outlive layer/frame/object switches and are cleared only when a
   * DIFFERENT project is installed — see `disposeReflectionReaction` below.
   */
  readonly reflection: ReflectionUIStore;

  /**
   * Stops the `loadGeneration` → `reflection.clear()` reaction; run by
   * {@link ApplicationStore.dispose}.
   */
  private readonly disposeReflectionReaction: () => void;

  /**
   * The pose tool's 3D reference state — mesh (a primitive, the whole
   * mannequin, or one of its parts), rotation, light, outline width, camera
   * and pan (pose-tool task 02; framing deleted 2026-09-03, MASTER E2 —
   * a part is its own geometry now). ⚠️ The MODEL and OUTLINE colours are the
   * app's own Fill/Edge slots on `ui.tool`, not pose state (E8/E9).
   * Session-only: not in
   * `toPersistedUIState()`, not in history, never schedules a save. No
   * dependencies in either direction, like `reflection`.
   *
   * The pose outlives layer/frame/object switches and is cleared only when a
   * DIFFERENT project is installed — see `disposePoseReaction` below.
   */
  readonly pose: PoseUIStore;

  /**
   * Stops the `loadGeneration` → `pose.clear()` reaction; run by
   * {@link ApplicationStore.dispose}.
   */
  private readonly disposePoseReaction: () => void;

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
      host: options.projectHost ?? this.createNativeProjectHost(),
    });
    this.history = editorHistory;
    this.history.setBudgetBytes(this.options.historyBudgetBytes);

    // ── task 38: the shared history singleton snapshots THIS app's project ─
    //
    // The snapshot provider is a single slot on the shared `editorHistory`,
    // so the last-constructed app owns it — the same last-wins discipline the
    // retired bridge used for its action delegates. The previous provider is
    // captured and restored by `dispose()`, so a test that wires a second app
    // (`wireAutoSave()`) hands the slot back when it unwires.
    this.previousSnapshotProvider = this.history.setSnapshotProvider(
      (label) => {
        const project = this.domain.currentProject();
        return project
          ? createSnapshotCommand({ label, project, host: this.snapshotHost })
          : null;
      },
    );

    // ── task 23: the tree's behaviour modules and the cross-store computeds ─
    const mutator = new DomainMutator({
      domain: this.domain,
      history: this.history,
      mirror: options.domainMirror ?? {
        // Task 38 (native): a committed MobX mutation lands in the hosted
        // project BY REFERENCE — the one-line publish the Zustand mirror
        // performed, minus the store in the middle.
        publish: (project) => {
          this.hosted.current = project;
        },
        snapshot: (label) => {
          runInAction(() => this.history.snapshot(label));
        },
      },
    });
    this.mutator = mutator;

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
    // ── task 29 ────────────────────────────────────────────────────────────
    // Built here — after `tool`, before `this.ui` — for the ordering reason on
    // the member declaration above. `save` is INJECTED rather than imported:
    // `stores/ui/**` may not depend on `stores/domain/**` (ESLint, task 05),
    // so the store reaches `project.referenceImage` through this one callback.
    const referenceUI = new ReferenceUIStore({
      tool,
      save: (image, selection) => {
        void this.domain.saveReferenceImageToProject(image, selection);
      },
    });
    this.referenceUI = referenceUI;
    // ── task 32 ────────────────────────────────────────────────────────────
    // No dependencies in either direction; see the member declaration.
    this.canvasInteraction = new CanvasInteractionStore();
    // Split-canvas task 01: same reasoning as `canvasInteraction`.
    this.canvasViews = new CanvasViewsUIStore();
    // Lighting-preview-split task 01: same reasoning as `canvasViews`.
    this.lightingViews = new LightingViewsUIStore();
    // Reflection-tool task 03: same reasoning as `canvasViews`.
    this.reflection = new ReflectionUIStore();
    // Locked D6 — guides are cleared when a DIFFERENT project is installed.
    // `DomainStore.loadGeneration` is bumped once per fresh install (init /
    // load / create / switch / delete) and NOT by `adoptProject`, which also
    // runs on snapshot undo/redo; hooking that would wipe the guides on undo.
    this.disposeReflectionReaction = reaction(
      () => this.domain.loadGeneration,
      () => this.reflection.clear(),
    );
    // Pose-tool task 02: same reasoning as `reflection`.
    this.pose = new PoseUIStore();
    // Locked D6 — the pose is cleared when a DIFFERENT project is installed.
    // `DomainStore.loadGeneration` is bumped once per fresh install (init /
    // load / create / switch / delete) and NOT by `adoptProject`, which also
    // runs on snapshot undo/redo; hooking that would wipe the pose on undo.
    this.disposePoseReaction = reaction(
      () => this.domain.loadGeneration,
      () => this.pose.clear(),
    );
    // ── task 38: the NATIVE sinks — the hosted `uiState` replaces Zustand ──
    //
    // During the bridge era these wrote the Zustand SOURCE and the bridge
    // mirrored the value back into MobX. The MobX stores own every field now,
    // so each sink patches the hosted project's `uiState` ride-along copy —
    // the record `currentProject()` recombines for the wire format's domain
    // half and for external readers — while the owning store's observable is
    // written by the caller as before. One field, one writer, no mirror.
    this.aiServiceUrlSink =
      options.publishAiServiceUrl ??
      ((url) => this.patchHostedUiState({ aiServiceUrl: url }));
    // `colorHistory` is SessionStore-owned outright now (the Phase A list is
    // retired); `setColorAndAddToHistory`'s `session.addToColorHistory` call
    // is the single writer, so the sink carries only the `selectedColor`
    // half the legacy action folded into the same commit.
    this.colorSink =
      options.publishColorAndHistory ??
      ((color) => this.patchHostedUiState({ selectedColor: color }));
    this.selectedColorSink =
      options.publishSelectedColor ??
      ((color) => this.patchHostedUiState({ selectedColor: color }));
    // W29i's paired clear: the "legacy half" is gone with the Zustand store —
    // `ToolUIStore.colorAdjustment` is the ONLY storage location left, so the
    // second half of the pair is a no-op unless a test injects its own.
    this.legacyClearColorAdjustment =
      options.timelineContext?.clearColorAdjustment ?? (() => {});
    // Task 38: undo/redo/snapshot are bare `HistoryStore` calls now — the
    // Phase B mirror the bridge-era glue re-published after each operation is
    // gone with the store it mirrored into.
    this.historyOps = {
      undo: () =>
        options.historyControl
          ? options.historyControl.undo()
          : runInAction(() => this.history.undo()),
      redo: () =>
        options.historyControl
          ? options.historyControl.redo()
          : runInAction(() => this.history.redo()),
      snapshot: (label) => {
        const injected = options.historyControl?.snapshot;
        if (injected) injected.call(options.historyControl, label);
        else runInAction(() => this.history.snapshot(label ?? "Edit"));
      },
    };
    const timelineUI = new TimelineUIStore({
      viewport,
      context: {
        currentObject: () => this.currentObject,
        // Task 28: `advanceVariantFrames` needs the current FRAME's variant
        // layers to resolve each group's frame count.
        currentFrame: () => this.currentFrame,
        currentLayer: () => this.currentLayer,
        variants: () => this.domain.variants,
        // W29f (task 38): `selectObject` resolves an ARBITRARY object id, so
        // it needs the whole list — `currentObject` only ever yields the
        // already-selected one. Same shape as `variants` above.
        objects: () => this.domain.objects,
        publishSelection:
          options.timelineContext?.publishSelection ??
          ((patch) => this.patchHostedUiState(patch)),
        // ── W29d: the MobX half is now UNCONDITIONAL ──────────────────
        //
        // This callback used to be ONLY `zustandProjectHost.ts:150`'s
        // a legacy-hook `setState({ colorAdjustment: null })` — MobX
        // reaching back into Zustand for a field MobX already stores
        // (`ToolUIStore.colorAdjustment`). That is the wrong direction
        // through the bridge and it left the MobX copy permanently stale,
        // which is the mechanism behind the ledger's `GlobalHotkeys.tsx:78`
        // defect (`tool.colorAdjustment` never non-null, so Escape cannot
        // exit the mode).
        //
        // ⚠️ IT CLEARS BOTH, and that is NOT two writers of one field —
        // they are two DIFFERENT storage locations. `colorAdjustment` is in
        // NEITHER `PHASE_A_FIELDS` nor `PHASE_B_FIELDS`: the bridge does not
        // mirror it in either direction, so Zustand's copy and MobX's copy
        // are independent, and the live Zustand `colorAdjustmentActions.ts`
        // still reads its own. Clearing only MobX would stop `selectLayer`
        // dropping the LIVE adjustment — a real regression. Task 38 deletes
        // the Zustand half along with the store, leaving the MobX line.
        clearColorAdjustment: () => this.clearBothColorAdjustments(),
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
      reference: referenceUI,
    });
    const uiRef = this.ui;
    // ⚠️ INJECTED, not imported: `DomainStore` may not depend on
    // `stores/ui/**` (ESLint, task 05). This is the seam that lets
    // `serialize()` emit the 43 UI fields without a domain→UI dependency.
    this.domain.setUIStateProvider(() => this.ui.toPersistedUIState());

    this.palettes = new PaletteStore({ domain: this.domain, mutator });
    // Task 38 (native): a domain mutation's selection write lands on the ids'
    // OWNER (`TimelineUIStore`) plus the hosted ride-along copy. During the
    // bridge era this wrote Zustand and the adoption seam pulled it back;
    // both halves collapse into the two direct writes below.
    const selectionSink = options.selectionSink ?? {
      selectObjectTree: (ids: {
        selectedObjectId: string | null;
        selectedFrameId: string | null;
        selectedLayerId: string | null;
      }) => {
        this.patchHostedUiState(ids);
        runInAction(() => this.timelineUI.adopt(ids));
      },
    };
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

    // ── task 28: the variant slice ─────────────────────────────────────────
    //
    // The same one-way seam every domain store uses: selection ids arrive as
    // GETTERS, and the two UI writes as plain callbacks. `selectLayer` here
    // is the retirement of `variantActions.ts`'s `get().selectLayer` — the
    // store module graph's ONLY true cross-module edge, now an injected
    // function that carries no store type across the boundary.
    this.variants = new VariantStore({
      domain: this.domain,
      mutator,
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
      selectLayer: (id) => timelineUI.selectLayer(id),
      setVariantFrameIndex: (variantGroupId, index) =>
        timelineUI.setVariantFrameIndex(variantGroupId, index),
      replaceVariantFrameIndices: (next) =>
        timelineUI.replaceVariantFrameIndices(next),
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
      mirror: options.pixelMirror ?? {
        // Task 38 (native): publish BY REFERENCE into the hosted project; the
        // bridge-era history-mirror hooks are no-ops — the mirror they kept
        // consistent is gone with the Zustand store.
        publish: (project) => {
          this.hosted.current = project;
        },
        syncHistory: () => {},
        reconcile: () => {},
        snapshot: (label) => {
          runInAction(() => this.history.snapshot(label));
        },
      },
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
      // Task 38 (native): `SelectionUIStore` is the selection's only storage
      // location now — the legacy top-level `EditorState.selection` field the
      // publisher mirrored into is gone, so the default publish is a no-op.
      publish: options.selectionPublisher ?? (() => {}),
    });

    makeObservable(this, {
      currentObject: computed,
      currentFrame: computed,
      currentLayer: computed,
      currentVariant: computed,
      selectedVariantLayer: computed,
      isEditingVariant: computed,
      // W29d. `computed` (not `computed.struct`): both return a fresh object
      // literal per evaluation, but `editableGrid` holds a GRID REFERENCE, and
      // a structural comparator would walk 300,249 cells to decide whether it
      // changed (R2). Reference identity is the correct — and only safe —
      // comparison for a grid.
      editableGrid: computed,
      selectionDims: computed,
    });

    // The save reaction — constructed LAST so it observes fully-built stores.
    // `history` is the live replay guard (task 17): the trigger is `null`
    // while `isReplaying` is set, so undo/redo never schedules a save.
    //
    // ⚠️ W29d ADDED THE FOURTH ARGUMENT, and it is a bug fix, not a tidy-up.
    // MEASURED: before it, a UI-only write bumped `ui.persistedUIVersion`
    // 1 -> 2 and produced ZERO saves — the counter task 24 built was never in
    // the trigger tuple. Every UI setting appeared to persist only because the
    // legacy Zustand setter ran `updateProjectAndSave` alongside it, so the
    // FIRST setting whose ownership flipped to MobX would have silently
    // stopped persisting. `setAiServiceUrl` is that setting.
    this.autoSave = this.options.autoSaveEnabled
      ? new AutoSaveController(
          this.domain,
          this.session,
          this.history,
          options.autoSave,
          this.ui,
        )
      : null;

    // Cross-instance sync. Opt-in: constructing a websocket is a side effect
    // that must never be acquired implicitly by a test or a Storybook story.
    this.syncController = options.syncEnabled
      ? new SyncController(this.domain, this.session, options.sync)
      : null;
    this.syncClient =
      options.syncEnabled && this.syncController
        ? new SyncClient({
            onProjectSaved: (event: ProjectSavedEvent) =>
              this.syncController?.handleProjectSaved(event),
          })
        : null;
    this.syncClient?.connect();
  }

  /* ── task 38: the NATIVE project host ──────────────────────────────────── */

  /**
   * The MobX-native {@link ProjectHost} — the retirement of
   * `createZustandProjectHost`.
   *
   * `getProject()` recombines the hosted project with a `uiState` COMPOSED
   * from the owning stores, so `DomainStore.currentProject()` (and through it
   * the wire format's domain half and every external reader) always sees the
   * live values — the role the bridge's Phase A/B mirrors used to play.
   *
   * `installProject` resets the undo history exactly as the legacy lifecycle
   * did on init/create/switch/delete; `replaceProject` keeps it
   * (restore-from-backup is undoable); `snapshotToHistory` records through
   * the shared stack's snapshot provider.
   */
  private createNativeProjectHost(): ProjectHost {
    return {
      getProject: () => {
        const project = this.hosted.current;
        if (!project) return null;
        return { ...project, uiState: this.composeUiState(project.uiState) };
      },
      installProject: (project) => {
        this.adoptProject(project);
        // `replaceEntries`, NOT `clear()`: an open stroke transaction
        // deliberately survives an install — pinned by task 08 (see
        // `HistoryStore.replaceEntries`).
        runInAction(() => this.history.replaceEntries([], -1));
      },
      replaceProject: (project) => {
        this.adoptProject(project);
      },
      snapshotToHistory: () => {
        // The legacy host pushed a serializer-round-trip clone; the snapshot
        // provider's `createSnapshotCommand` clones the same way ("Edit" is
        // the label the bridge-era adoption gave these entries).
        runInAction(() => this.history.snapshot("Edit"));
      },
    };
  }

  /**
   * Adopt a whole `Project` into every store that owns a slice of it — the
   * load/install/restore seam (task 38).
   *
   * This is what the bridge's subscribe-side adoption seams (`adoptTree`,
   * `adoptUIState`, `adoptLighting`, `adoptVariantFrameIndices`,
   * `adoptSelectionIds`, the Phase A `aiServiceUrl` sync) collapse into once
   * the store in the middle is gone: one explicit call at every point a whole
   * project legitimately arrives (a load, a lifecycle flow, an undo/redo
   * restore, the task-08 harness's `load()`), instead of an echo-checked
   * pull on every store change.
   */
  adoptProject(project: Project): void {
    runInAction(() => {
      this.hosted.current = project;
      this.domain.adoptTree(project);
      const ui = project.uiState;
      this.ui.hydrate(ui);
      this.ui.hydrateLighting(ui);
      this.timelineUI.adopt({
        selectedObjectId: ui.selectedObjectId ?? null,
        selectedFrameId: ui.selectedFrameId ?? null,
        selectedLayerId: ui.selectedLayerId ?? null,
      });
      this.timelineUI.adoptVariantFrameIndices(ui.variantFrameIndices ?? {});
      this.session.setAiServiceUrl(ui.aiServiceUrl ?? null);
    });
  }

  /**
   * Drop the hosted project so `currentProject()` reads `null` (task 38).
   * The teardown seam the task-08 harness's `reset()` uses — the legacy
   * store's `project: null` write, made explicit.
   */
  clearHostedProject(): void {
    this.hosted.current = null;
  }

  /**
   * Patch the hosted project's `uiState` ride-along copy (task 38). The
   * shape every native sink funnels through — the one writer of that record.
   */
  private patchHostedUiState(patch: Partial<UIState>): void {
    const project = this.hosted.current;
    if (!project) return;
    this.hosted.current = {
      ...project,
      uiState: { ...project.uiState, ...patch },
    };
  }

  /**
   * The live `UIState`, composed from the stores that own each field
   * (task 38). `base` supplies any field no store has claimed — the honest
   * representation of the hosted ride-along, exactly as the bridge-era
   * `currentProject()` composition worked, only sourced from MobX instead of
   * the Zustand mirror.
   *
   * ⚠️ RUNTIME shapes, not the wire format: packing to `CompactUIState`
   * happens only in `UIStore.toPersistedUIState()`, at the serialization
   * boundary.
   */
  private composeUiState(base: UIState): UIState {
    const t = this.ui.tool;
    const v = this.ui.viewport;
    const l = this.lightingUI;
    const tl = this.timelineUI;
    const panels = v.panels;
    return {
      ...base,
      /* TimelineUIStore */
      selectedObjectId: tl.selectedObjectId,
      selectedFrameId: tl.selectedFrameId,
      selectedLayerId: tl.selectedLayerId,
      variantFrameIndices: tl.variantFrameIndices,
      /* ToolUIStore */
      selectedTool: t.selectedTool,
      selectedColor: t.selectedColor,
      brushSize: t.brushSize,
      bitDepth: t.bitDepth,
      shapeMode: t.shapeMode,
      borderRadius: t.borderRadius ?? base.borderRadius,
      eraserShape: t.eraserShape,
      pencilBrushShape: t.pencilBrushShape,
      pencilBrushMax: t.pencilBrushMax,
      moveAllLayers: t.moveAllLayers,
      selectionMode: t.selectionMode,
      selectionBehavior: t.selectionBehavior,
      originColor: t.originColor,
      gaussianFill: t.gaussianFill,
      /* ViewportUIStore */
      zoom: v.zoom,
      panOffset: v.panOffset,
      viewZoom: v.viewZoom,
      focusMode: v.focusMode,
      lightGridMode: v.lightGridMode,
      canvasInfoHidden: v.canvasInfoHidden,
      objectLibraryViewMode: v.objectLibraryViewMode,
      timelineThumbnailMode: v.timelineThumbnailMode,
      layerSelectionCounter: v.layerSelectionCounter,
      frameReferencePanelPosition: panels.frameReference.position,
      frameReferencePanelMinimized: panels.frameReference.minimized,
      frameReferencePanelVisible: panels.frameReference.visible,
      referenceImagePanelPosition: panels.referenceImage.position,
      referenceImagePanelMinimized: panels.referenceImage.minimized,
      lightingPreviewPanelPosition: panels.lightingPreview.position,
      lightingPreviewPanelMinimized: panels.lightingPreview.minimized,
      /* UIStore / ReferenceUIStore */
      traceNudgeAmount: this.ui.traceNudgeAmount,
      /* LightingUIStore — runtime shapes */
      studioMode: l.studioMode,
      lightingDataLayerEditMode: l.lightingDataLayerEditMode,
      selectedNormal: l.selectedNormal,
      lightDirection: l.lightDirection,
      lightColor: l.lightColor,
      ambientColor: l.ambientColor,
      heightScale: l.heightScale,
      heightBrushValue: l.heightBrushValue,
      normalBrushShape: l.normalBrushShape,
      /* SessionStore */
      aiServiceUrl: this.session.aiServiceUrl ?? undefined,
      /* LayoutUIStore — shell chrome. Both stay `undefined` until the user
         changes them, which is what keeps them out of the wire format. */
      railLayouts: this.ui.layout.toPersistedRailLayouts(),
      theme: this.ui.layout.theme ?? undefined,
    };
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
      variant.baseFrameOffsets?.[baseFrameIndex >= 0 ? baseFrameIndex : 0] ?? {
        x: 0,
        y: 0,
      };

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

  /* ── W29d: the two GRID-RESOLUTION seams ───────────────────────────────
   *
   * Both were closures inside `zustandBridge.ts` (`editableGrid()` at :1020,
   * `selectionDims()` at :1043) and had no other home, which is the single
   * reason `CanvasContainer` and `LightingCanvasContainer` still dispatch
   * through the legacy Zustand hook — calling `app.selectionUI.*` directly meant
   * re-deriving them at the call site, a SECOND implementation of each (R6).
   *
   * They live HERE, not on `DomainStore` and not on a UI store, for exactly
   * the reason the six computeds above do: they span both halves. They read
   * the domain tree (the object, the variant, the layer grids) AND the UI
   * selection ids, and no single-slice store may reach across that line.
   */

  /**
   * The grid a pixel-sampling read should look at, plus the dimensions that
   * grid is expressed in — branching variant-vs-object for BOTH.
   *
   * ⚠️ The dimensions are NOT the object's when a variant is being edited:
   * a variant carries its own `gridSize`, and sampling a variant grid against
   * the object's dimensions indexes the wrong cells. That coupled branch is
   * why this returns grid and dims together rather than as two accessors.
   *
   * ⚠️ RETURNS THE GRID BY REFERENCE. `layer.pixels` is `observable.ref`
   * (R2) and is replaced wholesale by `PixelStore`; nothing here copies,
   * clones or iterates it. Reading the reference is O(1) and creates no
   * proxies — the 300,249-cell tree is never walked.
   *
   * `null` when anything in the chain is missing, which is the silent bail-out
   * every legacy caller already handles.
   */
  get editableGrid(): {
    grid: PixelData[][];
    dims: { width: number; height: number };
  } | null {
    const layer = this.currentLayer;
    const object = this.currentObject;
    if (!layer || !object) return null;
    if (layer.isVariant) {
      const variant = this.currentVariant;
      const variantLayer = this.selectedVariantLayer;
      if (!variant || !variantLayer) return null;
      return {
        grid: variantLayer.pixels,
        dims: {
          width: variant.variant.gridSize.width,
          height: variant.variant.gridSize.height,
        },
      };
    }
    return { grid: layer.pixels, dims: object.gridSize };
  }

  /**
   * The grid dimensions a SELECTION is expressed against.
   *
   * ⚠️ The `32 x 32` floor is transcribed, not invented. `zustandBridge.ts`'s
   * `selectionDims()` fell back to it when `editableGrid()` returned `null`,
   * so a selection made with no resolvable layer still produced a mask of a
   * definite size rather than throwing. Preserved verbatim — a selection
   * store that received `undefined` dims would pack indices against `NaN`.
   */
  get selectionDims(): { width: number; height: number } {
    return this.editableGrid?.dims ?? { width: 32, height: 32 };
  }

  /* ══ W29d: THE COLOUR-ADJUSTMENT LIFECYCLE ═══════════════════════════════
   *
   * `startColorAdjustment` is the ~190-line multi-frame SCAN that had no MobX
   * home at all — the last thing blocking `LayerColorsContainer` and
   * `ColorPickerContainer`. It lands HERE, not on `ToolUIStore` and not on
   * `PixelStore`, and the reason is the boundary rather than convenience:
   *
   *  - it READS the domain tree (every frame, every same-named layer, every
   *    cell) — so it cannot live on `ToolUIStore`, which may not import a
   *    domain store;
   *  - it WRITES a UI field (`ToolUIStore.colorAdjustment`) — so it cannot
   *    live on `PixelStore`, which is forbidden to touch UI state and whose
   *    `stores/domain/**` directory may not import `stores/ui/**` at all
   *    (ESLint, task 05).
   *
   * That is exactly the cross-slice signature of the six computeds above, and
   * this class is the one place both halves are legally in scope.
   *
   * ⚠️ IT WRITES NO PIXELS. The scan only records WHICH cells match; the
   * recolour is `PixelStore.adjustColor` / `adjustColorAcross`. `PixelStore`
   * remains the sole writer of pixel content (R2).
   *
   * ── The four pinned semantics, transcribed verbatim (W29b, 34 tests) ──
   *
   *  1. TWO DISJOINT PAYLOADS. All-frames mode fills `affectedPixelsByFrame`
   *     and leaves `affectedPixels` an EMPTY ARRAY — it is the unused half of
   *     a tagged union, not a lost payload. Flattening the Map into the flat
   *     list would write frame 2..N's coordinates onto frame 1.
   *  2. LAYERS MATCH BY NAME, WITH `filter` NOT `find`. Ids are per-frame and
   *     do not correspond across frames, so name is the only cross-frame
   *     identity the model has. Two consequences are pinned and preserved:
   *     several same-named layers in ONE frame are ALL recoloured, and a
   *     RENAMED layer is silently stranded.
   *  3. THE SNAPSHOT IS TAKEN AT START. The set is computed once here and
   *     replayed verbatim by every later `adjustColor` — which is what makes
   *     slider-dragging recolour the same cells rather than chasing the
   *     colour it just wrote.
   *  4. THE EXACT-MATCH TEST IS ON ALL FOUR CHANNELS, and a cell whose
   *     `color` is the sentinel `0` (transparent) never matches, because
   *     `typeof 0 === "object"` is false. Preserved as the `typeof` guard
   *     rather than "cleaned up" to a truthiness check.
   *
   * ⚠️ THE VARIANT FRAME KEY IS NOT A FRAME ID. The variant branch keys the
   * Map by the synthetic string `variant-frame-<index>`, which matches no
   * `frame.id` anywhere in the tree. That is why `PixelStore.adjustColorAcross`
   * refuses the variant case rather than resolving those keys — see its header.
   *
   * ⚠️ Reading every cell of every layer is O(frames x layers x w x h) and is
   * why this is an ACTION, never a computed. It runs once when the user opens
   * the mode. A computed would re-run it on any tree change, and observing the
   * grids to know when to do so is the exact modelling error R2 forbids.
   */
  startColorAdjustment(
    color: Color,
    allFrames: boolean,
    allLayers = false,
  ): void {
    const layer = this.currentLayer;
    const obj = this.currentObject;
    if (!layer || !obj) return;

    /** Does this cell hold EXACTLY `color`? Pin 4 — all four channels. */
    const matches = (grid: PixelData[][], x: number, y: number): boolean => {
      const pColor = grid[y]?.[x]?.color;
      if (!pColor || typeof pColor !== "object") return false;
      return (
        pColor.r === color.r &&
        pColor.g === color.g &&
        pColor.b === color.b &&
        pColor.a === color.a
      );
    };

    /** Every matching cell of one grid, in row-major order. */
    const scan = (
      grid: PixelData[][],
      width: number,
      height: number,
    ): { x: number; y: number }[] => {
      const found: { x: number; y: number }[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (matches(grid, x, y)) found.push({ x, y });
        }
      }
      return found;
    };

    const variantData = this.currentVariant;
    const variantLayer = this.selectedVariantLayer;
    const isEditingVariant = layer.isVariant && variantData && variantLayer;

    let next: ColorAdjustmentState;

    if (isEditingVariant) {
      const { variant } = variantData;
      const { width, height } = variant.gridSize;

      if (allFrames) {
        const affectedPixelsByFrame = new Map<
          string,
          Map<string, { x: number; y: number }[]>
        >();
        for (let frameIdx = 0; frameIdx < variant.frames.length; frameIdx++) {
          const variantFrame = variant.frames[frameIdx];
          // ⚠️ Synthetic key, NOT a frame id — see the header.
          const frameKey = `variant-frame-${frameIdx}`;
          for (const vLayer of variantFrame.layers) {
            const pixels = scan(vLayer.pixels, width, height);
            if (pixels.length > 0) {
              if (!affectedPixelsByFrame.has(frameKey)) {
                affectedPixelsByFrame.set(frameKey, new Map());
              }
              affectedPixelsByFrame.get(frameKey)!.set(vLayer.id, pixels);
            }
          }
        }
        next = {
          originalColor: color,
          allFrames: true,
          affectedPixels: [], // pin 1 — the unused half of the union
          affectedPixelsByFrame,
        };
      } else if (allLayers) {
        // ⚠️ EVERY layer of the current variant frame — so this cannot use
        // the flat `affectedPixels` payload, which addresses one layer only.
        // It takes the same by-frame Map as the all-frames case, with the one
        // synthetic key for the frame the editor is on. `adjustColor`'s
        // variant branch already dispatches on the Map being present.
        const affectedPixelsByFrame = new Map<
          string,
          Map<string, { x: number; y: number }[]>
        >();
        const frameIdx = variant.frames.indexOf(variantData.variantFrame);
        const frameKey = `variant-frame-${frameIdx}`;
        for (const vLayer of variantData.variantFrame.layers) {
          const pixels = scan(vLayer.pixels, width, height);
          if (pixels.length > 0) {
            if (!affectedPixelsByFrame.has(frameKey)) {
              affectedPixelsByFrame.set(frameKey, new Map());
            }
            affectedPixelsByFrame.get(frameKey)!.set(vLayer.id, pixels);
          }
        }
        next = {
          originalColor: color,
          allFrames: false,
          allLayers: true,
          affectedPixels: [], // pin 1 — the unused half of the union
          affectedPixelsByFrame,
        };
      } else {
        next = {
          originalColor: color,
          allFrames: false,
          allLayers: false,
          affectedPixels: scan(variantLayer.pixels, width, height),
        };
      }
    } else {
      const { width, height } = obj.gridSize;

      if (allFrames) {
        const affectedPixelsByFrame = new Map<
          string,
          Map<string, { x: number; y: number }[]>
        >();
        for (const frame of obj.frames) {
          // pin 2 — `filter`, by NAME. Every same-named layer, not the first.
          // `allLayers` is exactly "skip the name filter": every layer of the
          // frame is in scope, which is what makes the two toggles orthogonal.
          const matchingLayers = allLayers
            ? frame.layers
            : frame.layers.filter((l) => l.name === layer.name);
          for (const matchingLayer of matchingLayers) {
            const pixels = scan(matchingLayer.pixels, width, height);
            if (pixels.length > 0) {
              if (!affectedPixelsByFrame.has(frame.id)) {
                affectedPixelsByFrame.set(frame.id, new Map());
              }
              affectedPixelsByFrame
                .get(frame.id)!
                .set(matchingLayer.id, pixels);
            }
          }
        }
        next = {
          originalColor: color,
          allFrames: true,
          allLayers,
          affectedPixels: [], // pin 1
          affectedPixelsByFrame,
        };
      } else if (allLayers) {
        // ⚠️ EVERY layer of the current frame. Like the variant twin above
        // this needs the by-frame Map rather than the flat list, because the
        // flat payload addresses the SELECTED layer only. The key is the real
        // `frame.id`, so `PixelStore.adjustColorAcross` resolves it normally.
        const affectedPixelsByFrame = new Map<
          string,
          Map<string, { x: number; y: number }[]>
        >();
        const frame = this.currentFrame;
        for (const frameLayer of frame?.layers ?? []) {
          const pixels = scan(frameLayer.pixels, width, height);
          if (pixels.length > 0) {
            if (!affectedPixelsByFrame.has(frame!.id)) {
              affectedPixelsByFrame.set(frame!.id, new Map());
            }
            affectedPixelsByFrame.get(frame!.id)!.set(frameLayer.id, pixels);
          }
        }
        next = {
          originalColor: color,
          allFrames: false,
          allLayers: true,
          affectedPixels: [], // pin 1
          affectedPixelsByFrame,
        };
      } else {
        next = {
          originalColor: color,
          allFrames: false,
          allLayers: false,
          affectedPixels: scan(layer.pixels, width, height),
        };
      }
    }

    runInAction(() => {
      this.ui.tool.setColorAdjustment(next);
      // ⚠️ THE COUPLED WRITE, and it is pinned (W29b pin 4): starting an
      // adjustment ALSO moves the colour picker to the colour being adjusted,
      // with `trackHistory: false`. Without it the picker shows the previous
      // colour while the user drags, and the first drag jumps.
      this.ui.tool.setColor(color);
    });
  }

  /**
   * Drop any pending colour adjustment — W29d.
   *
   * A pass-through to `ToolUIStore`, which OWNS the field. It exists on this
   * class so consumers have one lifecycle surface (`start…`/`clear…`) rather
   * than reaching for the scan here and the clear two stores down, and so the
   * `TimelineUIStore` callback that `zustandProjectHost.ts:150` implemented as
   * a legacy-hook `setState({ colorAdjustment: null })` has a MobX target.
   */
  clearColorAdjustment(): void {
    this.clearBothColorAdjustments();
  }

  /**
   * The PAIRED clear — both independent storage locations (W29i).
   *
   * ⚠️ Not two writers of one field. `colorAdjustment` is in NEITHER
   * `PHASE_A_FIELDS` nor `PHASE_B_FIELDS`, so the bridge mirrors it in no
   * direction and Zustand's copy and `ToolUIStore`'s are genuinely
   * independent. The live UI now reads the MobX one
   * ({@link adjustColor}, `GlobalHotkeys`, the two colour containers), while
   * the legacy `store/colorAdjustmentActions.ts` still reads its own.
   * Clearing only MobX would leave a stale LIVE adjustment on the Zustand
   * side; clearing only Zustand is the W29d defect this replaced.
   *
   * W29i hoisted this out of the `TimelineUIStore` context literal, where it
   * had been the ONLY paired implementation, so that `clearColorAdjustment()`
   * — the public lifecycle surface consumers actually reach for — has the
   * same semantics as the `selectLayer` path. Before this, the two disagreed:
   * `selectLayer` cleared both, the public method cleared one.
   *
   * Task 38 deletes the legacy half with the store, leaving the MobX line.
   */
  private clearBothColorAdjustments(): void {
    runInAction(() => this.ui.tool.clearColorAdjustment());
    this.legacyClearColorAdjustment();
  }

  /**
   * Replay the pending colour adjustment at `newColor` — W29h, and the last
   * piece of the colour-adjustment lifecycle.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ WHY THIS COULD NOT EXIST BEFORE W29h
   * ══════════════════════════════════════════════════════════════════════
   *
   * W29d built {@link startColorAdjustment} (the scan) and
   * `PixelStore.adjustColorAcross` (the object write), and still could not
   * wire the two colour containers, because the VARIANT quarter of the
   * behaviour was inexpressible: `PixelStore.writeGridInAction` was hard-wired
   * to variant `layers[0]`, so "all-frames variant adjustment recolours EVERY
   * layer of every variant frame" (W29g's pin) could not be performed.
   * W29h added `PixelTarget.variant.layerIndex` and
   * `PixelStore.adjustVariantColorAcross`; this method is the dispatcher over
   * the four resulting cases.
   *
   * ── The four cases, matching `colorAdjustmentActions.ts:207-442` ──────
   *
   *   variant + allFrames   -> `adjustVariantColorAcross` over the snapshot
   *   variant + single      -> `adjustColor`, which resolves the variant
   *                            through `resolveTarget` — i.e. `layers[0]`
   *   object  + allFrames   -> `adjustColorAcross` over the snapshot
   *   object  + single      -> `adjustColor` on the selected layer
   *
   * ⚠️ THE SINGLE-FRAME VARIANT CASE STILL WRITES `layers[0]` ONLY, and that
   * is DELIBERATE. W29g pinned it as an observed defect: the legacy
   * `getSelectedVariantLayer()` (`store/helpers.ts:82`) ignores
   * `selectedLayerId` entirely, and `resolveTarget`'s variant branch
   * transcribes that. W29h enables the ENGINE to address any variant layer;
   * it does NOT change what any pinned behaviour does. Fixing the defect
   * needs owner sign-off.
   *
   * ── ⚠️ THE COLOUR WRITE GOES THROUGH THE ZUSTAND SOURCE ───────────────
   *
   * The legacy action writes `uiState.selectedColor` in the SAME commit as
   * the pixels. `selectedColor` is one of the ~30 fields the bridge
   * re-hydrates wholesale from `project.uiState` on EVERY Zustand change
   * (`zustandBridge.ts:334`), so a MobX-only write is reverted by the next
   * unrelated change — MEASURED in W29d. {@link setColorAndAddToHistory}'s
   * header has the full note; the sink is reused here rather than duplicating
   * the reasoning.
   *
   * ⚠️ It is NOT `setColorAndAddToHistory`: that also prepends to
   * `colorHistory`, and the legacy `adjustColor` does not. Dragging a slider
   * would otherwise flood the recent-colours trail with every intermediate
   * value. `colorSink` writes both, so the colour history is kept out by
   * writing `selectedColor` through the narrower UI-state patch instead.
   *
   * @returns the number of layers written; 0 when there is nothing pending.
   */
  adjustColor(newColor: Color, trackHistory = false): number {
    const state = this.ui.tool.colorAdjustment;
    if (!state) return 0;

    const layer = this.currentLayer;
    const obj = this.currentObject;
    if (!layer || !obj) return 0;

    const options = { trackHistory };
    let written = 0;

    // ⚠️ DISPATCH ON THE PAYLOAD, NOT ON `allFrames`.
    //
    // This read `state.allFrames ? state.affectedPixelsByFrame : undefined`
    // while all-frames was the ONLY way to produce a multi-layer snapshot.
    // The `allLayers` axis breaks that equivalence: `allLayers && !allFrames`
    // fills the Map with the current frame's layers, and the old test would
    // have sent it down the flat-list branch, which addresses the SELECTED
    // layer only — every other layer would silently keep its old colour while
    // the swatch strip claimed the whole frame had been recoloured.
    //
    // Which payload is populated is the tagged union's real discriminant (pin
    // 1: the two are disjoint, and the unused half is an empty array), so
    // testing it directly is both correct and axis-agnostic.
    const byFrame = state.affectedPixelsByFrame;

    if (this.isEditingVariant && layer.variantGroupId) {
      const variantId = layer.selectedVariantId;
      if (!variantId) return 0;

      if (byFrame) {
        // ⚠️ The synthetic key -> INDEX translation. The scan keys by
        // `variant-frame-<index>` (a string matching no `frame.id` in the
        // tree); the write engine addresses variant frames positionally.
        // Both halves agree by construction — see `startColorAdjustment`.
        const byIndex = new Map<
          number,
          ReadonlyMap<string, readonly { x: number; y: number }[]>
        >();
        for (const [key, byLayer] of byFrame) {
          const match = /^variant-frame-(\d+)$/.exec(key);
          if (match) byIndex.set(Number(match[1]), byLayer);
        }
        written = this.pixels.adjustVariantColorAcross(
          layer.variantGroupId,
          variantId,
          byIndex,
          newColor,
          options,
        );
      } else {
        // The pinned `layers[0]` path — see the header.
        this.pixels.adjustColor(state.affectedPixels, newColor, options);
        written = state.affectedPixels.length > 0 ? 1 : 0;
      }
    } else if (byFrame) {
      written = this.pixels.adjustColorAcross(byFrame, newColor, options);
    } else {
      this.pixels.adjustColor(state.affectedPixels, newColor, options);
      written = state.affectedPixels.length > 0 ? 1 : 0;
    }

    // The coupled UI write, AFTER the pixels — the legacy action commits both
    // in one `updateProjectAndSave`, and the order within it is not
    // observable, but keeping the pixels first means a throw leaves no
    // half-applied colour.
    // The eager MobX write is what re-renders the observer on this tick; the
    // sink writes the source and the bridge then re-asserts the same value.
    // One writer, not two — `setColorAndAddToHistory`'s header has the note.
    this.selectedColorSink(newColor);
    runInAction(() => this.ui.tool.setColor(newColor));

    return written;
  }

  /**
   * Set the AI service URL — W29d, and the seam `HeaderContainer` was blocked
   * on.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ THE NAIVE SWAP COMPILES AND SILENTLY STOPS THE URL PERSISTING
   * ══════════════════════════════════════════════════════════════════════
   *
   * `SessionStore.setAiServiceUrl` assigns the observable and stops. The
   * legacy `store/toolActions.ts:514` ran `updateProjectAndSave`, writing
   * `project.uiState.aiServiceUrl` so the value survived a reload. Pointing
   * `HeaderContainer` at the MobX setter would therefore type-check, look
   * correct in the UI, and lose the value on the next load — and worse, be
   * overwritten mid-session by the very next `syncPhaseA`, which mirrors
   * `project.uiState.aiServiceUrl` into `session.aiServiceUrl` on EVERY
   * Zustand change.
   *
   * ── Why this is ONE writer, not two (R6) ──────────────────────────────
   *
   * `aiServiceUrl` is a PHASE A field. Zustand's `project.uiState` is the
   * SOURCE and `session.aiServiceUrl` is its MIRROR. This method writes the
   * source — the only write that sticks — and lets the established mirror
   * carry it into MobX. The `session.setAiServiceUrl` call below is an
   * EAGER mirror update so the observer re-renders on this tick rather than
   * on the bridge's next sync; the bridge overwrites it with the identical
   * value moments later. It is not a competing writer: it can only ever
   * assign what the source was just set to.
   *
   * ── Why it could not simply FLIP to Phase B in this wave ─────────────
   *
   * MEASURED: every MobX-side hydration point today is bridge-driven
   * (`zustandBridge.ts:316` for this field, `:334` for the rest). Flipping
   * would make `session.aiServiceUrl` authoritative with NO load-time
   * hydration of its own — a loaded project's URL would never reach MobX at
   * all. Building that path is task 38's, which deletes the bridge and
   * replaces every one of those hydration points at once. The list move is
   * therefore deliberately NOT made here; what this wave removes is the
   * OTHER blocker, which was real and separate: `AutoSaveController`'s
   * trigger did not observe `persistedUIVersion`, so nothing a MobX UI store
   * wrote was ever saved. See that class's header.
   */
  setAiServiceUrl(url: string): void {
    this.aiServiceUrlSink(url);
    runInAction(() => this.session.setAiServiceUrl(url));
  }

  /* ── W29d: undo / redo ──────────────────────────────────────────────────
   *
   * ⚠️ NOT `this.history.undo()`. During the bridge era an undo is
   * `reconcile()` -> `HistoryStore.undo()` -> `computeMirror()`: the Phase B
   * `projectHistory`/`historyIndex` mirror has exactly ONE writer (R6, task
   * 17), the glue in `store/index.ts`, and a consumer calling `HistoryStore`
   * directly would undo the command and leave the mirror describing the
   * pre-undo stack.
   *
   * So this delegates to that single writer through the published
   * `historyControl` seam — the same technique `strokeControl`,
   * `syncHistoryMirror` and `reconcileHistory` already use, and for the same
   * reason. The point is that a migrated container gets undo WITHOUT
   * importing the legacy Zustand hook, not that the glue has moved: it has not, and
   * task 38 retires it along with the mirror, at which point these two
   * methods become bare `HistoryStore` calls.
   */

  /** Undo one entry, keeping the bridge-era history mirror consistent. */
  undo(): void {
    this.historyOps.undo();
  }

  /** Redo one entry, keeping the bridge-era history mirror consistent. */
  redo(): void {
    this.historyOps.redo();
  }

  /**
   * Record a pre-mutation project SNAPSHOT — W29h, for `ColorPickerContainer`.
   *
   * ⚠️ SNAPSHOT family, deliberately. The colour picker brackets a slider drag
   * with one unlabelled call on drag START and a debounced `"Adjust color"`
   * 300 ms after release, which is what makes the whole drag ONE undo entry.
   * `PixelStore` records inverse patches and has no equivalent bracket, so
   * this routes to the bridge glue — the single writer of the Phase B mirror
   * — exactly as {@link ApplicationStore.undo} does, and retires with it.
   *
   * ⚠️ It is O(project). Nothing else may start using it; the 5 kB stroke
   * byte gate does not cover this path and would not notice a regression that
   * routed a stroke through here.
   */
  saveStateToHistory(label?: string): void {
    this.historyOps.snapshot(label);
  }

  /**
   * Pick a colour AND record it in the recent-colours trail — W29d.
   *
   * A COUPLED write, and the reason it needs a home on this class: it spans
   * two stores that may not reach each other. `SessionStore` owns
   * `colorHistory` (a cross-project buffer that must survive a project
   * switch, R14) and `ToolUIStore` owns `selectedColor`. Neither imports the
   * other, and duplicating the pair at each call site is what the migration
   * exists to avoid — `CanvasContainer` dispatches it from three places.
   *
   * ⚠️ ORDER IS TRANSCRIBED FROM `toolActions.ts:111`: the history entry is
   * added FIRST, then the colour is set. `SessionStore.addToColorHistory`
   * already carries that action's exact de-duplicate-and-cap semantics (an
   * existing colour moves to the front; a new one is prepended and the list
   * trimmed to `MAX_COLOR_HISTORY`), so nothing is re-implemented here.
   *
   * ══════════════════════════════════════════════════════════════════════
   *  ⚠️ IT MUST WRITE THE ZUSTAND SOURCE, AND THIS WAS MEASURED
   * ══════════════════════════════════════════════════════════════════════
   *
   * BOTH fields are Zustand-sourced during the bridge era, by two different
   * mechanisms: `colorHistory` is a `PHASE_A_FIELDS` member mirrored at
   * `zustandBridge.ts:340`, and `selectedColor` is one of the ~30 fields the
   * bridge re-hydrates wholesale from `project.uiState` at `:334` — on EVERY
   * Zustand change, not only on load.
   *
   * MEASURED W29d with the bridge installed: a MobX-only
   * `ui.tool.setColor(RED)` held RED, and after ONE unrelated Zustand change
   * (`saveStatus`) it was back to black. `session.addToColorHistory` went
   * 1 -> 0 the same way. A seam that wrote only MobX would therefore appear
   * to work, pass a unit test that never touched Zustand, and revert in the
   * real app on the next keystroke.
   *
   * So the sink writes the SOURCE, and the eager MobX writes below exist only
   * so the observer re-renders on this tick; the bridge then re-asserts the
   * identical values. One writer, not two — the same reasoning as
   * {@link ApplicationStore.setAiServiceUrl}, which has the full note.
   */
  setColorAndAddToHistory(color: Color): void {
    this.colorSink(color);
    runInAction(() => {
      this.session.addToColorHistory(color);
      this.ui.tool.setColor(color);
    });
  }

  /**
   * Apply an accepted AI interpolation — the 182-line `handleAccept` that used
   * to live in `AIInterpolateModal` (task 34).
   *
   * ONE undo entry however many frames land: `DomainMutator.commit` snapshots
   * exactly once. See `domain/applyInterpolation.ts` for the splice rules and
   * for the W1/W8 findings it preserves.
   *
   * @returns `true` when a mutation was committed.
   */
  applyInterpolation(input: ApplyInterpolationInput): boolean {
    return applyInterpolationAction(
      { domain: this.domain, mutator: this.mutator },
      input,
    );
  }

  /** Storybook/Vitest teardown: stop the save reaction and its timers. */
  /**
   * Decode `project.referenceImage` into `ReferenceUIStore` (task 29).
   *
   * The composition point that replaces `App.tsx`'s old two-step dance:
   * `restoreReferenceImageFromProject()` hydrated a module singleton and
   * `getCurrentReferenceImageData()` read it straight back out, which is how a
   * modal's global became the application root's data-transfer object.
   *
   * The decode lives on `DomainStore` (it owns `referenceImage`), the state
   * lives on `ReferenceUIStore` (it owns the live DOM node), and neither
   * imports the other — this method is the seam. Resolves the extracted pixels
   * so the caller need not re-derive them.
   */
  async restoreReferenceImage(): Promise<ReferenceImageData | null> {
    const restored = await this.domain.restoreReferenceImageFromProject();
    if (!restored) return null;
    runInAction(() => {
      this.referenceUI.setImage(
        restored.image,
        restored.imageUrl,
        restored.selection,
      );
    });
    return this.referenceUI.currentReferenceImageData;
  }

  dispose(): void {
    this.autoSave?.dispose();
    this.disposeReflectionReaction();
    this.disposePoseReaction();
    this.syncClient?.dispose();
    this.ui.dispose();
    this.referenceUI.dispose();
    // Task 38: hand the shared history singleton's snapshot slot back to
    // whichever app held it before this one — see the constructor.
    this.history.setSnapshotProvider(this.previousSnapshotProvider);
  }
}
