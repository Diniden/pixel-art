/**
 * ViewportUIStore — zoom, pan, the view-mode flags and the three floating
 * panels (REFRESH task 24).
 *
 * `zoom` is the most-read `uiState` field in the app (8 consumers), which is
 * exactly why it becomes a first-class observable rather than a property read
 * off a rebuilt `project` object.
 *
 * ── Panel grouping is an INTERNAL shape only ───────────────────────────────
 * The three floating panels are modelled as one `panels` record so the seven
 * near-identical legacy setters collapse into one parameterised
 * `setPanel(name, patch)`. **The wire format does not change**:
 * `UIStore.toPersistedUIState()` flattens `panels` back to the exact 7
 * top-level keys it has always used, and the three positions stay DISTINCT
 * (spec constraint: do not unify `frameReferencePanelPosition`,
 * `referenceImagePanelPosition` and `lightingPreviewPanelPosition`).
 *
 * `frameReference.visible` defaults to `true` when absent; every other panel
 * flag defaults to `false`/`undefined`, matching the legacy `?? ` fallbacks.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import { DEFAULT_UI_STATE } from "../../types";
import type { CanvasCamera } from "./CanvasCameraStore";

export interface PanelPosition {
  topPercent: number;
  leftPercent: number;
}

/** One floating panel's UI state. `visible` exists only for frameReference. */
export interface PanelState {
  position?: PanelPosition;
  minimized?: boolean;
  visible?: boolean;
}

export type PanelName = "frameReference" | "referenceImage" | "lightingPreview";

export class ViewportUIStore implements CanvasCamera {
  zoom: number = DEFAULT_UI_STATE.zoom;
  /** `observableRef`: the offset is replaced wholesale on every pan tick. */
  panOffset: { x: number; y: number } = DEFAULT_UI_STATE.panOffset;
  /**
   * The VIEW transform's scale — the pinch/wheel zoom, distinct from `zoom`.
   *
   * ⚠️ TWO ZOOMS, AND CONFUSING THEM IS THE HAZARD HERE. `zoom` above is the
   * PIXEL SCALE: how many screen pixels one sprite pixel occupies (2–50),
   * and it changes what is drawn. `viewZoom` is a CSS `scale()` on the
   * already-rendered canvas (0.25–4) — a magnifying glass over the same
   * bitmap. They multiply, they have different ranges, and they are set by
   * different gestures.
   *
   * It lived in a `useState` inside `useCanvasViewport` until 2026-08-28,
   * which meant it reset to 1 on every reload and could not follow the
   * project between devices — while `panOffset`, its other half, persisted.
   * Half a view state surviving a reload is worse than none: the canvas came
   * back panned to a position that only made sense at the old zoom.
   *
   * ⚠️ Tri-state, like `lightGridMode`: `undefined` means "absent from the
   * project file", so a project that has never been zoomed adds no key. See
   * the conditional half of `UIStore.toPersistedUIState()`. Readers use
   * `viewZoom ?? 1`.
   */
  viewZoom: number | undefined = undefined;
  focusMode = false;
  /**
   * ⚠️ Tri-state deliberately: `undefined` means "absent from the project
   * file". `compactToProject` fills it in with `?? false` on load, so any
   * project that has been loaded once HAS the key — but a project built by
   * `createDefaultProject()` and saved without a load does NOT, and the
   * legacy spread would not have written one. Modelling it as a plain
   * `boolean` would add the key to those projects, which is exactly the
   * wire-format drift R3 exists to prevent. Readers use
   * `lightGridMode ?? false`.
   */
  lightGridMode: boolean | undefined = undefined;
  canvasInfoHidden: boolean | undefined = undefined;
  objectLibraryViewMode: "normal" | "small-rows" | "grid" = "normal";
  timelineThumbnailMode = false;
  /**
   * How the NON-focused layers render on the canvas while a variant layer is
   * selected: `"normal"` (full opacity), `"transparent"` (the historical
   * 0.5/0.7 dim), or `"onion"` (semi-transparent outline — only cells with an
   * empty 4-adjacent neighbour, in their actual colour). Session-only: not
   * part of the persisted `uiState` wire format.
   */
  layerFocusMode: "normal" | "transparent" | "onion" = "transparent";
  /** Bumped on every layer click (even re-selection) so clicks are detectable. */
  layerSelectionCounter: number | undefined = undefined;

  /**
   * The three floating panels. `observableRef` per panel: a panel's state is
   * replaced wholesale by `setPanel`, so per-key granularity would only add
   * proxies.
   */
  panels: Record<PanelName, PanelState> = {
    frameReference: {},
    referenceImage: {},
    lightingPreview: {},
  };

  constructor() {
    makeObservable(this, {
      zoom: observable,
      panOffset: observableRef,
      viewZoom: observable,
      focusMode: observable,
      lightGridMode: observable,
      canvasInfoHidden: observable,
      objectLibraryViewMode: observable,
      timelineThumbnailMode: observable,
      layerFocusMode: observable,
      layerSelectionCounter: observable,
      panels: observableRef,

      setZoom: action,
      setPanOffset: action,
      setViewZoom: action,
      resetView: action,
      toggleFocusMode: action,
      toggleLightGridMode: action,
      setCanvasInfoHidden: action,
      setObjectLibraryViewMode: action,
      setTimelineThumbnailMode: action,
      setLayerFocusMode: action,
      bumpLayerSelectionCounter: action,
      setPanel: action,
      toggleFrameReferencePanelVisible: action,
      hydrate: action,
    });
  }

  /** Legacy clamp, verbatim: `Math.max(1, Math.min(50, zoom))`. */
  setZoom(zoom: number): void {
    this.zoom = Math.max(1, Math.min(50, zoom));
  }

  setPanOffset(offset: { x: number; y: number }): void {
    this.panOffset = offset;
  }

  /** Clamped to the view-transform range the gesture engine enforces. */
  setViewZoom(zoom: number): void {
    this.viewZoom = Math.max(0.25, Math.min(4, zoom));
  }

  /**
   * Return the workspace to 100% view zoom, centred.
   *
   * ⚠️ It resets the VIEW only. `zoom` — the pixel scale the user chose for
   * this sprite — is deliberately untouched (owner decision): the button
   * undoes a pan/pinch that got lost, it does not discard a deliberate
   * setting. The centring itself needs the viewport's measured size, so the
   * pan is computed by the caller and passed in; a store may not read the DOM.
   */
  resetView(centeredPan: { x: number; y: number }): void {
    this.viewZoom = 1;
    this.panOffset = centeredPan;
  }

  toggleFocusMode(): void {
    this.focusMode = !this.focusMode;
  }

  /** `?? false` matches the legacy toggle, which read the same fallback. */
  toggleLightGridMode(): void {
    this.lightGridMode = !(this.lightGridMode ?? false);
  }

  setCanvasInfoHidden(hidden: boolean): void {
    this.canvasInfoHidden = hidden;
  }

  setObjectLibraryViewMode(mode: "normal" | "small-rows" | "grid"): void {
    this.objectLibraryViewMode = mode;
  }

  setTimelineThumbnailMode(enabled: boolean): void {
    this.timelineThumbnailMode = enabled;
  }

  setLayerFocusMode(mode: "normal" | "transparent" | "onion"): void {
    this.layerFocusMode = mode;
  }

  bumpLayerSelectionCounter(): void {
    this.layerSelectionCounter = (this.layerSelectionCounter ?? 0) + 1;
  }

  /**
   * THE replacement for the 7 near-identical panel setters. `panels` is a
   * ref, so the record is rebuilt rather than mutated in place.
   */
  setPanel(name: PanelName, patch: PanelState): void {
    this.panels = {
      ...this.panels,
      [name]: { ...this.panels[name], ...patch },
    };
  }

  /** `frameReference.visible` defaults to `true` when it has never been set. */
  toggleFrameReferencePanelVisible(): void {
    const next = !(this.panels.frameReference.visible ?? true);
    this.setPanel("frameReference", { visible: next });
  }

  /**
   * Adopt a loaded project's viewport fields, re-grouping the 7 flat panel
   * keys into the internal `panels` record. The inverse of the flattening
   * `UIStore.toPersistedUIState()` performs.
   */
  hydrate(ui: {
    zoom?: number;
    panOffset?: { x: number; y: number };
    viewZoom?: number;
    focusMode?: boolean;
    lightGridMode?: boolean;
    canvasInfoHidden?: boolean;
    objectLibraryViewMode?: "normal" | "small-rows" | "grid";
    timelineThumbnailMode?: boolean;
    layerSelectionCounter?: number;
    frameReferencePanelPosition?: PanelPosition;
    frameReferencePanelMinimized?: boolean;
    frameReferencePanelVisible?: boolean;
    referenceImagePanelPosition?: PanelPosition;
    referenceImagePanelMinimized?: boolean;
    lightingPreviewPanelPosition?: PanelPosition;
    lightingPreviewPanelMinimized?: boolean;
  }): void {
    if (ui.zoom !== undefined) this.zoom = ui.zoom;
    if (ui.panOffset !== undefined) this.panOffset = ui.panOffset;
    // Assigned unconditionally: absent must stay absent (see the field note).
    this.viewZoom = ui.viewZoom;
    if (ui.focusMode !== undefined) this.focusMode = ui.focusMode;
    // Assigned unconditionally: absent must stay absent (see the field note).
    this.lightGridMode = ui.lightGridMode;
    if (ui.objectLibraryViewMode !== undefined) {
      this.objectLibraryViewMode = ui.objectLibraryViewMode;
    }
    if (ui.timelineThumbnailMode !== undefined) {
      this.timelineThumbnailMode = ui.timelineThumbnailMode;
    }
    // These four are legitimately absent in the wire format — assigning
    // unconditionally preserves "absent stays absent" through a round trip.
    this.canvasInfoHidden = ui.canvasInfoHidden;
    this.layerSelectionCounter = ui.layerSelectionCounter;

    this.panels = {
      frameReference: {
        position: ui.frameReferencePanelPosition,
        minimized: ui.frameReferencePanelMinimized,
        visible: ui.frameReferencePanelVisible,
      },
      referenceImage: {
        position: ui.referenceImagePanelPosition,
        minimized: ui.referenceImagePanelMinimized,
      },
      lightingPreview: {
        position: ui.lightingPreviewPanelPosition,
        minimized: ui.lightingPreviewPanelMinimized,
      },
    };
  }
}
