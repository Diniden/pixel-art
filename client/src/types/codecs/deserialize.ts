import type { Layer, Project, VariantGroup } from "../domain";
import {
  DEFAULT_AMBIENT_COLOR,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_LIGHT_DIRECTION,
  DEFAULT_NORMAL,
} from "../constants";
import type {
  CompactLayer,
  CompactProject,
  CompactUIState,
  CompactVariantGroup,
} from "./compactTypes";
import { migrateLayerVariantOffset } from "./migrate";
import { compactToPixelData, hexToRgba, packedToNormal } from "./pixel";

// Helper to convert compact layer back to runtime format
function compactToLayer(layer: CompactLayer): Layer {
  const runtimeLayer: Layer = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    pixels: layer.pixels.map((row) => row.map((pd) => compactToPixelData(pd))),
  };
  // Include variant fields if present
  if (layer.isVariant) {
    runtimeLayer.isVariant = layer.isVariant;
    runtimeLayer.variantGroupId = layer.variantGroupId;
    runtimeLayer.selectedVariantId = layer.selectedVariantId;
    // Load new per-variant-type offsets
    if (layer.variantOffsets && Object.keys(layer.variantOffsets).length > 0) {
      runtimeLayer.variantOffsets = layer.variantOffsets;
    }
    // Load legacy single offset (for migration purposes)
    if (layer.variantOffset) {
      runtimeLayer.variantOffset = layer.variantOffset;
    }
  }
  return runtimeLayer;
}

// Helper to convert compact variant groups back to runtime format
function compactToVariantGroups(
  groups: CompactVariantGroup[] | undefined,
): VariantGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    variants: group.variants.map((variant) => {
      // Handle migration from old format (offset on frames) to new format (baseFrameOffsets)
      let baseFrameOffsets = variant.baseFrameOffsets;
      if (!baseFrameOffsets || Object.keys(baseFrameOffsets).length === 0) {
        // Migrate from old format: use the offset from the first frame for all base frames
        // This is a reasonable default since old format had offsets per variant frame
        baseFrameOffsets = {};
        // Check if frames have old-style offsets
        const firstFrameWithOffset = variant.frames.find((f) => f.offset);
        if (firstFrameWithOffset?.offset) {
          // Use the first frame's offset as default for base frame 0
          // Other base frames will get this default offset too
          for (let i = 0; i < Math.max(variant.frames.length, 10); i++) {
            const frameOffset = variant.frames[i]?.offset;
            baseFrameOffsets[i] = frameOffset || firstFrameWithOffset.offset;
          }
        } else {
          // No offsets found, use default (0, 0)
          baseFrameOffsets[0] = { x: 0, y: 0 };
        }
      }

      return {
        id: variant.id,
        name: variant.name,
        gridSize: variant.gridSize,
        frames: variant.frames.map((frame) => ({
          id: frame.id,
          layers: frame.layers.map(compactToLayer),
          ...(frame.tags?.length ? { tags: frame.tags } : {}),
        })),
        baseFrameOffsets,
      };
    }),
  }));
}

// Convert compact format back to runtime Project
/** The `fillColor`-free half of the compact spread — see `omitFillColor`. */
function omitCompactFillColor(
  ui: CompactUIState,
): Omit<CompactUIState, "fillColor"> {
  const { fillColor: _fillColor, ...rest } = ui;
  return rest;
}

export function compactToProject(compact: CompactProject): Project {
  // Check if we need to migrate object-level variants to project-level
  const needsMigration =
    !compact.variants &&
    compact.objects.some(
      (obj) => obj.variantGroups && obj.variantGroups.length > 0,
    );

  // Collect all variant groups - either from project level or migrate from objects
  let projectVariants: VariantGroup[] | undefined;
  let migratedObjects = compact.objects;

  if (compact.variants) {
    // Already has project-level variants
    projectVariants = compactToVariantGroups(compact.variants);
  } else if (needsMigration) {
    // Migrate from object-level variants
    console.log("Migrating object-level variants to project level...");
    projectVariants = [];

    // For each object, migrate its variant groups
    migratedObjects = compact.objects.map((obj) => {
      if (!obj.variantGroups || obj.variantGroups.length === 0) {
        return obj;
      }

      const migratedVariantGroups = compactToVariantGroups(obj.variantGroups);
      if (migratedVariantGroups) {
        projectVariants!.push(...migratedVariantGroups);
      }

      // Update variant layers to use per-layer offsets instead of variant-level baseFrameOffsets
      const newFrames = obj.frames.map((frame, frameIndex) => ({
        ...frame,
        layers: frame.layers.map((layer) => {
          if (
            !layer.isVariant ||
            !layer.variantGroupId ||
            !layer.selectedVariantId
          ) {
            return layer;
          }

          // Find the variant group and variant to get the offset
          const variantGroup = obj.variantGroups?.find(
            (vg) => vg.id === layer.variantGroupId,
          );
          const variant = variantGroup?.variants.find(
            (v) => v.id === layer.selectedVariantId,
          );
          const offset = variant?.baseFrameOffsets?.[frameIndex] ?? {
            x: 0,
            y: 0,
          };

          // Use new variantOffsets format instead of old variantOffset
          return {
            ...layer,
            variantOffsets: {
              [layer.selectedVariantId]: offset,
            },
          };
        }),
      }));

      // Return object without variantGroups (they're now at project level)
      return {
        ...obj,
        frames: newFrames,
      };
    });
  }

  return {
    version: compact.version ?? "1.1.0",
    objects: migratedObjects.map((obj) => ({
      id: obj.id,
      name: obj.name,
      gridSize: obj.gridSize,
      ...(obj.origin ? { origin: obj.origin } : {}),
      frames: obj.frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        // Apply layer conversion and migration from variantOffset to variantOffsets
        layers: frame.layers.map(compactToLayer).map(migrateLayerVariantOffset),
        ...(frame.tags?.length ? { tags: frame.tags } : {}),
      })),
      // Note: variantGroups no longer stored on objects
    })),
    palettes: compact.palettes.map((palette) => ({
      id: palette.id,
      name: palette.name,
      colors: palette.colors.map((hex) => hexToRgba(hex)),
    })),
    uiState: {
      /* `fillColor` is dropped from the spread and re-added below in decoded
         form — see `projectToCompact`'s mirror of this. */
      ...omitCompactFillColor(compact.uiState),
      selectedColor: hexToRgba(compact.uiState.selectedColor),
      selectionMode: compact.uiState.selectionMode ?? "rect",
      selectionBehavior: compact.uiState.selectionBehavior ?? "movePixels",
      focusMode: compact.uiState.focusMode ?? false,
      lightGridMode: compact.uiState.lightGridMode ?? false,
      // Handle migration from old format without lighting state
      studioMode: compact.uiState.studioMode ?? "pixel",
      lightingDataLayerEditMode:
        compact.uiState.lightingDataLayerEditMode ?? "normals",
      selectedNormal:
        compact.uiState.selectedNormal !== undefined
          ? packedToNormal(compact.uiState.selectedNormal)
          : DEFAULT_NORMAL,
      lightDirection:
        compact.uiState.lightDirection !== undefined
          ? packedToNormal(compact.uiState.lightDirection)
          : DEFAULT_LIGHT_DIRECTION,
      lightColor:
        compact.uiState.lightColor !== undefined
          ? hexToRgba(compact.uiState.lightColor)
          : DEFAULT_LIGHT_COLOR,
      ambientColor:
        compact.uiState.ambientColor !== undefined
          ? hexToRgba(compact.uiState.ambientColor)
          : DEFAULT_AMBIENT_COLOR,
      // Handle migration from old format without eraserShape
      eraserShape: compact.uiState.eraserShape ?? "circle",
      // Handle migration from old format without pencil brush settings
      pencilBrushShape: compact.uiState.pencilBrushShape ?? "square",
      pencilBrushMax: compact.uiState.pencilBrushMax ?? 16,
      traceNudgeAmount: compact.uiState.traceNudgeAmount ?? 10,
      // Handle migration from old format without normalBrushShape
      normalBrushShape: compact.uiState.normalBrushShape ?? "circle",
      // Handle migration from old format without heightScale
      heightScale: compact.uiState.heightScale ?? 100,
      heightBrushValue: compact.uiState.heightBrushValue ?? 128,
      // Handle migration from old format without objectLibraryViewMode
      objectLibraryViewMode: compact.uiState.objectLibraryViewMode ?? "normal",
      // Handle migration from old format without timelineThumbnailMode
      timelineThumbnailMode: compact.uiState.timelineThumbnailMode ?? false,
      // Handle migration from old format without originColor
      originColor:
        compact.uiState.originColor !== undefined
          ? hexToRgba(compact.uiState.originColor)
          : undefined,
      /* ⚠️ A CONDITIONAL SPREAD, for the same reason as `projectToCompact`'s:
         `fillColor: undefined` still ADDS THE KEY, and the round trip would
         then carry it back out and change every corpus digest. Absent in every
         project predating the edge/fill split; readers fall back to
         `selectedColor`, so those keep their single-colour behaviour. */
      ...(compact.uiState.fillColor !== undefined
        ? { fillColor: hexToRgba(compact.uiState.fillColor) }
        : {}),
    },
    variants: projectVariants,
    // Reference image (same format in compact)
    referenceImage: compact.referenceImage,
  };
}
