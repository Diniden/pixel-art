/**
 * Row view-models and a synthetic painter for the ObjectLibrary stories
 * (REFRESH task 35).
 *
 * ⚠️ `ObjectRowModel` has no `frames` field, so there is no pixel data here
 * at all — and the stories still render real thumbnails, because painting
 * arrives as a `draw` closure. That is the clearest demonstration in this
 * wave of what the projection bought: the visual output is unchanged and the
 * 300,249-cell grid (R2) never crosses the boundary.
 *
 * Rows are derived from `src/fixtures`' shared projects where the shape
 * allows, per task 10's rule that stories and Vitest describe the same data.
 */
import { projectTypical, projectDense } from "../../../fixtures";
import type { ObjectRowModel } from "./ObjectLibrary";

/** Projects a fixture project's objects the way the container does. */
function rowsFrom(objects: typeof projectTypical.objects): ObjectRowModel[] {
  return objects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    width: obj.gridSize.width,
    height: obj.gridSize.height,
    frameCount: obj.frames.length,
  }));
}

/** `projectTypical`'s two objects: a 4-frame hero and a 2-frame prop. */
export const TYPICAL_OBJECTS: ObjectRowModel[] = rowsFrom(
  projectTypical.objects,
);

/** `projectDense`'s 12 objects — the scroll and grid-wrap case. */
export const DENSE_OBJECTS: ObjectRowModel[] = rowsFrom(projectDense.objects);

/**
 * Edge: names long enough to truncate, an extreme aspect ratio, a 256x256
 * grid, and a 1x1 grid. Together these are the layout cases the row has:
 * the name row overflowing, and the metrics line running long.
 */
export const AWKWARD_OBJECTS: ObjectRowModel[] = [
  {
    id: "obj-long",
    name: "Protagonist — idle / walk / run cycle sheet (working draft v3)",
    width: 256,
    height: 256,
    frameCount: 144,
  },
  {
    id: "obj-wide",
    name: "Parallax background strip",
    width: 512,
    height: 16,
    frameCount: 1,
  },
  { id: "obj-tiny", name: "Pip", width: 1, height: 1, frameCount: 1 },
];

/**
 * A synthetic painter, standing in for the container's bound
 * `renderFramePreview`. Hashes the object id to a hue so each row is
 * visually distinct and STABLE across reloads.
 */
export function makeStoryThumbnailDraw(objectId: string) {
  let hash = 0;
  for (let i = 0; i < objectId.length; i++) {
    hash = (hash * 31 + objectId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;

  return (ctx: CanvasRenderingContext2D, size: number) => {
    ctx.clearRect(0, 0, size, size);
    const r = size / 2 - 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2;
        const dy = y - size / 2;
        if (dx * dx + dy * dy > r * r) continue;
        const t = (x + y) / (size * 2);
        ctx.fillStyle = `hsl(${hue}, 65%, ${Math.round(35 + t * 40)}%)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };
}
