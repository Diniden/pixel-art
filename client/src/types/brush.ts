/**
 * Brush document types & colourisation (Brush Studio plan,
 * `docs/01-brush-studio`, task 01; multi-brush projects,
 * `docs/14-multi-brush-projects`, task 05).
 *
 * A brush document is a SEPARATE type family from the pixel project. It never
 * extends `Project` / `Layer` / `Frame` from `./domain`; the only thing it
 * borrows is the `Pixel` RGBA shape for rendering. The in-memory shape here IS
 * the wire shape (MASTER D3) — brush files are plain `JSON.stringify` of a
 * `BrushDocument`; there is no compact codec.
 *
 * The document has two levels. A `BrushDocument` (one file, a brush
 * **project**) is `{ version: "brush-2", brushes: Brush[] }` — never empty,
 * ids unique. Each `Brush` has its own `width × height`, frames, layers and
 * applied groups: exactly the shape a whole brush-1 file had. A legacy brush-1
 * file (no `brushes` key; `width`/`height`/`frames` at the top level) is
 * wrapped by `normalizeBrushDocument` as one brush, `id: "brush-1"`,
 * `name: "Brush 1"`, losslessly; the first save writes it back as brush-2.
 *
 * Every cell is either `0` (unpainted, renders transparent) or a 4-tuple of
 * signed deltas in −255..255. Rendering maps each delta through a 127-centred
 * function (`deltaToByte`, MASTER D5): −255 → 0, 0 → 127, 255 → 255.
 *
 * This module is pure: no MobX, no store, no API. Grids are plain arrays
 * indexed `[y][x]`.
 */
import type { Pixel } from "./domain";

export type BrushChannelType = "hsl" | "rgb" | "normal" | "heightmap";
export const BRUSH_CHANNEL_TYPES: readonly BrushChannelType[] = [
  "hsl",
  "rgb",
  "normal",
  "heightmap",
];
export const BRUSH_CHANNELS: Record<BrushChannelType, readonly string[]> = {
  hsl: ["H", "S", "L", "A"],
  rgb: ["R", "G", "B", "A"],
  normal: ["X", "Y", "Z"],
  heightmap: ["H"],
};
export const BRUSH_CHANNEL_BADGE: Record<BrushChannelType, string> = {
  hsl: "HSL",
  rgb: "RGB",
  normal: "NRM",
  heightmap: "HGT",
};
/** Where the pixel-studio Brush tool takes the colour a layer's deltas operate on. */
export type BrushColorSource = "selected" | "target";
export const BRUSH_COLOR_SOURCES: readonly BrushColorSource[] = [
  "selected",
  "target",
];
export const BRUSH_COLOR_SOURCE_LABEL: Record<BrushColorSource, string> = {
  selected: "Selected colour",
  target: "Target pixel",
};
export const BRUSH_COLOR_SOURCE_BADGE: Record<BrushColorSource, string> = {
  selected: "SEL",
  target: "TGT",
};
/** The default when the key is absent — every pre-existing brush file. */
export const DEFAULT_BRUSH_COLOR_SOURCE: BrushColorSource = "selected";
export const BRUSH_DELTA_MIN = -255;
export const BRUSH_DELTA_MAX = 255;
/** Four signed deltas in −255..255. Unused slots (normal: index 3; heightmap: 1–3) are 0. */
export type BrushDelta = [number, number, number, number];
/** `0` = unpainted (renders transparent). */
export type BrushCell = BrushDelta | 0;
export interface BrushAppliedGroup {
  id: string;
  name: string;
}
export interface BrushLayer {
  id: string;
  name: string;
  channelType: BrushChannelType;
  visible: boolean;
  appliedGroupId?: string;
  /**
   * Where the pixel-studio Brush tool seeds this layer's deltas. Absent means
   * `"selected"` (the picked colour); the key is present only when `"target"`
   * (the pixel already on the canvas). Optional and additive — old brush files
   * never carry it (plan 13 D1).
   */
  colorSource?: BrushColorSource;
  pixels: BrushCell[][] /* [y][x] */;
}
export interface BrushFrame {
  id: string;
  name: string;
  layers: BrushLayer[];
}
/** One brush inside a project: today's whole-file body plus `id` / `name`. */
export interface Brush {
  id: string;
  name: string;
  width: number;
  height: number;
  frames: BrushFrame[];
  appliedGroups: BrushAppliedGroup[];
}
export const BRUSH_DOCUMENT_VERSION = "brush-2" as const;
/**
 * The pre-multi-brush file shape: one brush's body at the top level, no
 * `brushes` key. Exported for documentation and tests; the normaliser detects
 * a legacy file by its structure, never by this string.
 */
export const LEGACY_BRUSH_DOCUMENT_VERSION = "brush-1" as const;
export interface BrushDocument {
  version: typeof BRUSH_DOCUMENT_VERSION;
  /** Never empty; ids unique. */
  brushes: Brush[];
}

/**
 * Resolve a layer's colour source, treating an absent key as `"selected"`.
 * Structural parameter so `ui/` scene layers can pass through it.
 */
export function brushLayerColorSource(layer: {
  colorSource?: BrushColorSource;
}): BrushColorSource {
  return layer.colorSource ?? DEFAULT_BRUSH_COLOR_SOURCE;
}

// ============================================
// Colourisation (MASTER D5)
// ============================================

/** Round and clamp a delta to −255..255. `NaN` (and anything non-finite) → 0. */
export function clampDelta(v: number): number {
  if (!Number.isFinite(v)) return 0;
  // `Math.round(-0.4)` is `-0`; `|| 0` folds it to `+0` so a signed zero never
  // reaches a stored cell.
  const r = Math.round(v) || 0;
  return Math.max(BRUSH_DELTA_MIN, Math.min(BRUSH_DELTA_MAX, r));
}

/** −255 → 0, 0 → 127, 255 → 255. Output is always an integer byte. */
export function deltaToByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(127 + v / 2)));
}

/**
 * Colourise one cell for rendering.
 * - `hsl` / `rgb`: channel-for-channel, alpha included (a painted cell with
 *   A = 0 renders at alpha 127 — see MASTER §1 "Alpha channel rendering").
 * - `normal`: X/Y/Z → R/G/B, alpha 255.
 * - `heightmap`: grey from H, alpha 255.
 * - `0`: `null` (unpainted, transparent).
 */
export function brushCellToRgba(
  cell: BrushCell,
  type: BrushChannelType,
): Pixel | null {
  if (cell === 0) return null;
  switch (type) {
    case "hsl":
    case "rgb":
      return {
        r: deltaToByte(cell[0]),
        g: deltaToByte(cell[1]),
        b: deltaToByte(cell[2]),
        a: deltaToByte(cell[3]),
      };
    case "normal":
      return {
        r: deltaToByte(cell[0]),
        g: deltaToByte(cell[1]),
        b: deltaToByte(cell[2]),
        a: 255,
      };
    case "heightmap": {
      const grey = deltaToByte(cell[0]);
      return { r: grey, g: grey, b: grey, a: 255 };
    }
  }
}

// ============================================
// Factories
// ============================================

export function createEmptyBrushGrid(
  width: number,
  height: number,
): BrushCell[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, (): BrushCell => 0),
  );
}

export function createBrushLayer(
  id: string,
  name: string,
  width: number,
  height: number,
  channelType: BrushChannelType = "rgb",
  colorSource: BrushColorSource = "selected",
): BrushLayer {
  const layer: BrushLayer = {
    id,
    name,
    channelType,
    visible: true,
    pixels: createEmptyBrushGrid(width, height),
  };
  // The key is present only for `"target"` so the default output stays
  // byte-identical to a pre-plan-13 layer.
  if (colorSource === "target") layer.colorSource = "target";
  return layer;
}

export function createBrushFrame(
  id: string,
  name: string,
  layers: BrushLayer[],
): BrushFrame {
  return { id, name, layers };
}

/**
 * One brush with one frame (`frame-1` / "Frame 1") holding one rgb layer
 * (`layer-1` / "Layer 1"). Frame and layer ids are unique WITHIN a brush only;
 * every brush reuses these deterministic ids.
 */
export function createBrush(
  id: string,
  name: string,
  width = 16,
  height = 16,
): Brush {
  return {
    id,
    name,
    width,
    height,
    frames: [
      createBrushFrame("frame-1", "Frame 1", [
        createBrushLayer("layer-1", "Layer 1", width, height),
      ]),
    ],
    appliedGroups: [],
  };
}

/** One brush, id `"brush-1"`, named `name` (default "Brush 1"). */
export function createBrushDocument(
  width = 16,
  height = 16,
  name = "Brush 1",
): BrushDocument {
  return {
    version: BRUSH_DOCUMENT_VERSION,
    brushes: [createBrush("brush-1", name, width, height)],
  };
}

/**
 * The one selected-brush rule (MASTER D4): find by id, else the first brush,
 * else `null`. Returns the object held by `doc`, not a copy — the
 * `selectedFrameIn` convention.
 */
export function brushIn(
  doc: BrushDocument | null,
  brushId: string | null,
): Brush | null {
  if (!doc) return null;
  if (brushId !== null) {
    const found = doc.brushes.find((b) => b.id === brushId);
    if (found) return found;
  }
  return doc.brushes[0] ?? null;
}

// ============================================
// Invariants (MASTER D6)
// ============================================

/**
 * Throws unless every frame carries the same layer ids in the same order as
 * frame 0, and every layer grid is exactly `height` rows × `width` cells.
 */
export function assertUniformLayers(brush: Brush): void {
  const { width, height, frames } = brush;
  if (frames.length === 0) {
    throw new Error("Brush document has no frames");
  }
  const expectedIds = frames[0].layers.map((l) => l.id);
  frames.forEach((frame, fi) => {
    const ids = frame.layers.map((l) => l.id);
    if (
      ids.length !== expectedIds.length ||
      ids.some((id, i) => id !== expectedIds[i])
    ) {
      throw new Error(
        `Brush frame ${fi} (${frame.id}) layer ids [${ids.join(",")}] differ from frame 0 [${expectedIds.join(",")}]`,
      );
    }
    frame.layers.forEach((layer) => {
      if (layer.pixels.length !== height) {
        throw new Error(
          `Brush layer ${layer.id} in frame ${frame.id} has ${layer.pixels.length} rows, expected ${height}`,
        );
      }
      layer.pixels.forEach((row, y) => {
        if (row.length !== width) {
          throw new Error(
            `Brush layer ${layer.id} in frame ${frame.id} row ${y} has ${row.length} cells, expected ${width}`,
          );
        }
      });
    });
  });
}

/**
 * Throws unless the document holds at least one brush, every brush id is
 * unique, and every brush satisfies `assertUniformLayers`.
 */
export function assertBrushDocument(doc: BrushDocument): void {
  if (doc.brushes.length === 0) {
    throw new Error("Brush document has no brushes");
  }
  const seen = new Set<string>();
  for (const brush of doc.brushes) {
    if (seen.has(brush.id)) {
      throw new Error(`Brush document has duplicate brush id ${brush.id}`);
    }
    seen.add(brush.id);
  }
  doc.brushes.forEach(assertUniformLayers);
}

// ============================================
// Lenient normaliser for raw JSON
// ============================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isChannelType(v: unknown): v is BrushChannelType {
  return (
    typeof v === "string" &&
    (BRUSH_CHANNEL_TYPES as readonly string[]).includes(v)
  );
}

export function isColorSource(v: unknown): v is BrushColorSource {
  return (
    typeof v === "string" &&
    (BRUSH_COLOR_SOURCES as readonly string[]).includes(v)
  );
}

function normalizeCell(raw: unknown): BrushCell {
  if (!Array.isArray(raw)) return 0;
  const n = (i: number): number =>
    typeof raw[i] === "number" ? clampDelta(raw[i]) : 0;
  return [n(0), n(1), n(2), n(3)];
}

function normalizeGrid(
  raw: unknown,
  width: number,
  height: number,
): BrushCell[][] {
  const rows = Array.isArray(raw) ? raw : [];
  return Array.from({ length: height }, (_, y) => {
    const row = Array.isArray(rows[y]) ? (rows[y] as unknown[]) : [];
    return Array.from({ length: width }, (_, x) => normalizeCell(row[x]));
  });
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function normalizeLayer(
  raw: unknown,
  index: number,
  width: number,
  height: number,
): BrushLayer {
  const r = isRecord(raw) ? raw : {};
  const layer: BrushLayer = {
    id: stringOr(r.id, `layer-${index + 1}`),
    name: stringOr(r.name, `Layer ${index + 1}`),
    channelType: isChannelType(r.channelType) ? r.channelType : "rgb",
    visible: typeof r.visible === "boolean" ? r.visible : true,
    pixels: normalizeGrid(r.pixels, width, height),
  };
  if (typeof r.appliedGroupId === "string" && r.appliedGroupId.length > 0) {
    layer.appliedGroupId = r.appliedGroupId;
  }
  // Absent, `"selected"` or garbage all leave the key absent (the default).
  if (r.colorSource === "target") layer.colorSource = "target";
  return layer;
}

function normalizeFrame(
  raw: unknown,
  index: number,
  width: number,
  height: number,
): BrushFrame {
  const r = isRecord(raw) ? raw : {};
  const layers = Array.isArray(r.layers) ? r.layers : [];
  return {
    id: stringOr(r.id, `frame-${index + 1}`),
    name: stringOr(r.name, `Frame ${index + 1}`),
    layers: layers.map((l, i) => normalizeLayer(l, i, width, height)),
  };
}

function normalizeAppliedGroups(raw: unknown): BrushAppliedGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: BrushAppliedGroup[] = [];
  for (const g of raw) {
    if (isRecord(g) && typeof g.id === "string" && g.id.length > 0) {
      out.push({ id: g.id, name: stringOr(g.name, g.id) });
    }
  }
  return out;
}

/**
 * Coerce one raw brush body (a brush-2 `brushes[index]` entry, or a whole
 * legacy brush-1 file) into a `Brush`, or return `null`.
 *
 * Rejects unless `raw` is an object with numeric `width`/`height` ≥ 1 and a
 * non-empty `frames` array. Otherwise floors the dimensions, fills
 * `id`/`name` (→ `brush-<index+1>` / `Brush <index+1>`), `appliedGroups`
 * (→ `[]`), `visible` (→ `true`), unknown `channelType` (→ `"rgb"`), clamps
 * every cell via `clampDelta` and pads/truncates every grid to
 * `height × width`. Layer uniformity is checked by the caller.
 */
function normalizeBrush(raw: unknown, index: number): Brush | null {
  if (!isRecord(raw)) return null;
  const { width: rawW, height: rawH, frames: rawFrames } = raw;
  if (typeof rawW !== "number" || !Number.isFinite(rawW) || rawW < 1) {
    return null;
  }
  if (typeof rawH !== "number" || !Number.isFinite(rawH) || rawH < 1) {
    return null;
  }
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) return null;

  const width = Math.floor(rawW);
  const height = Math.floor(rawH);
  return {
    id: stringOr(raw.id, `brush-${index + 1}`),
    name: stringOr(raw.name, `Brush ${index + 1}`),
    width,
    height,
    frames: rawFrames.map((f, i) => normalizeFrame(f, i, width, height)),
    appliedGroups: normalizeAppliedGroups(raw.appliedGroups),
  };
}

/**
 * Coerce untrusted JSON into a `BrushDocument`, or return `null` (MASTER D2).
 *
 * Accepts both file shapes; the `version` string is never read — the
 * normaliser is lenient about the string and strict about the structure.
 * - `raw.brushes` is an array → brush-2: every entry goes through
 *   `normalizeBrush`; ANY invalid entry rejects the whole document.
 * - No `brushes` key at all → legacy brush-1: the object itself is one brush,
 *   `id: "brush-1"`, `name: "Brush 1"` (a legacy file has neither key), its
 *   frames and applied groups normalised exactly as before — a clean legacy
 *   file wraps byte-identically.
 * - A present-but-wrong `brushes` (a string, `null`, an object) → `null`.
 * Finally runs `assertBrushDocument` (≥ 1 brush, unique ids, uniform layers)
 * and returns `null` if it throws: a corrupt file is an error, never a blank
 * default.
 */
export function normalizeBrushDocument(raw: unknown): BrushDocument | null {
  if (!isRecord(raw)) return null;

  let brushes: Brush[];
  if (Array.isArray(raw.brushes)) {
    brushes = [];
    for (let i = 0; i < raw.brushes.length; i++) {
      const brush = normalizeBrush(raw.brushes[i], i);
      if (brush === null) return null;
      brushes.push(brush);
    }
  } else if (!("brushes" in raw)) {
    const brush = normalizeBrush(raw, 0);
    if (brush === null) return null;
    brushes = [brush];
  } else {
    return null;
  }

  const doc: BrushDocument = { version: BRUSH_DOCUMENT_VERSION, brushes };
  try {
    assertBrushDocument(doc);
  } catch {
    return null;
  }
  return doc;
}
