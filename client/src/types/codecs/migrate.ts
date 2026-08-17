import type { Layer } from "../domain";
import type {
  CompactLayer,
  CompactPixelData,
  CompactProject,
} from "./compactTypes";

// Helper to migrate a layer from old variantOffset to new variantOffsets format
export function migrateLayerVariantOffset(layer: Layer): Layer {
  // If layer has old-style variantOffset but no variantOffsets, migrate it
  if (
    layer.isVariant &&
    layer.selectedVariantId &&
    layer.variantOffset &&
    !layer.variantOffsets
  ) {
    console.log(
      `Migrating variantOffset to variantOffsets for layer ${layer.id}, variant ${layer.selectedVariantId}`,
    );
    return {
      ...layer,
      variantOffsets: {
        [layer.selectedVariantId]: layer.variantOffset,
      },
      // Clear the deprecated field after migration
      variantOffset: undefined,
    };
  }
  return layer;
}

// Check if a project is in compact format (colors are numbers, not objects)
export function isCompactFormat(data: unknown): data is CompactProject {
  if (!data || typeof data !== "object") return false;
  const project = data as Record<string, unknown>;

  // Check if palettes exist and have numeric colors
  if (Array.isArray(project.palettes) && project.palettes.length > 0) {
    const palette = project.palettes[0] as Record<string, unknown>;
    if (Array.isArray(palette.colors) && palette.colors.length > 0) {
      return typeof palette.colors[0] === "number";
    }
  }

  // Check uiState.selectedColor
  if (project.uiState && typeof project.uiState === "object") {
    const uiState = project.uiState as Record<string, unknown>;
    return typeof uiState.selectedColor === "number";
  }

  return false;
}

// Check if compact data is in legacy format (before lighting studio)
// Legacy format has pixels as simple numbers, new format has [color, normal, height] tuples
export function isLegacyCompactFormat(data: CompactProject): boolean {
  // Check the first non-empty pixel in the first layer of the first frame
  if (data.objects.length > 0 && data.objects[0].frames.length > 0) {
    const frame = data.objects[0].frames[0];
    if (frame.layers.length > 0) {
      const layer = frame.layers[0];
      for (const row of layer.pixels) {
        for (const pixel of row) {
          if (pixel !== 0) {
            // If pixel is a number (not an array), it's legacy format
            return typeof pixel === "number";
          }
        }
      }
    }
  }
  // Empty project or all-empty pixels - check uiState for lighting fields
  return data.uiState.studioMode === undefined;
}

// Migrate legacy compact pixel data (just color hex) to new format
export function migrateLegacyPixel(legacyPixel: number | 0): CompactPixelData {
  if (legacyPixel === 0) {
    return 0;
  }
  // Legacy format: just a color hex number
  // New format: [colorHex, normalPacked, height]
  // For migration: set default normal to 0 (no normal), height to 1 (base height) for non-empty pixels
  return [legacyPixel, 0, 1];
}

// Migrate a legacy compact layer to new format
export function migrateLegacyLayer(layer: {
  id: string;
  name: string;
  pixels: (number | 0)[][];
  visible: boolean;
  isVariant?: boolean;
  variantGroupId?: string;
  selectedVariantId?: string;
}): CompactLayer {
  return {
    ...layer,
    pixels: layer.pixels.map((row) =>
      row.map((pixel) => migrateLegacyPixel(pixel)),
    ),
  };
}
