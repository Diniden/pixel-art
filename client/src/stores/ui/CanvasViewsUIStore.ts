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
 *   stays left. `presentVariantPanes` is the ONE exception and says why.
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
      presentVariantPanes: action,
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

  /**
   * Both panes open, with the **Layer** pane LEFT and the **Full** (composite)
   * pane RIGHT. Called when the user selects a variant layer.
   *
   * ⚠️ THIS DELIBERATELY BREAKS THE "NEW PANE GOES RIGHT" RULE (MASTER D6),
   * which is why it is its own action rather than two `openMode` calls.
   *
   * From the usual starting state — Full alone, open and left —
   * `openMode("layer")` puts Layer on the RIGHT, which is the opposite of what
   * is wanted: the owner reported (2026-09-08) that on selecting a variant
   * layer "the default editor should be the variant canvas and NOT the
   * composed view on the left, BUT the composed view should be automatically
   * opened and on the right as the default". The pane the user EDITS belongs
   * under the primary hand; the composite is reference beside it. So this sets
   * `leftMode` outright instead of letting the open order decide.
   *
   * Idempotent, and it does not consult the current state: re-selecting the
   * same variant layer, or selecting a different one, lands on the same
   * arrangement. That also means it OVERRIDES a manual `swap` on the next
   * variant selection — acceptable, because the selection is the user's own
   * act and this is the documented response to it. It is deliberately NOT
   * called for a non-variant layer, so a user who arranges the panes by hand
   * keeps that arrangement for all ordinary layer work.
   */
  presentVariantPanes(): void {
    this.layerOpen = true;
    this.fullOpen = true;
    this.leftMode = "layer";
  }

  /** Flip which side each pane takes. No-op unless both are open. */
  swap(): void {
    if (!this.bothOpen) return;
    this.leftMode = this.leftMode === "full" ? "layer" : "full";
  }
}
