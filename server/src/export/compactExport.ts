/**
 * String-table construction and compaction of the exported project.
 *
 * Moved VERBATIM from `src/routes/export.ts:221-370` (REFRESH task 11).
 *
 * ⚠️ BYTE-SENSITIVE. `toCompactExport`'s output is `JSON.stringify`d straight
 * into the published `frames.json`, so KEY INSERTION ORDER is part of the wire
 * format. Reordering an object literal here changes the emitted bytes even
 * though the data is identical. `server/exports/lib/` is consumed by external
 * game code (OPEN-QUESTIONS.md Q33).
 */

import type {
  CompactExportedLayer,
  CompactExportedRoot,
  ExportedProject,
} from "./exportTypes.js";

export function collectStrings(proj: ExportedProject): {
  stringTable: string[];
  str2idx: Map<string, number>;
} {
  const stringTable: string[] = [];
  const str2idx = new Map<string, number>();
  function add(s: string): number {
    let idx = str2idx.get(s);
    if (idx === undefined) {
      idx = stringTable.length;
      str2idx.set(s, idx);
      stringTable.push(s);
    }
    return idx;
  }
  add(proj.version);
  add(proj.projectName);
  for (const obj of proj.objects) {
    add(obj.id);
    add(obj.name);
    for (const frame of obj.frames) {
      add(frame.id);
      add(frame.name);
      for (const layer of frame.layers) {
        add(layer.id);
        add(layer.name);
        if (layer.colorTexture != null) add(layer.colorTexture);
        if (layer.normalTexture != null) add(layer.normalTexture);
        if (layer.variantLayerId != null) add(layer.variantLayerId);
        if (layer.selectedVariantId != null) add(layer.selectedVariantId);
        if (layer.variantOffsets) {
          for (const k of Object.keys(layer.variantOffsets)) add(k);
        }
      }
    }
  }
  for (const vg of proj.variantLayers ?? []) {
    add(vg.id);
    add(vg.name);
    for (const v of vg.variants) {
      add(v.id);
      add(v.name);
      for (const vf of v.frames) {
        add(vf.id);
        for (const vl of vf.layers) {
          if (vl.colorTexture != null) add(vl.colorTexture);
          if (vl.normalTexture != null) add(vl.normalTexture);
        }
      }
      // baseFrameOffsets keys stay as "0", "1", "2" - not in string table
    }
  }
  for (const path of Object.keys(proj.textures)) {
    add(path);
  }
  return { stringTable, str2idx };
}

export function toCompactExport(
  proj: ExportedProject,
  stringTable: string[],
  str2idx: Map<string, number>,
): CompactExportedRoot {
  const idx = (s: string) => str2idx.get(s) ?? 0;
  const t: { [key: string]: [number, number] } = {};
  for (const [path, info] of Object.entries(proj.textures)) {
    t[String(str2idx.get(path))] = [info.width, info.height];
  }
  return {
    v: idx(proj.version),
    p: idx(proj.projectName),
    s: stringTable,
    o: proj.objects.map((obj) => ({
      i: idx(obj.id),
      n: idx(obj.name),
      g: [obj.gridSize.width, obj.gridSize.height],
      ...(obj.origin
        ? { or: [obj.origin.x, obj.origin.y] as [number, number] }
        : {}),
      ...(obj.maxCanvas
        ? {
            mc: [
              obj.maxCanvas.width,
              obj.maxCanvas.height,
              obj.maxCanvas.offset.x,
              obj.maxCanvas.offset.y,
            ] as [number, number, number, number],
          }
        : {}),
      f: obj.frames.map((frame) => ({
        i: idx(frame.id),
        n: idx(frame.name),
        l: frame.layers.map((layer) => {
          if (layer.isVariant && layer.variantLayerId != null) {
            const vo: { [key: string]: [number, number] } = {};
            if (layer.variantOffsets) {
              for (const [k, val] of Object.entries(layer.variantOffsets)) {
                vo[String(str2idx.get(k))] = [val.x, val.y];
              }
            }
            return {
              i: idx(layer.id),
              n: idx(layer.name),
              vis: layer.visible,
              c: null,
              m: null,
              iv: true,
              vg: idx(layer.variantLayerId),
              sv:
                layer.selectedVariantId != null
                  ? idx(layer.selectedVariantId)
                  : undefined,
              ...(Object.keys(vo).length > 0 ? { vo } : {}),
            } as CompactExportedLayer;
          }
          return {
            i: idx(layer.id),
            n: idx(layer.name),
            vis: layer.visible,
            c: layer.colorTexture != null ? idx(layer.colorTexture) : null,
            m: layer.normalTexture != null ? idx(layer.normalTexture) : null,
          } as CompactExportedLayer;
        }),
      })),
    })),
    r: (proj.variantLayers ?? []).map((vg) => ({
      i: idx(vg.id),
      n: idx(vg.name),
      v: vg.variants.map((v) => ({
        i: idx(v.id),
        n: idx(v.name),
        g: [v.gridSize.width, v.gridSize.height],
        f: v.frames.map((vf) => ({
          i: idx(vf.id),
          l: vf.layers.map((vl) => ({
            c: vl.colorTexture != null ? idx(vl.colorTexture) : null,
            m: vl.normalTexture != null ? idx(vl.normalTexture) : null,
          })),
        })),
        bo: Object.fromEntries(
          Object.entries(v.baseFrameOffsets ?? {}).map(([k, val]) => [
            k,
            [val.x, val.y],
          ]),
        ),
      })),
    })),
    t,
  };
}
