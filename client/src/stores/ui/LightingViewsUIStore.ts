/**
 * LightingViewsUIStore — which lighting render modes are open, and where
 * (lighting-preview-split 2026-08-29, task 01).
 *
 * The lighting studio's canvas region shows one or two panes: the Edit Render
 * Mode (today's normal / height painting canvas) and the Preview Render Mode
 * (the lit composite of the whole object, promoted out of its 200 px floating
 * panel into a real workspace pane, and READ-ONLY). This store is the
 * SESSION-ONLY record of which of the two are open, which sits on the left,
 * and an independent camera for EACH pane.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NOTHING HERE IS PERSISTED, AND NOTHING HERE MAY BE DEEP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * None of these fields is read by `toPersistedUIState()`; a reload comes back
 * to a single Edit pane. Adding a key to the wire format would touch the
 * 151-snapshot corpus and was not asked for (MASTER D3).
 *
 * ── Why BOTH panes get a `CanvasCameraStore` ──────────────────────────────
 * The pixel studio's Full pane reuses the persisted `ViewportUIStore` as its
 * camera. The lighting studio has no persisted camera at all: measured, it
 * hands `useCanvasViewport` a hard-coded `panOffset: {x:0,y:0}` with no commit
 * sinks, so its pan and view zoom are hook-local and die on reload. So both
 * lighting panes get a `CanvasCameraStore` and NEITHER is persisted — which is
 * not a regression, the lighting view transform is session-only today
 * (MASTER D2/D3).
 *
 * ⚠️ The lighting PIXEL scale stays `app.ui.viewport.zoom` — shared by both
 * panes, persisted, and deliberately NOT part of `CanvasCamera` (MASTER D4).
 * "Camera" here means pan + view zoom only.
 *
 * Two containers read this store concurrently (one per pane). Every field is
 * a scalar or an `observableRef` (inside a camera); there is nothing to proxy.
 * Like `CanvasViewsUIStore`, it has no dependencies and nothing depends on it,
 * so `ApplicationStore` constructs it directly.
 *
 * ── Ordering rules (MASTER D6) ────────────────────────────────────────────
 * - A NEWLY opened mode goes on the RIGHT; the pane that was already open
 *   stays left.
 * - The last open pane cannot be closed — `closeMode` is a no-op then.
 * - `swap` flips sides only when both are open.
 * - Exactly ONE pane owns the window keyboard map (otherwise every ⌘Z and
 *   frame step would fire twice): Edit whenever it is open, else Preview.
 */
import { action, computed, makeObservable, observable } from "mobx";
import { CanvasCameraStore, type CanvasCamera } from "./CanvasCameraStore";

export type LightingRenderMode = "edit" | "preview";

export class LightingViewsUIStore {
  editOpen = true;
  previewOpen = false;
  /** Which mode is the LEFT pane. Meaningful only when both are open. */
  leftMode: LightingRenderMode = "edit";
  /** Both panes are session-only: the lighting studio has never persisted a camera. */
  readonly editCamera = new CanvasCameraStore();
  readonly previewCamera = new CanvasCameraStore();

  constructor() {
    makeObservable(this, {
      editOpen: observable,
      previewOpen: observable,
      leftMode: observable,

      bothOpen: computed,
      openModes: computed,
      keyboardOwner: computed,

      openMode: action,
      closeMode: action,
      swap: action,
    });
  }

  get bothOpen(): boolean {
    return this.editOpen && this.previewOpen;
  }

  /** Open modes in left→right order; length 1 or 2. */
  get openModes(): LightingRenderMode[] {
    if (this.bothOpen) {
      return this.leftMode === "edit"
        ? ["edit", "preview"]
        : ["preview", "edit"];
    }
    return this.editOpen ? ["edit"] : ["preview"];
  }

  /** The ONE pane that owns the window keyboard map: "edit" whenever it is open, else "preview". */
  get keyboardOwner(): LightingRenderMode {
    return this.editOpen ? "edit" : "preview";
  }

  /**
   * The camera belonging to `mode`. Keeps the mode→camera choice here rather
   * than repeating a ternary in each of the two containers.
   */
  cameraFor(mode: LightingRenderMode): CanvasCamera {
    return mode === "edit" ? this.editCamera : this.previewCamera;
  }

  isOpen(mode: LightingRenderMode): boolean {
    return mode === "edit" ? this.editOpen : this.previewOpen;
  }

  /**
   * Open `mode`. No-op if already open. When the other mode is already open,
   * the new pane appears on the RIGHT: `leftMode` becomes the mode that was
   * already there.
   */
  openMode(mode: LightingRenderMode): void {
    if (this.isOpen(mode)) return;
    const other: LightingRenderMode = mode === "edit" ? "preview" : "edit";
    if (this.isOpen(other)) this.leftMode = other;
    if (mode === "edit") this.editOpen = true;
    else this.previewOpen = true;
  }

  /** Close `mode`. Refuses (no-op) when it is the only open pane. */
  closeMode(mode: LightingRenderMode): void {
    if (!this.isOpen(mode) || !this.bothOpen) return;
    if (mode === "edit") this.editOpen = false;
    else this.previewOpen = false;
  }

  /** Flip which side each pane takes. No-op unless both are open. */
  swap(): void {
    if (!this.bothOpen) return;
    this.leftMode = this.leftMode === "edit" ? "preview" : "edit";
  }
}
