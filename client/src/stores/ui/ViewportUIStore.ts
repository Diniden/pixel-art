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
import {
  FOCUS_MODE_RAILS,
  isDismissableRail,
  type DismissableRail,
} from "../../ui/layout/railVisibility";
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
  /**
   * ⚠️ THE LEGACY FIELD, and it is now DERIVED on the way out — read
   * `hiddenRails` instead of this in new code.
   *
   * It stays a stored boolean for one reason: it is slot 8 of the frozen
   * wire format, emitted unconditionally on every save, and every one of the
   * owner's 151 corpus snapshots carries it. Removing it, or making it
   * conditional, would change every project's key set.
   *
   * What it MEANS has narrowed. It is the persisted record of the classic
   * two-rail focus mode; whether the UI's focus button looks engaged is
   * `focusModeEngaged` below, which also counts a rail dismissed by its own
   * × button. On load, `hydrate` expands a `true` here into the two rails it
   * has always hidden, so an old project comes back looking exactly as it
   * did.
   */
  focusMode = false;
  /**
   * Which rails the user has dismissed, by rail NAME.
   *
   * ⚠️ A SET OF NAMES, not three booleans. The three dismiss buttons and the
   * focus toggle are the same operation applied to different subsets, and a
   * set lets `focusModeEngaged` be "is anything hidden" rather than a
   * three-way `||` that a fourth rail would silently fall out of.
   *
   * `observableRef` — replaced wholesale on every edit, like the other
   * collection fields here, so per-key proxies would buy nothing.
   *
   * ⚠️ The rail names are IDENTITIES, not positions (`railLayout.ts` opens on
   * this). `left` is the Objects & Layers rail wherever the user has since
   * moved it to, which is what makes a dismissal survive a layout change.
   */
  hiddenRails: ReadonlySet<DismissableRail> = new Set();
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
  /**
   * Pencil-only input (2026-08-31): only an Apple Pencil may edit pixels.
   *
   * ⚠️ TRI-STATE, for the same reason `lightGridMode` above is: `undefined`
   * means "absent from the project file", and it must round-trip back out as
   * absent so an untouched project's bytes do not move. Modelling it as a
   * plain `boolean` would add the key to every project that has ever been
   * saved, which is the wire-format drift R3 exists to prevent.
   *
   * ⚠️ THE DEFAULT IS NOT DECIDED HERE, and deliberately so. It is
   * device-dependent — ON where there is a touch screen, meaningless on a
   * mouse-only desktop — and a store may not read the DOM to find out. The
   * container resolves it (see `HeaderContainer`), so this stays a faithful
   * mirror of the file and nothing more.
   */
  pencilOnly: boolean | undefined = undefined;
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
      hiddenRails: observableRef,
      setRailHidden: action,
      showAllRails: action,
      lightGridMode: observable,
      pencilOnly: observable,
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

  /**
   * Whether the focus button reads as ENGAGED.
   *
   * ⚠️ "Anything hidden", not "focus mode is on". Dismissing a single rail
   * with its own × button engages the button too (owner, 2026-08-30), because
   * from the user's side both actions did the same kind of thing — took a
   * rail away — and the button is what brings rails back. A button that
   * stayed unlit while a rail was missing would leave no visible way to undo
   * the dismissal.
   */
  get focusModeEngaged(): boolean {
    return this.hiddenRails.size > 0;
  }

  /** Whether one rail should render at all. The layouts' only question. */
  isRailHidden(rail: DismissableRail): boolean {
    return this.hiddenRails.has(rail);
  }

  /**
   * Hide or show one rail — what a panel's × button calls.
   *
   * ⚠️ It also maintains `focusMode`, the persisted legacy boolean, so the
   * wire format keeps meaning what it always did: true exactly when the two
   * rails classic focus mode hides are both hidden. A project saved with a
   * single rail dismissed therefore loads on an older build as no focus mode
   * at all, which is the safe direction to be wrong in — the user sees their
   * panels rather than losing them.
   */
  setRailHidden(rail: DismissableRail, hidden: boolean): void {
    const next = new Set(this.hiddenRails);
    if (hidden) next.add(rail);
    else next.delete(rail);
    this.hiddenRails = next;
    this.focusMode = FOCUS_MODE_RAILS.every((r) => next.has(r));
  }

  /** Bring every dismissed rail back. The engaged button's action. */
  showAllRails(): void {
    this.hiddenRails = new Set();
    this.focusMode = false;
  }

  /**
   * The focus button.
   *
   * ⚠️ ASYMMETRIC, and deliberately so (owner, 2026-08-30). Engaged, it
   * restores EVERYTHING — including a rail dismissed individually, which
   * classic focus mode never touched. Disengaged, it does what it always did
   * and hides the two rails in `FOCUS_MODE_RAILS`.
   *
   * So it is not a toggle of one flag: "off" is a single, predictable state
   * (everything visible) while "on" has as many shapes as there are subsets
   * of hidden rails. That is what makes one button able to undo three
   * different × presses.
   */
  toggleFocusMode(): void {
    if (this.focusModeEngaged) {
      this.showAllRails();
      return;
    }
    this.hiddenRails = new Set(FOCUS_MODE_RAILS);
    this.focusMode = true;
  }

  /** `?? false` matches the legacy toggle, which read the same fallback. */
  toggleLightGridMode(): void {
    this.lightGridMode = !(this.lightGridMode ?? false);
  }

  /**
   * Pencil-only input. Takes the value explicitly rather than toggling: the
   * caller knows the device default this is being flipped away from, and this
   * store deliberately does not (see the field note).
   */
  setPencilOnly(on: boolean): void {
    this.pencilOnly = on;
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
    /** Wide `string[]`: a file may name a rail this build does not know. */
    hiddenRails?: string[];
    lightGridMode?: boolean;
    pencilOnly?: boolean;
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
    // ⚠️ THE LEGACY EXPANSION. `focusMode: true` in a file written before
    // per-rail dismissal existed means "the two classic rails are hidden", so
    // it becomes exactly that set. `hiddenRails` in the file wins where
    // present — a newer save is more specific than the boolean it derives.
    if (ui.hiddenRails !== undefined) {
      this.hiddenRails = new Set(ui.hiddenRails.filter(isDismissableRail));
    } else if (ui.focusMode) {
      this.hiddenRails = new Set(FOCUS_MODE_RAILS);
    } else {
      this.hiddenRails = new Set();
    }
    if (ui.focusMode !== undefined) this.focusMode = ui.focusMode;
    // Assigned unconditionally: absent must stay absent (see the field note).
    this.lightGridMode = ui.lightGridMode;
    // Likewise — a project that never set it must not gain the key on save.
    this.pencilOnly = ui.pencilOnly;
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
