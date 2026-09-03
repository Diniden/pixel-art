import type { Layer, Project, UIState, VariantGroup } from "../domain";
import type {
  CompactLayer,
  CompactProject,
  CompactVariantGroup,
} from "./compactTypes";
import { normalToPacked, pixelDataToCompact, rgbaToHex } from "./pixel";

// Helper to convert a layer to compact format
function layerToCompact(layer: Layer): CompactLayer {
  const compactLayer: CompactLayer = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    pixels: layer.pixels.map((row) => row.map((pd) => pixelDataToCompact(pd))),
  };
  // Include variant fields if present
  if (layer.isVariant) {
    compactLayer.isVariant = layer.isVariant;
    compactLayer.variantGroupId = layer.variantGroupId;
    compactLayer.selectedVariantId = layer.selectedVariantId;
    // Save new per-variant-type offsets
    if (layer.variantOffsets && Object.keys(layer.variantOffsets).length > 0) {
      compactLayer.variantOffsets = layer.variantOffsets;
    }
    // Also save legacy single offset for backward compatibility if present
    if (layer.variantOffset) {
      compactLayer.variantOffset = layer.variantOffset;
    }
  }
  return compactLayer;
}

// Helper to convert variant groups to compact format
function variantGroupsToCompact(
  groups: VariantGroup[] | undefined,
): CompactVariantGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    variants: group.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      gridSize: variant.gridSize,
      frames: variant.frames.map((frame) => ({
        id: frame.id,
        layers: frame.layers.map(layerToCompact),
        ...(frame.tags?.length ? { tags: frame.tags } : {}),
      })),
      baseFrameOffsets: variant.baseFrameOffsets,
    })),
  }));
}

// Convert runtime Project to compact format for saving
/**
 * `uiState` without `fillColor`, so the encoded value can be re-added without
 * the domain `Color` widening the field's type. Purely a typing device — the
 * key is put back (or deliberately left out) by the caller.
 */
function omitFillColor(ui: UIState): Omit<UIState, "fillColor"> {
  const { fillColor: _fillColor, ...rest } = ui;
  return rest;
}

export function projectToCompact(project: Project): CompactProject {
  return {
    version: project.version ?? "1.1.0", // Default to current version
    objects: project.objects.map((obj) => ({
      id: obj.id,
      name: obj.name,
      gridSize: obj.gridSize,
      ...(obj.origin ? { origin: obj.origin } : {}),
      frames: obj.frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        layers: frame.layers.map(layerToCompact),
        ...(frame.tags?.length ? { tags: frame.tags } : {}),
      })),
      // Note: object-level variantGroups are no longer saved - they live at project level now
    })),
    palettes: project.palettes.map((palette) => ({
      id: palette.id,
      name: palette.name,
      colors: palette.colors.map((color) => rgbaToHex(color)),
    })),
    uiState: {
      /* `fillColor` is dropped from the spread and re-added below in its
         encoded form. Without the omission the domain `Color` would flow
         through untranslated and collide with the hex `number` the wire
         format declares. */
      ...omitFillColor(project.uiState),
      selectedColor: rgbaToHex(project.uiState.selectedColor),
      selectedNormal: normalToPacked(project.uiState.selectedNormal),
      lightDirection: normalToPacked(project.uiState.lightDirection),
      lightColor: rgbaToHex(project.uiState.lightColor),
      ambientColor: rgbaToHex(project.uiState.ambientColor),
      heightScale: project.uiState.heightScale,
      originColor: project.uiState.originColor
        ? rgbaToHex(project.uiState.originColor)
        : undefined,
      /* ⚠️ A CONDITIONAL SPREAD, not `: undefined`. Writing the key with an
         undefined value would still ADD THE KEY — `Object.keys()` and the
         corpus digest both count "present but undefined" as present, which is
         the exact distinction the persistence builder's notes call out (and
         which `originColor` above can ignore only because it is already in the
         frozen key set). Measured: the plain form changed every corpus digest.
         This way a project with no fill colour is byte-identical to before. */
      ...(project.uiState.fillColor
        ? { fillColor: rgbaToHex(project.uiState.fillColor) }
        : {}),
    },
    // Project-level variants
    variants: variantGroupsToCompact(project.variants),
    // Reference image (same format in compact)
    referenceImage: project.referenceImage,
  };
}
