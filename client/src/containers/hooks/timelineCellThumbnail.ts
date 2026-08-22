/**
 * Timeline-cell thumbnail painting (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS IS THE CODE THAT MAY NOT CROSS INTO `ui/`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * These two functions walk `layer.pixels` — on the owner's real project, part
 * of a 300,249-cell grid (R2). The pre-split `CellThumbnail` did this walk
 * inside the component, which meant every one of a 360-cell timeline's cells
 * held a `Layer` reference and a `VariantGroup[]`.
 *
 * They live on the container side now and reach `ui/` only as a bound
 * `draw(ctx, size)` closure, which is precisely the contract the
 * `ThumbnailCanvas` primitive was designed around.
 *
 * Both functions are copied verbatim from `TimelineView.tsx`'s
 * `renderThumbnail` and the variant branch of `CellThumbnail`'s effect,
 * including two details worth naming because they look like bugs and are not:
 *
 *  - the **regular** path scales by `thumbSize / max(w, h)` — a SINGLE axis
 *    divisor, so a non-square grid overflows its box rather than fitting it.
 *    `renderFramePreview` (used by the object library) uses `Math.min` of the
 *    two ratios instead. The two disagree; this task preserves the timeline's
 *    behaviour rather than unifying them.
 *  - the **variant** path indexes `variant.frames[frameIndex % length]`, so a
 *    variant with fewer frames than the object WRAPS rather than clamping.
 */
import type { Layer, PixelData, VariantGroup } from "../../types";

/** Renders a layer's pixels to a small thumbnail canvas. */
export function renderLayerThumbnail(
  ctx: CanvasRenderingContext2D,
  thumbSize: number,
  pixels: PixelData[][],
  gridWidth: number,
  gridHeight: number,
): void {
  // ⚠️ Single-axis divisor — see the header.
  const scale = thumbSize / Math.max(gridWidth, gridHeight);

  ctx.clearRect(0, 0, thumbSize, thumbSize);

  // Center the content
  const offsetX = (thumbSize - gridWidth * scale) / 2;
  const offsetY = (thumbSize - gridHeight * scale) / 2;

  for (let y = 0; y < pixels.length && y < gridHeight; y++) {
    const row = pixels[y];
    if (!row) continue;
    for (let x = 0; x < row.length && x < gridWidth; x++) {
      const pixelData = row[x];
      if (!pixelData || pixelData.color === 0) continue;
      const color = pixelData.color;
      if (color.a === 0) continue;
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
      ctx.fillRect(
        Math.floor(offsetX + x * scale),
        Math.floor(offsetY + y * scale),
        Math.ceil(scale) || 1,
        Math.ceil(scale) || 1,
      );
    }
  }
}

/**
 * Paints one timeline cell: the variant-frame composite for a variant layer,
 * otherwise the layer's own pixels.
 *
 * Returns a closure suitable for `ThumbnailCanvas`'s `draw` prop.
 */
export function makeCellThumbnailDraw(
  layer: Layer,
  gridSize: { width: number; height: number },
  variants: VariantGroup[] | undefined,
  frameIndex: number,
): (ctx: CanvasRenderingContext2D, size: number) => void {
  return (ctx, thumbSize) => {
    // Handle variant layers
    if (layer.isVariant && layer.variantGroupId && variants) {
      const variantGroup = variants.find(
        (vg) => vg.id === layer.variantGroupId,
      );
      const variant = variantGroup?.variants.find(
        (v) => v.id === layer.selectedVariantId,
      );

      if (variant && variant.frames.length > 0) {
        // ⚠️ WRAPS rather than clamping — see the header.
        const variantFrame = variant.frames[frameIndex % variant.frames.length];

        const scale =
          thumbSize / Math.max(variant.gridSize.width, variant.gridSize.height);
        const offsetX = (thumbSize - variant.gridSize.width * scale) / 2;
        const offsetY = (thumbSize - variant.gridSize.height * scale) / 2;

        ctx.clearRect(0, 0, thumbSize, thumbSize);

        // Render each visible layer in the variant frame
        for (const vLayer of variantFrame.layers) {
          if (!vLayer.visible || !vLayer.pixels) continue;

          for (
            let y = 0;
            y < vLayer.pixels.length && y < variant.gridSize.height;
            y++
          ) {
            const row = vLayer.pixels[y];
            if (!row) continue;
            for (let x = 0; x < row.length && x < variant.gridSize.width; x++) {
              const pixelData = row[x];
              if (!pixelData || pixelData.color === 0) continue;
              const color = pixelData.color;
              if (color.a === 0) continue;
              ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
              ctx.fillRect(
                Math.floor(offsetX + x * scale),
                Math.floor(offsetY + y * scale),
                Math.ceil(scale) || 1,
                Math.ceil(scale) || 1,
              );
            }
          }
        }
        return;
      }
    }

    // Handle regular layers
    if (layer.pixels) {
      renderLayerThumbnail(
        ctx,
        thumbSize,
        layer.pixels,
        gridSize.width,
        gridSize.height,
      );
    }
  };
}
