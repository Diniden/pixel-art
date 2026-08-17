import type { Project } from "@/types";
import { makeBulkObject, makeHeroObject, makePropObject } from "./objects";
import { palettesDense, palettesTypical } from "./palettes";
import { uiStateEmpty, uiStateTypical } from "./uiState";
import { makeTypicalVariantGroup } from "./variants";

/**
 * The three project sizes.
 *
 * Shared by BOTH stories and Vitest, deliberately. If the visual evidence and
 * the unit evidence describe different data they are not corroborating each
 * other. The variant-offset 4-level fallback, `screenToPixel`'s snapping modes
 * and the brush mouse-vs-touch agreement tests all need the same shapes the
 * stories render.
 *
 * ⚠️ The owner's real project file under `server/src/data/` is NOT a fixture.
 * It is 1.1 MB and 300,249 pixel cells of real work and belongs to the
 * migration corpus (task 07), not to stories.
 *
 * `PROJECT_VERSION` is pinned literally rather than read from package.json: the
 * serializer defaults `version` to "1.1.0" and a fixture that tracked the app
 * version would make every release look like a schema change.
 */
export const PROJECT_VERSION = "1.1.0";

/** No objects at all — the empty-state branch of every list, panel and canvas. */
export function makeProjectEmpty(): Project {
  return {
    version: PROJECT_VERSION,
    objects: [],
    palettes: [],
    uiState: { ...uiStateEmpty },
    variants: [],
  };
}

/**
 * 2 objects; the hero has 4 frames x 3 layers (plus one variant layer on frame
 * 1), the prop has 2 frames; 16x16 grids; one variant group with 2 variants;
 * frame tags on some frames but not all.
 */
export function makeProjectTypical(): Project {
  return {
    version: PROJECT_VERSION,
    objects: [makeHeroObject(), makePropObject()],
    palettes: palettesTypical.map((p) => ({ ...p, colors: [...p.colors] })),
    uiState: { ...uiStateTypical },
    variants: [makeTypicalVariantGroup()],
  };
}

export const DENSE_OBJECTS = 12;
export const DENSE_FRAMES = 12;
export const DENSE_LAYERS = 8;

/**
 * 12 objects x 12 frames x 8 layers = 1,152 layers of 16x16 = 294,912 cells.
 *
 * Roughly the scale of the owner's real project (300,249 cells) without using
 * the real project. For stress and virtualisation checks: a list that renders
 * 12 objects fine and dies at 12x12x8 has a virtualisation bug, not a data bug.
 */
export function makeProjectDense(): Project {
  return {
    version: PROJECT_VERSION,
    objects: Array.from({ length: DENSE_OBJECTS }, (_o, i) =>
      makeBulkObject(
        `obj-dense-${i + 1}`,
        `Dense ${i + 1}`,
        DENSE_FRAMES,
        DENSE_LAYERS,
      ),
    ),
    palettes: palettesDense.map((p) => ({ ...p, colors: [...p.colors] })),
    uiState: {
      ...uiStateTypical,
      selectedObjectId: "obj-dense-1",
      selectedFrameId: "obj-dense-1-frame-1",
      selectedLayerId: "obj-dense-1-frame-1-layer-1",
    },
    variants: [],
  };
}

// ── Eager exports ──────────────────────────────────────────────────────────
//
// `projectEmpty` and `projectTypical` are cheap, so they are plain constants.
// `projectDense` is ~295k cells and would cost every unit test that imports
// this barrel, so it is a memoised getter: materialised on first read and never
// again. Call `makeProjectDense()` instead if a test needs an unshared copy.

export const projectEmpty: Project = makeProjectEmpty();
export const projectTypical: Project = makeProjectTypical();

let denseCache: Project | undefined;

/**
 * ⚠️ SHARED instance. Read-only use only — mutate it and every later consumer
 * in the same process sees the mutation. Use `makeProjectDense()` to mutate.
 */
export function getProjectDense(): Project {
  denseCache ??= makeProjectDense();
  return denseCache;
}
