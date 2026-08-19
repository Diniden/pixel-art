/**
 * `PixelStore` — THE LIGHTING WRITE PATHS (REFRESH task 27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THESE LIVE ON `PixelStore` AT ALL (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Normals and heights ARE pixel content — `PixelData` is
 * `[colour, normal, height]` — so the sole-writer rule covers them exactly as
 * it covers colour. These six actions were the last pixel writes still living
 * outside the store, in `store/lightingActions.ts`.
 *
 * A separate file from `PixelStore.test.ts` deliberately: that suite is task
 * 26's and its 32 assertions are the inverse-patch contract. This one pins
 * what task 27 ADDED, so a failure names the right task.
 *
 * ⚠️ Every assertion is OBSERVED behaviour. The legacy quirks — the
 * colour-exists guard, the empty-batch-still-saves rule, the absent
 * same-value early return — are transcribed, not chosen. Task 08 pinned the
 * Zustand originals and `store/__tests__/lighting.test.ts` still passes
 * unchanged against these implementations.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { PixelStore } from "../PixelStore";
import type { PixelMirror } from "../PixelStore";
import { DomainStore } from "../DomainStore";
import { HistoryStore } from "../../history/HistoryStore";
import { DEFAULT_UI_STATE } from "@/types";
import type { Color, Layer, Normal, PixelData, Project } from "@/types";

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };
const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };

function mkGrid(width: number, height: number): PixelData[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ...EMPTY })),
  );
}

function mkProject(width = 4, height = 4): Project {
  const layer = {
    id: "layer-1",
    name: "Layer 1",
    visible: true,
    opacity: 1,
    pixels: mkGrid(width, height),
  } as unknown as Layer;
  return {
    version: "1.1.0",
    objects: [
      {
        id: "obj-1",
        name: "Object 1",
        gridSize: { width, height },
        frames: [{ id: "frame-1", name: "Frame 1", layers: [layer] }],
      },
    ],
    palettes: [],
    variants: [],
    uiState: {
      ...DEFAULT_UI_STATE,
      selectedObjectId: "obj-1",
      selectedFrameId: "frame-1",
      selectedLayerId: "layer-1",
    },
  } as unknown as Project;
}

/**
 * A deliberately ASYMMETRIC fixture — colours, normals AND heights all differ
 * under every reflection. A symmetric one passes the identity assertions
 * trivially and proves nothing; the guard test below fails the fixture itself
 * if it ever becomes symmetric.
 */
function asymmetricProject(): Project {
  const project = mkProject(4, 4);
  const px = project.objects[0].frames[0].layers[0].pixels;
  px[0][0] = { color: RED, normal: { x: -30, y: -10, z: 200 }, height: 10 };
  px[1][0] = { color: BLUE, normal: { x: 40, y: 20, z: 210 }, height: 20 };
  px[2][0] = { color: GREEN, normal: { x: -50, y: 30, z: 220 }, height: 30 };
  px[2][1] = { color: RED, normal: { x: 60, y: -40, z: 230 }, height: 40 };
  return project;
}

interface Rig {
  domain: DomainStore;
  history: HistoryStore;
  pixels: PixelStore;
  publishes: number;
  snapshots: string[];
  layer(): Layer;
}

function makeRig(project: Project = mkProject()): Rig {
  const domain = new DomainStore({
    session: { saveSuspended: false } as never,
    host: {
      getProject: () => null,
      installProject: () => {},
      replaceProject: () => {},
      snapshotToHistory: () => {},
    },
  });
  const history = new HistoryStore({ budgetBytes: 64 * 1024 * 1024 });

  const rig: Rig = {
    domain,
    history,
    publishes: 0,
    snapshots: [],
    pixels: null as unknown as PixelStore,
    layer: () => domain.objects[0].frames[0].layers[0],
  };

  const mirror: PixelMirror = {
    publish: () => {
      rig.publishes += 1;
    },
    syncHistory: () => {},
    reconcile: () => {},
    snapshot: (label: string) => {
      rig.snapshots.push(label);
    },
  };

  rig.pixels = new PixelStore({
    domain,
    history,
    mirror,
    source: {
      selectedObjectId: "obj-1",
      selectedFrameId: "frame-1",
      selectedLayerId: "layer-1",
      variantFrameIndices: {},
    },
  });

  runInAction(() => domain.adoptTree(project));
  return rig;
}

/** Paint a cell so a normal/height write has somewhere to land. */
function paint(rig: Rig, x: number, y: number, color: Color = RED): void {
  rig.pixels.setPixel(x, y, color);
}

/* ══ setNormalPixel ═══════════════════════════════════════════════════════ */

describe("PixelStore.setNormalPixel", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  it("writes a normal where a colour exists", () => {
    paint(rig, 1, 1);
    const normal: Normal = { x: 5, y: 6, z: 200 };
    rig.pixels.setNormalPixel(1, 1, normal);
    expect(rig.layer().pixels[1][1].normal).toEqual(normal);
    // The colour and height ride along untouched.
    expect(rig.layer().pixels[1][1].color).toEqual(RED);
  });

  it("OBSERVED: refuses to write where there is NO colour", () => {
    const before = rig.history.entries.length;
    rig.pixels.setNormalPixel(0, 0, { x: 1, y: 2, z: 3 });
    expect(rig.layer().pixels[0][0].normal).toBe(0);
    // Nothing is recorded either — the legacy action returned before the
    // updater, so it saved nothing as well.
    expect(rig.history.entries).toHaveLength(before);
  });

  it("ignores an out-of-bounds coordinate silently", () => {
    expect(() => rig.pixels.setNormalPixel(99, 99, { x: 1, y: 2, z: 3 })).not.toThrow();
    expect(() => rig.pixels.setNormalPixel(-1, 0, { x: 1, y: 2, z: 3 })).not.toThrow();
  });

  it("replaces the grid WHOLESALE — a new array identity (R2)", () => {
    paint(rig, 1, 1);
    const before = rig.layer().pixels;
    rig.pixels.setNormalPixel(1, 1, { x: 5, y: 6, z: 200 });
    expect(rig.layer().pixels).not.toBe(before);
  });

  it("bumps pixelVersion exactly ONCE per write", () => {
    paint(rig, 1, 1);
    const before = rig.domain.pixelVersion;
    rig.pixels.setNormalPixel(1, 1, { x: 5, y: 6, z: 200 });
    expect(rig.domain.pixelVersion).toBe(before + 1);
  });

  it("undo restores the previous normal", () => {
    paint(rig, 1, 1);
    rig.pixels.setNormalPixel(1, 1, { x: 5, y: 6, z: 200 });
    runInAction(() => rig.history.undo());
    expect(rig.layer().pixels[1][1].normal).toBe(0);
    // …and the colour survives the undo, because the patch only ever held
    // the one cell's before/after pair.
    expect(rig.layer().pixels[1][1].color).toEqual(RED);
  });
});

/* ══ setNormalPixels / setHeightPixels ════════════════════════════════════ */

describe("PixelStore.setNormalPixels / setHeightPixels", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
    paint(rig, 0, 0);
    paint(rig, 1, 1);
  });

  it("writes a batch as ONE history entry", () => {
    const before = rig.history.entries.length;
    rig.pixels.setNormalPixels([
      { x: 0, y: 0, normal: { x: 1, y: 1, z: 200 } },
      { x: 1, y: 1, normal: { x: 2, y: 2, z: 201 } },
    ]);
    expect(rig.history.entries).toHaveLength(before + 1);
    expect(rig.layer().pixels[0][0].normal).toEqual({ x: 1, y: 1, z: 200 });
    expect(rig.layer().pixels[1][1].normal).toEqual({ x: 2, y: 2, z: 201 });
  });

  it("heights are written the same way and PRESERVE colour + normal", () => {
    rig.pixels.setNormalPixels([{ x: 0, y: 0, normal: { x: 9, y: 9, z: 9 } }]);
    rig.pixels.setHeightPixels([{ x: 0, y: 0, height: 123 }]);
    const cell = rig.layer().pixels[0][0];
    expect(cell.height).toBe(123);
    expect(cell.normal).toEqual({ x: 9, y: 9, z: 9 });
    expect(cell.color).toEqual(RED);
  });

  it("OBSERVED: cells with no colour are SKIPPED, the rest still written", () => {
    rig.pixels.setHeightPixels([
      { x: 0, y: 0, height: 50 }, // painted
      { x: 3, y: 3, height: 60 }, // transparent — skipped
    ]);
    expect(rig.layer().pixels[0][0].height).toBe(50);
    expect(rig.layer().pixels[3][3].height).toBe(0);
  });

  it("OBSERVED: out-of-bounds cells are FILTERED, not clamped", () => {
    rig.pixels.setHeightPixels([
      { x: 0, y: 0, height: 50 },
      { x: 99, y: 0, height: 60 },
    ]);
    expect(rig.layer().pixels[0][0].height).toBe(50);
    // Nothing landed at the row's far edge — the write was dropped, not
    // clamped onto the last column.
    expect(rig.layer().pixels[0][3].height).toBe(0);
  });

  it("OBSERVED: an empty batch STILL bumps pixelVersion (and so still saves)", () => {
    // ⚠️ The legacy actions applied the colour guard INSIDE
    // `updateProjectAndSave`, which schedules unconditionally. So a batch
    // that writes nothing still tripped the save trigger. Pinned by
    // `store/__tests__/autoSave.test.ts:361` and preserved via
    // `commitLighting`.
    const before = rig.domain.pixelVersion;
    rig.pixels.setHeightPixels([{ x: 3, y: 3, height: 99 }]); // all transparent
    expect(rig.domain.pixelVersion).toBe(before + 1);
  });

  it("…but records NO history entry when nothing was written", () => {
    const before = rig.history.entries.length;
    rig.pixels.setHeightPixels([{ x: 3, y: 3, height: 99 }]);
    expect(rig.history.entries).toHaveLength(before);
  });

  it("an EMPTY input array is a complete no-op", () => {
    const version = rig.domain.pixelVersion;
    rig.pixels.setNormalPixels([]);
    rig.pixels.setHeightPixels([]);
    expect(rig.domain.pixelVersion).toBe(version);
  });

  it("the LAST write to a repeated cell wins, with ONE patch recorded", () => {
    rig.pixels.setHeightPixels([
      { x: 0, y: 0, height: 10 },
      { x: 0, y: 0, height: 20 },
    ]);
    expect(rig.layer().pixels[0][0].height).toBe(20);
    // Undo must restore the TRUE pre-batch value, not the intermediate 10.
    //
    // ⚠️ That value is 0, not 1. `nextCell` reads `existing?.height ?? 1`,
    // and the fixture's cells EXIST with `height: 0` before painting — the
    // `?? 1` default only applies to a genuinely absent cell. Observed,
    // and exactly the kind of detail a "restores 1" guess would get wrong.
    runInAction(() => rig.history.undo());
    expect(rig.layer().pixels[0][0].height).toBe(0);
  });

  it("undo restores every cell of a batch at once", () => {
    rig.pixels.setNormalPixels([
      { x: 0, y: 0, normal: { x: 1, y: 1, z: 200 } },
      { x: 1, y: 1, normal: { x: 2, y: 2, z: 201 } },
    ]);
    runInAction(() => rig.history.undo());
    expect(rig.layer().pixels[0][0].normal).toBe(0);
    expect(rig.layer().pixels[1][1].normal).toBe(0);
  });
});

/* ══ THE FLIPS ════════════════════════════════════════════════════════════ */

describe("PixelStore.flipHorizontal / flipVertical", () => {
  it("H ∘ H is the IDENTITY on an asymmetric fixture", () => {
    const rig = makeRig(asymmetricProject());
    const before = JSON.stringify(rig.layer().pixels);
    rig.pixels.flipHorizontal();
    rig.pixels.flipHorizontal();
    expect(JSON.stringify(rig.layer().pixels)).toBe(before);
  });

  it("V ∘ V is the IDENTITY on an asymmetric fixture", () => {
    const rig = makeRig(asymmetricProject());
    const before = JSON.stringify(rig.layer().pixels);
    rig.pixels.flipVertical();
    rig.pixels.flipVertical();
    expect(JSON.stringify(rig.layer().pixels)).toBe(before);
  });

  it("the fixture really IS asymmetric — the guard on the two tests above", () => {
    const rig = makeRig(asymmetricProject());
    const before = JSON.stringify(rig.layer().pixels);
    rig.pixels.flipHorizontal();
    expect(JSON.stringify(rig.layer().pixels)).not.toBe(before);
  });

  it("H moves a cell to the mirrored column and negates its normal x", () => {
    const rig = makeRig(asymmetricProject());
    rig.pixels.flipHorizontal();
    const moved = rig.layer().pixels[0][3]; // was (0,0) in a 4-wide grid
    expect(moved.color).toEqual(RED);
    expect(moved.normal).toEqual({ x: 30, y: -10, z: 200 });
    expect(moved.height).toBe(10);
  });

  it("V moves a cell to the mirrored row and negates its normal y", () => {
    const rig = makeRig(asymmetricProject());
    rig.pixels.flipVertical();
    const moved = rig.layer().pixels[3][0]; // was (0,0) in a 4-tall grid
    expect(moved.color).toEqual(RED);
    expect(moved.normal).toEqual({ x: -30, y: 10, z: 200 });
  });

  it("both are SNAPSHOT-family commands, not inverse patches", () => {
    // ⚠️ The ONE exception to this store's no-snapshot rule. A flip rewrites
    // every cell, so the patch would be the whole grid twice — strictly worse
    // than the snapshot. See `PixelMirror.snapshot`.
    const rig = makeRig(asymmetricProject());
    rig.pixels.flipHorizontal();
    rig.pixels.flipVertical();
    expect(rig.snapshots).toEqual(["Flip horizontal", "Flip vertical"]);
    // …and no inverse-patch entry was recorded for either.
    expect(rig.history.entries).toHaveLength(0);
  });

  it("bumps pixelVersion exactly once per flip", () => {
    const rig = makeRig(asymmetricProject());
    const before = rig.domain.pixelVersion;
    rig.pixels.flipHorizontal();
    expect(rig.domain.pixelVersion).toBe(before + 1);
  });

  it("replaces the grid WHOLESALE (R2)", () => {
    const rig = makeRig(asymmetricProject());
    const before = rig.layer().pixels;
    rig.pixels.flipHorizontal();
    expect(rig.layer().pixels).not.toBe(before);
  });

  it("does nothing when the target cannot be resolved", () => {
    const rig = makeRig();
    runInAction(() => {
      rig.domain.objects = [];
    });
    expect(() => rig.pixels.flipHorizontal()).not.toThrow();
    expect(() => rig.pixels.flipVertical()).not.toThrow();
    expect(rig.snapshots).toEqual([]);
  });
});

/* ══ computeNormalsForAllFrames — THE FLOW ════════════════════════════════ */

describe("PixelStore.computeNormalsForAllFrames — a flow", () => {
  it("writes normals ONLY where a colour exists", async () => {
    const rig = makeRig();
    paint(rig, 0, 0);
    paint(rig, 1, 0);
    await rig.pixels.computeNormalsForAllFrames({
      startAngle: 90,
      smoothing: 1,
      radius: 3,
    });
    expect(rig.layer().pixels[0][0].normal).not.toBe(0);
    // (3,3) was never painted and stays normal-free.
    expect(rig.layer().pixels[3][3].normal).toBe(0);
  });

  it("PRESERVES colour and height while replacing normals", async () => {
    const rig = makeRig();
    paint(rig, 0, 0);
    rig.pixels.setHeightPixels([{ x: 0, y: 0, height: 77 }]);
    await rig.pixels.computeNormalsForAllFrames({
      startAngle: 90,
      smoothing: 1,
      radius: 3,
    });
    expect(rig.layer().pixels[0][0].color).toEqual(RED);
    expect(rig.layer().pixels[0][0].height).toBe(77);
  });

  it("records exactly ONE history entry for the whole sweep", async () => {
    const rig = makeRig();
    paint(rig, 0, 0);
    const before = rig.history.entries.length;
    await rig.pixels.computeNormalsForAllFrames({
      startAngle: 90,
      smoothing: 1,
      radius: 3,
    });
    expect(rig.history.entries).toHaveLength(before + 1);
  });

  it("leaves progress at 0 once it finishes", async () => {
    const rig = makeRig();
    paint(rig, 0, 0);
    await rig.pixels.computeNormalsForAllFrames({
      startAngle: 90,
      smoothing: 1,
      radius: 3,
    });
    expect(rig.pixels.normalComputeProgress).toBe(0);
  });

  it("is DETERMINISTIC — the same params produce the same grid", async () => {
    const params = { startAngle: 45, smoothing: 0.7, radius: 2.5 };
    const a = makeRig();
    paint(a, 0, 0);
    paint(a, 1, 0);
    await a.pixels.computeNormalsForAllFrames(params);

    const b = makeRig();
    paint(b, 0, 0);
    paint(b, 1, 0);
    await b.pixels.computeNormalsForAllFrames(params);

    expect(JSON.stringify(a.layer().pixels)).toBe(
      JSON.stringify(b.layer().pixels),
    );
  });

  it("does nothing when the target cannot be resolved", async () => {
    const rig = makeRig();
    runInAction(() => {
      rig.domain.objects = [];
    });
    await expect(
      rig.pixels.computeNormalsForAllFrames({
        startAngle: 90,
        smoothing: 1,
        radius: 3,
      }),
    ).resolves.toBeUndefined();
  });
});
