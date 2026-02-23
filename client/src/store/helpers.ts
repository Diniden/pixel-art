import type { StoreGet } from "./storeTypes";

export function createHelpers(get: StoreGet) {
  return {
    getCurrentObject: () => {
      const { project } = get();
      if (!project) return null;
      return (
        project.objects.find(
          (o) => o.id === project.uiState.selectedObjectId,
        ) ?? null
      );
    },

    getCurrentFrame: () => {
      const obj = get().getCurrentObject();
      const { project } = get();
      if (!obj || !project) return null;
      return (
        obj.frames.find((f) => f.id === project.uiState.selectedFrameId) ?? null
      );
    },

    getCurrentLayer: () => {
      const frame = get().getCurrentFrame();
      const { project } = get();
      if (!frame || !project) return null;
      return (
        frame.layers.find((l) => l.id === project.uiState.selectedLayerId) ??
        null
      );
    },

    getCurrentVariant: () => {
      const obj = get().getCurrentObject();
      const layer = get().getCurrentLayer();
      const { project } = get();

      if (
        !obj ||
        !layer ||
        !project ||
        !layer.isVariant ||
        !layer.variantGroupId
      )
        return null;

      // Look for variant group at project level first, fall back to object level for backward compatibility
      const variantGroup = project.variants?.find(
        (vg) => vg.id === layer.variantGroupId,
      );
      if (!variantGroup) return null;

      const variant = variantGroup.variants.find(
        (v) => v.id === layer.selectedVariantId,
      );
      if (!variant) return null;

      const variantFrameIndex =
        project.uiState.variantFrameIndices?.[variantGroup.id] ?? 0;
      const variantFrame =
        variant.frames[variantFrameIndex % variant.frames.length];

      // Get the current base frame index for the offset
      const currentFrameId = project.uiState.selectedFrameId;
      const baseFrameIndex = obj.frames.findIndex(
        (f) => f.id === currentFrameId,
      );

      // Get offset for the currently selected variant type
      // Priority: variantOffsets[selectedVariantId] > variantOffset (legacy) > baseFrameOffsets (legacy)
      const selectedVariantId = layer.selectedVariantId;
      const offset = layer.variantOffsets?.[selectedVariantId ?? ""] ??
        layer.variantOffset ??
        variant.baseFrameOffsets?.[
          baseFrameIndex >= 0 ? baseFrameIndex : 0
        ] ?? { x: 0, y: 0 };

      return { variantGroup, variant, variantFrame, baseFrameIndex, offset };
    },

    getSelectedVariantLayer: () => {
      const variantData = get().getCurrentVariant();
      if (!variantData) return null;
      return variantData.variantFrame.layers[0] ?? null;
    },

    isEditingVariant: () => {
      const layer = get().getCurrentLayer();
      return layer?.isVariant === true;
    },
  };
}
