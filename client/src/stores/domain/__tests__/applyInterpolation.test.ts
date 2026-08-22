/**
 * `applyInterpolation` — the relocated `handleAccept` (REFRESH task 34).
 *
 * The 182-line accept routine used to live inside `AIInterpolateModal`, where
 * it cloned the project by hand and pushed its own history entry. It is a
 * domain mutation, so it now runs behind `DomainMutator.commit`. What is
 * asserted here is what the task 34 spec requires plus the findings earlier
 * waves paid for:
 *
 *  1. **the array rank** — a written layer's `pixels` is `PixelData[][]`
 *     (rank 2 per frame, rank 4 across pairs). W1 found the modal's
 *     annotation wrong here while the values were right; this pins the values.
 *  2. **ONE undo entry** — however many frames land, exactly one snapshot is
 *     recorded, and it is a snapshot-family entry.
 *  3. the timeline splice, including the two loop-back behaviours.
 *  4. the guards that used to be silent early returns.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import {
  APPLY_INTERPOLATION_LABEL,
  type PairPixelData,
} from "@/stores/domain/applyInterpolation";
import { mkLayer, tinyProject } from "@/store/__tests__/storeContract";
import type { Frame, PixelData, Project, Variant, VariantGroup } from "@/types";

/* ── rig ─────────────────────────────────────────────────────────────────── */

interface Rig {
  app: ApplicationStore;
  snapshots: string[];
  published: Project[];
}

function makeRig(project: Project): Rig {
  let current: Project | null = project;
  const snapshots: string[] = [];
  const published: Project[] = [];

  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
      published.push(p);
    },
    snapshot: (label) => snapshots.push(label),
  };

  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink: { selectObjectTree: () => {} },
    timelineContext: {
      publishSelection: () => {},
      clearColorAdjustment: () => {},
    },
  });

  runInAction(() => app.domain.adoptTree(project));
  return { app, snapshots, published };
}

const W = 2;
const H = 2;

/** A distinguishable grid — `tag` is written into the red channel. */
function gridOf(tag: number): PixelData[][] {
  return Array.from({ length: H }, () =>
    Array.from({ length: W }, () => ({
      color: { r: tag, g: 1, b: 2, a: 255 },
      normal: 0 as const,
      height: 0,
    })),
  );
}

/** `pairs[pairIdx][frameIdx][y][x]` — RANK 4 (W1). */
function pairsOf(counts: number[]): PairPixelData {
  let tag = 10;
  return counts.map((n) => Array.from({ length: n }, () => gridOf(tag++)));
}

function projectWithFrames(n: number): Project {
  const frames: Frame[] = Array.from({ length: n }, (_, i) => ({
    id: `frame-${i + 1}`,
    name: `Frame ${i + 1}`,
    layers: [mkLayer(`layer-${i + 1}`, W, H)],
  }));
  // Every frame shares the layer NAME so `selectedLayerName` resolves.
  for (const f of frames) f.layers[0].name = "Base";
  return tinyProject({ frames, width: W, height: H });
}

const framesOf = (rig: Rig) => rig.app.domain.objects[0].frames;

/* ── base mode ───────────────────────────────────────────────────────────── */

describe("applyInterpolation — base object", () => {
  it("splices generated frames between keyframes and drops what was between", () => {
    // 5 frames, keyframes at 0 and 4 → frames 1,2,3 are replaced by 2 generated.
    const rig = makeRig(projectWithFrames(5));
    const ok = rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 4],
      pairs: pairsOf([2]),
      loopBack: false,
    });

    expect(ok).toBe(true);
    const names = framesOf(rig).map((f) => f.name);
    expect(names).toEqual([
      "Frame 1", // keyframe 0
      "Interp 1.1", // generated
      "Interp 1.2",
      "Frame 5", // keyframe 4
    ]);
  });

  it("preserves frames OUTSIDE the keyframe range", () => {
    // 6 frames, keyframes 1 and 4 → frame 0 kept before, frame 5 kept after.
    const rig = makeRig(projectWithFrames(6));
    rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [1, 4],
      pairs: pairsOf([1]),
      loopBack: false,
    });

    expect(framesOf(rig).map((f) => f.name)).toEqual([
      "Frame 1",
      "Frame 2",
      "Interp 1.1",
      "Frame 5",
      "Frame 6",
    ]);
  });

  it("loopBack appends a wrap pair AND drops everything after the last keyframe", () => {
    const rig = makeRig(projectWithFrames(6));
    rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 3],
      // pair 0 = 0→3, pair 1 = the loop 3→0
      pairs: pairsOf([1, 2]),
      loopBack: true,
    });

    expect(framesOf(rig).map((f) => f.name)).toEqual([
      "Frame 1",
      "Interp 1.1",
      "Frame 4",
      "Loop 1",
      "Loop 2",
    ]);
    // Frames 5 and 6 are GONE — verbatim loop-back behaviour.
    expect(framesOf(rig).map((f) => f.name)).not.toContain("Frame 5");
  });

  it("writes the generated grid into the SELECTED layer and copies the rest", () => {
    const base = projectWithFrames(3);
    // Add a second layer that must be carried through untouched in shape.
    for (const f of base.objects[0].frames) {
      const extra = mkLayer(`extra-${f.id}`, W, H);
      extra.name = "Extra";
      f.layers.push(extra);
    }
    const rig = makeRig(base);

    rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 2],
      pairs: pairsOf([1]),
      loopBack: false,
    });

    const generated = framesOf(rig)[1];
    expect(generated.name).toBe("Interp 1.1");
    expect(generated.layers.map((l) => l.name)).toEqual(["Base", "Extra"]);

    const written = generated.layers.find((l) => l.name === "Base")!;
    // The generated grid landed (tag 10 in the red channel).
    expect((written.pixels[0][0].color as { r: number }).r).toBe(10);
    // The non-selected layer did NOT receive it.
    const copied = generated.layers.find((l) => l.name === "Extra")!;
    expect(copied.pixels[0][0]).not.toBe(written.pixels[0][0]);
  });

  /* ── the rank assertion the spec requires ─────────────────────────────── */

  it("🏁 the written layer's `pixels` is PixelData[][] — rank 2 per frame (W1)", () => {
    const rig = makeRig(projectWithFrames(3));
    rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 2],
      pairs: pairsOf([1]),
      loopBack: false,
    });

    const written = framesOf(rig)[1].layers.find((l) => l.name === "Base")!;
    const pixels = written.pixels;

    // Rank 2: array of rows of CELLS. A rank error here is exactly the class
    // of bug W1 found in the modal's annotation, and it corrupts pixels
    // silently rather than throwing.
    expect(Array.isArray(pixels)).toBe(true);
    expect(pixels).toHaveLength(H);
    expect(Array.isArray(pixels[0])).toBe(true);
    expect(pixels[0]).toHaveLength(W);
    // The leaf is a CELL, not another array.
    const cell = pixels[0][0];
    expect(Array.isArray(cell)).toBe(false);
    expect(cell).toHaveProperty("color");
    expect(cell).toHaveProperty("normal");
    expect(cell).toHaveProperty("height");
    // Every row is an array of cells with a `color` key — no rank-3 leakage.
    for (const row of pixels) {
      expect(Array.isArray(row)).toBe(true);
      expect(row).toHaveLength(W);
      for (const c of row) {
        expect(Array.isArray(c)).toBe(false);
        expect(typeof c).toBe("object");
        expect(c).toHaveProperty("color");
      }
    }
  });

  /* ── one undo entry ───────────────────────────────────────────────────── */

  it("🏁 records exactly ONE history entry no matter how many frames land", () => {
    const rig = makeRig(projectWithFrames(8));
    rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 3, 7],
      pairs: pairsOf([4, 4]),
      loopBack: false,
    });

    // 11 frames now exist; ONE undo step must revert all of them.
    expect(framesOf(rig)).toHaveLength(3 + 8);
    expect(rig.snapshots).toEqual([APPLY_INTERPOLATION_LABEL]);
    expect(rig.snapshots).toHaveLength(1);
  });

  it("publishes the mutated tree to the Zustand mirror exactly once", () => {
    const rig = makeRig(projectWithFrames(4));
    rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 3],
      pairs: pairsOf([2]),
      loopBack: false,
    });
    expect(rig.published).toHaveLength(1);
    expect(rig.published[0].objects[0].frames).toHaveLength(4);
  });

  /* ── guards ───────────────────────────────────────────────────────────── */

  it("refuses (and commits nothing) on fewer than two keyframes", () => {
    const rig = makeRig(projectWithFrames(3));
    const ok = rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [1],
      pairs: pairsOf([1]),
      loopBack: false,
    });
    expect(ok).toBe(false);
    expect(rig.snapshots).toEqual([]);
    expect(framesOf(rig)).toHaveLength(3);
  });

  it("refuses on an unknown object id", () => {
    const rig = makeRig(projectWithFrames(3));
    const ok = rig.app.applyInterpolation({
      mode: "base",
      objectId: "nope",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 2],
      pairs: pairsOf([1]),
      loopBack: false,
    });
    expect(ok).toBe(false);
    expect(rig.snapshots).toEqual([]);
  });

  it("refuses when a keyframe index is out of range", () => {
    const rig = makeRig(projectWithFrames(3));
    const ok = rig.app.applyInterpolation({
      mode: "base",
      objectId: "obj-1",
      selectedLayerName: "Base",
      sortedKeyframes: [0, 9],
      pairs: pairsOf([1]),
      loopBack: false,
    });
    expect(ok).toBe(false);
    expect(rig.snapshots).toEqual([]);
  });
});

/* ── variant mode ────────────────────────────────────────────────────────── */

function projectWithVariant(frameCount: number): Project {
  const project = projectWithFrames(3);
  const variant: Variant = {
    id: "var-1",
    name: "Variant 1",
    gridSize: { width: W, height: H },
    frames: Array.from({ length: frameCount }, (_, i) => ({
      id: `vf-${i + 1}`,
      layers: [{ ...mkLayer(`vl-${i + 1}`, W, H), name: `V${i + 1}` }],
    })),
    baseFrameOffsets: {},
  };
  const group: VariantGroup = {
    id: "vg-1",
    name: "Group 1",
    variants: [variant],
  };
  project.variants = [group];
  return project;
}

describe("applyInterpolation — variant", () => {
  it("splices generated variant frames, each with a single 'Layer 1'", () => {
    const rig = makeRig(projectWithVariant(4));
    const ok = rig.app.applyInterpolation({
      mode: "variant",
      variantGroupId: "vg-1",
      variantId: "var-1",
      sortedKeyframes: [0, 3],
      pairs: pairsOf([2]),
      loopBack: false,
    });

    expect(ok).toBe(true);
    const frames = rig.app.domain.variants[0].variants[0].frames;
    expect(frames).toHaveLength(4);
    // keyframe, gen, gen, keyframe
    expect(frames[1].layers).toHaveLength(1);
    expect(frames[1].layers[0].name).toBe("Layer 1");
    expect(frames[1].layers[0].visible).toBe(true);
  });

  it("🏁 a generated variant layer's `pixels` is PixelData[][] too", () => {
    const rig = makeRig(projectWithVariant(3));
    rig.app.applyInterpolation({
      mode: "variant",
      variantGroupId: "vg-1",
      variantId: "var-1",
      sortedKeyframes: [0, 2],
      pairs: pairsOf([1]),
      loopBack: false,
    });
    const pixels =
      rig.app.domain.variants[0].variants[0].frames[1].layers[0].pixels;
    expect(pixels).toHaveLength(H);
    expect(pixels[0]).toHaveLength(W);
    expect(Array.isArray(pixels[0][0])).toBe(false);
    expect(pixels[0][0]).toHaveProperty("color");
  });

  it("🏁 is ONE history entry", () => {
    const rig = makeRig(projectWithVariant(5));
    rig.app.applyInterpolation({
      mode: "variant",
      variantGroupId: "vg-1",
      variantId: "var-1",
      sortedKeyframes: [0, 2, 4],
      pairs: pairsOf([3, 3]),
      loopBack: false,
    });
    expect(rig.snapshots).toEqual([APPLY_INTERPOLATION_LABEL]);
  });

  it("refuses on an unknown variant group or variant", () => {
    const rig = makeRig(projectWithVariant(3));
    expect(
      rig.app.applyInterpolation({
        mode: "variant",
        variantGroupId: "nope",
        variantId: "var-1",
        sortedKeyframes: [0, 2],
        pairs: pairsOf([1]),
        loopBack: false,
      }),
    ).toBe(false);
    expect(
      rig.app.applyInterpolation({
        mode: "variant",
        variantGroupId: "vg-1",
        variantId: "nope",
        sortedKeyframes: [0, 2],
        pairs: pairsOf([1]),
        loopBack: false,
      }),
    ).toBe(false);
    expect(rig.snapshots).toEqual([]);
  });
});
