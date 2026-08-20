/**
 * Grid view-models for the TimelineView stories (REFRESH task 35).
 *
 * Built from `projectTypical`'s hero object where the shape allows, so the
 * stories and Vitest describe the same data (task 10's rule).
 *
 * ⚠️ Note what is NOT here: no `Frame`, no `Layer`, no pixel anywhere. The
 * whole point of `timelineTypes.ts` is that the grid is ids, names, colours
 * and booleans. A story fixture that needed a pixel grid to render a timeline
 * would be evidence the projection was drawn in the wrong place.
 */
import { projectTypical } from "../../../fixtures";
import type { TimelineCellData, TimelineLayerHeader } from "./timelineTypes";

/** Stable hues, so a story never depends on the container's hue search. */
const COLORS = [
  "hsl(200, 70%, 55%)",
  "hsl(320, 70%, 55%)",
  "hsl(80, 70%, 55%)",
  "hsl(30, 70%, 55%)",
  "hsl(260, 70%, 55%)",
];

/**
 * Projects the hero object the way `TimelineViewContainer` does: rows are
 * z-order positions counted DOWN from `maxLayers - 1`, columns are frames.
 */
function buildTypical(): {
  grid: (TimelineCellData | null)[][];
  frameIds: string[];
  maxLayers: number;
  layerHeaders: TimelineLayerHeader[];
} {
  const hero = projectTypical.objects[0];
  const frames = hero.frames;
  const maxLayers = Math.max(...frames.map((f) => f.layers.length), 1);

  const colorFor = new Map<string, string>();
  let next = 0;
  for (const frame of frames) {
    for (const layer of frame.layers) {
      if (!colorFor.has(layer.name)) {
        colorFor.set(layer.name, COLORS[next % COLORS.length]);
        next++;
      }
    }
  }

  const grid: (TimelineCellData | null)[][] = [];
  for (let row = maxLayers - 1; row >= 0; row--) {
    grid.push(
      frames.map((frame, frameIndex) => {
        const layer = frame.layers[row];
        if (!layer) return null;
        return {
          frameId: frame.id,
          frameIndex,
          layerId: layer.id,
          layerName: layer.name,
          rowIndex: row,
          isVariant: layer.isVariant || false,
          color: colorFor.get(layer.name) ?? "gray",
        };
      }),
    );
  }

  const seen = new Set<string>();
  const layerHeaders: TimelineLayerHeader[] = [];
  frames.forEach((frame) => {
    frame.layers.forEach((layer, zOrder) => {
      if (seen.has(layer.name)) return;
      seen.add(layer.name);
      layerHeaders.push({
        name: layer.name,
        firstDisplayRow: maxLayers - 1 - zOrder,
        typicalRow: zOrder,
        color: colorFor.get(layer.name) ?? "gray",
      });
    });
  });
  layerHeaders.sort((a, b) => a.firstDisplayRow - b.firstDisplayRow);

  return {
    grid,
    frameIds: frames.map((f) => f.id),
    maxLayers,
    layerHeaders,
  };
}

export const TYPICAL = buildTypical();

/** Zero frames and zero layers — the empty-object state. */
export const EMPTY = {
  grid: [] as (TimelineCellData | null)[][],
  frameIds: [] as string[],
  maxLayers: 1,
  layerHeaders: [] as TimelineLayerHeader[],
};

/**
 * The edge case the task names by number: a **360-cell** grid — 30 frames ×
 * 12 rows — with holes. This is the scale at which "one `observer` over the
 * whole grid" becomes the performance bug the per-cell containers exist to
 * prevent, so it is the story that should be looked at when judging whether
 * the split achieved anything.
 *
 * Every third position is left empty so the empty-cell path is exercised at
 * scale too, and the row-striping alternation stays visible across 12 rows.
 */
function buildDense(): {
  grid: (TimelineCellData | null)[][];
  frameIds: string[];
  maxLayers: number;
  layerHeaders: TimelineLayerHeader[];
} {
  const FRAMES = 30;
  const ROWS = 12;
  const frameIds = Array.from({ length: FRAMES }, (_, i) => `frame-${i}`);
  const names = Array.from({ length: ROWS }, (_, r) => `Layer ${r + 1}`);

  const grid: (TimelineCellData | null)[][] = [];
  for (let row = ROWS - 1; row >= 0; row--) {
    grid.push(
      frameIds.map((frameId, frameIndex) => {
        // Punch holes so the empty-cell path is exercised at scale.
        if ((frameIndex + row) % 3 === 0) return null;
        return {
          frameId,
          frameIndex,
          layerId: `${frameId}-layer-${row}`,
          layerName: names[row],
          rowIndex: row,
          isVariant: row === 4,
          color: COLORS[row % COLORS.length],
        };
      }),
    );
  }

  return {
    grid,
    frameIds,
    maxLayers: ROWS,
    layerHeaders: names.map((name, r) => ({
      name,
      firstDisplayRow: ROWS - 1 - r,
      typicalRow: r,
      color: COLORS[r % COLORS.length],
    })),
  };
}

export const DENSE = buildDense();

/**
 * Edge: two layer headers that WANT the same display row. The packing loop in
 * `TimelineGrid` has to push the second one outward (below first, then
 * above), and this is the only story that exercises that branch.
 */
export const COLLIDING_HEADERS: TimelineLayerHeader[] = [
  { name: "Base", firstDisplayRow: 1, typicalRow: 1, color: COLORS[0] },
  { name: "Shadow", firstDisplayRow: 1, typicalRow: 1, color: COLORS[1] },
  { name: "Highlight", firstDisplayRow: 1, typicalRow: 1, color: COLORS[2] },
];
