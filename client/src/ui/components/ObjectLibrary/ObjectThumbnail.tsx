/**
 * ObjectThumbnail — one object's preview canvas (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ DO NOT REINTRODUCE A COMPARATOR HERE. READ THIS FIRST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This component used to carry a **79-line hand-written `React.memo`
 * comparator** that threaded `project` internals. W20 found it was **dead
 * code that was hiding a live bug**: its variant-frame branch iterated
 * `prev.variantGroups`, the OBJECT-level list which the v1.1.0 migration sets
 * to `undefined` on load. The loop never ran, so a variant-frame change never
 * invalidated a changed object's thumbnail — the stale-thumbnail regression
 * this component is prone to.
 *
 * W20 removed it and replaced it with direct props. **That decision stands.**
 * A comparator over the project tree must not come back: `project` is
 * replaced by reference on every pixel edit (measured, W19), so any
 * comparator keyed on it either re-runs constantly or reaches for a sub-field
 * that stopped existing. 5 DOM tests in `ObjectLibraryThumbnails.dom.test.tsx`
 * pin this, and they are probe-verified — reintroducing the broken comparator
 * fails 2 of them.
 *
 * ── Why the painting is a `draw` prop ─────────────────────────────────────
 *
 * `renderFramePreview` walks `frame.layers[].pixels` — on the owner's real
 * project part of a 300,249-cell grid (R2). It may not run under `ui/`. The
 * container binds it and passes `draw`; `revision` says when to repaint.
 * That is the same contract `TimelineCell` uses, and it is what allows the
 * stories next door to paint real thumbnails with no store at all.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: the `ThumbnailCanvas` primitive and the parent's stylesheet. No
 * store, no MobX, no API, no domain type — the `PixelObject` that used to be
 * a prop is gone.
 */
import { ThumbnailCanvas } from "../../primitives/ThumbnailCanvas/ThumbnailCanvas";
import "./ObjectLibrary.css";

/** Thumbnail edge in px, verbatim from the pre-split `THUMB_SIZE`. */
export const OBJECT_THUMB_SIZE = 32;

export interface ObjectThumbnailProps {
  /** Paints the preview. Bound by the container — never a pixel grid. */
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
  /** Changes exactly when this thumbnail's content changes. */
  revision: number;
  /** Accessible name, e.g. the object's name. */
  label?: string;
}

export function ObjectThumbnail({
  draw,
  revision,
  label,
}: ObjectThumbnailProps) {
  return (
    <ThumbnailCanvas
      size={OBJECT_THUMB_SIZE}
      revision={revision}
      draw={draw}
      label={label}
      className="object-library__thumb-canvas"
    />
  );
}
