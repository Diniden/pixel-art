/**
 * The flat view-models the timeline grid is built from (REFRESH task 35).
 *
 * These are the projection boundary. `TimelineViewContainer` derives them
 * from `obj.frames`; nothing under `ui/components/TimelineView/` ever sees a
 * `Frame`, a `Layer` or a `VariantGroup`.
 *
 * ⚠️ That matters more here than almost anywhere else in the app. The grid is
 * `frames × maxLayers` cells — 360 on a normal project — and the pre-split
 * component held `project`, `obj`, and a `Layer` reference per thumbnail. A
 * `Layer` carries `pixels`, part of a 300,249-cell grid on the owner's real
 * project (R2), so the old shape put a pixel grid on the diffing path of
 * every cell. Thumbnails now cross as a `draw` CALLBACK plus a revision
 * number instead — see `TimelineCell`.
 */

/** One occupied grid position. */
export interface TimelineCellData {
  frameId: string;
  /** Column index — the frame's position in `obj.frames`. */
  frameIndex: number;
  layerId: string;
  layerName: string;
  /** z-order position in the STORED array (0 = bottom). */
  rowIndex: number;
  isVariant: boolean;
  /** Dot colour assigned to this layer NAME (stable across frames). */
  color: string;
}

/** One entry in the layer-name column to the left of the grid. */
export interface TimelineLayerHeader {
  name: string;
  /** Preferred display row; collisions are resolved by `TimelineGrid`. */
  firstDisplayRow: number;
  /** Max row this layer occupies across all frames. */
  typicalRow: number;
  color: string;
}

/** The cell the user has selected, if it holds a layer. */
export interface TimelineSelectedCell {
  frameId: string;
  layerId: string;
}

/** The cell the user has selected, if it is an empty position. */
export interface TimelineEmptyCellSelection {
  frameId: string;
  /** z-order position in the STORED array (0 = bottom). */
  rowIndex: number;
}
