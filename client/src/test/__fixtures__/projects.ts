/**
 * Shared fixtures and corpus loaders for the serialization / migration
 * characterisation suites (REFRESH task 07).
 *
 * ⚠️ Everything under `__fixtures__/corpus/` is a COPY of the owner's real
 * artwork. It is byte-significant, excluded from Prettier, and must never be
 * regenerated or reformatted. See `corpus/README.md`.
 *
 * ⚠️ MEASURED 2026-08-16: all 149 real snapshots are already fully migrated, so
 * NONE of them exercises any of the 8 migrations. Every migration fixture below
 * is hand-authored synthetic data built from the migration source itself.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  CompactLayer,
  CompactProject,
  CompactUIState,
  Layer,
  Project,
} from "@/types";

const corpusDir = fileURLToPath(new URL("./corpus/", import.meta.url));

/** Absolute path to a corpus file. */
export function corpusPath(name: string): string {
  return `${corpusDir}${name}`;
}

/**
 * Every `*.json` in the corpus, sorted for deterministic test ordering.
 *
 * THROWS if the corpus is missing. The corpus is gitignored (owner decision,
 * 2026-08-16: 149 MB of real artwork does not belong in an 8 MB repo's
 * permanent history), so a fresh clone has an empty directory here.
 *
 * Returning `[]` in that case would make every corpus suite iterate zero files
 * and report PASS -- a regression gate that is green precisely because it is
 * testing nothing. That is the failure mode this project keeps hitting
 * (MASTER.md §9.9), so this fails loudly instead and says how to fix it.
 */
export function corpusFiles(): string[] {
  const files = readdirSync(corpusDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `Migration corpus is empty at ${corpusDir}\n\n` +
        `The corpus is gitignored -- it is 149 MB of the owner's real artwork.\n` +
        `Regenerate it from the gzipped backups before running the corpus suites:\n` +
        `  see client/src/test/__fixtures__/corpus/README.md\n\n` +
        `Refusing to report a pass on zero files: that would be a green gate\n` +
        `that verifies nothing.`,
    );
  }
  return files;
}

/**
 * One real project snapshot out of the corpus.
 *
 * `backup-*.json` files are maps of snapshot-name → CompactProject; the two
 * standalone project files hold a single project directly.
 */
export interface CorpusSnapshot {
  /** e.g. `backup-02-25-2026.json` */
  file: string;
  /** e.g. `Test Blend-07-57-05.json`, or the file name for standalone files. */
  key: string;
  data: CompactProject;
}

/**
 * Load every snapshot in one corpus file.
 *
 * Deliberately per-file rather than "load everything": the full corpus is 149 MB
 * of JSON and expands to ~2 GB of runtime objects. Tests iterate file by file so
 * only one archive is resident at a time.
 */
export function loadCorpusFile(file: string): CorpusSnapshot[] {
  const raw: unknown = JSON.parse(readFileSync(corpusPath(file), "utf8"));
  if (file.startsWith("backup-")) {
    return Object.entries(raw as Record<string, CompactProject>).map(
      ([key, data]) => ({ file, key, data }),
    );
  }
  return [{ file, key: file, data: raw as CompactProject }];
}

/**
 * Stable digest of any value, used instead of `toMatchSnapshot()`.
 *
 * WHY: a vitest snapshot of the *runtime* form of the smallest corpus file
 * (`test-blend.json`, 29,922 bytes) measures 780,687 bytes — a 26x expansion.
 * Across the 149 MB corpus that is ~4.1 GB of `.snap`, which defeats the whole
 * point: task 07 requires a human to review every committed snapshot by eye.
 * A digest is the same regression gate (any changed byte flips it) in a form a
 * human can actually read.
 *
 * Object keys are sorted so the digest depends on content, not insertion order.
 * `undefined` values are preserved as an explicit marker, because "key present
 * with value undefined" vs "key absent" is a real distinction in this codebase
 * (`projectToCompact` emits `originColor: undefined`).
 */
export function digest(value: unknown): string {
  const hash = createHash("sha256");
  // Streamed in 64 KB chunks rather than concatenated into one giant string.
  // Measured: building the whole canonical form as a single string took ~7s for
  // the largest archive (46 MB compact, far larger expanded); streaming brings
  // that down by an order of magnitude and keeps peak memory flat.
  let buffer = "";
  const emit = (s: string): void => {
    buffer += s;
    if (buffer.length >= 65536) {
      hash.update(buffer);
      buffer = "";
    }
  };
  canonicalize(value, emit);
  hash.update(buffer);
  return hash.digest("hex");
}

function canonicalize(value: unknown, emit: (s: string) => void): void {
  if (value === undefined) return emit(" undefined");
  if (value === null) return emit("null");
  if (typeof value === "number") {
    return emit(Number.isFinite(value) ? String(value) : ` ${String(value)}`);
  }
  if (typeof value !== "object") return emit(JSON.stringify(value) ?? "null");
  if (Array.isArray(value)) {
    emit("[");
    for (let i = 0; i < value.length; i++) {
      if (i > 0) emit(",");
      canonicalize(value[i], emit);
    }
    return emit("]");
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  emit("{");
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) emit(",");
    emit(`${JSON.stringify(entries[i][0])}:`);
    canonicalize(entries[i][1], emit);
  }
  emit("}");
}

/**
 * Yield to the macrotask queue.
 *
 * The corpus tests do tens of seconds of synchronous CPU work. That starves
 * vitest's worker RPC heartbeat, which surfaces as
 * `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` and a non-zero exit
 * even when every assertion passed. Awaiting a real macrotask between archives
 * lets the heartbeat through.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================================================
// Hand-built runtime fixture (roundtrip R2)
// ============================================================================

function px(color: number, normal: number, height: number) {
  return {
    color:
      color === 0
        ? (0 as const)
        : {
            r: (color >>> 24) & 0xff,
            g: (color >>> 16) & 0xff,
            b: (color >>> 8) & 0xff,
            a: color & 0xff,
          },
    normal:
      normal === 0
        ? (0 as const)
        : {
            x: ((normal >>> 16) & 0xff) - 128,
            y: ((normal >>> 8) & 0xff) - 128,
            z: normal & 0xff,
          },
    height,
  };
}

function grid(w: number, h: number, seed: number) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) =>
      (x + y + seed) % 3 === 0
        ? px(0, 0, 0)
        : px(
            ((x * 37 + seed) % 256 << 24) | (y * 11 % 256 << 16) | 0xff,
            (((x + 128) % 256) << 16) | (((y + 128) % 256) << 8) | 255,
            (x * y + seed) % 256,
          ),
    ),
  );
}

function layer(id: string, seed: number, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    name: `Layer ${id}`,
    visible: seed % 2 === 0,
    pixels: grid(4, 4, seed),
    ...extra,
  };
}

/**
 * A dense, hand-built runtime `Project` covering every optional field the
 * serializer touches: 2 objects, 3 frames, 4 layers, a variant group with 2
 * variants, frame tags, an object origin, and a reference image.
 *
 * Hand-built ON PURPOSE — a fixture loaded from the corpus has already been
 * through every migration, so it cannot prove anything about them.
 */
export function buildRichProject(): Project {
  return {
    version: "1.1.0",
    objects: [
      {
        id: "obj-a",
        name: "Object A",
        gridSize: { width: 4, height: 4 },
        origin: { x: 2, y: 3 },
        frames: [
          {
            id: "obj-a-f0",
            name: "Frame 0",
            tags: ["idle", "loop"],
            layers: [
              layer("a-f0-l0", 1),
              layer("a-f0-l1", 2),
              layer("a-f0-l2", 3, {
                isVariant: true,
                variantGroupId: "vg-head",
                selectedVariantId: "var-head-1",
                variantOffsets: { "var-head-1": { x: 1, y: -2 } },
              }),
              layer("a-f0-l3", 4),
            ],
          },
          {
            id: "obj-a-f1",
            name: "Frame 1",
            layers: [layer("a-f1-l0", 5), layer("a-f1-l1", 6)],
          },
          {
            id: "obj-a-f2",
            name: "Frame 2",
            tags: ["attack"],
            layers: [layer("a-f2-l0", 7)],
          },
        ],
      },
      {
        id: "obj-b",
        name: "Object B",
        gridSize: { width: 4, height: 4 },
        frames: [
          {
            id: "obj-b-f0",
            name: "Frame 0",
            layers: [layer("b-f0-l0", 8), layer("b-f0-l1", 9)],
          },
        ],
      },
    ],
    palettes: [
      {
        id: "pal-1",
        name: "Palette 1",
        colors: [
          { r: 0, g: 0, b: 0, a: 255 },
          { r: 255, g: 128, b: 64, a: 200 },
          { r: 1, g: 2, b: 3, a: 0 },
        ],
      },
    ],
    uiState: {
      selectedObjectId: "obj-a",
      selectedFrameId: "obj-a-f0",
      selectedLayerId: "a-f0-l0",
      selectedTool: "pixel",
      selectedColor: { r: 12, g: 34, b: 56, a: 255 },
      selectionMode: "rect",
      selectionBehavior: "movePixels",
      focusMode: false,
      lightGridMode: true,
      brushSize: 3,
      bitDepth: 16,
      shapeMode: "outline",
      borderRadius: 2,
      zoom: 8,
      panOffset: { x: -5, y: 7 },
      moveAllLayers: true,
      eraserShape: "square",
      pencilBrushShape: "circle",
      pencilBrushMax: 32,
      traceNudgeAmount: 25,
      variantFrameIndices: { "vg-head": 1 },
      studioMode: "lighting",
      lightingDataLayerEditMode: "height",
      selectedNormal: { x: -10, y: 20, z: 200 },
      lightDirection: { x: -64, y: -64, z: 180 },
      lightColor: { r: 255, g: 250, b: 240, a: 255 },
      ambientColor: { r: 40, g: 45, b: 60, a: 255 },
      heightScale: 120,
      heightBrushValue: 200,
      normalBrushShape: "square",
      frameReferencePanelPosition: { topPercent: 10, leftPercent: 20 },
      frameReferencePanelMinimized: false,
      frameReferencePanelVisible: true,
      lightingPreviewPanelPosition: { topPercent: 30, leftPercent: 40 },
      lightingPreviewPanelMinimized: true,
      canvasInfoHidden: true,
      objectLibraryViewMode: "grid",
      timelineThumbnailMode: true,
      originColor: { r: 9, g: 8, b: 7, a: 255 },
      gaussianFill: { smoothing: 1.5, radius: 3, radiusMax: 32 },
      aiServiceUrl: "http://example.invalid:1234",
    },
    variants: [
      {
        id: "vg-head",
        name: "Head",
        variants: [
          {
            id: "var-head-1",
            name: "Head 1",
            gridSize: { width: 4, height: 4 },
            frames: [
              { id: "vh1-f0", layers: [layer("vh1-f0-l0", 11)], tags: ["a"] },
              { id: "vh1-f1", layers: [layer("vh1-f1-l0", 12)] },
            ],
            baseFrameOffsets: { 0: { x: 1, y: 1 }, 1: { x: 2, y: 2 } },
          },
          {
            id: "var-head-2",
            name: "Head 2",
            gridSize: { width: 4, height: 4 },
            frames: [{ id: "vh2-f0", layers: [layer("vh2-f0-l0", 13)] }],
            baseFrameOffsets: { 0: { x: -1, y: -1 } },
          },
        ],
      },
    ],
    referenceImage: {
      imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      selectionBox: { startX: 1, startY: 2, endX: 30, endY: 40 },
    },
  };
}

// ============================================================================
// Synthetic migration fixtures — hand-authored from the migration source
// ============================================================================

/** Minimal already-migrated (non-legacy) CompactUIState. */
export function syntheticUIState(
  overrides: Partial<CompactUIState> = {},
): CompactUIState {
  return {
    selectedObjectId: "o1",
    selectedFrameId: "o1-f0",
    selectedLayerId: "o1-f0-l0",
    selectedTool: "pixel",
    selectedColor: 0x00_00_00_ff,
    brushSize: 1,
    bitDepth: 8,
    shapeMode: "both",
    borderRadius: 0,
    zoom: 10,
    panOffset: { x: 0, y: 0 },
    moveAllLayers: false,
    studioMode: "pixel",
    selectedNormal: 0x80_80_ff,
    lightDirection: 0x40_40_b4,
    lightColor: 0xff_fa_f0_ff,
    ambientColor: 0x28_2d_3c_ff,
    ...overrides,
  };
}

/** A compact layer. `pixels` is `unknown` so legacy scalar grids can be built. */
export function syntheticLayer(
  id: string,
  pixels: unknown,
  extra: Partial<CompactLayer> = {},
): CompactLayer {
  return {
    id,
    name: `Layer ${id}`,
    visible: true,
    pixels: pixels as CompactLayer["pixels"],
    ...extra,
  };
}

/** A minimal single-object compact project. */
export function syntheticProject(
  layers: CompactLayer[],
  overrides: Partial<CompactProject> = {},
): CompactProject {
  return {
    version: "1.1.0",
    objects: [
      {
        id: "o1",
        name: "Object 1",
        gridSize: { width: 2, height: 2 },
        frames: [{ id: "o1-f0", name: "Frame 0", layers }],
      },
    ],
    palettes: [{ id: "pal", name: "Palette", colors: [0x00_00_00_ff] }],
    uiState: syntheticUIState(),
    ...overrides,
  };
}

/** Legacy pixel grid: bare colour hex numbers, no `[c,n,h]` tuples. */
export const LEGACY_PIXELS: (number | 0)[][] = [
  [0, 0xff_00_00_ff],
  [0x00_ff_00_ff, 0],
];

/** Already-migrated pixel grid: `[colorHex, normalPacked, height]` tuples. */
export const MODERN_PIXELS = [
  [0, [0xff_00_00_ff, 0, 1]],
  [[0x00_ff_00_ff, 0, 1], 0],
];
