/**
 * maxCanvas bounds computation.
 *
 * Moved VERBATIM from `src/routes/export.ts:628-690` (REFRESH task 11).
 *
 * Analyses all variant offsets to determine the total canvas size needed to
 * render any combination of variants without clipping.
 */

import type {
  ExportedLayer,
  ExportedObject,
  ExportedVariant,
  ExportedVariantLayerDef,
} from "./exportTypes.js";

/**
 * The 4-level variant-offset fallback.
 *
 * ⚠️ DUPLICATED RULE — this is 1 of 6 copies in the repo. The other 5 live in
 * `client/src/components/Canvas/Canvas.tsx` at lines 541, 663, 1113, 1390 and
 * 1915. Task 30 unifies the five CLIENT copies; this server copy stays
 * separate deliberately, because sharing it would require a `shared/`
 * workspace package that is explicitly out of scope for this refresh
 * (MASTER.md §9.4 and §9.12).
 *
 * **If you change the rule here, change it in all five client sites too** —
 * the exporter's maxCanvas must agree with what the runtime actually renders,
 * or sprites clip.
 *
 * Resolve the offset using the same priority as the runtime:
 *   1. Per-frame `variantOffsets` for this specific variant
 *   2. Variant's `baseFrameOffsets` for this frame index
 *   3. Variant's `baseFrameOffsets` for frame 0
 *   4. Default `{ x: 0, y: 0 }`
 */
export function resolveVariantOffset(
  layer: Pick<ExportedLayer, "variantOffsets">,
  variant: Pick<ExportedVariant, "id" | "baseFrameOffsets">,
  frameIdx: number,
): { x: number; y: number } {
  return (
    layer.variantOffsets?.[variant.id] ??
    variant.baseFrameOffsets[String(frameIdx)] ??
    variant.baseFrameOffsets["0"] ?? { x: 0, y: 0 }
  );
}

/**
 * Compute and ASSIGN `maxCanvas` on each object that needs one.
 *
 * Mutates `finalObjects` in place, exactly as the original inline block did.
 * `maxCanvas` is only added when the computed bounds differ from the base
 * `gridSize` — that conditional is part of the wire format, since an object
 * without the key serialises without an `mc` entry.
 */
export function applyMaxCanvas(
  finalObjects: ExportedObject[],
  finalVariantLayers: ExportedVariantLayerDef[],
): void {
  const vlDefMap = new Map<string, ExportedVariantLayerDef>();
  for (const vl of finalVariantLayers) {
    vlDefMap.set(vl.id, vl);
  }

  for (const obj of finalObjects) {
    let minX = 0;
    let minY = 0;
    let maxX = obj.gridSize.width;
    let maxY = obj.gridSize.height;

    for (let frameIdx = 0; frameIdx < obj.frames.length; frameIdx++) {
      const frame = obj.frames[frameIdx];
      for (const layer of frame.layers) {
        if (!layer.isVariant || !layer.variantLayerId) continue;

        const vlDef = vlDefMap.get(layer.variantLayerId);
        if (!vlDef) continue;

        // Consider ALL variants in this variant layer (any could be selected at runtime)
        for (const variant of vlDef.variants) {
          const offset = resolveVariantOffset(layer, variant, frameIdx);

          const vRight = offset.x + variant.gridSize.width;
          const vBottom = offset.y + variant.gridSize.height;

          minX = Math.min(minX, offset.x);
          minY = Math.min(minY, offset.y);
          maxX = Math.max(maxX, vRight);
          maxY = Math.max(maxY, vBottom);
        }
      }
    }

    // Only add maxCanvas if the bounds differ from the base gridSize
    const mcWidth = maxX - minX;
    const mcHeight = maxY - minY;
    const mcOffsetX = -minX;
    const mcOffsetY = -minY;

    if (
      mcWidth !== obj.gridSize.width ||
      mcHeight !== obj.gridSize.height ||
      mcOffsetX !== 0 ||
      mcOffsetY !== 0
    ) {
      obj.maxCanvas = {
        width: mcWidth,
        height: mcHeight,
        offset: { x: mcOffsetX, y: mcOffsetY },
      };
    }
  }
}
