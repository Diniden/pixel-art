/**
 * BrushList story fixtures (multi-brush plan, task 03). Pure data and
 * synthetic `draw` closures — no store, no brush document.
 *
 * The thumbnail contract is `ThumbnailCanvas`'s: the caller paints. In the
 * app the container binds `renderBrushFrame` over each brush; here a
 * deterministic painter (a coloured square on a checker ground) stands in so
 * the stories show a real thumbnail per row.
 */
import type { BrushListRowModel } from "./BrushListRow";

/** Paints a checker ground and a centred square of `color`. Deterministic. */
export function makeSquareDraw(
  color: string,
): (ctx: CanvasRenderingContext2D, size: number) => void {
  return (ctx, size) => {
    const cell = Math.max(1, Math.floor(size / 8));
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const even = ((x / cell + y / cell) & 1) === 0;
        ctx.fillStyle = even ? "#2a2a33" : "#1e1e26";
        ctx.fillRect(x, y, cell, cell);
      }
    }
    const inset = Math.floor(size / 5);
    ctx.fillStyle = color;
    ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2);
  };
}

/** Three brushes of three sizes, each with its own coloured thumbnail. */
export const TYPICAL_BRUSHES: BrushListRowModel[] = [
  {
    id: "brush-1",
    name: "Soft Round",
    width: 16,
    height: 16,
    draw: makeSquareDraw("#8ab4f8"),
  },
  {
    id: "brush-2",
    name: "Grass Tuft",
    width: 8,
    height: 12,
    draw: makeSquareDraw("#7bd88f"),
  },
  {
    id: "brush-3",
    name: "Dither 4x4",
    width: 4,
    height: 4,
    draw: makeSquareDraw("#f5c26b"),
  },
];

const MANY_COLORS = [
  "#8ab4f8",
  "#7bd88f",
  "#f5c26b",
  "#ef8a8a",
  "#c792ea",
  "#89ddff",
];

/** Twelve brushes — the densest the rail gets. */
export const MANY_BRUSHES: BrushListRowModel[] = Array.from(
  { length: 12 },
  (_, i) => ({
    id: `brush-${i + 1}`,
    name: `Brush ${i + 1}`,
    width: 4 * (i + 1),
    height: 4 * (i + 1),
    draw: makeSquareDraw(MANY_COLORS[i % MANY_COLORS.length]),
  }),
);

/** One brush with a name long enough to ellipsise at rail width. */
export const LONG_NAME_BRUSH: BrushListRowModel = {
  id: "brush-long",
  name: "Heavy foliage scatter brush with a very long descriptive name",
  width: 64,
  height: 64,
  draw: makeSquareDraw("#c792ea"),
};
