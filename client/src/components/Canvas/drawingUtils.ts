import { Point, Color, Pixel, PixelData } from "../../types";

// Bresenham's line algorithm
export function getLinePixels(start: Point, end: Point): Point[] {
  const pixels: Point[] = [];

  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    pixels.push({ x: x0, y: y0 });

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return pixels;
}

// Check if a point is inside a rounded rectangle
function isInsideRoundedRect(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  radius: number,
): boolean {
  // Clamp radius to half the smaller dimension
  const width = maxX - minX;
  const height = maxY - minY;
  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));

  if (r <= 0) return true; // No rounding, always inside if within bounds

  // Check corners
  // Top-left corner
  if (x < minX + r && y < minY + r) {
    const dx = x - (minX + r);
    const dy = y - (minY + r);
    return dx * dx + dy * dy <= r * r;
  }
  // Top-right corner
  if (x > maxX - r && y < minY + r) {
    const dx = x - (maxX - r);
    const dy = y - (minY + r);
    return dx * dx + dy * dy <= r * r;
  }
  // Bottom-left corner
  if (x < minX + r && y > maxY - r) {
    const dx = x - (minX + r);
    const dy = y - (maxY - r);
    return dx * dx + dy * dy <= r * r;
  }
  // Bottom-right corner
  if (x > maxX - r && y > maxY - r) {
    const dx = x - (maxX - r);
    const dy = y - (maxY - r);
    return dx * dx + dy * dy <= r * r;
  }

  return true;
}

// Check if a point is on the border of a rounded rectangle
function isOnRoundedRectBorder(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  radius: number,
): boolean {
  const width = maxX - minX;
  const height = maxY - minY;
  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));

  // Check if on edge
  const onLeft = x === minX;
  const onRight = x === maxX;
  const onTop = y === minY;
  const onBottom = y === maxY;

  if (!onLeft && !onRight && !onTop && !onBottom) return false;

  if (r <= 0) return true;

  // Check corners - need to verify the point is actually on the rounded corner
  // Top-left corner region
  if (x < minX + r && y < minY + r) {
    const dx = x - (minX + r);
    const dy = y - (minY + r);
    const distSq = dx * dx + dy * dy;
    return distSq <= r * r && distSq >= (r - 1) * (r - 1);
  }
  // Top-right corner region
  if (x > maxX - r && y < minY + r) {
    const dx = x - (maxX - r);
    const dy = y - (minY + r);
    const distSq = dx * dx + dy * dy;
    return distSq <= r * r && distSq >= (r - 1) * (r - 1);
  }
  // Bottom-left corner region
  if (x < minX + r && y > maxY - r) {
    const dx = x - (minX + r);
    const dy = y - (maxY - r);
    const distSq = dx * dx + dy * dy;
    return distSq <= r * r && distSq >= (r - 1) * (r - 1);
  }
  // Bottom-right corner region
  if (x > maxX - r && y > maxY - r) {
    const dx = x - (maxX - r);
    const dy = y - (maxY - r);
    const distSq = dx * dx + dy * dy;
    return distSq <= r * r && distSq >= (r - 1) * (r - 1);
  }

  return true;
}

// Rectangle pixels with optional border radius
export function getRectanglePixels(
  start: Point,
  end: Point,
  mode: "outline" | "fill" | "both",
  borderRadius: number = 0,
): Point[] {
  const pixels: Point[] = [];
  const set = new Set<string>();

  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const addPixel = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!set.has(key)) {
      set.add(key);
      pixels.push({ x, y });
    }
  };

  if (mode === "fill" || mode === "both") {
    // Fill entire rounded rectangle
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (isInsideRoundedRect(x, y, minX, minY, maxX, maxY, borderRadius)) {
          addPixel(x, y);
        }
      }
    }
  } else {
    // Outline only
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (
          isInsideRoundedRect(x, y, minX, minY, maxX, maxY, borderRadius) &&
          isOnRoundedRectBorder(x, y, minX, minY, maxX, maxY, borderRadius)
        ) {
          addPixel(x, y);
        }
      }
    }
  }

  return pixels;
}

// Midpoint ellipse algorithm
export function getEllipsePixels(
  center: Point,
  edge: Point,
  mode: "outline" | "fill" | "both",
): Point[] {
  const pixels: Point[] = [];
  const set = new Set<string>();

  const rx = Math.abs(edge.x - center.x);
  const ry = Math.abs(edge.y - center.y);

  if (rx === 0 && ry === 0) {
    return [{ x: center.x, y: center.y }];
  }

  const addPixel = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!set.has(key)) {
      set.add(key);
      pixels.push({ x, y });
    }
  };

  const addSymmetricPixels = (cx: number, cy: number, x: number, y: number) => {
    if (mode === "fill" || mode === "both") {
      // Fill horizontal lines
      for (let i = cx - x; i <= cx + x; i++) {
        addPixel(i, cy + y);
        addPixel(i, cy - y);
      }
    } else {
      // Just the outline points
      addPixel(cx + x, cy + y);
      addPixel(cx - x, cy + y);
      addPixel(cx + x, cy - y);
      addPixel(cx - x, cy - y);
    }
  };

  let x = 0;
  let y = ry;

  // Region 1
  let d1 = ry * ry - rx * rx * ry + 0.25 * rx * rx;
  let dx = 2 * ry * ry * x;
  let dy = 2 * rx * rx * y;

  while (dx < dy) {
    addSymmetricPixels(center.x, center.y, x, y);

    if (d1 < 0) {
      x++;
      dx = dx + 2 * ry * ry;
      d1 = d1 + dx + ry * ry;
    } else {
      x++;
      y--;
      dx = dx + 2 * ry * ry;
      dy = dy - 2 * rx * rx;
      d1 = d1 + dx - dy + ry * ry;
    }
  }

  // Region 2
  let d2 =
    ry * ry * (x + 0.5) * (x + 0.5) +
    rx * rx * (y - 1) * (y - 1) -
    rx * rx * ry * ry;

  while (y >= 0) {
    addSymmetricPixels(center.x, center.y, x, y);

    if (d2 > 0) {
      y--;
      dy = dy - 2 * rx * rx;
      d2 = d2 + rx * rx - dy;
    } else {
      y--;
      x++;
      dx = dx + 2 * ry * ry;
      dy = dy - 2 * rx * rx;
      d2 = d2 + dx - dy + rx * rx;
    }
  }

  return pixels;
}

// Flood fill using BFS
export function floodFill(
  pixels: PixelData[][],
  startX: number,
  startY: number,
  width: number,
  height: number,
  fillColor: Color,
): { x: number; y: number; color: Color }[] {
  const result: { x: number; y: number; color: Color }[] = [];
  const targetPixelData = pixels[startY]?.[startX];
  const targetColor = targetPixelData?.color;

  // Check if target color is same as fill color
  if (
    targetColor &&
    typeof targetColor === "object" &&
    targetColor.r === fillColor.r &&
    targetColor.g === fillColor.g &&
    targetColor.b === fillColor.b &&
    targetColor.a === fillColor.a
  ) {
    return result;
  }

  const visited = new Set<string>();
  const queue: Point[] = [{ x: startX, y: startY }];

  const isSameColor = (pd: PixelData | undefined): boolean => {
    const color = pd?.color;
    if (targetColor === 0 && color === 0) return true;
    if (targetColor === 0 || color === 0) return false;
    if (!targetColor || !color) return false;
    return (
      color.r === (targetColor as Pixel).r &&
      color.g === (targetColor as Pixel).g &&
      color.b === (targetColor as Pixel).b &&
      color.a === (targetColor as Pixel).a
    );
  };

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const currentPixelData = pixels[y]?.[x];
    if (!isSameColor(currentPixelData)) continue;

    visited.add(key);
    result.push({ x, y, color: fillColor });

    // Add neighbors
    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }

  return result;
}

function gaussianRBF(
  distance: number,
  radius: number,
  smoothing: number,
): number {
  const sigma = Math.max(0.001, radius * smoothing);
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function isSamePixelColor(
  a: PixelData | undefined,
  b: PixelData | undefined,
): boolean {
  const ca = a?.color;
  const cb = b?.color;
  if (ca === 0 && cb === 0) return true;
  if (ca === 0 || cb === 0) return false;
  if (!ca || !cb) return false;
  return (
    (ca as Pixel).r === (cb as Pixel).r &&
    (ca as Pixel).g === (cb as Pixel).g &&
    (ca as Pixel).b === (cb as Pixel).b &&
    (ca as Pixel).a === (cb as Pixel).a
  );
}

/**
 * Auto Gaussian fill:
 * - Finds the connected region matching the start pixel color (target region)
 * - Collects adjacent colored pixels around that region as seed points ("edge pixels")
 * - Fills the target region by Gaussian RBF interpolation of seed colors
 *
 * If no seeds are found, falls back to a solid flood fill using the provided fallbackFillColor.
 */
export function gaussianFloodFill(
  pixels: PixelData[][],
  startX: number,
  startY: number,
  width: number,
  height: number,
  smoothing: number,
  radius: number,
  fallbackFillColor: Color,
): { x: number; y: number; color: Color }[] {
  const start = pixels[startY]?.[startX];
  if (!start) return [];

  const visited = new Set<string>();
  const region: Point[] = [];
  const queue: Point[] = [{ x: startX, y: startY }];

  // Discover region (same-color connected component)
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const pd = pixels[y]?.[x];
    if (!isSamePixelColor(pd, start)) continue;

    visited.add(key);
    region.push({ x, y });

    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }

  if (region.length === 0) return [];

  // Collect seed points from the boundary: neighboring colored pixels not in region.
  const seedKey = new Set<string>();
  const seeds: Array<{ x: number; y: number; color: Pixel }> = [];
  const neighborDirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (const p of region) {
    for (const d of neighborDirs) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighbor = pixels[ny]?.[nx];

      // Only consider neighbors that are NOT the target color and HAVE a color
      if (isSamePixelColor(neighbor, start)) continue;
      const c = neighbor?.color;
      if (!c || c === 0) continue;

      const k = `${nx},${ny}`;
      if (seedKey.has(k)) continue;
      seedKey.add(k);
      seeds.push({ x: nx, y: ny, color: c });
    }
  }

  // If there are no surrounding colors, fall back to solid fill.
  if (seeds.length === 0) {
    return region.map((p) => ({ x: p.x, y: p.y, color: fallbackFillColor }));
  }

  // Interpolate each region pixel's color from seed colors.
  const sigma = radius * smoothing;
  const cutoff = Math.max(0.001, sigma * 3); // Skip seeds far away for perf
  const result: { x: number; y: number; color: Color }[] = [];

  for (const p of region) {
    let sumW = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;

    for (const s of seeds) {
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > cutoff) continue;

      const w = gaussianRBF(dist, radius, smoothing);
      if (w < 0.001) continue;
      sumW += w;
      sumR += s.color.r * w;
      sumG += s.color.g * w;
      sumB += s.color.b * w;
      sumA += s.color.a * w;
    }

    if (sumW < 0.001) {
      result.push({ x: p.x, y: p.y, color: fallbackFillColor });
    } else {
      const a = Math.max(1, clampByte(sumA / sumW));
      result.push({
        x: p.x,
        y: p.y,
        color: {
          r: clampByte(sumR / sumW),
          g: clampByte(sumG / sumW),
          b: clampByte(sumB / sumW),
          a,
        },
      });
    }
  }

  return result;
}

// Fill square brush
export function getSquarePixels(
  center: Point,
  size: number,
  color: Color,
): { x: number; y: number; color: Color }[] {
  const result: { x: number; y: number; color: Color }[] = [];
  const halfSize = Math.floor(size / 2);

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      result.push({
        x: center.x + dx,
        y: center.y + dy,
        color,
      });
    }
  }

  return result;
}

// Fill circle brush
export function getCirclePixels(
  center: Point,
  size: number,
  color: Color,
): { x: number; y: number; color: Color }[] {
  const result: { x: number; y: number; color: Color }[] = [];
  const radius = size / 2;
  const radiusSq = radius * radius;
  const halfSize = Math.floor(size / 2);

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) {
        result.push({
          x: center.x + dx,
          y: center.y + dy,
          color,
        });
      }
    }
  }

  return result;
}
