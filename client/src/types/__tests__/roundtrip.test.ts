// DO NOT run `vitest -u` on this file. Every diff here is a change to real user data.
//
// Characterisation tests for the compact serializer (REFRESH task 07).
//
// ⚠️ These assert OBSERVED behaviour, not desired behaviour. Where the current
// code does something surprising, the test pins the surprise and carries a
// `// BUG:` comment. A test asserting what the code *should* do is just a
// failing test, and the first person who needs a green build deletes it.
//
// The round trip pinned here is load-bearing TWICE over. It is the save/load
// path AND the deep-clone mechanism for undo — `store/index.ts:57-58` and
// `:88-89`, `store/projectActions.ts:182-183` and `:216-217` all snapshot
// history through `compactToProject(projectToCompact(p))`. A field that does
// not survive this round trip is silently lost on undo, not just on reload.
import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildRichProject,
  corpusFiles,
  corpusPath,
  digest,
  loadCorpusFile,
  yieldToEventLoop,
} from "@test/__fixtures__/projects";
import {
  DEFAULT_LIGHT_DIRECTION,
  DEFAULT_NORMAL,
  EMPTY_PIXEL_DATA,
  compactToPixelData,
  compactToProject,
  createDefaultProject,
  hexToRgba,
  normalToPacked,
  packedToNormal,
  pixelDataToCompact,
  projectToCompact,
  rgbaToHex,
  type CompactPixelData,
  type Normal,
  type PixelData,
  type Project,
} from "@/types";

function roundTrip(p: Project): Project {
  return compactToProject(projectToCompact(p));
}

describe("R1 — createDefaultProject round trip", () => {
  it("is NOT identity: the round trip adds fields and drops an empty variants array", () => {
    const p = createDefaultProject();
    const rt = roundTrip(p);

    // BUG: `compactToProject(projectToCompact(createDefaultProject()))` does not
    // deep-equal its input. Three observed deviations, pinned as-is:
    //   1. `uiState.lightGridMode` is ADDED (`types/index.ts:968`, `?? false`).
    //   2. `uiState.originColor` is ADDED as an explicit `undefined` key
    //      (`types/index.ts:1005-1008`), so the key exists where it did not.
    //   3. `variants: []` becomes `variants: undefined` — `projectToCompact`
    //      routes through `variantGroupsToCompact`, which returns `undefined`
    //      for an empty array (`types/index.ts:714`).
    // Deviation 3 means every undo snapshot silently changes the shape of
    // `project.variants` from `[]` to `undefined`.
    // Pinned deliberately — no task in this plan flips it. Fixing it requires a
    // purpose-built synthetic corpus and owner sign-off, because no real
    // pre-migration data exists to validate a change against (measured
    // 2026-08-16).
    expect(rt).not.toEqual(p);

    expect(p.variants).toEqual([]);
    expect(rt.variants).toBeUndefined();
    expect("lightGridMode" in p.uiState).toBe(false);
    expect(rt.uiState.lightGridMode).toBe(false);
    expect("originColor" in p.uiState).toBe(false);
    expect("originColor" in rt.uiState).toBe(true);
    expect(rt.uiState.originColor).toBeUndefined();
  });

  it("is stable from the SECOND pass onward (one normalising pass)", () => {
    const once = roundTrip(createDefaultProject());
    expect(roundTrip(once)).toEqual(once);
  });

  it("preserves objects, palettes and pixel data exactly", () => {
    const p = createDefaultProject();
    const rt = roundTrip(p);
    expect(rt.objects).toEqual(p.objects);
    expect(rt.palettes).toEqual(p.palettes);
    expect(rt.version).toBe("1.1.0");
  });
});

describe("R2 — hand-built rich project round trip", () => {
  // Hand-built ON PURPOSE. Anything loaded from the corpus has already been
  // through every migration and so cannot prove anything about them.
  it("round-trips a project with 2 objects, 3 frames, 4 layers, 2 variants, tags and a referenceImage", () => {
    const p = buildRichProject();
    const rt = roundTrip(p);

    expect(rt.objects).toHaveLength(2);
    expect(rt.objects[0].frames).toHaveLength(3);
    expect(rt.objects[0].frames[0].layers).toHaveLength(4);
    expect(rt.variants?.[0].variants).toHaveLength(2);

    // Everything survives except the known uiState additions covered by R1/R3.
    expect(rt.objects).toEqual(p.objects);
    expect(rt.palettes).toEqual(p.palettes);
    expect(rt.variants).toEqual(p.variants);
    expect(rt.referenceImage).toEqual(p.referenceImage);
    expect(rt.objects[0].origin).toEqual({ x: 2, y: 3 });
    expect(rt.objects[0].frames[0].tags).toEqual(["idle", "loop"]);
  });

  it("is idempotent from the second pass onward", () => {
    const once = roundTrip(buildRichProject());
    expect(roundTrip(once)).toEqual(once);
  });

  it("preserves variant-layer variantOffsets untouched (no M5 migration fires)", () => {
    const rt = roundTrip(buildRichProject());
    const variantLayer = rt.objects[0].frames[0].layers[2];
    expect(variantLayer.variantOffsets).toEqual({
      "var-head-1": { x: 1, y: -2 },
    });
    expect(variantLayer.variantOffset).toBeUndefined();
  });
});

describe("R3 — UIState field census", () => {
  // This is the test that would have caught `lightGridMode`. It is written as an
  // explicit hard-coded key list transcribed from `types/index.ts:125-194` so
  // that adding a field to `UIState` without adding it to `CompactUIState`
  // fails here rather than silently losing user state on save.
  const UI_STATE_KEYS = [
    "aiServiceUrl",
    "ambientColor",
    "bitDepth",
    "borderRadius",
    "brushSize",
    "canvasInfoHidden",
    "eraserShape",
    "focusMode",
    "frameReferencePanelMinimized",
    "frameReferencePanelPosition",
    "frameReferencePanelVisible",
    "gaussianFill",
    "heightBrushValue",
    "heightScale",
    "layerSelectionCounter",
    "lightColor",
    "lightDirection",
    "lightGridMode",
    "lightingDataLayerEditMode",
    "lightingPreviewPanelMinimized",
    "lightingPreviewPanelPosition",
    "moveAllLayers",
    "normalBrushShape",
    "objectLibraryViewMode",
    "originColor",
    "panOffset",
    "pencilBrushMax",
    "pencilBrushShape",
    "pencilOnly",
    "referenceImagePanelMinimized",
    "referenceImagePanelPosition",
    "selectedColor",
    "selectedFrameId",
    "selectedLayerId",
    "selectedNormal",
    "selectedObjectId",
    "selectedTool",
    "selectionBehavior",
    "selectionMode",
    "shapeMode",
    "studioMode",
    "timelineThumbnailMode",
    "traceNudgeAmount",
    "variantFrameIndices",
    "zoom",
  ] as const;

  it("the hard-coded key list matches every key declared on UIState", () => {
    // A project that sets EVERY UIState key, including the three the compact
    // type omits. If a new field is added to `UIState` and not added here, the
    // author has to come to this file — which is the point.
    const p = buildRichProject();
    p.uiState.referenceImagePanelPosition = { topPercent: 5, leftPercent: 6 };
    p.uiState.referenceImagePanelMinimized = false;
    p.uiState.layerSelectionCounter = 3;

    expect(Object.keys(p.uiState).sort()).toEqual([...UI_STATE_KEYS]);
  });

  it("every set UIState key survives the round trip", () => {
    const p = buildRichProject();
    p.uiState.referenceImagePanelPosition = { topPercent: 5, leftPercent: 6 };
    p.uiState.referenceImagePanelMinimized = false;
    p.uiState.layerSelectionCounter = 3;

    const rt = roundTrip(p);
    for (const key of UI_STATE_KEYS) {
      expect(rt.uiState[key]).toEqual(p.uiState[key]);
    }
    // And no key is lost.
    expect(Object.keys(rt.uiState).sort()).toEqual(
      expect.arrayContaining([...UI_STATE_KEYS]),
    );
  });
});

describe("R4 — the three fields absent from CompactUIState", () => {
  // BUG: `referenceImagePanelPosition` (UIState:171), `referenceImagePanelMinimized`
  // (UIState:172) and `layerSelectionCounter` (UIState:153) are declared on
  // `UIState` but NOT on `CompactUIState` (types/index.ts:612-663).
  //
  // OBSERVED: they DO survive the round trip anyway, because `projectToCompact`
  // spreads `...project.uiState` wholesale (types/index.ts:755) and
  // `compactToProject` spreads `...compact.uiState` back (types/index.ts:963).
  // The runtime behaviour and the type contract disagree: the type says these
  // fields do not exist in the saved file, the runtime writes them.
  //
  // This is pinned as it behaves TODAY. `layerSelectionCounter` is read by
  // `FrameTimeline.tsx`, so the runtime behaviour is the one being relied on.
  // Task 13 declares these fields on `CompactUIState`, which should turn this
  // from an accident into a contract WITHOUT changing the observed values here.
  // If task 13 changes any assertion in this block, the change is a behaviour
  // change and needs owner sign-off, not a snapshot update.
  it("survive the round trip despite being absent from the compact type", () => {
    const p = createDefaultProject();
    p.uiState.referenceImagePanelPosition = { topPercent: 10, leftPercent: 20 };
    p.uiState.referenceImagePanelMinimized = true;
    p.uiState.layerSelectionCounter = 7;

    const rt = roundTrip(p);

    expect(rt.uiState.referenceImagePanelPosition).toEqual({
      topPercent: 10,
      leftPercent: 20,
    });
    expect(rt.uiState.referenceImagePanelMinimized).toBe(true);
    expect(rt.uiState.layerSelectionCounter).toBe(7);
  });

  it("are written into the compact payload too", () => {
    const p = createDefaultProject();
    p.uiState.layerSelectionCounter = 42;
    const compact = projectToCompact(p) as unknown as Record<
      string,
      Record<string, unknown>
    >;
    expect(compact.uiState.layerSelectionCounter).toBe(42);
  });
});

describe("R5 — compact output is JSON-stable", () => {
  it("survives JSON.parse(JSON.stringify(...)) unchanged for the default project", () => {
    const c = projectToCompact(createDefaultProject());
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("survives JSON round trip unchanged for the rich hand-built project", () => {
    const c = projectToCompact(buildRichProject());
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("leaks no Map, Set or NaN, and `variantOffset: undefined` drops cleanly", () => {
    // `migrateLayerVariantOffset` (types/index.ts:844-865) sets
    // `variantOffset: undefined` on migrated layers. This asserts that key
    // disappears entirely once serialized, rather than becoming `null`.
    const p = buildRichProject();
    p.objects[0].frames[0].layers[2] = {
      ...p.objects[0].frames[0].layers[2],
      variantOffsets: undefined,
      variantOffset: { x: 3, y: 4 },
    };
    const migrated = roundTrip(p);
    const layer = migrated.objects[0].frames[0].layers[2];
    expect(layer.variantOffsets).toEqual({ "var-head-1": { x: 3, y: 4 } });
    expect(layer.variantOffset).toBeUndefined();

    const json = JSON.stringify(projectToCompact(migrated));
    expect(json).not.toContain("NaN");
    expect(json).not.toContain('"variantOffset"');
    const walk = (v: unknown): void => {
      expect(v).not.toBeInstanceOf(Map);
      expect(v).not.toBeInstanceOf(Set);
      if (typeof v === "number") expect(Number.isNaN(v)).toBe(false);
      if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(projectToCompact(migrated));
  });
});

describe("R6 — compact idempotency across the whole real corpus", () => {
  // The corpus's PRIMARY job. All 151 real projects (149 backup snapshots plus
  // the two standalone files) must survive `projectToCompact(compactToProject(c))`
  // byte-identically. Iterated per file so only one archive is resident at a
  // time — the full corpus is 149 MB of JSON and ~2 GB expanded.
  it.each(corpusFiles())(
    "%s is byte-stable through the serializer",
    async (file) => {
      const snapshots = loadCorpusFile(file);
      expect(snapshots.length).toBeGreaterThan(0);
      for (const { key, data } of snapshots) {
        const once = projectToCompact(compactToProject(data));
        const twice = projectToCompact(compactToProject(once));
        expect(digest(twice), `${file} / ${key}`).toBe(digest(once));
        await yieldToEventLoop();
      }
    },
    // Generous timeout: the largest archive is 46 MB compact and digesting its
    // expanded form traverses tens of millions of nodes.
    120_000,
  );
});

describe("R7 — pixel codec", () => {
  const cases: [string, PixelData][] = [
    ["EMPTY_PIXEL_DATA", EMPTY_PIXEL_DATA],
    [
      "colour only",
      { color: { r: 1, g: 2, b: 3, a: 255 }, normal: 0, height: 0 },
    ],
    ["normal only", { color: 0, normal: { x: -5, y: 6, z: 200 }, height: 0 }],
    ["height only", { color: 0, normal: 0, height: 128 }],
    [
      "all three",
      {
        color: { r: 10, g: 20, b: 30, a: 40 },
        normal: { x: -128, y: 127, z: 255 },
        height: 255,
      },
    ],
    ["a=0", { color: { r: 9, g: 9, b: 9, a: 0 }, normal: 0, height: 1 }],
    ["a=255", { color: { r: 9, g: 9, b: 9, a: 255 }, normal: 0, height: 1 }],
  ];

  it.each(cases)(
    "compactToPixelData(pixelDataToCompact(%s)) is identity",
    (_n, pd) => {
      expect(compactToPixelData(pixelDataToCompact(pd))).toEqual(pd);
    },
  );

  it("collapses a fully-empty pixel to the scalar 0", () => {
    expect(pixelDataToCompact(EMPTY_PIXEL_DATA)).toBe(0);
    expect(compactToPixelData(0)).toEqual(EMPTY_PIXEL_DATA);
  });

  it("a colour of pure transparent black is NOT collapsed to 0", () => {
    // OBSERVED: `pixelDataToCompact` collapses only when color/normal/height are
    // all the literal 0 sentinel. `{r:0,g:0,b:0,a:0}` is an object, so it
    // encodes as `[0, 0, 0]` — a tuple, not the scalar 0 — and decodes back to
    // `color: 0`. The colour object is therefore NOT preserved.
    const pd: PixelData = {
      color: { r: 0, g: 0, b: 0, a: 0 },
      normal: 0,
      height: 0,
    };
    expect(pixelDataToCompact(pd)).toEqual([0, 0, 0]);
    expect(compactToPixelData([0, 0, 0] as CompactPixelData)).toEqual(
      EMPTY_PIXEL_DATA,
    );
  });
});

describe("R8 — hexToRgba(rgbaToHex(c))", () => {
  const channels = [0, 1, 127, 128, 254, 255];
  const cases = channels.flatMap((r) =>
    channels.map((v) => ({ r, g: v, b: (v + 1) % 256, a: (r + 1) % 256 })),
  );
  it("is identity for all 4 channels at 0/1/127/128/254/255", () => {
    for (const c of cases) {
      expect(hexToRgba(rgbaToHex(c))).toEqual(c);
    }
  });
});

describe("R9 — packedToNormal(normalToPacked(n))", () => {
  const cases: [string, Normal][] = [
    ["DEFAULT_NORMAL", DEFAULT_NORMAL],
    ["DEFAULT_LIGHT_DIRECTION", DEFAULT_LIGHT_DIRECTION],
    ["min", { x: -128, y: -128, z: 0 }],
    ["max", { x: 127, y: 127, z: 255 }],
    ["zero", { x: 0, y: 0, z: 0 }],
  ];
  it.each(cases)("is identity for %s", (_n, normal) => {
    expect(packedToNormal(normalToPacked(normal))).toEqual(normal);
  });
});

describe("R10 — compaction size guard", () => {
  it("re-compacting Base Unit.json reproduces the on-disk byte size exactly", () => {
    // A cheap canary that compaction did not silently stop compacting. The spec
    // allowed +/-2%; the OBSERVED value is an exact match, so that is what is
    // pinned. Any drift at all is a real change.
    const path = corpusPath("base-unit.json");
    const onDisk = statSync(path).size;
    const compact = JSON.parse(readFileSync(path, "utf8"));
    const recompacted = JSON.stringify(
      projectToCompact(compactToProject(compact)),
    );

    expect(onDisk).toBe(1_129_965);
    expect(recompacted.length).toBe(onDisk);
  });

  it("the expanded runtime form is roughly 10x the compact form", () => {
    // Documents WHY the corpus regression gate uses digests rather than
    // `toMatchSnapshot()`: the runtime form of the corpus is enormous.
    const compact = JSON.parse(
      readFileSync(corpusPath("base-unit.json"), "utf8"),
    );
    const runtimeBytes = JSON.stringify(compactToProject(compact)).length;
    expect(runtimeBytes).toBeGreaterThan(9_000_000);
    expect(runtimeBytes).toBeLessThan(13_000_000);
  });
});
