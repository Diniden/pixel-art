/**
 * The object-library thumbnail paint factory (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS IS WHERE THE STALE-THUMBNAIL REGRESSION LIVES. READ FIRST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ObjectThumbnail` used to carry a **79-line hand-written `React.memo`
 * comparator** threading `project` internals, and W20 found it was dead code
 * hiding a live bug: its variant-frame branch iterated `prev.variantGroups` —
 * the OBJECT-level list the v1.1.0 migration sets to `undefined` on load — so
 * the loop never ran and a variant-frame change never invalidated a changed
 * object's thumbnail.
 *
 * **Do not reintroduce a comparator over the project tree.** `project` is
 * replaced by reference on every pixel edit (measured, W19). Invalidation is
 * `ThumbnailCanvas`'s `revision` prop, fed from `domain.pixelVersion`.
 *
 * ── Why this is a MODULE, not an inline closure ───────────────────────────
 *
 * `renderFramePreview` walks `frame.layers[].pixels` (R2), so it may not run
 * under `ui/`. Extracting the decision here also keeps it directly testable
 * with no store, no provider and no React — which is what
 * `ObjectLibraryThumbnails.dom.test.tsx` asserts against.
 *
 * ── The LIVE-vs-STATIC rule, verbatim from before task 28 ─────────────────
 *
 * Only the SELECTED object, on its selected FIRST frame, follows the live
 * `variantFrameIndices`. Every other object gets `{[vg.id]: 0}` — the static
 * index-0 pose. Without that, scrubbing a variant frame would animate every
 * thumbnail in the library at once.
 *
 * ⚠️ When `variants` is undefined AND the object is not the selected one,
 * `variantFrameIndices` is left `undefined` rather than `{}`. That asymmetry
 * is preserved deliberately: `renderFramePreview` treats the two differently.
 */
import { renderFramePreview } from "../../utils/previewRenderer";
import type { PixelObject, VariantGroup } from "../../types";

export interface ObjectThumbnailDrawOptions {
  objectId: string;
  objects: PixelObject[];
  /** `DomainStore.variants` — project-level, never `obj.variantGroups`. */
  variants: VariantGroup[] | undefined;
  /** `TimelineUIStore.variantFrameIndices`. */
  variantFrameIndices: { [key: string]: number } | undefined;
  selectedObjectId: string | null;
  selectedFrameId: string | null;
}

/**
 * Builds the `draw(ctx, size)` closure for one object's thumbnail.
 *
 * The closure is rebuilt on every render and that is free by design:
 * `ThumbnailCanvas` ignores `draw`'s identity and repaints only when its
 * `revision` changes.
 */
export function makeObjectThumbnailDraw({
  objectId,
  objects,
  variants,
  variantFrameIndices,
  selectedObjectId,
  selectedFrameId,
}: ObjectThumbnailDrawOptions): (
  ctx: CanvasRenderingContext2D,
  size: number,
) => void {
  return (ctx, size) => {
    const obj = objects.find((o) => o.id === objectId);
    if (!obj || obj.frames.length === 0) return;

    const frame = obj.frames[0];
    const isSelected = selectedObjectId === obj.id;
    const isFirstFrameSelected = isSelected && selectedFrameId === frame.id;

    // See the header: only the selected object on its selected first frame
    // follows the live indices.
    let indices: { [key: string]: number } | undefined;
    if (isSelected && isFirstFrameSelected) {
      indices = variantFrameIndices;
    } else if (variants) {
      indices = {};
      for (const vg of variants) indices[vg.id] = 0;
    }

    renderFramePreview(ctx, {
      thumbSize: size,
      gridWidth: obj.gridSize.width,
      gridHeight: obj.gridSize.height,
      frame,
      variants,
      variantFrameIndices: indices,
    });
  };
}
