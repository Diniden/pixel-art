import { Project, PixelObject, Frame, Layer, Color } from '../types';

interface ExportedFrame {
  objectName: string;
  frameName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExportMetadata {
  width: number;
  height: number;
  frames: ExportedFrame[];
}

function colorToRGBA(color: Color | null): [number, number, number, number] {
  if (!color) return [0, 0, 0, 0];
  return [color.r, color.g, color.b, color.a];
}

function flattenLayers(layers: Layer[], width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Start with transparent background
  const imageData = ctx.createImageData(width, height);

  // Apply layers from bottom to top (first layer is bottom)
  for (const layer of layers) {
    if (!layer.visible) continue;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = layer.pixels[y]?.[x];
        if (!pixel || pixel.a === 0) continue;

        const idx = (y * width + x) * 4;
        const [r, g, b, a] = colorToRGBA(pixel);
        const srcAlpha = a / 255;
        const dstAlpha = imageData.data[idx + 3] / 255;

        // Alpha compositing
        const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
        if (outAlpha > 0) {
          imageData.data[idx] = Math.round((r * srcAlpha + imageData.data[idx] * dstAlpha * (1 - srcAlpha)) / outAlpha);
          imageData.data[idx + 1] = Math.round((g * srcAlpha + imageData.data[idx + 1] * dstAlpha * (1 - srcAlpha)) / outAlpha);
          imageData.data[idx + 2] = Math.round((b * srcAlpha + imageData.data[idx + 2] * dstAlpha * (1 - srcAlpha)) / outAlpha);
          imageData.data[idx + 3] = Math.round(outAlpha * 255);
        }
      }
    }
  }

  return imageData;
}

function calculatePacking(objects: PixelObject[]): {
  totalWidth: number;
  totalHeight: number;
  positions: Map<string, { x: number; y: number }>;
} {
  // Collect all frames with their dimensions
  const frames: { key: string; width: number; height: number }[] = [];

  for (const obj of objects) {
    for (const frame of obj.frames) {
      frames.push({
        key: `${obj.id}:${frame.id}`,
        width: obj.gridSize.width,
        height: obj.gridSize.height
      });
    }
  }

  if (frames.length === 0) {
    return { totalWidth: 0, totalHeight: 0, positions: new Map() };
  }

  // Simple grid packing - calculate optimal grid dimensions
  const maxWidth = Math.max(...frames.map(f => f.width));
  const maxHeight = Math.max(...frames.map(f => f.height));

  const cols = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / cols);

  const totalWidth = cols * maxWidth;
  const totalHeight = rows * maxHeight;

  const positions = new Map<string, { x: number; y: number }>();

  frames.forEach((frame, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(frame.key, {
      x: col * maxWidth,
      y: row * maxHeight
    });
  });

  return { totalWidth, totalHeight, positions };
}

export async function exportProject(project: Project): Promise<void> {
  const { objects } = project;

  if (objects.length === 0) {
    alert('No objects to export');
    return;
  }

  const { totalWidth, totalHeight, positions } = calculatePacking(objects);

  if (totalWidth === 0 || totalHeight === 0) {
    alert('No frames to export');
    return;
  }

  // Create the output canvas
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // Clear with transparent
  ctx.clearRect(0, 0, totalWidth, totalHeight);

  // Build metadata
  const metadata: ExportMetadata = {
    width: totalWidth,
    height: totalHeight,
    frames: []
  };

  // Render each frame
  for (const obj of objects) {
    for (const frame of obj.frames) {
      const key = `${obj.id}:${frame.id}`;
      const pos = positions.get(key);
      if (!pos) continue;

      const imageData = flattenLayers(
        frame.layers,
        obj.gridSize.width,
        obj.gridSize.height
      );

      ctx.putImageData(imageData, pos.x, pos.y);

      metadata.frames.push({
        objectName: obj.name,
        frameName: frame.name,
        x: pos.x,
        y: pos.y,
        width: obj.gridSize.width,
        height: obj.gridSize.height
      });
    }
  }

  // Convert canvas to blob and download
  canvas.toBlob((blob) => {
    if (!blob) {
      alert('Failed to create PNG');
      return;
    }

    // Download PNG
    const pngUrl = URL.createObjectURL(blob);
    const pngLink = document.createElement('a');
    pngLink.href = pngUrl;
    pngLink.download = 'pixel-art-export.png';
    pngLink.click();
    URL.revokeObjectURL(pngUrl);

    // Download JSON
    const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = 'pixel-art-export.json';
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);
  }, 'image/png');
}

