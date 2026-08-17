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
import { useEditorStore } from "@/store";
import { MAX_HISTORY } from "@/store/storeTypes";
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

export function createZustandHarness(): StoreHarness {
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
];
