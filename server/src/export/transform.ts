/**
 * Texture deduplication and object/variant transformation.
 *
 * Moved VERBATIM from `src/routes/export.ts:513-624` (REFRESH task 11). The
 * three closures (`ensureColorTexture`, `ensureNormalTexture`, and the
 * accumulators they close over) were local to the route handler; they are
 * gathered here into a `TextureRegistry` so the transformation is callable
 * outside an Express handler, but the LOGIC is unchanged.
 *
 * ⚠️ ORDER IS LOAD-BEARING. Textures are deduplicated by content hash and the
 * FIRST writer of a hash wins, so the traversal order of objects → frames →
 * layers determines the key insertion order of the `textures` map. That map's
 * key order flows into `collectStrings`, which decides string-table indices,
 * which are emitted as integers in `frames.json`. Reordering this traversal
 * changes the published bytes even though the sprites are identical.
 */

import { join } from "path";

import type {
  CompactLayer,
  CompactProject,
  ExportedLayer,
  ExportedObject,
  ExportedTextureInfo,
  ExportedVariantLayer,
  ExportedVariantLayerDef,
} from "./exportTypes.js";
import {
  bufferHash,
  renderLayerToColorBuffer,
  renderLayerToNormalHeightBuffer,
  writePng,
} from "./raster.js";

/**
 * Accumulates deduplicated textures and the pending PNG write promises.
 *
 * This is the original handler's `textures` / `colorWritten` / `normalWritten`
 * / `allWritePromises` quartet, moved intact.
 */
export class TextureRegistry {
  readonly textures: { [path: string]: ExportedTextureInfo } = {};
  private readonly colorWritten = new Set<string>();
  private readonly normalWritten = new Set<string>();
  private readonly allWritePromises: Promise<void>[] = [];

  constructor(private readonly texturesSubdir: string) {}

  ensureColorTexture(
    buffer: Buffer,
    width: number,
    height: number,
  ): string | null {
    const hash = bufferHash(buffer);
    const path = `textures/${hash}.png`;
    if (!this.colorWritten.has(hash)) {
      this.colorWritten.add(hash);
      this.textures[path] = { width, height };
      this.allWritePromises.push(
        writePng(
          buffer,
          width,
          height,
          join(this.texturesSubdir, `${hash}.png`),
        ),
      );
    }
    return path;
  }

  ensureNormalTexture(
    buffer: Buffer,
    width: number,
    height: number,
  ): string | null {
    const hash = bufferHash(buffer);
    const path = `textures/${hash}_nrm.png`;
    if (!this.normalWritten.has(hash)) {
      this.normalWritten.add(hash);
      this.textures[path] = { width, height };
      this.allWritePromises.push(
        writePng(
          buffer,
          width,
          height,
          join(this.texturesSubdir, `${hash}_nrm.png`),
        ),
      );
    }
    return path;
  }

  /** Await every queued PNG write. */
  async flush(): Promise<void> {
    await Promise.all(this.allWritePromises);
  }

  /** Number of distinct textures written (colour + normal). */
  get count(): number {
    return Object.keys(this.textures).length;
  }
}

/**
 * Export-time `variantOffset` → `variantOffsets` migration (M8).
 *
 * Moved VERBATIM from `src/routes/export.ts:576-580`.
 *
 * ⚠️ BUG, PINNED DELIBERATELY — DO NOT FIX. When a layer carries a legacy
 * `variantOffset` but no `selectedVariantId`, the key falls back to `""` and
 * the export emits `{"": {x, y}}` — an entry no consumer can look up, since no
 * variant has the id `""`. Task 07 pinned this as OBSERVED behaviour in
 * `src/__tests__/normalizePixel.test.ts`.
 *
 * Fixing it changes exported JSON, and `server/exports/lib/` is consumed by
 * external game code (OPEN-QUESTIONS.md Q33), so a fix needs a coordinated
 * version bump plus explicit owner sign-off. MASTER.md §9.4 lists it as
 * explicitly REJECTED for this task.
 */
export function exportVariantOffsets(
  // Narrowed to exactly the three fields the rule reads, so the pinned tests
  // can pass minimal literals rather than whole synthetic layers.
  layer: Pick<
    CompactLayer,
    "variantOffsets" | "variantOffset" | "selectedVariantId"
  >,
): { [variantId: string]: { x: number; y: number } } | undefined {
  return (
    layer.variantOffsets ??
    (layer.variantOffset
      ? { [layer.selectedVariantId ?? ""]: layer.variantOffset }
      : undefined)
  );
}

/** Transform on-disk objects into the exported wire shape, rasterising layers. */
export function buildFinalObjects(
  project: CompactProject,
  registry: TextureRegistry,
): ExportedObject[] {
  return project.objects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    gridSize: obj.gridSize,
    ...(obj.origin ? { origin: obj.origin } : {}),
    frames: obj.frames.map((frame) => ({
      id: frame.id,
      name: frame.name,
      layers: frame.layers.map((layer) => {
        if (layer.isVariant && layer.variantGroupId != null) {
          return {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            colorTexture: null,
            normalTexture: null,
            isVariant: true,
            variantLayerId: layer.variantGroupId,
            selectedVariantId: layer.selectedVariantId,
            variantOffsets: exportVariantOffsets(layer),
          } as ExportedLayer;
        }
        const w = obj.gridSize.width;
        const h = obj.gridSize.height;
        const colorBuf = renderLayerToColorBuffer(layer, w, h);
        const normalBuf = renderLayerToNormalHeightBuffer(layer, w, h);
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          colorTexture: registry.ensureColorTexture(colorBuf, w, h),
          normalTexture: registry.ensureNormalTexture(normalBuf, w, h),
        } as ExportedLayer;
      }),
    })),
  }));
}

/** Transform on-disk variant layers into the exported wire shape. */
export function buildFinalVariantLayers(
  project: CompactProject,
  registry: TextureRegistry,
): ExportedVariantLayerDef[] {
  return (project.variants ?? []).map((vg) => ({
    id: vg.id,
    name: vg.name,
    variants: vg.variants.map((v) => ({
      id: v.id,
      name: v.name,
      gridSize: v.gridSize,
      frames: v.frames.map((vf) => ({
        id: vf.id,
        layers: vf.layers.map((layer) => {
          const w = v.gridSize.width;
          const h = v.gridSize.height;
          const colorBuf = renderLayerToColorBuffer(layer, w, h);
          const normalBuf = renderLayerToNormalHeightBuffer(layer, w, h);
          return {
            colorTexture: registry.ensureColorTexture(colorBuf, w, h),
            normalTexture: registry.ensureNormalTexture(normalBuf, w, h),
          } as ExportedVariantLayer;
        }),
      })),
      baseFrameOffsets: Object.fromEntries(
        Object.entries(v.baseFrameOffsets ?? {}).map(([k, val]) => [k, val]),
      ),
    })),
  }));
}
