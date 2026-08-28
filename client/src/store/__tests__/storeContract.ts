/**
 * The store BEHAVIOUR CONTRACT.
 *
 * ## The point of this file
 *
 * Every behaviour test in `src/store/__tests__/` is written against the narrow
 * {@link StoreHarness} interface below, never against the store
 * implementation directly. The MobX migration added a `createMobxHarness`
 * alongside `createZustandHarness`, both entries ran under the same
 * `describe.each`, and when the Zustand harness was finally deleted
 * (task 38) the Zustand ROW was removed from {@link HARNESSES} and the
 * assertions were **untouched**. That is the parity proof, completed: the
 * `*.test.ts` files in this directory are the task-08 characterisation
 * baseline, byte-unmodified since it was written against the legacy store —
 * and they now run entirely against the MobX tree.
 *
 * ## Two hard rules this file exists to enforce
 *
 * 1. **Never assert on the store's shape.** The legacy state had ~206
 *    top-level keys and the MobX design re-homed every one across
 *    SessionStore / DomainStore / UIStore. A shape assertion guarantees a
 *    rewrite. Assert only through `dispatch` + `getProject` / `getUiState` /
 *    `getHistoryLength` / `getHistoryIndex` / the few explicitly-modelled
 *    accessors below.
 *
 * 2. **Never build a realistic project.** A runtime `Project` snapshot of the
 *    real `Base Unit.json` measures 6.9 MB; 100 history entries of one is
 *    ~680 MB and WILL OOM the worker. {@link tinyProject} is 1 object × 1
 *    frame × 1 layer × 4×4, and every history-cap test uses it with a
 *    LOWERED cap via {@link StoreHarness.setMaxHistory}.
 *
 * These tests run in the fast `unit` project — no jsdom, no React, no
 * renderer.
 */
import { runInAction } from "mobx";
import { currentHarnessApp, registerHarnessApp } from "./mobxHarnessRuntime";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { DEFAULT_UI_STATE, compactToProject, projectToCompact } from "@/types";
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
import {
  dispatchLegacyAction,
  historyMirrorEntry,
  resetHistoryMirror,
} from "./mobxHarnessRuntime";

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
   * costs 100 serialise/deserialise round-trips per test.
   * `HistoryStore.maxEntries` is an ordinary instance field, so the harness
   * returns a real restore function. Returns `null` if the implementation
   * cannot lower the cap, in which case the cap tests must fall back to the
   * real value.
   */
  setMaxHistory(n: number): (() => void) | null;

  /** The cap this implementation is currently enforcing. */
  getMaxHistory(): number;

  /** Read-only peek at the save-status lifecycle field. */
  // `"pending"` added 2026-08-28: an edit is scheduled/in-flight but not on
  // disk. The frozen assertions never observe it — they read this after a
  // save settles — but the type must admit it or the harness cannot compile.
  getSaveStatus(): "idle" | "pending" | "saving" | "saved" | "error";
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
    project?.objects[objectIndex]?.frames[frameIndex]?.layers[layerIndex] ??
    null
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
/* The MobX harness — the only row since task 38                              */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * ## The shared app
 *
 * ONE `ApplicationStore` is constructed for the whole module rather than per
 * harness: `makeHarness()` runs in `beforeEach` across hundreds of tests with
 * no matching teardown (the `StoreHarness` interface has no `dispose`), so a
 * per-harness construction would leak a reaction per test.
 *
 * `autoSaveEnabled: false` — these suites assert history and mutation
 * behaviour, not saving; the tests that DO assert saving build their own
 * wired app through {@link wireAutoSave}.
 *
 * ## Dynamic resolution — the "last app wired wins" rule
 *
 * Every member resolves the CURRENTLY REGISTERED app on each call rather
 * than capturing one at construction. That preserves the legacy store's
 * global-singleton semantics for the suites that span two apps: while a
 * {@link wireAutoSave} app is registered, dispatches and reads reach IT (its
 * saves, its `saveStatus`, its project); on dispose they fall back to the
 * shared app. Binding to the shared app instead was measured (during the
 * harness's construction) to fail 5 auto-save tests — the harness looking at
 * the wrong instance, not a behaviour difference.
 */
let sharedApp: ApplicationStore | null = null;

function ensureApp(): ApplicationStore {
  if (!sharedApp) {
    sharedApp = new ApplicationStore({ autoSaveEnabled: false });
    // Module-lifetime — never unregistered, exactly like the shared bridge
    // installation it replaces.
    registerHarnessApp(sharedApp);
  }
  return sharedApp;
}

/** The legacy store's initial `projectName`, restored by `reset()`. */
const INITIAL_PROJECT_NAME = "project";

export function createMobxHarness(): StoreHarness {
  ensureApp();

  return {
    /**
     * Served from the MobX tree: `currentProject()` recombines
     * `DomainStore`'s `version`/`objects`/`palettes`/`variants`/
     * `referenceImage` with a `uiState` composed from the owning UI stores.
     * `null` before a tree is adopted, exactly as the interface requires.
     */
    getProject: () => currentHarnessApp().domain.currentProject(),

    getUiState: () => {
      const project = currentHarnessApp().domain.currentProject();
      if (!project) {
        throw new Error(
          "getUiState(): no project loaded — call harness.load(...) first.",
        );
      }
      // Already composed live from the owning stores by the project host —
      // runtime shapes, not the wire format (packing happens only in
      // `UIStore.toPersistedUIState()`, at the serialization boundary).
      return project.uiState;
    },

    /**
     * Dispatch by legacy action NAME through the harness runtime's table —
     * the direct descendant of the bridge's delegate table, with the store
     * in the middle removed. See `mobxHarnessRuntime.ts`.
     */
    dispatch: ((action: string, ...args: unknown[]) =>
      dispatchLegacyAction(
        currentHarnessApp(),
        action,
        args,
      )) as StoreHarness["dispatch"],

    /** Read from `HistoryStore`, the owner of the command stack. */
    getHistoryLength: () => currentHarnessApp().history.entries.length,
    getHistoryIndex: () => currentHarnessApp().history.index,

    /**
     * ── `getHistoryEntry` — clone independence ────────────────────────────
     *
     * The interface says this exists ONLY to prove clone independence, and
     * the baseline proves it the hard way: `history.test.ts:207` mutates the
     * LIVE project in place (`live.pixels[3][3] = …`, a row no patch ever
     * touched) and requires the snapshot to be unaffected.
     *
     * A `SnapshotCommand` carries its pre-state in `before`, but a
     * `PixelCommand` deliberately does NOT — carrying one would reintroduce
     * the 6.9 MB-per-edit clone the inverse-patch family exists to remove.
     * So a patch entry's pre-state is RECONSTRUCTED by rewinding the stack
     * from the live project — materialised at RECORD time by the harness
     * runtime, never derived at read time: a read-time rewind would
     * faithfully reproduce an in-place corruption of the live tree inside
     * the "snapshot", and the clone-independence assertion fails (measured
     * when the mirror was first built).
     */
    getHistoryEntry: (index) => historyMirrorEntry(index),

    /**
     * Drive the MobX lifecycle: clear the shared command stack, adopt the
     * project into every owning store, and reset the per-test scratch state
     * the legacy `load()` cleared (`selection`, `colorAdjustment`,
     * `saveStatus`).
     */
    load: (project) => {
      const app = currentHarnessApp();
      runInAction(() => {
        // ⚠️ `replaceEntries([], -1)`, NOT `clear()`. The two differ in
        // exactly one respect: `clear()` also drops an OPEN TRANSACTION
        // (`HistoryStore.ts`), and `replaceEntries` deliberately lets one
        // survive. That difference is pinned behaviour: the baseline's
        // "`_strokeActive` is MODULE state, so it survives a store reset"
        // begins a stroke, resets and reloads the store, and requires the
        // stroke to STILL be batching. The MobX equivalent of module state
        // that outlives a store reset is the shared `editorHistory`
        // instance's open transaction, so `replaceEntries` is what keeps
        // that pin green.
        app.history.replaceEntries([], -1);
      });
      app.adoptProject(project);
      runInAction(() => {
        app.selectionUI.clearSelection();
        app.ui.tool.setColorAdjustment(null);
        app.session.setSaveStatus("idle");
      });
      resetHistoryMirror();
    },

    reset: () => {
      const app = currentHarnessApp();
      // Drop the hosted project FIRST so `getProject()` reads `null`, as the
      // legacy reset's `project: null` did.
      app.clearHostedProject();
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
        // A null project CLEARS the selection ids — pinned: the baseline's
        // "falls back to a hard-coded 32x32 when nothing resolves" requires
        // a reset store to resolve NO current layer.
        app.timelineUI.adopt({
          selectedObjectId: null,
          selectedFrameId: null,
          selectedLayerId: null,
        });
        app.session.setSaveStatus("idle");
        app.session.setLayerClipboard(null);
        app.session.setTimelineCellClipboard(null);
        app.session.colorHistory = [];
        app.selectionUI.clearSelection();
        app.ui.tool.setColorAdjustment(null);
        app.domain.projectName = INITIAL_PROJECT_NAME;
        app.domain.projectList = [];
      });
      resetHistoryMirror();
    },

    /**
     * `HistoryStore.maxEntries` is an ordinary instance field (written by the
     * constructor and read by the eviction check), so this returns a REAL
     * restore function. The cap tests consequently fill a 5-entry stack
     * instead of a 100-entry one, and they assert eviction against a cap
     * that was actually lowered rather than against the shipped constant.
     */
    setMaxHistory: (n) => {
      const app = currentHarnessApp();
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
    getMaxHistory: () => currentHarnessApp().history.maxEntries,

    /**
     * Resolved off the CURRENTLY REGISTERED app — see the module note above:
     * the suites that assert saving build their OWN wired app, and while it
     * is registered these reads must describe IT, not the shared app.
     */
    getSaveStatus: () => currentHarnessApp().session.saveStatus,
    getProjectName: () => currentHarnessApp().domain.projectName,
  };
}

/**
 * The harness table every behaviour test iterates.
 *
 * ```ts
 * describe.each(HARNESSES)("%s", (_name, makeHarness) => { ... });
 * ```
 *
 * During the migration this held two rows — `["zustand", …]` and
 * `["mobx", …]` — and both ran. Task 38 deleted the Zustand row along with
 * the store it exercised; nothing else changed. The assertions never moved.
 */
export const HARNESSES: ReadonlyArray<[string, () => StoreHarness]> = [
  ["mobx", createMobxHarness],
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Task 16: MobX auto-save wiring for the behaviour suites                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * A test that asserts SAVE behaviour wires its own auto-saving app:
 *
 *   ApplicationStore (autoSaveEnabled) → registerHarnessApp → open the gate.
 *
 * `openGate` simulates a completed load the way `DomainStore`'s flows do —
 * project already installed, THEN `loadGeneration` bumped and `loadState`
 * set — so the controller adopts the counters as its clean baseline and only
 * real edits schedule saves.
 *
 * Everything is instance-scoped: `dispose()` unregisters the app (restoring
 * the shared harness app as the dispatch/read target) and stops the save
 * reaction, so tests cannot leak timers or saves into each other.
 */
export interface WiredApp {
  app: ApplicationStore;
  /** Mark the CURRENT project as freshly loaded under `name`. */
  openGate(name?: string): void;
  dispose(): void;
}

export function wireAutoSave(): WiredApp {
  // Keep the shared app registered BENEATH the wired one, so dispose()
  // restores it as the fallback target.
  const shared = ensureApp();
  const app = new ApplicationStore({ autoSaveEnabled: true });
  // ── Inherit the state the app below already holds ──────────────────────
  //
  // The retired bridge did exactly this on install: it adopted the tree
  // eagerly ("a bridge installed while a project is ALREADY loaded started
  // with an empty DomainStore" — measured in this very suite), synced the
  // Phase A fields, and pulled the existing clipboards through the adoption
  // seam. The suites rely on it: `beforeEach` loads the project BEFORE
  // wiring, and the cross-project clipboard pin copies in one app's era and
  // pastes in another's.
  const inherited = shared.domain.currentProject();
  if (inherited) app.adoptProject(inherited);
  runInAction(() => {
    app.session.setLayerClipboard(shared.session.layerClipboard);
    app.session.setTimelineCellClipboard(shared.session.timelineCellClipboard);
    app.session.colorHistory = shared.session.colorHistory;
  });
  const unregister = registerHarnessApp(app);
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
      // ── Hand the state BACK to the app below ────────────────────────────
      //
      // The mirror image of the inheritance above. During the bridge era the
      // GLOBAL store carried everything across app boundaries: a project
      // switched during the wired era was simply *there* for the shared app
      // afterwards (its bridge had been adopting all along), and the layers
      // suite pins exactly that — copy in the shared era, switch projects in
      // the wired era, paste back in the shared era.
      const project = app.domain.currentProject();
      if (project) shared.adoptProject(project);
      runInAction(() => {
        shared.session.setLayerClipboard(app.session.layerClipboard);
        shared.session.setTimelineCellClipboard(
          app.session.timelineCellClipboard,
        );
        shared.session.colorHistory = app.session.colorHistory;
        shared.session.setSaveStatus(app.session.saveStatus);
        shared.domain.projectName = app.domain.projectName;
        shared.domain.projectList = app.domain.projectList.slice();
      });
      unregister();
      app.dispose();
    },
  };
}
