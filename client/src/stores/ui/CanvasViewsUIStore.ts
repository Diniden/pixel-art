/**
 * CanvasViewsUIStore — which canvas render modes are open, and where
 * (split-canvas 2026-08-29, task 01).
 *
 * The pixel studio's canvas region shows one or two panes: the Full Render
 * Mode (today's composite view) and the Layer Render Mode (just the selected
 * variant's / layer's own grid). This store is the SESSION-ONLY record of
 * which of the two are open and which sits on the left, plus the Layer pane's
 * own camera (`layerCamera`). The Full pane's camera is `ViewportUIStore`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NOTHING HERE IS PERSISTED, AND NOTHING HERE MAY BE DEEP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * None of these fields is read by `toPersistedUIState()`; a reload comes back
 * to a single Full pane. Adding a key to the wire format would touch the
 * 151-snapshot corpus and was not asked for (MASTER D3).
 *
 * Two containers read this store concurrently (one per pane). Every field is
 * a scalar or an `observableRef` (inside `layerCamera`); there is nothing to
 * proxy. Like `CanvasInteractionStore`, it has no dependencies and nothing
 * depends on it, so `ApplicationStore` constructs it directly.
 *
 * ── Ordering rules (MASTER D6) ────────────────────────────────────────────
 * - A NEWLY opened mode goes on the RIGHT; the pane that was already open
 *   stays left.
 * - The last open pane cannot be closed — `closeMode` is a no-op then.
 * - `swap` flips sides only when both are open.
 * - Exactly ONE pane owns the window keyboard map (otherwise every WASD press
 *   and ⌘Z would fire twice): Full whenever it is open, else Layer.
 */
import { action, computed, makeObservable, observable } from "mobx";
import { CanvasCameraStore } from "./CanvasCameraStore";

export type CanvasRenderMode = "full" | "layer";

export class CanvasViewsUIStore {
  fullOpen = true;
  layerOpen = false;
  /** Which mode is the LEFT pane. Meaningful only when both are open. */
  leftMode: CanvasRenderMode = "full";
  /** The Layer pane's camera. The Full pane's is `ViewportUIStore`. */
  readonly layerCamera = new CanvasCameraStore();

  constructor() {
    makeObservable(this, {
      fullOpen: observable,
      layerOpen: observable,
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
    return this.fullOpen && this.layerOpen;
  }

  /** Open modes in left→right order; length 1 or 2. */
  get openModes(): CanvasRenderMode[] {
    if (this.bothOpen) {
      return this.leftMode === "full" ? ["full", "layer"] : ["layer", "full"];
    }
    return this.fullOpen ? ["full"] : ["layer"];
  }

  /** The ONE pane that owns the window keyboard map: "full" whenever it is open, else "layer". */
  get keyboardOwner(): CanvasRenderMode {
    return this.fullOpen ? "full" : "layer";
  }

  isOpen(mode: CanvasRenderMode): boolean {
    return mode === "full" ? this.fullOpen : this.layerOpen;
  }

  /**
   * Open `mode`. No-op if already open. When the other mode is already open,
   * the new pane appears on the RIGHT: `leftMode` becomes the mode that was
   * already there.
   */
  openMode(mode: CanvasRenderMode): void {
    if (this.isOpen(mode)) return;
    const other: CanvasRenderMode = mode === "full" ? "layer" : "full";
    if (this.isOpen(other)) this.leftMode = other;
    if (mode === "full") this.fullOpen = true;
    else this.layerOpen = true;
  }

  /** Close `mode`. Refuses (no-op) when it is the only open pane. */
  closeMode(mode: CanvasRenderMode): void {
    if (!this.isOpen(mode) || !this.bothOpen) return;
    if (mode === "full") this.fullOpen = false;
    else this.layerOpen = false;
  }

  /** Flip which side each pane takes. No-op unless both are open. */
  swap(): void {
    if (!this.bothOpen) return;
    this.leftMode = this.leftMode === "full" ? "layer" : "full";
  }
}
