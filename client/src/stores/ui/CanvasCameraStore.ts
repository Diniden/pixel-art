/**
 * CanvasCameraStore — a second, session-only camera for the Layer Render Mode
 * (split-canvas 2026-08-29, task 01).
 *
 * The editor can show two panes side by side: the Full Render Mode (today's
 * view — every layer composited, the variant drawn inside the object) and the
 * Layer Render Mode (just the selected variant's / layer's own grid). Each
 * pane pans and pinch-zooms INDEPENDENTLY, so each needs its own camera.
 *
 * ── The Full camera already exists — it is `ViewportUIStore` ──────────────
 * `ViewportUIStore.panOffset` / `viewZoom` / `setPanOffset` / `setViewZoom` /
 * `resetView` ARE the Full-mode camera. They are persisted wire fields
 * (`UIStore.toPersistedUIState()`) and they stay exactly where they are;
 * `ViewportUIStore` simply declares `implements CanvasCamera` so a container
 * can be handed EITHER camera and not know which.
 *
 * This class is the Layer-mode camera. It is NOT persisted anywhere — not in
 * `uiState`, not in `localStorage` — and holds no reference through which it
 * could enter history or trigger a save. A reload comes back to a single Full
 * pane, so a Layer camera that outlived the session would have nothing to
 * attach to.
 *
 * ⚠️ `zoom` (the PIXEL scale, 1–50) is deliberately NOT part of the camera.
 * It is a per-sprite setting chosen in the toolbar and both panes share it
 * (`ViewportUIStore.zoom`). "Camera" here means pan + view zoom only — the
 * CSS `scale()` over the already-rendered bitmap, 0.25–4.
 *
 * `panOffset` is `observableRef`: it is replaced wholesale on every pan tick
 * and never edited field-by-field. `viewZoom` is a plain observable number
 * with the same tri-state as `ViewportUIStore.viewZoom` — `undefined` means
 * "never zoomed"; readers use `?? 1`.
 */
import { action, makeObservable, observable, observableRef } from "mobx";

/**
 * What a canvas pane needs from its camera. `ViewportUIStore` implements it
 * for the Full pane; `CanvasCameraStore` for the Layer pane.
 */
export interface CanvasCamera {
  readonly panOffset: { x: number; y: number };
  /** `undefined` = never zoomed; readers use `?? 1`. */
  readonly viewZoom: number | undefined;
  setPanOffset(offset: { x: number; y: number }): void;
  setViewZoom(zoom: number): void;
  resetView(centeredPan: { x: number; y: number }): void;
}

export class CanvasCameraStore implements CanvasCamera {
  /** `observableRef`: replaced wholesale on every pan tick. */
  panOffset: { x: number; y: number } = { x: 0, y: 0 };
  /** Tri-state like `ViewportUIStore.viewZoom`; readers use `?? 1`. */
  viewZoom: number | undefined = undefined;

  constructor() {
    makeObservable(this, {
      panOffset: observableRef,
      viewZoom: observable,

      setPanOffset: action,
      setViewZoom: action,
      resetView: action,
    });
  }

  setPanOffset(offset: { x: number; y: number }): void {
    this.panOffset = offset;
  }

  /** Same clamp as `ViewportUIStore.setViewZoom` — the gesture engine's range. */
  setViewZoom(zoom: number): void {
    this.viewZoom = Math.max(0.25, Math.min(4, zoom));
  }

  /**
   * Back to 100% view zoom at the pan the caller computed (centring needs the
   * viewport's measured size, and a store may not read the DOM).
   */
  resetView(centeredPan: { x: number; y: number }): void {
    this.viewZoom = 1;
    this.panOffset = centeredPan;
  }
}
