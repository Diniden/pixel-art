import type { Color, Normal, Pixel, PixelData } from "../domain";
import type { CompactPixelData } from "./compactTypes";

// ============================================
// Compact format conversion utilities
// ============================================

// Convert RGBA to a single hex number (0xRRGGBBAA)
export function rgbaToHex(pixel: Pixel | Color): number {
  return (
    ((pixel.r & 0xff) << 24) |
    ((pixel.g & 0xff) << 16) |
    ((pixel.b & 0xff) << 8) |
    (pixel.a & 0xff)
  );
}

// Convert hex number back to RGBA object
export function hexToRgba(hex: number): Pixel {
  return {
    r: (hex >>> 24) & 0xff,
    g: (hex >>> 16) & 0xff,
    b: (hex >>> 8) & 0xff,
    a: hex & 0xff,
  };
}

// Pack a normal into a single number: (x+128) << 16 | (y+128) << 8 | z
export function normalToPacked(normal: Normal): number {
  return ((normal.x + 128) << 16) | ((normal.y + 128) << 8) | normal.z;
}

// Unpack a normal from a packed number
export function packedToNormal(packed: number): Normal {
  return {
    x: ((packed >>> 16) & 0xff) - 128,
    y: ((packed >>> 8) & 0xff) - 128,
    z: packed & 0xff,
  };
}

// Convert PixelData to compact format
export function pixelDataToCompact(pd: PixelData): CompactPixelData {
  if (pd.color === 0 && pd.normal === 0 && pd.height === 0) {
    return 0;
  }
  const colorHex = pd.color === 0 ? 0 : rgbaToHex(pd.color);
  const normalPacked = pd.normal === 0 ? 0 : normalToPacked(pd.normal);
  return [colorHex, normalPacked, pd.height];
}

// Convert compact format back to PixelData
export function compactToPixelData(compact: CompactPixelData): PixelData {
  if (compact === 0) {
    return { color: 0, normal: 0, height: 0 };
  }
  const [colorHex, normalPacked, height] = compact;
  return {
    color: colorHex === 0 ? 0 : hexToRgba(colorHex),
    normal: normalPacked === 0 ? 0 : packedToNormal(normalPacked),
    height,
  };
}
