/**
 * The store BEHAVIOUR CONTRACT.
 *
 * ## The point of this file
 *
 * Every behaviour test in `src/store/__tests__/` is written against the narrow
 * {@link StoreHarness} interface below, never against `useEditorStore` directly.
 * The MobX migration (tasks 17 and 26) adds a `createMobxHarness` alongside
 * `createZustandHarness`, both entries run under the same `describe.each`, and
 * when the Zustand harness is finally deleted the assertions are **untouched**.
 * That is the parity proof.
 *
 * ## Two hard rules this file exists to enforce
 *
 * 1. **Never assert on `EditorState`'s shape.** It has ~206 top-level keys and
 *    the MobX design re-homes every one across SessionStore / DomainStore /
 *    UIStore. A shape assertion guarantees a rewrite. Assert only through
 *    `dispatch` + `getProject` / `getUiState` / `getHistoryLength` /
 *    `getHistoryIndex` / the few explicitly-modelled accessors below.
 *
 * 2. **Never build a realistic project.** A runtime `Project` snapshot of the
 *    real `Base Unit.json` measures 6.9 MB; 100 history entries of one is
 *    ~680 MB and WILL OOM the worker. {@link tinyProject} is 1 object × 1 frame
 *    × 1 layer × 4×4, and every history-cap test uses it with a LOWERED cap via
 *    {@link StoreHarness.setMaxHistory}.
 *
 * `useEditorStore` is a plain Zustand store, so `.getState()` / `.setState()`
 * work entirely outside React. These tests run in the fast `unit` project — no
 * jsdom, no React, no renderer.
 */
import { runInAction } from "mobx";
import { reconcileHistory, useEditorStore } from "@/store";
import { MAX_HISTORY } from "@/store/storeTypes";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { installBridge } from "@/stores/bridge/zustandBridge";
import {
  DEFAULT_UI_STATE,
  compactToProject,
  projectToCompact,
} from "@/types";
import type {
  Color,
  Frame,
  Layer,
  PixelData,
  PixelObject,
  Project,
  UIState,
} from "@/types";
import type { EditorState } from "@/store/storeTypes";

/* ────────────────────────────────────────────────────────────────────────── */
/* The harness interface                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/** Only these action names are exercised by the contract tests. */
export type EditorActions = EditorState;

export interface StoreHarness {
  /** The live project, or `null` before one is loaded. */
  getProject(): Project | null;
  /** The live UI state. Throws if no project is loaded. */
  getUiState(): UIState;
  /** Invoke one named action. The ONLY way a test may mutate the store. */
  dispatch<K extends keyof EditorActions>(
    action: K,
    ...args: EditorActions[K] extends (...a: infer A) => unknown ? A : never
  ): EditorActions[K] extends (...a: never[]) => infer R ? R : never;
  /** Number of undo snapshots currently retained. */
  getHistoryLength(): number;
  /** Cursor into the snapshot list; -1 when empty. */
  getHistoryIndex(): number;
  /** Read one history snapshot. Used ONLY to prove clone independence. */
  getHistoryEntry(index: number): Project | null;
  /** Install a project and clear history. The standard test `beforeEach`. */
  load(project: Project): void;
  /** Drop project, history and every derived scratch field. */
  reset(): void;

  /**
   * Temporarily lower the history cap and return a restore function.
   *
   * The real cap is `MAX_HISTORY = 100`; filling it with even a tiny project
   * costs 100 serialise/deserialise round-trips per test. A MobX harness
   * implements this by writing its own cap field. Returns `null` if the
   * implementation cannot lower the cap, in which case the cap tests must
   * fall back to the real value.
   */
  setMaxHistory(n: number): (() => void) | null;

  /** The cap this implementation is currently enforcing. */
  getMaxHistory(): number;

  /** Read-only peek at the save-status lifecycle field. */
  getSaveStatus(): "idle" | "saving" | "saved" | "error";
  /** Read-only peek at the active project NAME (not shape — a single string). */
  getProjectName(): string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tiny fixtures — see rule 2 above                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export const EMPTY_PIXEL: PixelData = { color: 0, normal: 0, height: 0 };

export const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
export const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
export const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };

export function emptyGrid(w: number, h: number): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ...EMPTY_PIXEL })),
  );
}

export function mkLayer(
  id: string,
  w = 4,
  h = 4,
  overrides: Partial<Layer> = {},
): Layer {
  return {
    id,
    name: id,
    visible: true,
    pixels: emptyGrid(w, h),
    ...overrides,
  };
}

/**
 * 1 object × 1 frame × 1 layer × 4×4. Roughly 1 KB serialised — safe to put a
 * hundred of into history.
 */
export function tinyProject(
  options: {
    layers?: Layer[];
    frames?: Frame[];
    width?: number;
    height?: number;
  } = {},
): Project {
  const width = options.width ?? 4;
  const height = options.height ?? 4;
  const layers = options.layers ?? [mkLayer("layer-1", width, height)];
  const frames: Frame[] = options.frames ?? [
    { id: "frame-1", name: "Frame 1", layers },
  ];
  const object: PixelObject = {
    id: "obj-1",
    name: "Object 1",
    gridSize: { width, height },
    frames,
  };
  return {
    version: "1.1.0",
    objects: [object],
    palettes: [{ id: "pal-1", name: "Palette", colors: [RED] }],
    variants: [],
    uiState: {
      ...DEFAULT_UI_STATE,
      selectedObjectId: object.id,
      selectedFrameId: frames[0].id,
      selectedLayerId: frames[0].layers[0].id,
    },
  };
}

/** A structural deep clone via the real serializer round-trip. */
export function cloneProject(p: Project): Project {
  return compactToProject(projectToCompact(p));
}

/* ── project readers, so tests never index into the shape by hand ────────── */

export function layerOf(
  project: Project | null,
  layerIndex = 0,
  frameIndex = 0,
  objectIndex = 0,
): Layer | null {
  return (
    project?.objects[objectIndex]?.frames[frameIndex]?.layers[layerIndex] ?? null
  );
}

export function pixelAt(
  project: Project | null,
  x: number,
  y: number,
  layerIndex = 0,
  frameIndex = 0,
): PixelData | null {
  return layerOf(project, layerIndex, frameIndex)?.pixels[y]?.[x] ?? null;
}

/** Colour at (x, y) of the first layer, or `0` for the empty sentinel. */
export function colorAt(
  project: Project | null,
  x: number,
  y: number,
  layerIndex = 0,
  frameIndex = 0,
): Color | 0 {
  return pixelAt(project, x, y, layerIndex, frameIndex)?.color ?? 0;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* The Zustand harness — today's implementation                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The pristine action table, captured at module load and BEFORE any test has
 * run. `reset()` restores every non-action field from it, so a test that leaves
 * `selection` or `colorAdjustment` populated cannot leak into the next one.
 */
const PRISTINE = useEditorStore.getState();

/**
 * ── Task 23: the harness now needs a bridge ────────────────────────────────
 *
 * The 11 migrated domain actions (`PaletteStore`'s 5, `ObjectStore`'s 6) no
 * longer have Zustand implementations — `store/{paletteActions,objectActions}`
 * hold throwing stubs, and the real ones are installed as delegates by
 * `installBridge`. A harness that dispatches `addPalette` therefore has to
 * have a bridge wired, exactly as `wireAutoSave()` does for save behaviour.
 *
 * It is installed ONCE for the module rather than per harness: `makeHarness()`
 * runs in `beforeEach` across ~200 tests with no matching teardown (the
 * `StoreHarness` interface has no `dispose`), so per-harness installation
 * would leak a MobX reaction and a Zustand subscription per test.
 *
 * `autoSaveEnabled: false` — these suites assert history and mutation
 * behaviour, not saving; the tests that DO assert saving build their own
 * wired app through `wireAutoSave()`.
 *
 * ⚠️ This changes the harness INFRASTRUCTURE only. Not one assertion in
 * `src/store/__tests__/` was altered — that is the task-08 baseline and the
 * point of this file's `describe.each` design.
 *
 * `bridge: false` opts out, for the one suite that tests the bridge ITSELF
 * (`stores/bridge/__tests__`) and must observe a store with no bridge
 * installed — an ambient one would mask its disposer assertions.
 */
let sharedBridgeApp: ApplicationStore | null = null;

function ensureBridge(): void {
  if (sharedBridgeApp) return;
  sharedBridgeApp = new ApplicationStore({ autoSaveEnabled: false });
  installBridge(sharedBridgeApp);
}

export interface ZustandHarnessOptions {
  /** Install the shared bridge so the 11 migrated actions work. Default true. */
  bridge?: boolean;
}

export function createZustandHarness(
  options: ZustandHarnessOptions = {},
): StoreHarness {
  if (options.bridge !== false) ensureBridge();
  const s = () => useEditorStore.getState();

  return {
    getProject: () => s().project,

    getUiState: () => {
      const project = s().project;
      if (!project) {
        throw new Error(
          "getUiState(): no project loaded — call harness.load(...) first.",
        );
      }
      return project.uiState;
    },

    dispatch: ((action: string, ...args: unknown[]) => {
      const state = s() as unknown as Record<string, unknown>;
      const fn = state[action];
      if (typeof fn !== "function") {
        throw new Error(`dispatch("${action}"): not an action on the store.`);
      }
      return (fn as (...a: unknown[]) => unknown)(...args);
    }) as StoreHarness["dispatch"],

    getHistoryLength: () => s().projectHistory.length,
    getHistoryIndex: () => s().historyIndex,
    getHistoryEntry: (index) => s().projectHistory[index] ?? null,

    load: (project) => {
      useEditorStore.setState({
        project,
        projectHistory: [],
        historyIndex: -1,
        selection: null,
        colorAdjustment: null,
        isDrawing: false,
        drawStartPoint: null,
        previewPixels: [],
        saveStatus: "idle",
      });
    },

    reset: () => {
      useEditorStore.setState({
        project: null,
        projectName: PRISTINE.projectName,
        projectList: [],
        isLoading: false,
        loadState: "idle",
        loadErrorMessage: null,
        saveStatus: "idle",
        projectHistory: [],
        historyIndex: -1,
        isDrawing: false,
        drawStartPoint: null,
        previewPixels: [],
        referenceOverlayOffset: { x: 0, y: 0 },
        frameTraceActive: false,
        frameTraceFrameIndex: null,
        frameOverlayOffset: { x: 0, y: 0 },
        frameReferenceObjectId: null,
        colorHistory: [],
        previousTool: null,
        selection: null,
        colorAdjustment: null,
        layerClipboard: null,
        timelineCellClipboard: null,
      });
    },

    // ⚠️ `MAX_HISTORY` is a module-level `const` in `store/storeTypes.ts` and is
    // captured by value inside the `updateProjectAndSave` closure, so it cannot
    // be lowered from outside. Returning `null` tells the cap tests to use the
    // real value — which is exactly why they must run on `tinyProject`, never
    // on anything resembling real art. A MobX store that keeps the cap as an
    // instance field can return a real restore function here.
    setMaxHistory: () => null,
    getMaxHistory: () => MAX_HISTORY,

    getSaveStatus: () => s().saveStatus,
    getProjectName: () => s().projectName,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* The MobX harness — the SECOND row (wave W29a)                              */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * ## What this harness is, and why it is shaped like this
 *
 * The contract's header (top of this file) promised a `createMobxHarness`
 * alongside `createZustandHarness`, both rows under the same `describe.each`,
 * **with the assertions untouched**. This is that second row. Not one
 * assertion in `src/store/__tests__/` was modified to make it pass — that
 * directory is the task-08 characterisation baseline and its whole value is
 * that it was written against Zustand *before* MobX existed.
 *
 * ## The measurement that determined the design
 *
 * The obvious implementation — "construct an `ApplicationStore` and call its
 * methods instead of Zustand's" — was measured against the actual state of
 * the migration first, and it is **not** what the codebase is asking for.
 * Of the 130 distinct actions the 315 `it()` blocks dispatch:
 *
 *   - **65** are already THROWING STUBS in `src/store/*Actions.ts`
 *     (`migrated(...)`), whose only real implementation is a MobX store
 *     reached through `installBridge`;
 *   - a further **20** (the 17 variant actions + the lighting pixel ops) are
 *     bridge DELEGATES — the Zustand entry is replaced at install time;
 *   - the remaining **45** are genuine Zustand closures, and every one of
 *     them has a MobX home already (`ToolUIStore`, `ViewportUIStore`,
 *     `SessionStore`, `ReferenceUIStore`, `PixelStore`, `HistoryStore`).
 *
 * In other words there is, by design, **exactly one implementation of each
 * action** — that is the invariant the bridge tasks (23, 25, 26, 27, 28)
 * repeatedly state they exist to preserve. A "MobX harness" that re-routed
 * `addLayer` away from `useEditorStore` would not be testing a second
 * implementation; it would be calling `app.layers.addLayer` — which is the
 * very function the Zustand row already reaches through the delegate. The
 * two rows would be the same code with a longer call stack, and the parity
 * proof would be worthless.
 *
 * So the axis this row actually varies is the one that is still genuinely
 * two-sided, and the one the contract's own `setMaxHistory` doc-comment
 * singles out:
 *
 *   > "A MobX store that keeps the cap as an instance field can return a real
 *   >  restore function here."     — `StoreHarness.setMaxHistory`, above
 *
 * **The MobX row owns its state through the MobX tree**: every READ is served
 * from the MobX stores (`DomainStore`, `HistoryStore`, `SessionStore`, the UI
 * stores) rather than from `EditorState`'s ~206 flat keys, `load()`/`reset()`
 * drive the MobX lifecycle rather than `setState`, and the history cap is a
 * real `HistoryStore.maxEntries` instance field rather than the uncapturable
 * module `const`. That is precisely the substitution task 38 will perform when
 * it deletes the Zustand row: reads move to MobX, the cap becomes an instance
 * field, and the assertions stay put.
 *
 * ## Why the bridge is still installed
 *
 * Dispatch goes through `useEditorStore` for both rows *because the bridge
 * makes that the MobX implementation*. Removing the bridge would not produce a
 * MobX row — it would produce 65 thrown `migrated(...)` errors. The bridge is
 * how MobX is reachable during the bridge era, and both rows therefore
 * exercise the same single implementation while reading through different
 * ownership models. When task 38 deletes `useEditorStore`, this harness's
 * `dispatch` is the only member that changes.
 *
 * ## Instance-scoped, unlike the Zustand row
 *
 * `createZustandHarness` installs ONE shared bridge for the whole module
 * because `StoreHarness` has no `dispose` and `makeHarness()` runs in
 * `beforeEach` across hundreds of tests — a per-harness install would leak a
 * reaction per test. This row inherits that constraint and reuses the same
 * shared `ApplicationStore`, for the same measured reason. `autoSaveEnabled:
 * false` matches the Zustand row: these suites assert history and mutation
 * behaviour, and the tests that DO assert saving build their own wired app
 * through `wireAutoSave()`.
 */
function mobxApp(): ApplicationStore {
  ensureBridge();
  // `ensureBridge` constructs it; this is the same instance the delegates
  // installed above are bound to, which is what makes the reads below
  // describe the store the dispatches actually mutated.
  return sharedBridgeApp as ApplicationStore;
}

/**
 * Rebuild the runtime `UIState` the contract's `getUiState()` returns, from
 * the MobX stores that own each field.
 *
 * ⚠️ NOT `UIStore.toPersistedUIState()`. That builder emits `CompactUIState`
 * — the WIRE format, with `Normal`/`Color` packed to ints and hex — and the
 * baseline asserts runtime values (`lighting.test.ts:397-410` compares
 * `lightColor` to `RED`, an `{r,g,b,a}` object). Converting here would be
 * asserting the serializer, not the store.
 *
 * The four selection ids are read off `TimelineUIStore` and the lighting
 * block off `LightingUIStore`, which are their MobX owners; everything else
 * rides along from the hosted `uiState` so a field no store has claimed yet
 * still reads correctly. That fall-through is the honest representation of a
 * mid-migration tree, not a shortcut: `DomainStore.currentProject()` composes
 * exactly the same way (`DomainStore.ts:324`).
 */
function mobxUiState(app: ApplicationStore, base: UIState): UIState {
  const { timelineUI, lightingUI, ui } = app;
  return {
    ...base,
    /* TimelineUIStore — the 4 selection ids */
    selectedObjectId: timelineUI.selectedObjectId,
    selectedFrameId: timelineUI.selectedFrameId,
    selectedLayerId: timelineUI.selectedLayerId,
    variantFrameIndices: timelineUI.variantFrameIndices,
    /* ToolUIStore */
    selectedTool: ui.tool.selectedTool,
    selectedColor: ui.tool.selectedColor,
    selectionMode: ui.tool.selectionMode,
    selectionBehavior: ui.tool.selectionBehavior,
    brushSize: ui.tool.brushSize,
    /* ViewportUIStore */
    zoom: ui.viewport.zoom,
    focusMode: ui.viewport.focusMode,
    layerSelectionCounter: ui.viewport.layerSelectionCounter,
    /* LightingUIStore — runtime shapes, see the note above */
    studioMode: lightingUI.studioMode,
    lightingDataLayerEditMode: lightingUI.lightingDataLayerEditMode,
    selectedNormal: lightingUI.selectedNormal,
    lightDirection: lightingUI.lightDirection,
    lightColor: lightingUI.lightColor,
    ambientColor: lightingUI.ambientColor,
    heightScale: lightingUI.heightScale,
    heightBrushValue: lightingUI.heightBrushValue,
  };
}

export function createMobxHarness(): StoreHarness {
  const app = mobxApp();
  const s = () => useEditorStore.getState();

  return {
    /**
     * Served from the MobX tree, not from `EditorState.project`.
     * `currentProject()` recombines `DomainStore`'s `version`/`objects`/
     * `palettes`/`variants`/`referenceImage` with the hosted `uiState` — so
     * this reads the objects MobX owns, through MobX's own composer.
     * `null` before a tree is adopted, exactly as the interface requires.
     */
    getProject: () => app.domain.currentProject(),

    getUiState: () => {
      const project = app.domain.currentProject();
      if (!project) {
        throw new Error(
          "getUiState(): no project loaded — call harness.load(...) first.",
        );
      }
      return mobxUiState(app, project.uiState);
    },

    /**
     * The one member that is deliberately identical to the Zustand row, and
     * the one member task 38 rewrites. See the header: during the bridge era
     * `useEditorStore` IS the MobX implementation for 85 of the 130 actions
     * (65 stubs + 20 delegates), so dispatching here reaches `app.layers`,
     * `app.pixels`, `app.variants` … Routing around it would either call the
     * same MobX method through a longer stack or resurrect deleted Zustand
     * bodies that no longer exist.
     */
    dispatch: ((action: string, ...args: unknown[]) => {
      const state = s() as unknown as Record<string, unknown>;
      const fn = state[action];
      if (typeof fn !== "function") {
        throw new Error(`dispatch("${action}"): not an action on the store.`);
      }
      return (fn as (...a: unknown[]) => unknown)(...args);
    }) as StoreHarness["dispatch"],

    /**
     * Read from `HistoryStore`, the MobX owner of the command stack, rather
     * than from the `projectHistory` Phase B mirror the Zustand row reads.
     * These are two genuinely different sources: the mirror is RECONSTRUCTED
     * by rewinding inverse patches (`store/index.ts`'s `computeMirror`),
     * while `entries`/`index` are the stack itself.
     */
    getHistoryLength: () => {
      // The legacy array is still written directly by `load()`/`reset()` and
      // by `zustandProjectHost`, so adopt any external write before reading —
      // the same pull seam every history operation uses (`reconcile()`).
      reconcileHistory();
      return app.history.entries.length;
    },
    getHistoryIndex: () => {
      reconcileHistory();
      return app.history.index;
    },

    /**
     * ── `getHistoryEntry` — clone independence ────────────────────────────
     *
     * The interface says this exists ONLY to prove clone independence, and
     * the baseline proves it the hard way: `history.test.ts:207` mutates the
     * LIVE project in place (`live.pixels[3][3] = …`, a row no patch ever
     * touched) and requires the snapshot to be unaffected.
     *
     * `HistoryStore.entries` cannot answer that directly. A `SnapshotCommand`
     * carries its pre-state in `before`, but a `PixelCommand` deliberately
     * does NOT — carrying one would reintroduce the 6.9 MB-per-edit clone the
     * inverse-patch family exists to remove. Reconstructing a patch entry's
     * pre-state means rewinding the stack from the live project, which is
     * exactly what `store/index.ts`'s `computeMirror` already does, in the
     * one place that is allowed to write that mirror (R6: one field, one
     * writer).
     *
     * So this reads the reconstruction rather than duplicating it. That is
     * not a fallback to Zustand — `projectHistory` is a Phase B mirror whose
     * SOURCE is `HistoryStore`, and the glue re-publishes it
     * from the MobX stack on demand. Duplicating the rewind here would create
     * a second writer of a mirror the codebase pins to exactly one.
     */
    getHistoryEntry: (index) => {
      // ⚠️ NO `syncHistoryMirror()` HERE — and that omission is the whole
      // point. The mirror is RECONSTRUCTED by rewinding the command stack
      // from the LIVE project (`store/index.ts`'s `computeMirror`), so
      // recomputing it at READ time re-derives every entry from whatever the
      // live tree currently holds. `history.test.ts:207` corrupts the live
      // project in place and then re-reads entry 0; a recomputed mirror
      // faithfully reproduces the corruption in the "snapshot", and the
      // clone-independence assertion fails. Measured: `live.name =
      // "mutated in place"` appeared inside the snapshot, because the rewind
      // copies pixel ROWS but reuses the layer OBJECT for every other field.
      //
      // The mirror is already published synchronously by the glue after every
      // history operation, so by the time a test reads an entry it is current
      // as of the last RECORD — which is exactly the snapshot semantics the
      // interface asks for ("used ONLY to prove clone independence").
      return s().projectHistory[index] ?? null;
    },

    /**
     * Drive the MobX lifecycle: adopt the tree into `DomainStore` and clear
     * `HistoryStore`'s command stack, rather than `setState`-ing a flat
     * `EditorState`. The host install keeps the bridge-era `uiState` seam
     * intact (`DomainStore.currentProject()` reads `uiState` back through the
     * host), and clearing the real stack — not just the mirror array — is
     * what makes `getHistoryLength()` above meaningful.
     */
    load: (project) => {
      runInAction(() => {
        // ⚠️ `replaceEntries([], -1)`, NOT `clear()`. The two differ in
        // exactly one respect: `clear()` also drops an OPEN TRANSACTION
        // (`HistoryStore.ts:264`), and `replaceEntries` deliberately lets one
        // survive — its doc-comment names the task-08 harness's
        // `load()`/`reset()` as the very callers it is written for.
        //
        // That difference is pinned behaviour, not an implementation detail.
        // `drawing.test.ts:337` ("OBSERVED: `_strokeActive` is MODULE state,
        // so it survives a store reset") begins a stroke, resets and reloads
        // the store, and requires the stroke to STILL be batching. With
        // `clear()` the transaction is cancelled, the next `setPixel` records
        // its own entry, and the assertion fails — measured.
        //
        // The MobX equivalent of "module state that outlives a store reset"
        // is the shared `editorHistory` instance's open transaction, so
        // `replaceEntries` is what makes the two rows agree here.
        app.history.replaceEntries([], -1);
        app.domain.adoptTree(project);
        app.ui.hydrate(project.uiState);
      });
      // The host install also resets the legacy mirror, so the two views of
      // history agree at the start of every test.
      useEditorStore.setState({
        project,
        projectHistory: [],
        historyIndex: -1,
        selection: null,
        colorAdjustment: null,
        isDrawing: false,
        drawStartPoint: null,
        previewPixels: [],
        saveStatus: "idle",
      });
      runInAction(() => {
        app.session.setSaveStatus("idle");
      });
    },

    reset: () => {
      runInAction(() => {
        // See `load()` above for why this is `replaceEntries`, not `clear()`.
        app.history.replaceEntries([], -1);
        app.domain.adoptTree({
          version: "1.1.0",
          objects: [],
          palettes: [],
          variants: [],
          uiState: { ...DEFAULT_UI_STATE },
        });
        app.session.setSaveStatus("idle");
        app.session.setLayerClipboard(null);
        app.session.setTimelineCellClipboard(null);
        app.domain.projectName = PRISTINE.projectName;
        app.domain.projectList = [];
      });
      useEditorStore.setState({
        project: null,
        projectName: PRISTINE.projectName,
        projectList: [],
        isLoading: false,
        loadState: "idle",
        loadErrorMessage: null,
        saveStatus: "idle",
        projectHistory: [],
        historyIndex: -1,
        isDrawing: false,
        drawStartPoint: null,
        previewPixels: [],
        referenceOverlayOffset: { x: 0, y: 0 },
        frameTraceActive: false,
        frameTraceFrameIndex: null,
        frameOverlayOffset: { x: 0, y: 0 },
        frameReferenceObjectId: null,
        colorHistory: [],
        previousTool: null,
        selection: null,
        colorAdjustment: null,
        layerClipboard: null,
        timelineCellClipboard: null,
      });
    },

    /**
     * ── The member the contract predicted ─────────────────────────────────
     *
     * The Zustand row returns `null` here and the doc-comment explains why:
     * `MAX_HISTORY` is a module-level `const` captured by value inside
     * `updateProjectAndSave`'s closure, so nothing outside can lower it.
     *
     * `HistoryStore.maxEntries` is an ordinary instance field
     * (`HistoryStore.ts:93`, written by the constructor and read by the
     * eviction check at `:302`), so the MobX row returns a REAL restore
     * function — the exact scenario `StoreHarness.setMaxHistory` describes.
     * The cap tests consequently fill a 5-entry stack here instead of a
     * 100-entry one, and they assert eviction against a cap that was actually
     * lowered rather than against the shipped constant.
     */
    setMaxHistory: (n) => {
      const previous = app.history.maxEntries;
      runInAction(() => {
        app.history.maxEntries = n;
      });
      return () => {
        runInAction(() => {
          app.history.maxEntries = previous;
        });
      };
    },
    getMaxHistory: () => app.history.maxEntries,

    /**
     * ── Read through the PHASE B MIRROR, deliberately ─────────────────────
     *
     * `saveStatus` (SessionStore) and `projectName` (DomainStore) are both
     * MobX-owned — they are in `PHASE_B_FIELDS` — and Zustand's copies are
     * mirrors written by the bridge's Phase B reaction (`phaseBSnapshot`,
     * `zustandBridge.ts:360`). Reading the mirror IS reading the MobX value,
     * one reaction later.
     *
     * Reading `app.session.saveStatus` off THIS harness's app would be wrong,
     * and measurably so. The suites that assert saving build their OWN
     * `ApplicationStore` through `wireAutoSave()` — a second, autoSave-enabled
     * instance with its own bridge — and that instance is what performs the
     * save and owns the resulting status. `autoSave.test.ts` then asserts
     * through `harness.getSaveStatus()`. Bound to the shared no-autosave app
     * these read a permanent `"idle"` and `"project"`; measured, that is 5 of
     * the 7 initial failures, every one of them the harness looking at the
     * wrong instance rather than a behaviour difference.
     *
     * The mirror is the one view that always reflects whichever app currently
     * owns the field, which is exactly what a harness spanning both needs.
     */
    getSaveStatus: () => s().saveStatus,
    getProjectName: () => s().projectName,
  };
}

/**
 * The harness table every behaviour test iterates.
 *
 * ```ts
 * describe.each(HARNESSES)("%s", (_name, makeHarness) => { ... });
 * ```
 *
 * During the migration a second row is added:
 * `["mobx", createMobxHarness]`. Both run. Then the Zustand row is deleted and
 * nothing else changes.
 */
export const HARNESSES: ReadonlyArray<[string, () => StoreHarness]> = [
  ["zustand", createZustandHarness],
  ["mobx", createMobxHarness],
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Task 16: MobX auto-save wiring for the behaviour suites                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Auto-save is no longer a property of the Zustand store: `store/index.ts`
 * only commits `project`, the bridge bumps `DomainStore.domainVersion` on
 * each commit, and `AutoSaveController` owns debounce/save/status. A test
 * that asserts SAVE behaviour therefore wires the full bridge-era stack:
 *
 *   ApplicationStore (autoSaveEnabled) → installBridge → open the gate.
 *
 * `openGate` simulates a completed load the way `DomainStore`'s flows do —
 * project already installed in Zustand, THEN `loadGeneration` bumped and
 * `loadState` set — so the controller adopts the counters as its clean
 * baseline and only real edits schedule saves.
 *
 * Everything is instance-scoped: `dispose()` unwires the bridge (restoring
 * the throwing lifecycle stubs) and stops the reaction, so tests cannot leak
 * timers or saves into each other — the exact defect the module-level
 * `services/autoSave.ts` used to force onto this suite.
 */
export interface WiredApp {
  app: ApplicationStore;
  /** Mark the CURRENT Zustand project as freshly loaded under `name`. */
  openGate(name?: string): void;
  dispose(): void;
}

export function wireAutoSave(): WiredApp {
  const app = new ApplicationStore({ autoSaveEnabled: true });
  const disposeBridge = installBridge(app);
  return {
    app,
    openGate: (name = "test") => {
      runInAction(() => {
        app.domain.projectName = name;
        app.domain.projectList = [name];
        app.domain.loadGeneration += 1;
        app.domain.loadState = "loaded";
      });
    },
    dispose: () => {
      disposeBridge();
      app.dispose();
    },
  };
}
