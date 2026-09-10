/**
 * BrushUIStore — brush-studio SESSION state (Brush Studio plan,
 * `docs/01-brush-studio`, task 10; MASTER D7 / D17. Brush follow-ups
 * `docs/11-brush-studio-followups`, task 03; MASTER D2 / D8).
 *
 * Which frame and layer are selected, the two delta vectors the tools will
 * paint (the brush studio's stand-in for the colour picker's edge/fill pair),
 * the brush canvas's zoom/pan/view-zoom, and the timeline's play flag. All of
 * it is in-memory only: NONE of these fields is persisted (MASTER §1 —
 * brush-studio UI state is not saved in v1), so there is no `hydrate` and
 * `UIStore.toPersistedUIState()` does not know this store exists.
 *
 * ── Why the document is passed IN rather than held ─────────────────────────
 *
 * `stores/ui/**` never imports `stores/domain/**`. The brush document lives on
 * `BrushStore` (domain); this store holds only IDS into it, and the methods
 * that need the document (`adoptDocument`, `selectedFrameIn`, `selectedLayerIn`,
 * `channelTypeIn`) take it as an argument. Containers own the wiring — typically a `reaction` on
 * `brushes.document` that calls `adoptDocument`.
 *
 * ── Observable kinds ───────────────────────────────────────────────────────
 *
 * `selectedDelta`, `fillDelta` and `panOffset` are `observableRef` (MobX's
 * `observable.ref`): each is replaced WHOLESALE by its setter and never edited
 * in place, exactly like `LightingUIStore.selectedNormal` and
 * `ViewportUIStore.panOffset`. A consumer may therefore repaint on identity
 * alone. The rest are scalars.
 *
 * ── Two delta slots, like the colour picker's edge / fill ──────────────────
 *
 * `selectedDelta` is the EDGE slot (the name predates the split and every
 * consumer reads it, so it is kept); `fillDelta` is the FILL slot. `deltaTarget`
 * says which one the picker edits, `activeDelta` reads it, and the `*Active*`
 * setters write it — the same shape as `ToolUIStore.selectedColor` /
 * `fillColor` / `colorTarget` and `ApplicationStore.setActiveColor`, minus
 * everything the brush store does not have: no persistence, no `colorSink`,
 * and no history entry on swap (the delta is not undoable — MASTER-01 D17).
 * Unlike `ToolUIStore.fillColor`, `fillDelta` is NOT tri-state: it starts at
 * `[0,0,0,0]` and is always defined, so `swapDeltas` is a plain exchange.
 *
 * ── `zoom` / `panOffset` share NAMES with `ViewportUIStore`, not state ─────
 *
 * The pixel project's viewport is persisted per project and must not be
 * stomped by the brush studio, so the brush canvas gets its own camera here.
 * `zoom` is the pixel scale (screen px per brush cell), clamped 1..64;
 * `viewZoom` is the CSS `scale()` over the already-rendered bitmap (0.25–4,
 * tri-state `undefined` = never zoomed). The store `implements CanvasCamera`
 * so the pixel canvas's viewport hook can drive the brush canvas unchanged;
 * `setViewZoom` / `resetView` are copies of the `ViewportUIStore` /
 * `CanvasCameraStore` twins and must stay identical to them.
 */
import {
  action,
  computed,
  makeObservable,
  observable,
  observableRef,
} from "mobx";
import type {
  BrushChannelType,
  BrushDelta,
  BrushDocument,
  BrushFrame,
  BrushLayer,
} from "../../types";
import { clampDelta } from "../../types";
import type { CanvasCamera } from "./CanvasCameraStore";

export const BRUSH_ZOOM_MIN = 1;
export const BRUSH_ZOOM_MAX = 64;
export const BRUSH_ZOOM_DEFAULT = 16;

export type BrushDeltaIndex = 0 | 1 | 2 | 3;

/** Which delta slot the picker edits — the brush twin of `ColorTarget`. */
export type BrushDeltaTarget = "edge" | "fill";

const ZERO_DELTA: BrushDelta = [0, 0, 0, 0];

/** Every channel clamped; a fresh tuple (the caller's is never kept). */
function clampedCopy(delta: BrushDelta): BrushDelta {
  return [
    clampDelta(delta[0]),
    clampDelta(delta[1]),
    clampDelta(delta[2]),
    clampDelta(delta[3]),
  ];
}

/** The frame `selectedFrameId` names, else the document's first frame. */
function frameIn(
  doc: BrushDocument,
  frameId: string | null,
): BrushDocument["frames"][number] | null {
  return (
    doc.frames.find((f) => f.id === frameId) ??
    (doc.frames.length > 0 ? doc.frames[0] : null)
  );
}

export class BrushUIStore implements CanvasCamera {
  /** The frame the timeline / canvas show. `null` = no document or no frames. */
  selectedFrameId: string | null = null;
  /** The layer the tools paint into. `null` = no document or no layers. */
  selectedLayerId: string | null = null;
  /**
   * `observableRef` — the EDGE slot: the four signed deltas (−255..255) the
   * outline tools (pencil, line, a shape's outline) write. Replaced as a whole
   * tuple on every edit; never mutated in place. UI state, NOT undoable
   * (MASTER D17). The name predates the edge/fill split and is kept because
   * every consumer reads it.
   */
  selectedDelta: BrushDelta = ZERO_DELTA;
  /**
   * `observableRef` — the FILL slot: what the flood fills and a shape's
   * interior write. Same contract as `selectedDelta`. Always defined (no
   * tri-state — nothing is persisted, so there is no "absent from file").
   */
  fillDelta: BrushDelta = ZERO_DELTA;
  /**
   * Which slot the delta picker edits. Session-only, like
   * `ToolUIStore.colorTarget`.
   */
  deltaTarget: BrushDeltaTarget = "edge";
  /** Screen px per brush cell. Clamped 1..64 by its setters. */
  zoom: number = BRUSH_ZOOM_DEFAULT;
  /** `observableRef` — replaced wholesale on every pan tick. */
  panOffset: { x: number; y: number } = { x: 0, y: 0 };
  /**
   * The VIEW transform's scale — pinch/wheel zoom, distinct from `zoom`
   * (see `ViewportUIStore.viewZoom` for the two-zooms warning). Tri-state:
   * `undefined` = never zoomed; readers use `?? 1`.
   */
  viewZoom: number | undefined = undefined;
  /** The timeline's 200 ms play loop is running (the container owns the timer). */
  isPlaying = false;

  constructor() {
    makeObservable(this, {
      selectedFrameId: observable,
      selectedLayerId: observable,
      // Replaced wholesale, never mutated in place.
      selectedDelta: observableRef,
      fillDelta: observableRef,
      deltaTarget: observable,
      activeDelta: computed,
      zoom: observable,
      panOffset: observableRef,
      viewZoom: observable,
      isPlaying: observable,

      selectFrame: action,
      selectLayer: action,
      setDeltaChannel: action,
      setDelta: action,
      resetDelta: action,
      setFillDelta: action,
      setDeltaTarget: action,
      setActiveDelta: action,
      setActiveDeltaChannel: action,
      resetActiveDelta: action,
      swapDeltas: action,
      setZoom: action,
      zoomBy: action,
      setPanOffset: action,
      setViewZoom: action,
      resetView: action,
      setPlaying: action,
      togglePlaying: action,
      adoptDocument: action,
    });
  }

  /* ══ Selection ═══════════════════════════════════════════════════════════ */

  selectFrame(id: string | null): void {
    this.selectedFrameId = id;
  }

  selectLayer(id: string | null): void {
    this.selectedLayerId = id;
  }

  /**
   * Re-seat the selection against a document that was just installed or
   * replaced. Ids that still exist are kept; a stale frame id falls back to
   * `frames[0]`, a stale layer id to the TOP layer — the LAST element of
   * `frame.layers`, matching the project convention that the array end is
   * the top of the stack (`LayerStore`). `null` clears both.
   *
   * Layer ids are uniform across frames (MASTER D6), so the layer lookup is
   * done against the frame that ends up selected.
   *
   * Touches ONLY the two ids: the deltas and the camera survive a document
   * swap untouched (they are the user's tool settings, not the document's).
   */
  adoptDocument(doc: BrushDocument | null): void {
    if (doc === null) {
      this.selectedFrameId = null;
      this.selectedLayerId = null;
      return;
    }
    const frame = frameIn(doc, this.selectedFrameId);
    if (frame === null) {
      this.selectedFrameId = null;
      this.selectedLayerId = null;
      return;
    }
    this.selectedFrameId = frame.id;
    const keep = frame.layers.some((l) => l.id === this.selectedLayerId);
    if (!keep) {
      const top = frame.layers[frame.layers.length - 1];
      this.selectedLayerId = top ? top.id : null;
    }
  }

  /**
   * The frame the studio treats as "current" in `doc`: the one `selectedFrameId`
   * names, else `doc.frames[0]`, else `null` — the same fallback `adoptDocument`
   * and `selectedLayerIn` apply, exported so callers outside the brush studio
   * (the pixel studio's brush tool — docs/12-pixel-brush-tool task 05/06) do
   * not re-implement it. Returns the frame object from `doc` itself, not a copy.
   */
  selectedFrameIn(doc: BrushDocument | null): BrushFrame | null {
    return doc === null ? null : frameIn(doc, this.selectedFrameId);
  }

  /** The selected layer as it appears in `doc`, or `null`. */
  selectedLayerIn(doc: BrushDocument | null): BrushLayer | null {
    if (doc === null || this.selectedLayerId === null) return null;
    const frame = frameIn(doc, this.selectedFrameId);
    if (frame === null) return null;
    return frame.layers.find((l) => l.id === this.selectedLayerId) ?? null;
  }

  /**
   * Convenience for containers: the selected layer's channel type in `doc`,
   * or `null` when nothing is selected or the id is not in `doc`.
   */
  channelTypeIn(doc: BrushDocument | null): BrushChannelType | null {
    return this.selectedLayerIn(doc)?.channelType ?? null;
  }

  /* ══ Delta — edge slot (`selectedDelta`) ═════════════════════════════════ */

  /**
   * Replace ONE channel of the EDGE slot; the tuple is rebuilt so the ref
   * changes. Pre-split API, kept: it always writes `selectedDelta`, regardless
   * of `deltaTarget` — use `setActiveDeltaChannel` to follow the picker's tab.
   */
  setDeltaChannel(index: BrushDeltaIndex, value: number): void {
    const next: BrushDelta = [...this.selectedDelta];
    next[index] = clampDelta(value);
    this.selectedDelta = next;
  }

  /**
   * Replace the EDGE slot. Every channel is clamped; a fresh tuple is stored
   * (the arg is not kept). Always writes `selectedDelta`, regardless of
   * `deltaTarget` — use `setActiveDelta` to follow the picker's tab.
   */
  setDelta(delta: BrushDelta): void {
    this.selectedDelta = clampedCopy(delta);
  }

  /** Zero the EDGE slot (new reference). Ignores `deltaTarget`. */
  resetDelta(): void {
    this.selectedDelta = [0, 0, 0, 0];
  }

  /* ══ Delta — fill slot and the active-slot orchestration ═════════════════ */

  /** Replace the FILL slot; clamped, fresh tuple, arg not kept. */
  setFillDelta(delta: BrushDelta): void {
    this.fillDelta = clampedCopy(delta);
  }

  setDeltaTarget(target: BrushDeltaTarget): void {
    this.deltaTarget = target;
  }

  /** The slot `deltaTarget` names — what the picker shows and edits. */
  get activeDelta(): BrushDelta {
    return this.deltaTarget === "fill" ? this.fillDelta : this.selectedDelta;
  }

  /** Replace the ACTIVE slot (per `deltaTarget`); the other is untouched. */
  setActiveDelta(delta: BrushDelta): void {
    if (this.deltaTarget === "fill") this.setFillDelta(delta);
    else this.setDelta(delta);
  }

  /** Replace ONE channel of the ACTIVE slot; the tuple is rebuilt. */
  setActiveDeltaChannel(index: BrushDeltaIndex, value: number): void {
    const next: BrushDelta = [...this.activeDelta];
    next[index] = clampDelta(value);
    if (this.deltaTarget === "fill") this.fillDelta = next;
    else this.selectedDelta = next;
  }

  /** Zero the ACTIVE slot with a new reference. */
  resetActiveDelta(): void {
    if (this.deltaTarget === "fill") this.fillDelta = [0, 0, 0, 0];
    else this.selectedDelta = [0, 0, 0, 0];
  }

  /**
   * Exchange the EDGE and FILL slots — the brush twin of
   * `ToolUIStore.swapColors`, without its `undefined` handling (both slots are
   * always defined here) and without a history entry (not undoable, D17).
   * Both slots receive FRESH tuples so a consumer keyed on identity repaints.
   * `deltaTarget` is left alone: the picker stays on its tab and shows the
   * value that just arrived there, as the colour picker does.
   */
  swapDeltas(): void {
    const nextEdge: BrushDelta = [...this.fillDelta];
    const nextFill: BrushDelta = [...this.selectedDelta];
    this.selectedDelta = nextEdge;
    this.fillDelta = nextFill;
  }

  /* ══ Camera ══════════════════════════════════════════════════════════════ */

  /** Clamped 1..64. A non-finite value is ignored rather than stored as NaN. */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom)) return;
    this.zoom = Math.max(BRUSH_ZOOM_MIN, Math.min(BRUSH_ZOOM_MAX, zoom));
  }

  /** Multiply the current zoom by `factor`, then clamp. */
  zoomBy(factor: number): void {
    this.setZoom(this.zoom * factor);
  }

  setPanOffset(offset: { x: number; y: number }): void {
    this.panOffset = offset;
  }

  /**
   * Same clamp as `ViewportUIStore.setViewZoom` / `CanvasCameraStore.setViewZoom`
   * — the gesture engine's range `[floor, 4]`, `floor` being the caller's
   * measured zoom-out limit (`viewZoomFloor()`), defaulting to the legacy 0.25
   * because a store may not read the DOM. The three are twins and must stay
   * identical. A non-finite value is ignored, as `setZoom` does, so a bad
   * gesture frame can never park the view at NaN.
   */
  setViewZoom(zoom: number, floor: number = 0.25): void {
    if (!Number.isFinite(zoom)) return;
    this.viewZoom = Math.max(floor, Math.min(4, zoom));
  }

  /**
   * Back to 100% view zoom at the pan the caller computed (centring needs the
   * viewport's measured size). Resets the VIEW only — `zoom` (px per cell) is
   * the user's deliberate setting and is untouched, as in `ViewportUIStore`.
   */
  resetView(centeredPan: { x: number; y: number }): void {
    this.viewZoom = 1;
    this.panOffset = centeredPan;
  }

  /* ══ Playback ════════════════════════════════════════════════════════════ */

  setPlaying(on: boolean): void {
    this.isPlaying = on;
  }

  togglePlaying(): void {
    this.isPlaying = !this.isPlaying;
  }
}
