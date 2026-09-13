/**
 * BrushLibrary story fixtures (Brush Studio plan, task 13). Pure data and a
 * synthetic `draw` closure — no store, no brush document.
 *
 * The thumbnail contract is `ThumbnailCanvas`'s: the caller paints. In the
 * app the container binds `renderBrushFrame` over the loaded document; here
 * a deterministic painter stands in so the story shows a real thumbnail.
 */

export const TYPICAL_BRUSH_NAMES: ReadonlyArray<string> = [
  "Dither 4x4",
  "Grass Tuft",
  "Soft Round",
];

export const MANY_BRUSH_NAMES: ReadonlyArray<string> = [
  ...TYPICAL_BRUSH_NAMES,
  ...Array.from(
    { length: 14 },
    (_, i) => `Heavy foliage scatter brush revision ${i + 1}`,
  ),
];

/**
 * Paints a "soft round" brush the way the brush canvas would: a checker
 * ground, then a disc of mid-grey (delta 0 renders as 127 — MASTER D5)
 * fading to darker grey at the rim. Deterministic, no randomness.
 */
export function drawStoryBrushThumbnail(
  ctx: CanvasRenderingContext2D,
  size: number,
): void {
  const cell = Math.max(1, Math.floor(size / 8));
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const even = ((x / cell + y / cell) & 1) === 0;
      ctx.fillStyle = even ? "#2a2a33" : "#1e1e26";
      ctx.fillRect(x, y, cell, cell);
    }
  }
  const px = Math.max(1, Math.floor(size / 16));
  const half = size / 2;
  const radius = half * 0.85;
  for (let y = 0; y < size; y += px) {
    for (let x = 0; x < size; x += px) {
      const dx = x + px / 2 - half;
      const dy = y + px / 2 - half;
      const d = Math.sqrt(dx * dx + dy * dy) / radius;
      if (d > 1) continue;
      const grey = Math.round(127 - d * 64);
      ctx.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
      ctx.fillRect(x, y, px, px);
    }
  }
}
