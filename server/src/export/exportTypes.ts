/**
 * The three schema families the exporter works with.
 *
 * Moved VERBATIM from `src/routes/export.ts:43-219` (REFRESH task 11):
 *   - `Compact*`         — the INPUT schema, a hand-copy of the client's
 *                          on-disk project JSON shape.
 *   - `Exported*`        — the intermediate wire schema (7 interfaces).
 *   - `CompactExported*` — the emitted string-table format (7 interfaces).
 *
 * ⚠️ These are a hand-copy of the client's `Compact*` types and they have
 * DRIFTED deliberately. `CompactFrame` below omits the `tags?: string[]` that
 * the client's equivalent carries, so exported `frames.json` loses frame tags.
 * That is a KNOWN gap and it is NOT fixed here: restoring it changes the
 * PUBLISHED export format consumed by external game code and requires a
 * coordinated version bump plus owner sign-off (OPEN-QUESTIONS.md Q33).
 *
 * Sharing these across the client/server package boundary would need a
 * `shared/` workspace, which is explicitly out of scope for this refresh
 * (MASTER.md §9.4).
 */

// Compact format types (minimal for export - matches project JSON on disk)
export type CompactPixelData = [number, number, number] | 0;

export interface CompactLayer {
  id: string;
  name: string;
  pixels: CompactPixelData[][];
  visible: boolean;
  isVariant?: boolean;
  variantGroupId?: string; // on-disk field name (maps to variantLayerId in export)
  selectedVariantId?: string;
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
  variantOffset?: { x: number; y: number };
}

export interface CompactFrame {
  id: string;
  name: string;
  layers: CompactLayer[];
}

export interface CompactVariantFrame {
  id: string;
  layers: CompactLayer[];
}

export interface CompactVariant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: CompactVariantFrame[];
  baseFrameOffsets: { [baseFrameIndex: number]: { x: number; y: number } };
}

export interface CompactVariantLayerInput {
  id: string;
  name: string;
  variants: CompactVariant[];
}

export interface CompactPixelObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: CompactFrame[];
  origin?: { x: number; y: number };
}

export interface CompactProject {
  version?: string;
  objects: CompactPixelObject[];
  variants?: CompactVariantLayerInput[];
}

// Exported JSON types
export interface ExportedTextureInfo {
  width: number;
  height: number;
}

export interface ExportedLayer {
  id: string;
  name: string;
  visible: boolean;
  colorTexture: string | null;
  normalTexture: string | null;
  isVariant?: boolean;
  variantLayerId?: string;
  selectedVariantId?: string;
  variantOffsets?: { [variantId: string]: { x: number; y: number } };
}

export interface ExportedFrame {
  id: string;
  name: string;
  layers: ExportedLayer[];
}

export interface ExportedVariantLayer {
  colorTexture: string | null;
  normalTexture: string | null;
}

export interface ExportedVariantFrame {
  id: string;
  layers: ExportedVariantLayer[];
}

export interface ExportedVariant {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: ExportedVariantFrame[];
  baseFrameOffsets: { [key: string]: { x: number; y: number } };
}

export interface ExportedVariantLayerDef {
  id: string;
  name: string;
  variants: ExportedVariant[];
}

export interface ExportedObject {
  id: string;
  name: string;
  gridSize: { width: number; height: number };
  frames: ExportedFrame[];
  origin?: { x: number; y: number };
  maxCanvas?: {
    width: number;
    height: number;
    offset: { x: number; y: number };
  };
}

export interface ExportedProject {
  version: string;
  projectName: string;
  objects: ExportedObject[];
  variantLayers: ExportedVariantLayerDef[];
  textures: { [path: string]: ExportedTextureInfo };
}

// Compact export format: string table + short keys + numeric string refs
export type SI = number; // string table index
export interface CompactExportedLayer {
  i: SI;
  n: SI;
  vis: boolean;
  c: SI | null;
  m: SI | null;
  iv?: true;
  vg?: SI;
  sv?: SI;
  vo?: { [key: string]: [number, number] };
}
export interface CompactExportedFrame {
  i: SI;
  n: SI;
  l: CompactExportedLayer[];
}
export interface CompactExportedObject {
  i: SI;
  n: SI;
  g: [number, number];
  f: CompactExportedFrame[];
  or?: [number, number]; // origin [x, y]
  mc?: [number, number, number, number]; // maxCanvas [width, height, offsetX, offsetY]
}
export interface CompactExportedVariantLayer {
  c: SI | null;
  m: SI | null;
}
export interface CompactExportedVariantFrame {
  i: SI;
  l: CompactExportedVariantLayer[];
}
export interface CompactExportedVariant {
  i: SI;
  n: SI;
  g: [number, number];
  f: CompactExportedVariantFrame[];
  bo: { [key: string]: [number, number] };
}
export interface CompactExportedVariantLayerDef {
  i: SI;
  n: SI;
  v: CompactExportedVariant[];
}
export interface CompactExportedRoot {
  v: number;
  p: SI;
  s: string[];
  o: CompactExportedObject[];
  r: CompactExportedVariantLayerDef[];
  t: { [key: string]: [number, number] };
}

/** The result `runExport` hands back to the route. */
export interface ExportResult {
  kebabName: string;
  /**
   * Absolute server filesystem path of the export directory.
   *
   * ⚠️ RETAINED DELIBERATELY. Task 11's spec proposed dropping this from the
   * HTTP response, on the premise that only `kebabName` is consumed. That
   * premise is WRONG: `client/src/components/Header/Header.tsx:97` reads it
   * (`setExportMessage(\`Exported to ${result.path}\`)`). Task 11 may not touch
   * `client/`, and the spec itself says to keep `path` until the client task
   * removes the reader. Remove it only together with that call site.
   */
  path: string;
  frameCount: number;
  textureCount: number;
  bytes: number;
}
