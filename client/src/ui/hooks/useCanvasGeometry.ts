/**
 * Variant-aware view geometry for the pixel canvas.
 *
 * ## What this replaces
 *
 * `Canvas.tsx:151-285` — concern #2 of the original eleven. 135 lines that
 * derived, from four inputs, every number the renderer, the coordinate mapper
 * and the offscreen caches needed. It was tangled into the component only
 * because it read `getCurrentObject()` / `getCurrentVariant()` inline; given
 * those as plain values it is a pure derivation.
 *
 * ## The one rule the whole file exists to express
 *
 * There are TWO grid sizes and they are not interchangeable:
 *
 *   - the OBJECT's grid (`objWidth`/`objHeight`) — what the sprite is;
 *   - the EDITABLE grid (`gridWidth`/`gridHeight`) — what the pointer writes
 *     into, which becomes the VARIANT's grid while a variant is being edited.
 *
 * And while editing a variant the visible area is neither: it is the UNION of
 * the object's bounds and the offset variant's bounds, so a variant that hangs
 * off the left edge (`variantOffset.x < 0`) is still visible and still
 * editable rather than being clipped away. That union is `viewMin*`/`viewMax*`,
 * and it is why `canvasWidth` is `viewWidth * zoom` in variant-edit mode and
 * `gridWidth * zoom` otherwise.
 *
 * ## `variantOffsetKey` is not decoration
 *
 * React compares dependencies with `Object.is`. `variantOffset` is rebuilt on
 * every store read, so a dependency array containing it invalidates every
 * render; one containing `variantOffset.x` and `.y` separately is correct but
 * unreadable at five call sites. The `"x,y"` string is the stable scalar the
 * original used, preserved verbatim.
 *
 * ## `bgCacheKey` likewise
 *
 * The checkerboard and the grid lines are painted once into offscreen canvases
 * and blitted thereafter; this key is the identity of that cached image. It
 * deliberately includes `lightGridMode` (`"l"`/`"d"`), because the two themes
 * are different pixels, and deliberately excludes pan — panning does not
 * change the cached image, only where it lands.
 *
 * ## Purity
 *
 * No store, no MobX, no API. Everything arrives as a plain value. The hook is
 * a `useMemo` over scalars, so it is also safe to call from a story with
 * literal numbers.
 */

import { useMemo, useRef } from "react";
import type { CanvasViewGeometry } from "../canvas/model/coords";
import type { BackgroundGeometry } from "../canvas/render/canvasBackground";

/** A grid-space offset. Structural — `ui/` does not import the domain `Point`. */
export interface GeometryOffset {
  x: number;
  y: number;
}

export interface UseCanvasGeometryOptions {
  /** The object's own grid size. Defaults to 32x32 when there is no object. */
  objWidth: number;
  objHeight: number;
  /**
   * The EDITABLE grid size — the variant's size while a variant is being
   * edited, the object's otherwise. The caller resolves this because the
   * choice depends on store computeds.
   */
  gridWidth: number;
  gridHeight: number;
  /** True only when a variant is being edited AND its data resolved. */
  editingVariant: boolean;
  /** Where the edited variant sits in object space. `{0,0}` when not editing. */
  variantOffset: GeometryOffset;
  zoom: number;
  /** Selects the light/dark checkerboard theme; part of the cache identity. */
  lightGridMode: boolean;
}

export interface CanvasGeometry {
  /* — the view union, in world cells — */
  viewMinX: number;
  viewMinY: number;
  viewMaxX: number;
  viewMaxY: number;
  viewWidth: number;
  viewHeight: number;

  /* — the <canvas> element's pixel size — */
  canvasWidth: number;
  canvasHeight: number;

  /* — cache identities — */
  /** Stable scalar for `variantOffset`; safe in a dependency array. */
  variantOffsetKey: string;
  /** Identity of the cached checkerboard/grid image. */
  bgCacheKey: string;

  /* — geometry objects the pure modules consume — */
  /** Input to `screenToPixel` in `ui/canvas/model/coords`. */
  coordGeom: CanvasViewGeometry;
  /** Input to `paintCheckerboard`/`strokeGrid` in `ui/canvas/render`. */
  bgGeom: BackgroundGeometry;

  /**
   * A ref holding the CURRENT `coordGeom`, updated every render.
   *
   * ⚠️ Load-bearing, and preserved verbatim from `Canvas.tsx:286-287`. The
   * pointer handlers must map screen→grid with the geometry as it is AT THE
   * MOMENT OF THE EVENT, not as it was when the handler was memoised. Reading
   * through this ref is what lets `getPixelCoords` be a `useCallback` with an
   * EMPTY dependency array — which in turn is what stops every mousemove
   * handler being rebuilt on every render mid-drag.
   */
  coordGeomRef: React.MutableRefObject<CanvasViewGeometry>;
  /** Same rationale as `coordGeomRef`, for the background painters. */
  bgGeomRef: React.MutableRefObject<BackgroundGeometry>;
}

export function useCanvasGeometry({
  objWidth,
  objHeight,
  gridWidth,
  gridHeight,
  editingVariant,
  variantOffset,
  zoom,
  lightGridMode,
}: UseCanvasGeometryOptions): CanvasGeometry {
  // Scalarised before the memo so the dependency list holds only primitives —
  // `variantOffset` itself is a fresh object on every store read.
  const offsetX = variantOffset.x;
  const offsetY = variantOffset.y;

  const derived = useMemo(() => {
    // The view union. Outside variant-edit mode it collapses to the object's
    // own bounds, which is why every consumer can use `view*` unconditionally.
    const viewMinX = editingVariant ? Math.min(0, offsetX) : 0;
    const viewMinY = editingVariant ? Math.min(0, offsetY) : 0;
    const viewMaxX = editingVariant
      ? Math.max(objWidth, offsetX + gridWidth)
      : objWidth;
    const viewMaxY = editingVariant
      ? Math.max(objHeight, offsetY + gridHeight)
      : objHeight;
    const viewWidth = viewMaxX - viewMinX;
    const viewHeight = viewMaxY - viewMinY;

    const canvasWidth = editingVariant ? viewWidth * zoom : gridWidth * zoom;
    const canvasHeight = editingVariant ? viewHeight * zoom : gridHeight * zoom;

    const variantOffsetKey = `${offsetX},${offsetY}`;

    // Verbatim from `Canvas.tsx:268-270`, including the two distinct shapes —
    // the variant-edit key carries the view origin because a variant dragged
    // left changes which cells the checkerboard covers.
    const bgCacheKey = editingVariant
      ? `view-${viewWidth}-${viewHeight}-${viewMinX}-${viewMinY}-${zoom}-${
          lightGridMode ? "l" : "d"
        }`
      : `${gridWidth}-${gridHeight}-${zoom}-${lightGridMode ? "l" : "d"}`;

    const coordGeom: CanvasViewGeometry = {
      gridWidth,
      gridHeight,
      objWidth,
      objHeight,
      editingVariant,
      variantOffset: { x: offsetX, y: offsetY },
      viewMinX,
      viewMinY,
      viewWidth,
      viewHeight,
    };

    const bgGeom: BackgroundGeometry = {
      canvasWidth,
      canvasHeight,
      cellsX: editingVariant ? viewWidth : gridWidth,
      cellsY: editingVariant ? viewHeight : gridHeight,
      offsetX: editingVariant ? viewMinX : 0,
      offsetY: editingVariant ? viewMinY : 0,
      zoom,
    };

    return {
      viewMinX,
      viewMinY,
      viewMaxX,
      viewMaxY,
      viewWidth,
      viewHeight,
      canvasWidth,
      canvasHeight,
      variantOffsetKey,
      bgCacheKey,
      coordGeom,
      bgGeom,
    };
  }, [
    objWidth,
    objHeight,
    gridWidth,
    gridHeight,
    editingVariant,
    offsetX,
    offsetY,
    zoom,
    lightGridMode,
  ]);

  const coordGeomRef = useRef(derived.coordGeom);
  const bgGeomRef = useRef(derived.bgGeom);
  // Deliberate render-phase writes; see `coordGeomRef`'s doc comment. This is
  // `Canvas.tsx:287` and `:336` moved, not new behaviour.
  // eslint-disable-next-line react-hooks/refs
  coordGeomRef.current = derived.coordGeom;
  // eslint-disable-next-line react-hooks/refs
  bgGeomRef.current = derived.bgGeom;

  return { ...derived, coordGeomRef, bgGeomRef };
}
