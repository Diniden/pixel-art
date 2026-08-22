// DO NOT run `vitest -u` on this file. Every diff here is a change to real user data.
//
// Characterisation tests for the 8 schema migrations (REFRESH task 07).
// M1–M6 live here; M7 and M8 are server-side and live in
// `server/src/__tests__/normalizePixel.test.ts`.
//
// ⚠️ MEASURED 2026-08-16 — NO PRE-MIGRATION DATA SURVIVES ANYWHERE IN THIS REPO.
// All 9 backup archives were decompressed and classified (and re-verified while
// writing this file): 149 snapshots, zero `variantGroups`, zero `variantOffset`,
// `[c,n,h]` pixel tuples throughout, `baseFrameOffsets` present, `"version":
// "1.1.0"` everywhere. The oldest surviving backup is already fully migrated.
//
// Consequences, which are the whole reason this file is written the way it is:
//   1. EVERY migration fixture below is hand-authored synthetic data, built by
//      reading each detector and transform and constructing the minimal input
//      that exercises it. There is no real-data safety net behind any migration.
//   2. The 149 real snapshots are a POST-migration corpus. Running the migration
//      pipeline over them is a no-op pass-through — which is exactly the
//      property pinned at the bottom of this file.
//
// ⚠️ EVERY assertion here is OBSERVED behaviour, bugs included. See the `// BUG:`
// comments. No task in the REFRESH plan fixes any of them.
import { describe, expect, it, vi } from "vitest";

import {
  LEGACY_PIXELS,
  MODERN_PIXELS,
  corpusFiles,
  digest,
  loadCorpusFile,
  syntheticLayer,
  syntheticProject,
  syntheticUIState,
  yieldToEventLoop,
} from "@test/__fixtures__/projects";
import {
  compactToProject,
  isCompactFormat,
  isLegacyCompactFormat,
  migrateLegacyLayer,
  migrateLegacyPixel,
  projectToCompact,
  type CompactProject,
  type CompactVariantGroup,
} from "@/types";

// ---------------------------------------------------------------------------
// Local re-implementation of `api.ts`'s private `migrateVariantsToProjectLevel`.
//
// It is module-private (`services/api.ts:111-143`) and this task may not modify
// production source to export it. This copy is transcribed line-for-line from
// that function; the M6 divergence block below is what makes the copy
// worthwhile, because it pins the concrete difference between the two
// implementations. If `api.ts:111-143` ever changes, this copy must change with
// it — the M6 divergence assertions are the tripwire.
// ---------------------------------------------------------------------------
function apiMigrateVariantsToProjectLevel(
  data: CompactProject,
): CompactProject {
  const allVariantGroups: Record<string, CompactVariantGroup> = {};
  for (const obj of data.objects) {
    if (obj.variantGroups) {
      for (const vg of obj.variantGroups) {
        if (!allVariantGroups[vg.id]) {
          allVariantGroups[vg.id] = vg;
        }
      }
    }
  }
  const projectVariants = Object.values(allVariantGroups);
  return {
    ...data,
    objects: data.objects.map((obj) => ({ ...obj, variantGroups: undefined })),
    variants: projectVariants.length > 0 ? projectVariants : undefined,
  };
}

// ===========================================================================
// M1 — expanded vs compact detection (`types/index.ts:1017-1036`)
// ===========================================================================
describe("M1 — isCompactFormat", () => {
  it("returns false for non-objects", () => {
    expect(isCompactFormat(null)).toBe(false);
    expect(isCompactFormat(undefined)).toBe(false);
    expect(isCompactFormat("nope")).toBe(false);
    expect(isCompactFormat(42)).toBe(false);
    expect(isCompactFormat({})).toBe(false);
  });

  it("detects compact format from numeric palette colours", () => {
    expect(isCompactFormat({ palettes: [{ colors: [0xff_00_00_ff] }] })).toBe(
      true,
    );
  });

  it("detects expanded format from object palette colours", () => {
    expect(
      isCompactFormat({
        palettes: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }],
      }),
    ).toBe(false);
  });

  it("falls back to typeof uiState.selectedColor === 'number' when palettes are empty", () => {
    expect(
      isCompactFormat({ palettes: [], uiState: { selectedColor: 255 } }),
    ).toBe(true);
    expect(
      isCompactFormat({ palettes: [], uiState: { selectedColor: { r: 1 } } }),
    ).toBe(false);
  });

  it("uses the fallback when a palette exists but carries an empty colors array", () => {
    // OBSERVED: `palettes[0].colors.length > 0` fails, so the palette branch is
    // skipped entirely and control reaches the uiState fallback.
    expect(
      isCompactFormat({
        palettes: [{ colors: [] }],
        uiState: { selectedColor: 255 },
      }),
    ).toBe(true);
  });

  it("returns false when there is neither a usable palette nor a uiState", () => {
    expect(isCompactFormat({ objects: [] })).toBe(false);
  });
});

// ===========================================================================
// M2 — legacy scalar pixel → [c,n,h] tuple
//      (`types/index.ts:1040-1058` detect, `:1061-1069` transform,
//       `:1072-1087` layer)
// ===========================================================================
describe("M2 — migrateLegacyPixel", () => {
  it("maps 0 to 0", () => {
    expect(migrateLegacyPixel(0)).toBe(0);
  });

  it("maps a scalar colour hex to [hex, 0, 1] — height defaults to 1, not 0", () => {
    expect(migrateLegacyPixel(0xff_00_00_ff)).toEqual([0xff_00_00_ff, 0, 1]);
    expect(migrateLegacyPixel(255)).toEqual([255, 0, 1]);
  });

  it("is NOT array-safe: an already-migrated tuple becomes a NESTED array", () => {
    // BUG: `migrateLegacyPixel` (types/index.ts:1061-1069) tests only
    // `legacyPixel === 0` before wrapping. Given an already-migrated
    // `[c,n,h]` it returns `[[c,n,h], 0, 1]` — a nested array that no decoder
    // understands. Re-running the migration corrupts pixel data silently:
    // the colour hex position now holds an array, so `hexToRgba` produces
    // garbage rather than throwing.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists anywhere in this repo to validate a fix against
    // (measured 2026-08-16), so fixing it requires a purpose-built synthetic
    // corpus AND explicit owner sign-off.
    const alreadyMigrated = [0xff_00_00_ff, 0, 1];
    expect(migrateLegacyPixel(alreadyMigrated as unknown as number)).toEqual([
      [0xff_00_00_ff, 0, 1],
      0,
      1,
    ]);
  });

  it("corrupts further on each re-run (NOT idempotent)", () => {
    // BUG: same defect, shown as non-idempotency. Each pass adds a nesting
    // level. PINNED DELIBERATELY — no task in this plan fixes it; a fix needs a
    // synthetic corpus and owner sign-off.
    const once = migrateLegacyPixel(255);
    const twice = migrateLegacyPixel(once as unknown as number);
    const thrice = migrateLegacyPixel(twice as unknown as number);
    expect(once).toEqual([255, 0, 1]);
    expect(twice).toEqual([[255, 0, 1], 0, 1]);
    expect(thrice).toEqual([[[255, 0, 1], 0, 1], 0, 1]);
  });
});

describe("M2 — migrateLegacyLayer", () => {
  it("migrates every scalar pixel in the grid", () => {
    const out = migrateLegacyLayer({
      id: "l1",
      name: "L1",
      visible: true,
      pixels: LEGACY_PIXELS,
    });
    expect(out.pixels).toEqual([
      [0, [0xff_00_00_ff, 0, 1]],
      [[0x00_ff_00_ff, 0, 1], 0],
    ]);
  });

  it("corrupts an already-migrated layer (inherits the array-unsafe bug)", () => {
    // BUG: running the layer migration twice nests every non-empty tuple.
    // PINNED DELIBERATELY — no task in this plan fixes it; a fix needs a
    // purpose-built synthetic corpus and owner sign-off.
    const out = migrateLegacyLayer({
      id: "l1",
      name: "L1",
      visible: true,
      pixels: MODERN_PIXELS as unknown as (number | 0)[][],
    });
    expect(out.pixels).toEqual([
      [0, [[0xff_00_00_ff, 0, 1], 0, 1]],
      [[[0x00_ff_00_ff, 0, 1], 0, 1], 0],
    ]);
  });
});

describe("M2 — isLegacyCompactFormat detection", () => {
  function projectWithObjects(grids: unknown[]): CompactProject {
    return {
      version: "1.1.0",
      objects: grids.map((pixels, i) => ({
        id: `o${i}`,
        name: `Object ${i}`,
        gridSize: { width: 2, height: 2 },
        frames: [
          {
            id: `o${i}-f0`,
            name: "Frame 0",
            layers: [syntheticLayer(`o${i}-l0`, pixels)],
          },
        ],
      })),
      palettes: [{ id: "pal", name: "Palette", colors: [0] }],
      uiState: syntheticUIState(),
    };
  }

  it("detects a legacy project from its first non-zero pixel", () => {
    expect(isLegacyCompactFormat(projectWithObjects([LEGACY_PIXELS]))).toBe(
      true,
    );
  });

  it("detects a modern project from its first non-zero pixel", () => {
    expect(isLegacyCompactFormat(projectWithObjects([MODERN_PIXELS]))).toBe(
      false,
    );
  });

  it("samples exactly ONE pixel: a mixed project with a legacy object 3 reports false", () => {
    // BUG: `isLegacyCompactFormat` (types/index.ts:1040-1058) inspects only the
    // first non-zero pixel of `objects[0].frames[0].layers[0]` and returns
    // immediately. A file where object 0 is already migrated but object 3 is
    // still legacy is classified as NON-legacy, so `migrateLegacyProject` never
    // runs and OBJECT 3'S PIXELS ARE NEVER MIGRATED. Object 3's scalar pixels
    // then flow into the renderer, where the `[c,n,h]` destructure yields
    // undefined normal/height — silent corruption, not an error.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off.
    const mixed = projectWithObjects([
      MODERN_PIXELS,
      MODERN_PIXELS,
      MODERN_PIXELS,
      LEGACY_PIXELS, // object 3 is legacy and will be missed
    ]);
    expect(isLegacyCompactFormat(mixed)).toBe(false);
  });

  it("the mirror case is equally wrong: a legacy object 0 marks a modern object 3 legacy", () => {
    // BUG: the same single-sample defect in the other direction — object 3's
    // already-migrated tuples get run through `migrateLegacyPixel` and nest.
    // PINNED DELIBERATELY — no task in this plan fixes it.
    const mixed = projectWithObjects([LEGACY_PIXELS, MODERN_PIXELS]);
    expect(isLegacyCompactFormat(mixed)).toBe(true);
  });

  it("falls back to `uiState.studioMode === undefined` when all pixels are empty", () => {
    const empty = [
      [0, 0],
      [0, 0],
    ];
    expect(isLegacyCompactFormat(projectWithObjects([empty]))).toBe(false);

    const noStudio = projectWithObjects([empty]);
    delete (noStudio.uiState as Partial<typeof noStudio.uiState>).studioMode;
    expect(isLegacyCompactFormat(noStudio)).toBe(true);
  });

  it("returns false for a project with no objects at all", () => {
    // OBSERVED: falls through to the uiState check, and the synthetic uiState
    // has `studioMode: "pixel"`.
    expect(isLegacyCompactFormat(projectWithObjects([]))).toBe(false);
  });
});

// ===========================================================================
// M3 — lighting-studio uiState defaults
//      (`api.ts:86-105` bulk, `types/index.ts:962-1009` per-field)
// ===========================================================================
describe("M3 — uiState defaults on load", () => {
  it("fills every defaulted field when the payload omits them all", () => {
    const bare = syntheticProject([syntheticLayer("l0", MODERN_PIXELS)]);
    // Strip every optional field the loader defaults.
    bare.uiState = {
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
    } as CompactProject["uiState"];

    const ui = compactToProject(bare).uiState;

    expect(ui.selectionMode).toBe("rect");
    expect(ui.selectionBehavior).toBe("movePixels");
    expect(ui.focusMode).toBe(false);
    expect(ui.lightGridMode).toBe(false);
    expect(ui.studioMode).toBe("pixel");
    expect(ui.lightingDataLayerEditMode).toBe("normals");
    expect(ui.selectedNormal).toEqual({ x: 0, y: 0, z: 255 });
    expect(ui.lightDirection).toEqual({ x: -64, y: -64, z: 180 });
    expect(ui.lightColor).toEqual({ r: 255, g: 250, b: 240, a: 255 });
    expect(ui.ambientColor).toEqual({ r: 40, g: 45, b: 60, a: 255 });
    expect(ui.eraserShape).toBe("circle");
    expect(ui.pencilBrushShape).toBe("square");
    expect(ui.pencilBrushMax).toBe(16);
    expect(ui.traceNudgeAmount).toBe(10);
    expect(ui.normalBrushShape).toBe("circle");
    expect(ui.heightScale).toBe(100);
    expect(ui.heightBrushValue).toBe(128);
    expect(ui.objectLibraryViewMode).toBe("normal");
    expect(ui.timelineThumbnailMode).toBe(false);
    expect(ui.originColor).toBeUndefined();
  });

  it("does not overwrite values that are present", () => {
    const p = syntheticProject([syntheticLayer("l0", MODERN_PIXELS)], {
      uiState: syntheticUIState({
        eraserShape: "square",
        pencilBrushMax: 64,
        heightScale: 42,
        traceNudgeAmount: 50,
      }),
    });
    const ui = compactToProject(p).uiState;
    expect(ui.eraserShape).toBe("square");
    expect(ui.pencilBrushMax).toBe(64);
    expect(ui.heightScale).toBe(42);
    expect(ui.traceNudgeAmount).toBe(50);
  });

  it("cross-module: the 7 shared defaults agree between api.ts and types/index.ts", () => {
    // `api.ts:86-104` (migrateLegacyProject, bulk assignment) and
    // `types/index.ts:962-1009` (compactToProject, per-field `??`) both supply
    // these defaults. Extracting one copy and forgetting the other must fail
    // here rather than silently changing what a legacy file loads as.
    //
    // The api.ts values are transcribed literally from `api.ts:89-103`.
    const API_DEFAULTS = {
      studioMode: "pixel",
      eraserShape: "circle",
      pencilBrushShape: "square",
      pencilBrushMax: 16,
      traceNudgeAmount: 10,
      normalBrushShape: "circle",
      heightScale: 100,
    } as const;

    const bare = syntheticProject([syntheticLayer("l0", MODERN_PIXELS)]);
    bare.uiState = {
      selectedObjectId: null,
      selectedFrameId: null,
      selectedLayerId: null,
      selectedTool: "pixel",
      selectedColor: 0,
      brushSize: 1,
      bitDepth: 8,
      shapeMode: "both",
      borderRadius: 0,
      zoom: 10,
      panOffset: { x: 0, y: 0 },
      moveAllLayers: false,
    } as CompactProject["uiState"];
    const typesDefaults = compactToProject(bare).uiState;

    for (const [key, value] of Object.entries(API_DEFAULTS)) {
      expect(
        typesDefaults[key as keyof typeof typesDefaults],
        `default for "${key}" diverged between api.ts and types/index.ts`,
      ).toBe(value);
    }

    // The packed numeric defaults in api.ts must decode to the same normals and
    // colours types/index.ts falls back to.
    expect(compactToProject(bare).uiState.selectedNormal).toEqual({
      x: 0,
      y: 0,
      z: 255,
    }); // api.ts:90  0x8080ff
    expect(compactToProject(bare).uiState.lightDirection).toEqual({
      x: -64,
      y: -64,
      z: 180,
    }); // api.ts:91  0x4040b4
    expect(compactToProject(bare).uiState.lightColor).toEqual({
      r: 255,
      g: 250,
      b: 240,
      a: 255,
    }); // api.ts:92  0xfffaf0ff
    expect(compactToProject(bare).uiState.ambientColor).toEqual({
      r: 40,
      g: 45,
      b: 60,
      a: 255,
    }); // api.ts:93  0x282d3cff
  });
});

// ===========================================================================
// M4 — variant frame `offset` → `baseFrameOffsets` (`types/index.ts:807-826`)
// ===========================================================================
describe("M4 — baseFrameOffsets back-fill", () => {
  function projectWith14BaseFrames(
    variantFrameOffsets: boolean,
  ): CompactProject {
    return {
      version: "1.1.0",
      objects: [
        {
          id: "o1",
          name: "Object 1",
          gridSize: { width: 2, height: 2 },
          frames: Array.from({ length: 14 }, (_, i) => ({
            id: `o1-f${i}`,
            name: `Frame ${i}`,
            layers: [syntheticLayer(`o1-f${i}-l0`, MODERN_PIXELS)],
          })),
        },
      ],
      palettes: [{ id: "pal", name: "Palette", colors: [0] }],
      uiState: syntheticUIState(),
      variants: [
        {
          id: "vg1",
          name: "Head",
          variants: [
            {
              id: "v1",
              name: "Variant 1",
              gridSize: { width: 2, height: 2 },
              frames: [0, 1, 2].map((i) => ({
                id: `vf${i}`,
                layers: [syntheticLayer(`vf${i}-l0`, MODERN_PIXELS)],
                ...(variantFrameOffsets
                  ? { offset: { x: i + 1, y: i + 1 } }
                  : {}),
              })),
              baseFrameOffsets: {},
            },
          ],
        },
      ],
    };
  }

  it("hard-codes 10: a 14-base-frame project gets NO entries for indices 10-13", () => {
    // BUG: `types/index.ts:818` loops
    // `for (let i = 0; i < Math.max(variant.frames.length, 10); i++)`.
    // `variant.frames` is the VARIANT's frame count (3 here), not the object's
    // base frame count (14), so the bound is `max(3, 10) === 10`. Base frames
    // 10-13 receive no offset at all and the variant renders at (0,0) there.
    // The literal `10` is arbitrary — it happens to have covered the owner's
    // projects at the time it was written.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off.
    const result = compactToProject(projectWith14BaseFrames(true));
    const map = result.variants![0].variants[0].baseFrameOffsets;

    expect(Object.keys(map)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
    expect(Object.keys(map).length).toBe(10);
    expect(map[10]).toBeUndefined();
    expect(map[13]).toBeUndefined();

    // Indices 0-2 take their own variant frame's offset; 3-9 all fall back to
    // the FIRST frame's offset (types/index.ts:820).
    expect(map[0]).toEqual({ x: 1, y: 1 });
    expect(map[1]).toEqual({ x: 2, y: 2 });
    expect(map[2]).toEqual({ x: 3, y: 3 });
    expect(map[3]).toEqual({ x: 1, y: 1 });
    expect(map[9]).toEqual({ x: 1, y: 1 });
  });

  it("with no frame offsets at all, emits a single {0:{x:0,y:0}} entry", () => {
    const result = compactToProject(projectWith14BaseFrames(false));
    const map = result.variants![0].variants[0].baseFrameOffsets;
    expect(map).toEqual({ 0: { x: 0, y: 0 } });
  });

  it("leaves an existing non-empty baseFrameOffsets untouched", () => {
    const p = projectWith14BaseFrames(true);
    p.variants![0].variants[0].baseFrameOffsets = { 0: { x: 99, y: 98 } };
    const map = compactToProject(p).variants![0].variants[0].baseFrameOffsets;
    expect(map).toEqual({ 0: { x: 99, y: 98 } });
  });

  it("is idempotent: re-running over its own output changes nothing", () => {
    const once = compactToProject(projectWith14BaseFrames(true));
    const twice = compactToProject(projectToCompact(once));
    expect(twice.variants![0].variants[0].baseFrameOffsets).toEqual(
      once.variants![0].variants[0].baseFrameOffsets,
    );
  });
});

// ===========================================================================
// M5 — layer `variantOffset` → `variantOffsets`
//      (`types/index.ts:844-865`, applied at `:952`)
// ===========================================================================
describe("M5 — variantOffset → variantOffsets", () => {
  function withVariantLayer(extra: Record<string, unknown>): CompactProject {
    return syntheticProject(
      [
        syntheticLayer("l1", MODERN_PIXELS, {
          isVariant: true,
          variantGroupId: "vg1",
          ...extra,
        }),
      ],
      { variants: [] },
    );
  }

  it("migrates when isVariant + selectedVariantId + variantOffset are all present", () => {
    const layer = compactToProject(
      withVariantLayer({
        selectedVariantId: "v1",
        variantOffset: { x: 5, y: 6 },
      }),
    ).objects[0].frames[0].layers[0];

    expect(layer.variantOffsets).toEqual({ v1: { x: 5, y: 6 } });
    expect(layer.variantOffset).toBeUndefined();
  });

  it("silently DROPS the offset when selectedVariantId is absent", () => {
    // BUG: `migrateLayerVariantOffset` (types/index.ts:846-851) requires
    // `layer.selectedVariantId` to be truthy. A layer carrying a
    // `variantOffset` but NO `selectedVariantId` fails the guard, so it is
    // returned unchanged and stays on the deprecated field forever. The
    // renderer reads only `variantOffsets`, so the offset is ignored — the
    // variant silently renders at the wrong position. Nothing throws and
    // nothing logs.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off.
    const layer = compactToProject(
      withVariantLayer({ variantOffset: { x: 5, y: 6 } }),
    ).objects[0].frames[0].layers[0];

    expect(layer.variantOffsets).toBeUndefined();
    expect(layer.variantOffset).toEqual({ x: 5, y: 6 });
    expect(layer.selectedVariantId).toBeUndefined();
  });

  it("does not fire when variantOffsets already exists — the legacy field survives alongside", () => {
    // OBSERVED: the guard requires `!layer.variantOffsets`, so a layer holding
    // BOTH keeps both. The stale `variantOffset` is never cleaned up.
    const layer = compactToProject(
      withVariantLayer({
        selectedVariantId: "v1",
        variantOffset: { x: 5, y: 6 },
        variantOffsets: { v1: { x: 9, y: 9 } },
      }),
    ).objects[0].frames[0].layers[0];

    expect(layer.variantOffsets).toEqual({ v1: { x: 9, y: 9 } });
    expect(layer.variantOffset).toEqual({ x: 5, y: 6 });
  });

  it("does not fire on a non-variant layer", () => {
    const layer = compactToProject(
      syntheticProject([
        syntheticLayer("l1", MODERN_PIXELS, {
          selectedVariantId: "v1",
          variantOffset: { x: 5, y: 6 },
        }),
      ]),
    ).objects[0].frames[0].layers[0];

    // `compactToLayer` only copies variant fields when `isVariant` is truthy,
    // so all of them are dropped on a plain layer.
    expect(layer.variantOffsets).toBeUndefined();
    expect(layer.variantOffset).toBeUndefined();
    expect(layer.selectedVariantId).toBeUndefined();
  });

  it("is value-idempotent, but the FIRST pass leaves an explicit `variantOffset: undefined` key", () => {
    // OBSERVED, and a genuinely subtle one. `migrateLayerVariantOffset`
    // (types/index.ts:855-862) returns `{ ...layer, variantOffset: undefined }`,
    // so after the first pass the key EXISTS with value `undefined`. On the
    // second pass the migration no longer fires (`variantOffsets` is now set),
    // `projectToCompact` skips the falsy `variantOffset` (types/index.ts:703),
    // and the key is ABSENT entirely.
    //
    // Values are identical either way; only key presence differs. That matters
    // because `Object.keys()` and any structural diff see two different shapes
    // for what is semantically the same layer — including the undo history
    // deep-clone, which routes through exactly this pair of functions.
    //
    // PINNED DELIBERATELY — no task in this plan flips it; a fix requires a
    // purpose-built synthetic corpus and owner sign-off.
    const once = compactToProject(
      withVariantLayer({
        selectedVariantId: "v1",
        variantOffset: { x: 5, y: 6 },
      }),
    );
    const twice = compactToProject(projectToCompact(once));

    const onceLayer = once.objects[0].frames[0].layers[0];
    const twiceLayer = twice.objects[0].frames[0].layers[0];

    expect("variantOffset" in onceLayer).toBe(true);
    expect(onceLayer.variantOffset).toBeUndefined();
    expect("variantOffset" in twiceLayer).toBe(false);

    // Same values, so a plain deep-equal still passes...
    expect(twiceLayer).toEqual(onceLayer);
    // ...but the canonical digest, which records key presence, does not.
    expect(digest(twiceLayer)).not.toBe(digest(onceLayer));

    // Everything a consumer actually reads is stable.
    expect(twiceLayer.variantOffsets).toEqual({ v1: { x: 5, y: 6 } });
  });
});

// ===========================================================================
// M6 — object-level `variantGroups` → project-level `variants`
//      TWO DIVERGENT IMPLEMENTATIONS:
//        (a) `api.ts:111-143`  — pure re-parent + de-dupe by vg.id
//        (b) `types/index.ts:868-939` — re-parent, NO de-dupe, and it
//            additionally rewrites each variant layer's `variantOffsets`
//            from `baseFrameOffsets[frameIndex]` (`types/index.ts:918`)
// ===========================================================================
describe("M6 — object-level variantGroups hoisted to project level", () => {
  function objectLevelVariantProject(): CompactProject {
    const vg: CompactVariantGroup = {
      id: "vg1",
      name: "Head",
      variants: [
        {
          id: "v1",
          name: "Variant 1",
          gridSize: { width: 2, height: 2 },
          frames: [
            { id: "vf0", layers: [syntheticLayer("vf0-l0", MODERN_PIXELS)] },
          ],
          baseFrameOffsets: { 0: { x: 11, y: 22 }, 1: { x: 33, y: 44 } },
        },
      ],
    };
    return {
      version: "1.1.0",
      objects: [
        {
          id: "o1",
          name: "Object 1",
          gridSize: { width: 2, height: 2 },
          variantGroups: [vg],
          frames: [0, 1].map((i) => ({
            id: `o1-f${i}`,
            name: `Frame ${i}`,
            layers: [
              syntheticLayer(`o1-f${i}-l0`, MODERN_PIXELS, {
                isVariant: true,
                variantGroupId: "vg1",
                selectedVariantId: "v1",
              }),
            ],
          })),
        },
      ],
      palettes: [{ id: "pal", name: "Palette", colors: [0] }],
      uiState: syntheticUIState(),
    };
  }

  it("types/index.ts hoists the groups AND rewrites per-layer variantOffsets", () => {
    const result = compactToProject(objectLevelVariantProject());
    expect(result.variants?.map((v) => v.id)).toEqual(["vg1"]);
    // `types/index.ts:918` reads `variant.baseFrameOffsets[frameIndex]`, so each
    // frame's variant layer gets that frame's offset.
    expect(result.objects[0].frames[0].layers[0].variantOffsets).toEqual({
      v1: { x: 11, y: 22 },
    });
    expect(result.objects[0].frames[1].layers[0].variantOffsets).toEqual({
      v1: { x: 33, y: 44 },
    });
  });

  it("api.ts hoists the groups but leaves variantOffsets UNSET", () => {
    const result = compactToProject(
      apiMigrateVariantsToProjectLevel(objectLevelVariantProject()),
    );
    expect(result.variants?.map((v) => v.id)).toEqual(["vg1"]);
    expect(
      result.objects[0].frames[0].layers[0].variantOffsets,
    ).toBeUndefined();
    expect(
      result.objects[0].frames[1].layers[0].variantOffsets,
    ).toBeUndefined();
  });

  it("THE DIVERGENCE, stated concretely", () => {
    // BUG: M6 exists twice and the two copies do NOT agree. Measured on the
    // fixture above, with a 2-base-frame object and
    // `baseFrameOffsets = {0:{x:11,y:22}, 1:{x:33,y:44}}`:
    //
    //   path                                  frame0.variantOffsets   frame1.variantOffsets
    //   ------------------------------------  ----------------------  ---------------------
    //   types/index.ts compactToProject       {v1:{x:11,y:22}}        {v1:{x:33,y:44}}
    //   api.ts  migrateVariantsToProjectLevel undefined               undefined
    //
    // Both produce IDENTICAL project-level `variants`. They differ ONLY in
    // whether per-layer offsets are back-filled. Which one runs depends on the
    // branch taken in `loadProject` (`api.ts:221-227`): the api.ts path fires
    // when the file is already modern-pixel, and the types/index.ts path fires
    // for every other route into `compactToProject` — including the UNDO
    // deep-clone. So the same file can gain or lose per-layer offsets depending
    // on how it entered the serializer.
    //
    // Pinning the difference is what makes deleting one of them safe later.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off.
    const viaTypes = compactToProject(objectLevelVariantProject());
    const viaApi = compactToProject(
      apiMigrateVariantsToProjectLevel(objectLevelVariantProject()),
    );

    expect(digest(viaTypes.variants)).toBe(digest(viaApi.variants));
    expect(digest(viaTypes.objects)).not.toBe(digest(viaApi.objects));

    expect(viaTypes.objects[0].frames[0].layers[0].variantOffsets).toEqual({
      v1: { x: 11, y: 22 },
    });
    expect(
      viaApi.objects[0].frames[0].layers[0].variantOffsets,
    ).toBeUndefined();
  });

  it("duplicate vg.id: api.ts keeps the FIRST and discards the second", () => {
    // BUG: `api.ts:126-129` guards with `if (!allVariantGroups[vg.id])`, so a
    // second group sharing an id but carrying DIFFERENT content is silently
    // dropped. Two objects that legitimately diverged under the same group id
    // lose one side's variants entirely, with no warning.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off.
    const result = apiMigrateVariantsToProjectLevel(duplicateIdProject());
    expect(result.variants?.map((v) => v.name)).toEqual(["A"]);
    expect(result.variants).toHaveLength(1);
  });

  it("duplicate vg.id: types/index.ts does NOT de-dupe and keeps BOTH", () => {
    // BUG: a SECOND divergence between the two M6 implementations, beyond the
    // per-layer offsets. `types/index.ts:896` does
    // `projectVariants.push(...migratedVariantGroups)` with no id check at all,
    // so both groups survive and the project ends up with two entries sharing
    // one id. Every downstream `variants.find(v => v.id === ...)` then resolves
    // to whichever happens to be first.
    //
    // The task spec asserted that BOTH implementations "hoist + de-dupe by
    // vg.id". Measured: only api.ts de-dupes. This assertion records what the
    // code actually does.
    //
    // PINNED DELIBERATELY. No task in the REFRESH plan flips this. No real
    // pre-migration data exists to validate a fix against (measured
    // 2026-08-16); a fix requires a purpose-built synthetic corpus and explicit
    // owner sign-off.
    const result = compactToProject(duplicateIdProject());
    expect(result.variants?.map((v) => v.name)).toEqual(["A", "B"]);
    expect(result.variants).toHaveLength(2);
    expect(result.variants![0].id).toBe("dup");
    expect(result.variants![1].id).toBe("dup");
  });

  it("does not migrate when project-level variants already exist", () => {
    const p = objectLevelVariantProject();
    p.variants = [];
    // `compactToProject`'s guard is `!compact.variants`; `[]` is truthy, so it
    // takes the "already has project-level variants" branch, and
    // `compactToVariantGroups([])` returns undefined.
    expect(compactToProject(p).variants).toBeUndefined();
    // api.ts's guard is `data.variants && data.variants.length > 0`, so an empty
    // array does NOT block its migration — another divergence between the two.
    expect(apiMigrateVariantsToProjectLevel(p).variants).toHaveLength(1);
  });

  it("strips variantGroups off objects in both implementations", () => {
    const viaTypes = compactToProject(objectLevelVariantProject());
    expect(
      (viaTypes.objects[0] as { variantGroups?: unknown }).variantGroups,
    ).toBeUndefined();
    const viaApi = apiMigrateVariantsToProjectLevel(
      objectLevelVariantProject(),
    );
    expect(viaApi.objects[0].variantGroups).toBeUndefined();
  });

  function duplicateIdProject(): CompactProject {
    const mk = (
      name: string,
      variantId: string,
      x: number,
    ): CompactVariantGroup => ({
      id: "dup",
      name,
      variants: [
        {
          id: variantId,
          name: `Variant ${name}`,
          gridSize: { width: 2, height: 2 },
          frames: [],
          baseFrameOffsets: { 0: { x, y: x } },
        },
      ],
    });
    return {
      version: "1.1.0",
      objects: [
        {
          id: "o1",
          name: "Object 1",
          gridSize: { width: 2, height: 2 },
          variantGroups: [mk("A", "va", 1)],
          frames: [
            {
              id: "o1-f0",
              name: "Frame 0",
              layers: [syntheticLayer("o1-f0-l0", MODERN_PIXELS)],
            },
          ],
        },
        {
          id: "o2",
          name: "Object 2",
          gridSize: { width: 2, height: 2 },
          variantGroups: [mk("B", "vb", 2)],
          frames: [
            {
              id: "o2-f0",
              name: "Frame 0",
              layers: [syntheticLayer("o2-f0-l0", MODERN_PIXELS)],
            },
          ],
        },
      ],
      palettes: [{ id: "pal", name: "Palette", colors: [0] }],
      uiState: syntheticUIState(),
    };
  }
});

// ===========================================================================
// Synthetic idempotency — migrate(migrate(x)) === migrate(x)
// ===========================================================================
describe("synthetic idempotency", () => {
  const fixtures: [string, () => CompactProject][] = [
    [
      "M3 bare uiState",
      () => syntheticProject([syntheticLayer("l0", MODERN_PIXELS)]),
    ],
    [
      "M5 variant layer with selectedVariantId",
      () =>
        syntheticProject(
          [
            syntheticLayer("l1", MODERN_PIXELS, {
              isVariant: true,
              variantGroupId: "vg1",
              selectedVariantId: "v1",
              variantOffset: { x: 5, y: 6 },
            }),
          ],
          { variants: [] },
        ),
    ],
    [
      "M5 variant layer WITHOUT selectedVariantId",
      () =>
        syntheticProject(
          [
            syntheticLayer("l1", MODERN_PIXELS, {
              isVariant: true,
              variantGroupId: "vg1",
              variantOffset: { x: 5, y: 6 },
            }),
          ],
          { variants: [] },
        ),
    ],
  ];

  it.each(fixtures)(
    "%s: migrate(migrate(x)) === migrate(x) by value",
    (_name, build) => {
      // Deep-equal, not digest: the M5 fixture that DOES migrate leaves an
      // explicit `variantOffset: undefined` key on the first pass which is absent
      // on the second (see the M5 block above, where that is pinned explicitly).
      // The VALUES are stable, which is the property that matters here.
      const once = compactToProject(build());
      const twice = compactToProject(projectToCompact(once));
      expect(twice).toEqual(once);
    },
  );

  it.each(fixtures)(
    "%s: is digest-stable from the SECOND pass onward",
    (_name, build) => {
      // Once the explicit-undefined key has been normalised away, the canonical
      // digest is frozen too.
      const once = compactToProject(
        projectToCompact(compactToProject(build())),
      );
      const twice = compactToProject(projectToCompact(once));
      expect(digest(twice)).toBe(digest(once));
    },
  );

  it("M2 is the exception: it is provably NOT idempotent", () => {
    // BUG: the nested-array corruption again, stated as the idempotency
    // violation it is. Every other migration in this file re-runs cleanly; M2
    // does not, and re-running it destroys pixel data.
    // PINNED DELIBERATELY — no task in this plan fixes it; a fix needs a
    // purpose-built synthetic corpus and owner sign-off.
    const once = migrateLegacyLayer({
      id: "l1",
      name: "L1",
      visible: true,
      pixels: LEGACY_PIXELS,
    });
    const twice = migrateLegacyLayer(
      once as unknown as Parameters<typeof migrateLegacyLayer>[0],
    );
    expect(digest(twice.pixels)).not.toBe(digest(once.pixels));
  });
});

// ===========================================================================
// The real corpus — 151 projects, all already fully migrated.
//
// The migration pipeline is a NO-OP PASS-THROUGH for every one of them, and
// that is precisely the property being pinned. If a refactor ever makes a
// migration fire on this data, one of these digests changes.
//
// ⚠️ These digests ARE the regression gate. A changed digest is a change to the
// owner's real artwork. READ THE DIFF. Never `-u` it.
//
// WHY digests and not `toMatchSnapshot()`: measured, a vitest snapshot of the
// runtime form of `test-blend.json` (the SMALLEST corpus file, 29,922 bytes) is
// 780,687 bytes — 26x expansion. Across the 149 MB corpus that is ~4.1 GB of
// `.snap`, which no human can review by eye, defeating the point of committing
// them. A SHA-256 of the canonical JSON is the same gate in a reviewable form.
// ===========================================================================
describe("corpus golden digests — the real regression gate", () => {
  it.each(corpusFiles())(
    "%s: the migration pipeline is a no-op and the result digest is frozen",
    async (file) => {
      const snapshots = loadCorpusFile(file);
      const perSnapshot: string[] = [];
      for (const { key, data } of snapshots) {
        // No migration must fire on this data.
        expect(isCompactFormat(data), `${file}/${key} isCompactFormat`).toBe(
          true,
        );
        expect(isLegacyCompactFormat(data), `${file}/${key} isLegacy`).toBe(
          false,
        );
        expect(
          data.objects.some(
            (o) => o.variantGroups && o.variantGroups.length > 0,
          ),
          `${file}/${key} has object-level variantGroups`,
        ).toBe(false);

        perSnapshot.push(`${key}:${digest(compactToProject(data))}`);
        await yieldToEventLoop();
      }

      expect({
        file,
        snapshots: snapshots.length,
        digest: digest(perSnapshot),
      }).toMatchSnapshot();
    },
    120_000,
  );

  it("the corpus carries exactly 149 backup snapshots plus 2 standalone projects", () => {
    let backupSnapshots = 0;
    let standalone = 0;
    for (const file of corpusFiles()) {
      const n = loadCorpusFile(file).length;
      if (file.startsWith("backup-")) backupSnapshots += n;
      else standalone += n;
    }
    expect(backupSnapshots).toBe(149);
    expect(standalone).toBe(2);
  }, 60_000);

  // Split per file rather than one big loop: a single test that occupies the
  // worker for ~50s starves vitest's RPC heartbeat and trips
  // `Timeout calling "onTaskUpdate"`, which surfaces as an unhandled error and a
  // non-zero exit even though every assertion passed.
  it.each(corpusFiles())(
    "%s: round-trip stability holds for every snapshot in the file",
    async (file) => {
      // The real corpus's primary job, restated here so the migration suite
      // fails too if the serializer regresses.
      for (const { key, data } of loadCorpusFile(file)) {
        const p1 = compactToProject(data);
        const p2 = compactToProject(projectToCompact(p1));
        expect(digest(p2), `${file} / ${key}`).toBe(digest(p1));
        await yieldToEventLoop();
      }
    },
    120_000,
  );
});

// ===========================================================================
// Console side effects — the migrations announce themselves via console.log.
// ===========================================================================
describe("migration logging", () => {
  it("M5 logs when it migrates a layer", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    compactToProject(
      syntheticProject(
        [
          syntheticLayer("l1", MODERN_PIXELS, {
            isVariant: true,
            variantGroupId: "vg1",
            selectedVariantId: "v1",
            variantOffset: { x: 1, y: 2 },
          }),
        ],
        { variants: [] },
      ),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Migrating variantOffset to variantOffsets"),
    );
    spy.mockRestore();
  });
});
