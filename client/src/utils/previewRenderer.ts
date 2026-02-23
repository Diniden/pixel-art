import { Pixel, PixelData, Layer, Frame, VariantGroup, VariantFrame, Variant } from '../types';

// Helper to extract color from PixelData
function getPixelColor(pd: PixelData | undefined): Pixel | null {
  if (!pd || pd.color === 0) return null;
  return pd.color;
}

// Cached checkerboard backgrounds
const CHECKERBOARD_CACHE = new Map<number, Uint8ClampedArray>();

function getCheckerboard(size: number): Uint8ClampedArray {
  if (!CHECKERBOARD_CACHE.has(size)) {
    const data = new Uint8ClampedArray(size * size * 4);
    const checkSize = 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (((Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2) === 0) {
          data[idx] = 42;     // #2a2a3a
          data[idx + 1] = 42;
          data[idx + 2] = 58;
        } else {
          data[idx] = 34;     // #222230
          data[idx + 1] = 34;
          data[idx + 2] = 48;
        }
        data[idx + 3] = 255;
      }
    }
    CHECKERBOARD_CACHE.set(size, data);
  }
  return CHECKERBOARD_CACHE.get(size)!;
}

interface RenderPreviewOptions {
  thumbSize: number;
  gridWidth: number;
  gridHeight: number;
  frame: Frame;
  frameIndex?: number; // Base frame index for fallback offset lookup
  variants?: VariantGroup[];  // Project-level variants (renamed from variantGroups)
  variantFrameIndices?: { [variantGroupId: string]: number };
}

/**
 * Renders a frame preview to a canvas ImageData.
 * Handles both regular layers and variant layers with proper alpha blending.
 * Layers are rendered front to back (first layer is bottom, last layer is top).
 */
export function renderFramePreview(
  ctx: CanvasRenderingContext2D,
  options: RenderPreviewOptions
): void {
  const { thumbSize, gridWidth, gridHeight, frame, frameIndex = 0, variants, variantFrameIndices } = options;

  ctx.imageSmoothingEnabled = false;

  if (gridWidth === 0 || gridHeight === 0 || frame.layers.length === 0) {
    // Empty frame - just draw checkerboard
    const checkerboard = getCheckerboard(thumbSize);
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    imageData.data.set(checkerboard);
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  const scale = Math.min(thumbSize / gridWidth, thumbSize / gridHeight);
  const offsetX = Math.floor((thumbSize - gridWidth * scale) / 2);
  const offsetY = Math.floor((thumbSize - gridHeight * scale) / 2);

  // Create ImageData with cached checkerboard
  const imageData = ctx.createImageData(thumbSize, thumbSize);
  const data = imageData.data;
  const checkerboard = getCheckerboard(thumbSize);
  data.set(checkerboard);

  // Render layers front to back (first layer is bottom, last layer is top)
  // This matches how the main canvas renders layers
  for (let layerIdx = 0; layerIdx < frame.layers.length; layerIdx++) {
    const layer = frame.layers[layerIdx];
    if (!layer.visible) continue;

    // Handle variant layers
    if (layer.isVariant && layer.variantGroupId && variants && variantFrameIndices) {
      const vg = variants.find(vg => vg.id === layer.variantGroupId);
      const variant = vg?.variants.find(v => v.id === layer.selectedVariantId);
      const variantFrameIdx = variantFrameIndices[layer.variantGroupId] ?? 0;
      const vFrame = variant?.frames[variantFrameIdx % (variant?.frames.length || 1)];

      if (variant && vFrame) {
        // Use layer's variantOffsets for the selected variant, falling back to variantOffset (legacy) then variant.baseFrameOffsets
        const variantOffset = layer.variantOffsets?.[layer.selectedVariantId ?? ''] ?? layer.variantOffset ?? variant.baseFrameOffsets?.[frameIndex] ?? { x: 0, y: 0 };

        renderVariantFrame(
          data,
          thumbSize,
          variant,
          vFrame,
          variantOffset,
          gridWidth,
          gridHeight,
          offsetX,
          offsetY,
          scale
        );
      }
    } else if (!layer.isVariant) {
      // Regular layer
      renderLayer(
        data,
        thumbSize,
        layer,
        gridWidth,
        gridHeight,
        offsetX,
        offsetY,
        scale
      );
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Renders a single regular layer to the ImageData
 */
function renderLayer(
  data: Uint8ClampedArray,
  thumbSize: number,
  layer: Layer,
  gridWidth: number,
  gridHeight: number,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const pixels = layer.pixels;
  if (!pixels) return;

  for (let py = 0; py < gridHeight; py++) {
    const row = pixels[py];
    if (!row) continue;

    for (let px = 0; px < gridWidth; px++) {
      const pixel = getPixelColor(row[px]);
      if (!pixel || pixel.a === 0) continue;

      const thumbX = Math.floor(offsetX + px * scale);
      const thumbY = Math.floor(offsetY + py * scale);
      const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (px + 1) * scale));
      const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (py + 1) * scale));

      if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

      const srcAlpha = pixel.a / 255;
      const r = pixel.r;
      const g = pixel.g;
      const b = pixel.b;

      for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
        for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
          const idx = (ty * thumbSize + tx) * 4;

          const dstAlpha = data[idx + 3] / 255;
          const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

          if (outAlpha > 0.01) {
            const invOutAlpha = 1 / outAlpha;
            data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
            data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
            data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
            data[idx + 3] = outAlpha * 255;
          }
        }
      }
    }
  }
}

/**
 * Renders a variant frame to the ImageData, positioned at its offset
 */
function renderVariantFrame(
  data: Uint8ClampedArray,
  thumbSize: number,
  variant: { gridSize: { width: number; height: number } },
  vFrame: VariantFrame,
  vOffset: { x: number; y: number },
  gridWidth: number,
  gridHeight: number,
  offsetX: number,
  offsetY: number,
  scale: number
): void {
  const vHeight = variant.gridSize.height;
  const vWidth = variant.gridSize.width;

  // Render variant frame layers front to back (first layer is bottom, last layer is top)
  for (let vlIdx = 0; vlIdx < vFrame.layers.length; vlIdx++) {
    const vl = vFrame.layers[vlIdx];
    if (!vl.visible) continue;

    const pixels = vl.pixels;
    if (!pixels) continue;

    for (let vy = 0; vy < vHeight; vy++) {
      const row = pixels[vy];
      if (!row) continue;

      for (let vx = 0; vx < vWidth; vx++) {
        const pixel = getPixelColor(row[vx]);
        if (!pixel || pixel.a === 0) continue;

        // Calculate position in base object coordinates
        const baseX = vOffset.x + vx;
        const baseY = vOffset.y + vy;

        // Skip if outside base object bounds
        if (baseX < 0 || baseX >= gridWidth || baseY < 0 || baseY >= gridHeight) continue;

        // Calculate the area this pixel covers in thumbnail (use same scale as base)
        const thumbX = Math.floor(offsetX + baseX * scale);
        const thumbY = Math.floor(offsetY + baseY * scale);
        const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (baseX + 1) * scale));
        const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (baseY + 1) * scale));

        if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

        const srcAlpha = pixel.a / 255;
        const r = pixel.r;
        const g = pixel.g;
        const b = pixel.b;

        for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
          for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
            const idx = (ty * thumbSize + tx) * 4;

            const dstAlpha = data[idx + 3] / 255;
            const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

            if (outAlpha > 0.01) {
              const invOutAlpha = 1 / outAlpha;
              data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
              data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
              data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
              data[idx + 3] = outAlpha * 255;
            }
          }
        }
      }
    }
  }
}

/**
 * Renders a variant frame preview (for variant frame thumbnails)
 */
export function renderVariantFramePreview(
  ctx: CanvasRenderingContext2D,
  thumbSize: number,
  variant: { gridSize: { width: number; height: number } },
  variantFrame: VariantFrame
): void {
  ctx.imageSmoothingEnabled = false;

  const { width, height } = variant.gridSize;
  if (width === 0 || height === 0 || variantFrame.layers.length === 0) {
    const checkerboard = getCheckerboard(thumbSize);
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    imageData.data.set(checkerboard);
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  const scale = Math.min(thumbSize / width, thumbSize / height);
  const offsetX = Math.floor((thumbSize - width * scale) / 2);
  const offsetY = Math.floor((thumbSize - height * scale) / 2);

  const imageData = ctx.createImageData(thumbSize, thumbSize);
  const data = imageData.data;
  const checkerboard = getCheckerboard(thumbSize);
  data.set(checkerboard);

  // Render layers front to back (first layer is bottom, last layer is top)
  for (let layerIdx = 0; layerIdx < variantFrame.layers.length; layerIdx++) {
    const layer = variantFrame.layers[layerIdx];
    if (!layer.visible) continue;

    const pixels = layer.pixels;
    if (!pixels) continue;

    for (let py = 0; py < height; py++) {
      const row = pixels[py];
      if (!row) continue;

      for (let px = 0; px < width; px++) {
        const pixel = getPixelColor(row[px]);
        if (!pixel || pixel.a === 0) continue;

        const thumbX = Math.floor(offsetX + px * scale);
        const thumbY = Math.floor(offsetY + py * scale);
        const thumbEndX = Math.min(thumbSize, Math.ceil(offsetX + (px + 1) * scale));
        const thumbEndY = Math.min(thumbSize, Math.ceil(offsetY + (py + 1) * scale));

        if (thumbX >= thumbSize || thumbY >= thumbSize || thumbEndX <= 0 || thumbEndY <= 0) continue;

        const srcAlpha = pixel.a / 255;
        const r = pixel.r;
        const g = pixel.g;
        const b = pixel.b;

        for (let ty = Math.max(0, thumbY); ty < thumbEndY; ty++) {
          for (let tx = Math.max(0, thumbX); tx < thumbEndX; tx++) {
            const idx = (ty * thumbSize + tx) * 4;

            const dstAlpha = data[idx + 3] / 255;
            const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

            if (outAlpha > 0.01) {
              const invOutAlpha = 1 / outAlpha;
              data[idx] = (r * srcAlpha + data[idx] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
              data[idx + 1] = (g * srcAlpha + data[idx + 1] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
              data[idx + 2] = (b * srcAlpha + data[idx + 2] * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
              data[idx + 3] = outAlpha * 255;
            }
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Renders a single layer preview (for copy-from modal thumbnails)
 */
export function renderLayerPreview(
  ctx: CanvasRenderingContext2D,
  thumbSize: number,
  layer: Layer,
  gridWidth: number,
  gridHeight: number
): void {
  ctx.imageSmoothingEnabled = false;

  if (gridWidth === 0 || gridHeight === 0) {
    const checkerboard = getCheckerboard(thumbSize);
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    imageData.data.set(checkerboard);
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  const scale = Math.min(thumbSize / gridWidth, thumbSize / gridHeight);
  const offsetX = Math.floor((thumbSize - gridWidth * scale) / 2);
  const offsetY = Math.floor((thumbSize - gridHeight * scale) / 2);

  const imageData = ctx.createImageData(thumbSize, thumbSize);
  const data = imageData.data;
  const checkerboard = getCheckerboard(thumbSize);
  data.set(checkerboard);

  // Render the single layer
  renderLayer(data, thumbSize, layer, gridWidth, gridHeight, offsetX, offsetY, scale);

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Renders a variant layer preview using the first frame of the selected variant
 */
export function renderVariantLayerPreview(
  ctx: CanvasRenderingContext2D,
  thumbSize: number,
  variant: Variant
): void {
  ctx.imageSmoothingEnabled = false;

  const { width, height } = variant.gridSize;
  const firstFrame = variant.frames[0];

  if (width === 0 || height === 0 || !firstFrame || firstFrame.layers.length === 0) {
    const checkerboard = getCheckerboard(thumbSize);
    const imageData = ctx.createImageData(thumbSize, thumbSize);
    imageData.data.set(checkerboard);
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  // Use renderVariantFramePreview which already handles this
  renderVariantFramePreview(ctx, thumbSize, variant, firstFrame);
}

