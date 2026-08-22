/**
 * `VariantStore` and the two variant actions on `TimelineUIStore`
 * (REFRESH task 28).
 *
 * These tests are ADDITIVE. The authoritative behaviour contract for all
 * twenty migrated actions is task 08's suite in
 * `src/store/__tests__/variants.test.ts` — 336 tests across the directory
 * which, since this task, exercise these implementations through the bridge
 * delegates. **Not one of those assertions was altered**, and that is the
 * parity proof: the 9-anchor resize matrix, the 4-level offset ladder and the
 * `makeVariant` bounding-box arithmetic are all pinned there, unchanged.
 *
 * What is asserted HERE is what task 08 could not see, because it only ever
 * looked at the Zustand surface:
 *
 *  1. the store mutates `DomainStore`'s tree directly, and mutates BOTH
 *     `objects` and `variants` in one operation — the entanglement that
 *     justifies "behaviour modules over one tree";
 *  2. the store graph's LAST cross-module edge is now an injected callback:
 *     `deleteVariantGroup` and `removeVariantLayer` reach `selectLayer`
 *     without importing anything;
 *  3. `variantFrameIndices` is written through the injected UI callbacks and
 *     never touched directly, and `deleteVariantGroup` REMOVES its key;
 *  4. the ordering rule — the UI index write lands BEFORE the domain commit,
 *     so the published project and the published `uiState` agree;
 *  5. `stores/domain/**` imports nothing from `stores/ui/**`, and no store
 *     file imports from `components/**` any more (the W20 gate, as a test);
 *  6. every grid the store produces is a raw array, never an observable.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { assertGridsAreRaw } from "@/stores/domain/gridSafety";
import { getAnchorPadding } from "@/utils/variantHelpers";
import {
  RED,
  GREEN,
  mkLayer,
  tinyProject,
} from "@/store/__tests__/storeContract";
import type { Color, Layer, PixelData, Project } from "@/types";

/* ── the rig ─────────────────────────────────────────────────────────────── */

interface Rig {
  app: ApplicationStore;
  /** Every history label recorded, in order. */
  snapshots: string[];
  /** Every project published to the Zustand mirror. */
  published: Project[];
  /** Every selection patch `TimelineUIStore` published, in order. */
  selectionPatches: Record<string, unknown>[];
  /** Every `selectLayer` id, in call order. */
  selectedLayers: string[];
}

const solid = (c: Color): PixelData => ({
  color: { ...c },
  normal: 0,
  height: 0,
});

/** A layer with pixels only at the listed cells. */
function layerWith(
  id: string,
  cells: Array<[number, number, Color]>,
  w = 4,
  h = 4,
): Layer {
  const l = mkLayer(id, w, h);
  for (const [x, y, c] of cells) l.pixels[y][x] = solid(c);
  return l;
}

function makeRig(project: Project = tinyProject()): Rig {
  let current: Project | null = project;
  const snapshots: string[] = [];
  const published: Project[] = [];
  const selectionPatches: Record<string, unknown>[] = [];
  const selectedLayers: string[] = [];

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
    selectionSink: {
      selectObjectTree: (ids) => {
        runInAction(() => {
          app.timelineUI.selectedObjectId = ids.selectedObjectId;
          app.timelineUI.selectedFrameId = ids.selectedFrameId;
          app.timelineUI.selectedLayerId = ids.selectedLayerId;
        });
      },
    } satisfies SelectionSink,
    timelineContext: {
      publishSelection: (patch) => {
        selectionPatches.push(patch as Record<string, unknown>);
        // Mirror the index into the hosted `uiState`, which is what the real
        // bridge's Phase B reaction does — so `currentProject()` recombines
        // the value the store just wrote.
        if (current && patch.variantFrameIndices) {
          current = {
            ...current,
            uiState: {
              ...current.uiState,
              variantFrameIndices: patch.variantFrameIndices,
            },
          };
        }
        if (patch.selectedLayerId !== undefined) {
          selectedLayers.push(patch.selectedLayerId as string);
        }
      },
      clearColorAdjustment: () => {},
    },
  });

  runInAction(() => {
    app.domain.adoptTree(project);
    app.timelineUI.adopt({
      selectedObjectId: project.uiState.selectedObjectId,
      selectedFrameId: project.uiState.selectedFrameId,
      selectedLayerId: project.uiState.selectedLayerId,
    });
    app.timelineUI.adoptVariantFrameIndices(
      project.uiState.variantFrameIndices ?? {},
    );
  });

  return { app, snapshots, published, selectionPatches, selectedLayers };
}

/**
 * Two frames × two layers. "Body" carries a DIFFERENT bounding box in each
 * frame, so `makeVariant` must record two distinct `baseFrameOffsets` and
 * size the variant grid to the LARGER box.
 *
 *   frame 1 Body: a 2×1 run at (0,0)-(1,0)
 *   frame 2 Body: a 2×2 block at (2,2)-(3,3)
 */
function variantFixture(): Project {
  const body1 = layerWith("body-1", [
    [0, 0, RED],
    [1, 0, RED],
  ]);
  body1.name = "Body";
  const other1 = layerWith("other-1", [[3, 3, GREEN]]);
  other1.name = "Other";

  const body2 = layerWith("body-2", [
    [2, 2, RED],
    [3, 2, RED],
    [2, 3, RED],
    [3, 3, RED],
  ]);
  body2.name = "Body";
  const other2 = layerWith("other-2", [[0, 0, GREEN]]);
  other2.name = "Other";

  return tinyProject({
    frames: [
      { id: "frame-1", name: "Frame 1", layers: [body1, other1] },
      { id: "frame-2", name: "Frame 2", layers: [body2, other2] },
    ],
  });
}

const objOf = (rig: Rig) => rig.app.domain.objects[0];
const layersOf = (rig: Rig, frameIndex = 0) =>
  objOf(rig).frames[frameIndex].layers;

/** Make a variant of "Body" and return the ids the store generated. */
function makeBodyVariant(rig: Rig) {
  rig.app.variants.makeVariant("body-1");
  const group = rig.app.domain.variants[0];
  return { group, variant: group.variants[0] };
}

/* ════════════════════════════════════════════════════════════════════════ */

describe("VariantStore — it mutates ONE tree, and both halves of it", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig(variantFixture());
  });

  it("makeVariant writes `variants` AND `objects` in a single commit", () => {
    expect(rig.app.domain.variants).toHaveLength(0);

    makeBodyVariant(rig);

    // One history entry, not two — the two-field write is ONE operation.
    expect(rig.snapshots).toEqual(["Make variant"]);
    expect(rig.app.domain.variants).toHaveLength(1);
    // …and the host layer replaced the source layer, at the same index.
    expect(layersOf(rig).map((l) => l.name)).toEqual(["Body", "Other"]);
    expect(layersOf(rig)[0].isVariant).toBe(true);
    expect(layersOf(rig)[0].variantGroupId).toBe(rig.app.domain.variants[0].id);
  });

  it("mutates the SAME DomainStore instance the computeds read", () => {
    const { group } = makeBodyVariant(rig);
    rig.app.variants.renameVariantGroup(group.id, "Renamed");
    expect(rig.app.domain.variants[0].name).toBe("Renamed");
    // The published mirror carries the same value, by reference.
    const last = rig.published[rig.published.length - 1];
    expect(last.variants?.[0].name).toBe("Renamed");
  });

  it("sizes the variant grid to the LARGEST single-frame bounding box", () => {
    const { variant } = makeBodyVariant(rig);
    // frame 1 box is 2×1, frame 2 box is 2×2 → 2×2, not the 4×4 union.
    expect(variant.gridSize).toEqual({ width: 2, height: 2 });
  });

  it("records each base frame's box ORIGIN in baseFrameOffsets", () => {
    const { variant } = makeBodyVariant(rig);
    expect(variant.baseFrameOffsets).toEqual({
      0: { x: 0, y: 0 },
      1: { x: 2, y: 2 },
    });
  });

  it("produces RAW grids — never observable (R2)", () => {
    makeBodyVariant(rig);
    // Walks every object grid AND every variant-frame grid.
    expect(() =>
      assertGridsAreRaw(rig.app.domain.objects, rig.app.domain.variants),
    ).not.toThrow();
  });
});

describe("VariantStore — the injected selectLayer callback (the LAST cross-module edge)", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig(variantFixture());
  });

  it("deleteVariantGroup selects the frame's LAST layer, through the callback", () => {
    const { group } = makeBodyVariant(rig);
    rig.selectedLayers.length = 0;

    rig.app.variants.deleteVariantGroup(group.id);

    // The host layers are gone, so the surviving frame has only "Other".
    expect(layersOf(rig).map((l) => l.name)).toEqual(["Other"]);
    // …and the selection landed on it — resolved AFTER the commit, which is
    // why it sees the post-delete frame rather than the pre-delete one.
    expect(rig.selectedLayers).toEqual(["other-1"]);
  });

  it("removeVariantLayer selects the frame's LAST layer, through the callback", () => {
    makeBodyVariant(rig);
    const hostId = layersOf(rig)[0].id;
    rig.selectedLayers.length = 0;

    rig.app.variants.removeVariantLayer(hostId);

    expect(layersOf(rig).map((l) => l.name)).toEqual(["Other"]);
    expect(rig.selectedLayers).toEqual(["other-1"]);
  });

  it("removeVariantLayer leaves the variant GROUP alone", () => {
    const { group } = makeBodyVariant(rig);
    rig.app.variants.removeVariantLayer(layersOf(rig)[0].id);
    // Groups persist independently of the layers hosting them.
    expect(rig.app.domain.variants.map((vg) => vg.id)).toEqual([group.id]);
  });
});

describe("VariantStore — variantFrameIndices goes through the UI callbacks", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig(variantFixture());
  });

  it("makeVariant seeds the new group's index at 0, on the UI store", () => {
    const { group } = makeBodyVariant(rig);
    expect(rig.app.timelineUI.variantFrameIndices).toEqual({ [group.id]: 0 });
  });

  it("⭐ the UI index write lands BEFORE the domain commit publishes", () => {
    // The ordering rule from `VariantStore`'s header. If the index were
    // written after the commit, the project object the commit published would
    // carry the STALE index and every memoised thumbnail holding that
    // reference would show the wrong variant frame.
    const { group, variant } = makeBodyVariant(rig);
    rig.published.length = 0;

    rig.app.variants.addVariantFrame(group.id, variant.id, false);

    const publishedProject = rig.published[rig.published.length - 1];
    expect(publishedProject.uiState.variantFrameIndices).toEqual({
      [group.id]: 1,
    });
    // …and it agrees with the tree that was published alongside it: the
    // fixture's 2 base frames gave the variant 2 frames, and this added a 3rd.
    expect(publishedProject.variants?.[0].variants[0].frames).toHaveLength(3);
  });

  it("deleteVariantGroup REMOVES the key rather than zeroing it", () => {
    const { group } = makeBodyVariant(rig);
    expect(rig.app.timelineUI.variantFrameIndices).toHaveProperty(group.id);

    rig.app.variants.deleteVariantGroup(group.id);

    expect(rig.app.timelineUI.variantFrameIndices).not.toHaveProperty(group.id);
    expect(rig.app.timelineUI.variantFrameIndices).toEqual({});
  });

  it("deleteVariantFrame selects the PREVIOUS frame, and refuses the last one", () => {
    const { group, variant } = makeBodyVariant(rig);
    // Two base frames → two variant frames already.
    expect(variant.frames).toHaveLength(2);

    rig.app.variants.deleteVariantFrame(
      group.id,
      variant.id,
      variant.frames[1].id,
    );
    expect(rig.app.domain.variants[0].variants[0].frames).toHaveLength(1);
    // index 1 deleted → max(0, 1-1) = 0
    expect(rig.app.timelineUI.variantFrameIndices[group.id]).toBe(0);

    const before = rig.snapshots.length;
    const only = rig.app.domain.variants[0].variants[0].frames[0].id;
    rig.app.variants.deleteVariantFrame(group.id, variant.id, only);
    // REFUSED: no history entry, frame still there.
    expect(rig.snapshots).toHaveLength(before);
    expect(rig.app.domain.variants[0].variants[0].frames).toHaveLength(1);
  });
});

describe("VariantStore — resizeVariant uses the EXTRACTED anchor math", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig(variantFixture());
  });

  it("compensates baseFrameOffsets by exactly getAnchorPadding's left/top", () => {
    const { group, variant } = makeBodyVariant(rig);
    const before = { ...variant.baseFrameOffsets };
    // 2×2 → 6×6 anchored bottom-right: ALL padding goes left/top.
    const { left, top } = getAnchorPadding("bottom-right", 4, 4);
    expect({ left, top }).toEqual({ left: 4, top: 4 });

    rig.app.variants.resizeVariant(group.id, variant.id, 6, 6, "bottom-right");

    const after = rig.app.domain.variants[0].variants[0];
    expect(after.gridSize).toEqual({ width: 6, height: 6 });
    expect(after.baseFrameOffsets).toEqual({
      0: { x: before[0].x - left, y: before[0].y - top },
      1: { x: before[1].x - left, y: before[1].y - top },
    });
  });

  it("defaults to middle-center, and produces raw grids", () => {
    const { group, variant } = makeBodyVariant(rig);
    rig.app.variants.resizeVariant(group.id, variant.id, 4, 4);
    const after = rig.app.domain.variants[0].variants[0];
    expect(after.gridSize).toEqual({ width: 4, height: 4 });
    // middle-center on a +2 delta → left/top padding 1
    expect(after.baseFrameOffsets[1]).toEqual({ x: 1, y: 1 });
    expect(() =>
      assertGridsAreRaw(rig.app.domain.objects, rig.app.domain.variants),
    ).not.toThrow();
  });

  it("shifts per-layer variantOffsets across the objects tree too", () => {
    const { group, variant } = makeBodyVariant(rig);
    const hostBefore = layersOf(rig)[0].variantOffsets?.[variant.id];
    expect(hostBefore).toBeDefined();

    rig.app.variants.resizeVariant(group.id, variant.id, 6, 6, "bottom-right");

    const hostAfter = layersOf(rig)[0].variantOffsets?.[variant.id];
    expect(hostAfter).toEqual({
      x: (hostBefore as { x: number }).x - 4,
      y: (hostBefore as { y: number }).y - 4,
    });
  });
});

describe("TimelineUIStore — the two variant SELECTION actions", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig(variantFixture());
  });

  it("selectVariantFrame gives the clicked group the EXACT index, unwrapped", () => {
    const { group } = makeBodyVariant(rig);
    // The variant has 2 frames; index 5 is stored as 5, not 5 % 2.
    rig.app.timelineUI.selectVariantFrame(group.id, 5);
    expect(rig.app.timelineUI.variantFrameIndices[group.id]).toBe(5);
  });

  it("selectVariantFrame pulls the BASE frame along, modulo the base count", () => {
    const { group } = makeBodyVariant(rig);
    // 2 base frames: index 3 → base frame 3 % 2 = 1.
    rig.app.timelineUI.selectVariantFrame(group.id, 3);
    expect(rig.app.timelineUI.selectedFrameId).toBe("frame-2");
  });

  it("selectVariantFrame writes NO history and NO domain change", () => {
    const { group } = makeBodyVariant(rig);
    const snapshotsBefore = rig.snapshots.length;
    const variantsBefore = rig.app.domain.variants;

    rig.app.timelineUI.selectVariantFrame(group.id, 1);

    expect(rig.snapshots).toHaveLength(snapshotsBefore);
    // The domain tree is untouched, by reference.
    expect(rig.app.domain.variants).toBe(variantsBefore);
  });

  it("advanceVariantFrames wraps FORWARD within each group's own frame count", () => {
    const { group } = makeBodyVariant(rig);
    expect(rig.app.timelineUI.variantFrameIndices[group.id]).toBe(0);
    rig.app.timelineUI.advanceVariantFrames(1);
    expect(rig.app.timelineUI.variantFrameIndices[group.id]).toBe(1);
    rig.app.timelineUI.advanceVariantFrames(1);
    // 2 frames → wraps back to 0.
    expect(rig.app.timelineUI.variantFrameIndices[group.id]).toBe(0);
  });

  it("⭐ advanceVariantFrames stays NON-NEGATIVE on a reverse step", () => {
    // The `+ maxFrames * Math.abs(delta)` term. A plain `%` would give -1
    // here, and `variant.frames[-1]` is `undefined` — a blank variant on
    // every reverse playback step.
    const { group } = makeBodyVariant(rig);
    rig.app.timelineUI.advanceVariantFrames(-1);
    expect(rig.app.timelineUI.variantFrameIndices[group.id]).toBe(1);
    rig.app.timelineUI.advanceVariantFrames(-3);
    expect(
      rig.app.timelineUI.variantFrameIndices[group.id],
    ).toBeGreaterThanOrEqual(0);
  });

  it("advanceVariantFrames is a no-op when there is no current frame", () => {
    const { group } = makeBodyVariant(rig);
    runInAction(() => {
      rig.app.timelineUI.selectedFrameId = "nope";
    });
    const before = rig.app.timelineUI.variantFrameIndices;
    rig.app.timelineUI.advanceVariantFrames(1);
    expect(rig.app.timelineUI.variantFrameIndices).toBe(before);
    expect(group).toBeDefined();
  });
});

describe("the LAYERING boundaries this task closed", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("⭐ NO file under src/stores imports from components/ (the W20 gate)", () => {
    // The violation this task removed: `getAnchorPadding` lived in
    // `components/AnchorGrid/AnchorGrid.tsx` and `ObjectStore` imported it.
    const files = [
      "src/stores/domain/VariantStore.ts",
      "src/stores/domain/ObjectStore.ts",
      "src/stores/domain/LayerStore.ts",
      "src/stores/domain/FrameStore.ts",
      "src/stores/ui/TimelineUIStore.ts",
      "src/stores/ApplicationStore.ts",
      // (task 38 deleted `src/stores/bridge/` outright — the strongest
      // possible pass for the file this list used to check.)
      "src/stores/history/editorHistory.ts",
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/from\s+["'][^"']*components\//);
    }
  });

  it("VariantStore imports NOTHING from stores/ui/**", () => {
    const src = read("src/stores/domain/VariantStore.ts");
    expect(src).not.toMatch(/from\s+["'][^"']*stores\/ui\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/ui\//);
    // …and it reaches `selectLayer` as a plain injected function instead.
    expect(src).toContain("selectLayer(id: string): void;");
  });

  it("VariantStore takes the anchor math from utils/, not from a component", () => {
    expect(read("src/stores/domain/VariantStore.ts")).toContain(
      'from "../../utils/variantHelpers"',
    );
  });

  it("the legacy variantActions module is GONE — task 38 finished the retirement", () => {
    // W28's gate pinned the module down to throwing stubs; task 38 deleted it
    // with the rest of the legacy store. `VariantStore` is the only
    // implementation, which is the end state the stub gate existed to reach.
    expect(existsSync("src/store/variantActions.ts")).toBe(false);
  });
});
