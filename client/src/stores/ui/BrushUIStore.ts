/**
 * BrushUIStore — brush-studio SESSION state (Brush Studio plan,
 * `docs/01-brush-studio`, task 10; MASTER D7 / D17).
 *
 * Which frame and layer are selected, the delta vector the tools will paint
 * (the brush studio's stand-in for the colour picker), the brush canvas's
 * zoom/pan, and the timeline's play flag. All of it is in-memory only: NONE of
 * these fields is persisted (MASTER §1 — brush-studio UI state is not saved
 * in v1), so there is no `hydrate` and `UIStore.toPersistedUIState()` does
 * not know this store exists.
 *
 * ── Why the document is passed IN rather than held ─────────────────────────
 *
 * `stores/ui/**` never imports `stores/domain/**`. The brush document lives on
 * `BrushStore` (domain); this store holds only IDS into it, and the two
 * methods that need the document (`adoptDocument`, `channelTypeIn`) take it
 * as an argument. Containers own the wiring — typically a `reaction` on
 * `brushes.document` that calls `adoptDocument`.
 *
 * ── Observable kinds ───────────────────────────────────────────────────────
 *
 * `selectedDelta` and `panOffset` are `observableRef` (MobX's `observable.ref`):
 * each is replaced WHOLESALE by its setter and never edited in place, exactly
 * like `LightingUIStore.selectedNormal` and `ViewportUIStore.panOffset`. A
 * consumer may therefore repaint on identity alone. The rest are scalars.
 *
 * ── `zoom` / `panOffset` share NAMES with `ViewportUIStore`, not state ─────
 *
 * The pixel project's viewport is persisted per project and must not be
 * stomped by the brush studio, so the brush canvas gets its own pair here.
 * `zoom` is the pixel scale (screen px per brush cell), clamped 1..64.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import type {
  BrushChannelType,
  BrushDelta,
  BrushDocument,
  BrushLayer,
} from "../../types";
import { clampDelta } from "../../types";

export const BRUSH_ZOOM_MIN = 1;
export const BRUSH_ZOOM_MAX = 64;
export const BRUSH_ZOOM_DEFAULT = 16;

export type BrushDeltaIndex = 0 | 1 | 2 | 3;

const ZERO_DELTA: BrushDelta = [0, 0, 0, 0];

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

export class BrushUIStore {
  /** The frame the timeline / canvas show. `null` = no document or no frames. */
  selectedFrameId: string | null = null;
  /** The layer the tools paint into. `null` = no document or no layers. */
  selectedLayerId: string | null = null;
  /**
   * `observableRef` — the four signed deltas (−255..255) the tools will
   * write. Replaced as a whole tuple on every edit; never mutated in place.
   * UI state, NOT undoable (MASTER D17).
   */
  selectedDelta: BrushDelta = ZERO_DELTA;
  /** Screen px per brush cell. Clamped 1..64 by its setters. */
  zoom: number = BRUSH_ZOOM_DEFAULT;
  /** `observableRef` — replaced wholesale on every pan tick. */
  panOffset: { x: number; y: number } = { x: 0, y: 0 };
  /** The timeline's 200 ms play loop is running (the container owns the timer). */
  isPlaying = false;

  constructor() {
    makeObservable(this, {
      selectedFrameId: observable,
      selectedLayerId: observable,
      // Replaced wholesale, never mutated in place.
      selectedDelta: observableRef,
      zoom: observable,
      panOffset: observableRef,
      isPlaying: observable,

      selectFrame: action,
      selectLayer: action,
      setDeltaChannel: action,
      setDelta: action,
      resetDelta: action,
      setZoom: action,
      zoomBy: action,
      setPanOffset: action,
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

  /* ══ Delta ═══════════════════════════════════════════════════════════════ */

  /** Replace ONE channel; the tuple is rebuilt so the ref changes. */
  setDeltaChannel(index: BrushDeltaIndex, value: number): void {
    const next: BrushDelta = [...this.selectedDelta];
    next[index] = clampDelta(value);
    this.selectedDelta = next;
  }

  /** Every channel is clamped; a fresh tuple is stored (the arg is not kept). */
  setDelta(delta: BrushDelta): void {
    this.selectedDelta = [
      clampDelta(delta[0]),
      clampDelta(delta[1]),
      clampDelta(delta[2]),
      clampDelta(delta[3]),
    ];
  }

  resetDelta(): void {
    this.selectedDelta = [0, 0, 0, 0];
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

  /* ══ Playback ════════════════════════════════════════════════════════════ */

  setPlaying(on: boolean): void {
    this.isPlaying = on;
  }

  togglePlaying(): void {
    this.isPlaying = !this.isPlaying;
  }
}
