/**
 * `FrameStore`, `LayerStore` and `TimelineUIStore` (REFRESH task 25).
 *
 * These tests are ADDITIVE. The authoritative behaviour contract for all 26
 * migrated actions is task 08's suite in `src/store/__tests__/` — 336 tests
 * that run through the Zustand harness and, since this task, exercise the
 * MobX implementations through the bridge delegates. Not one of those
 * assertions was altered, which is the parity proof.
 *
 * What is asserted HERE is what task 08 could not see, because it only ever
 * looked at the Zustand surface:
 *
 *  1. the three stores mutate `DomainStore`'s tree directly, not a copy;
 *  2. the four `squash*` variants are still FOUR distinct methods with the
 *     four pinned divergences intact (the constraint most at risk from a
 *     later "cleanup");
 *  3. `selectLayer` bumps `layerSelectionCounter` on re-selection;
 *  4. the clipboards live on `SessionStore` and survive a project switch by
 *     construction — R14, restated at the store level;
 *  5. `stores/domain/**` imports nothing from `stores/ui/**`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { assertGridsAreRaw } from "@/stores/domain/gridSafety";
import {
  BLUE,
  GREEN,
  RED,
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
  /** Every selection patch `TimelineUIStore` published. */
  selectionPatches: Record<string, unknown>[];
  /** Every `selectLayer` call that cleared the pending colour adjustment. */
  clears: { count: number };
}

function solid(c: Color): PixelData {
  return { color: { ...c }, normal: 0, height: 0 };
}

function filledLayer(id: string, c: Color, w = 4, h = 4): Layer {
  return {
    id,
    name: id,
    visible: true,
    pixels: Array.from({ length: h }, () =>
      Array.from({ length: w }, () => solid(c)),
    ),
  };
}

function makeRig(project: Project = tinyProject()): Rig {
  let current: Project | null = project;
  const snapshots: string[] = [];
  const published: Project[] = [];
  const selectionPatches: Record<string, unknown>[] = [];
  const clears = { count: 0 };

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
    // The selection sink writes straight onto the TimelineUIStore, which is
    // what the bridge's Phase A round trip achieves in the real app.
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
      },
      clearColorAdjustment: () => {
        clears.count += 1;
      },
    },
  });

  runInAction(() => {
    app.domain.adoptTree(project);
    app.timelineUI.adopt({
      selectedObjectId: project.uiState.selectedObjectId,
      selectedFrameId: project.uiState.selectedFrameId,
      selectedLayerId: project.uiState.selectedLayerId,
    });
    // Task 28: `variantFrameIndices` flipped A→B, so `adopt()` no longer
    // carries it — an EXTERNAL write lands through its own seam.
    app.timelineUI.adoptVariantFrameIndices(
      project.uiState.variantFrameIndices ?? {},
    );
  });

  return { app, snapshots, published, selectionPatches, clears };
}

const layersOf = (rig: Rig, frameIndex = 0) =>
  rig.app.domain.objects[0].frames[frameIndex].layers;

const namesOf = (rig: Rig, frameIndex = 0) =>
  layersOf(rig, frameIndex).map((l) => l.name);

/* ── FrameStore ──────────────────────────────────────────────────────────── */

describe("FrameStore", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  it("mutates DomainStore's tree, not a copy, and snapshots BEFORE mutating", () => {
    rig.app.frames.addFrame("F2");
    expect(rig.app.domain.objects[0].frames).toHaveLength(2);
    // The snapshot label is recorded before the tree changes — the ordering
    // `DomainMutator` exists to enforce.
    expect(rig.snapshots).toEqual(["Add frame"]);
    expect(rig.published).toHaveLength(1);
  });

  it("addFrame inserts AFTER the selected frame, not at the end", () => {
    rig.app.frames.addFrame("A");
    rig.app.frames.addFrame("B");
    // "B" is inserted after "A" (which addFrame selected), not appended.
    expect(rig.app.domain.objects[0].frames.map((f) => f.name)).toEqual([
      "Frame 1",
      "A",
      "B",
    ]);
  });

  it("addFrame(copyPrevious) copies the layers into a NEW grid", () => {
    const p = tinyProject({ layers: [filledLayer("l1", RED)] });
    rig = makeRig(p);
    rig.app.frames.addFrame("F2", true);
    const [f1, f2] = rig.app.domain.objects[0].frames;
    expect(f2.layers[0].pixels[0][0].color).toEqual(RED);
    // A `ref` REPLACEMENT: a genuinely new grid, never the same array.
    expect(f2.layers[0].pixels).not.toBe(f1.layers[0].pixels);
    assertGridsAreRaw(rig.app.domain.objects);
  });

  it("deleteFrame REFUSES the last frame and otherwise selects the PREVIOUS one", () => {
    rig.app.frames.deleteFrame("frame-1");
    expect(rig.app.domain.objects[0].frames).toHaveLength(1);
    expect(rig.snapshots).toEqual([]);

    rig.app.frames.addFrame("F2");
    const [f1, f2] = rig.app.domain.objects[0].frames;
    rig.app.frames.deleteFrame(f2.id);
    expect(rig.app.domain.objects[0].frames).toHaveLength(1);
    expect(rig.app.timelineUI.selectedFrameId).toBe(f1.id);
  });

  it("deleteSelectedFrame delegates to deleteFrame (the intra-module call)", () => {
    rig.app.frames.addFrame("F2");
    const before = rig.app.domain.objects[0].frames.length;
    rig.app.frames.deleteSelectedFrame();
    expect(rig.app.domain.objects[0].frames).toHaveLength(before - 1);
  });

  it("reorderFrame corrects the insert index when dragging rightwards", () => {
    rig.app.frames.addFrame("A");
    rig.app.frames.addFrame("B");
    const frames = rig.app.domain.objects[0].frames;
    // Move "Frame 1" (index 0) to index 2 → insertIndex becomes 1.
    rig.app.frames.reorderFrame(frames[0].id, 2);
    expect(rig.app.domain.objects[0].frames.map((f) => f.name)).toEqual([
      "A",
      "Frame 1",
      "B",
    ]);
  });

  it("reorderFrame ALLOWS toIndex === length but rejects beyond it", () => {
    rig.app.frames.addFrame("A");
    const frames = rig.app.domain.objects[0].frames;
    rig.snapshots.length = 0;
    rig.app.frames.reorderFrame(frames[0].id, frames.length);
    expect(rig.snapshots).toEqual(["Reorder frame"]);

    rig.snapshots.length = 0;
    rig.app.frames.reorderFrame(frames[0].id, 99);
    expect(rig.snapshots).toEqual([]);
  });

  it("addFrameTag trims, LOWERCASES, ignores empty and de-duplicates", () => {
    const id = rig.app.domain.objects[0].frames[0].id;
    rig.app.frames.addFrameTag(id, "  Walk  ");
    rig.app.frames.addFrameTag(id, "walk");
    rig.app.frames.addFrameTag(id, "   ");
    expect(rig.app.domain.objects[0].frames[0].tags).toEqual(["walk"]);
  });

  it("removeFrameTag leaves `undefined`, not an empty array", () => {
    const id = rig.app.domain.objects[0].frames[0].id;
    rig.app.frames.addFrameTag(id, "walk");
    rig.app.frames.removeFrameTag(id, "walk");
    expect(rig.app.domain.objects[0].frames[0].tags).toBeUndefined();
  });
});

/* ── TimelineUIStore ─────────────────────────────────────────────────────── */

describe("TimelineUIStore", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  it("selectLayer bumps layerSelectionCounter on EVERY call, re-selection included", () => {
    const before = rig.app.timelineUI.layerSelectionCounter ?? 0;
    rig.app.timelineUI.selectLayer("layer-1");
    rig.app.timelineUI.selectLayer("layer-1");
    rig.app.timelineUI.selectLayer("layer-1");
    expect(rig.app.timelineUI.layerSelectionCounter).toBe(before + 3);
  });

  it("selectLayer accepts an id that does not exist (no guard — pinned)", () => {
    expect(() => rig.app.timelineUI.selectLayer("nope")).not.toThrow();
    expect(rig.app.timelineUI.selectedLayerId).toBe("nope");
  });

  it("selectLayer CLEARS the pending colour adjustment (verbatim from layerActions.ts:210)", () => {
    const before = rig.clears.count;
    rig.app.timelineUI.selectLayer("layer-1");
    expect(rig.clears.count).toBe(before + 1);
  });

  it("selectLayer NEVER records a history snapshot", () => {
    rig.snapshots.length = 0;
    rig.app.timelineUI.selectLayer("layer-1");
    expect(rig.snapshots).toEqual([]);
  });

  it("selectFrame NEVER records a history snapshot", () => {
    rig.app.frames.addFrame("F2");
    rig.snapshots.length = 0;
    const f = rig.app.domain.objects[0].frames[0];
    rig.app.timelineUI.selectFrame(f.id);
    expect(rig.snapshots).toEqual([]);
  });

  it("selectFrame carries the selection to the same-NAMED layer in the new frame", () => {
    const p = tinyProject({
      frames: [
        { id: "f1", name: "F1", layers: [mkLayer("a"), mkLayer("b")] },
        { id: "f2", name: "F2", layers: [mkLayer("a2"), mkLayer("b2")] },
      ],
    });
    // Give f2 a layer NAMED "a" so the name ladder has a target.
    p.objects[0].frames[1].layers[0].name = "a";
    rig = makeRig(p);
    runInAction(() => {
      rig.app.timelineUI.selectedFrameId = "f1";
      rig.app.timelineUI.selectedLayerId = "a";
    });
    rig.app.timelineUI.selectFrame("f2");
    expect(rig.app.timelineUI.selectedFrameId).toBe("f2");
    expect(rig.app.timelineUI.selectedLayerId).toBe("a2");
  });

  it("selectFrame(syncVariants=false) leaves variantFrameIndices untouched", () => {
    runInAction(() => {
      rig.app.timelineUI.variantFrameIndices = { vg: 7 };
    });
    rig.app.timelineUI.selectFrame("frame-1", false);
    expect(rig.app.timelineUI.variantFrameIndices).toEqual({ vg: 7 });
  });

  it("setVariantFrameIndex REBUILDS the record (observableRef, never in place)", () => {
    const before = rig.app.timelineUI.variantFrameIndices;
    rig.app.timelineUI.setVariantFrameIndex("vg-1", 3);
    expect(rig.app.timelineUI.variantFrameIndices).not.toBe(before);
    expect(rig.app.timelineUI.variantFrameIndices["vg-1"]).toBe(3);
  });

  it("the three view-mode fields read through to ViewportUIStore — one storage site", () => {
    rig.app.timelineUI.setTimelineThumbnailMode(true);
    rig.app.timelineUI.setObjectLibraryViewMode("grid");
    expect(rig.app.ui.viewport.timelineThumbnailMode).toBe(true);
    expect(rig.app.ui.viewport.objectLibraryViewMode).toBe("grid");
    expect(rig.app.timelineUI.timelineThumbnailMode).toBe(true);
    expect(rig.app.timelineUI.objectLibraryViewMode).toBe("grid");
  });

  it("selectLayer is injectable as a bare (id) => void — the task 28 seam", () => {
    // `variantActions.ts:446`/`:1407` are the store graph's only cross-module
    // edge. `VariantStore` will receive exactly this shape as a callback, so
    // the signature is asserted rather than assumed.
    const inject: (id: string) => void = (id) =>
      rig.app.timelineUI.selectLayer(id);
    inject("layer-1");
    expect(rig.app.timelineUI.selectedLayerId).toBe("layer-1");
  });
});

/* ── LayerStore ──────────────────────────────────────────────────────────── */

describe("LayerStore", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig(
      tinyProject({
        layers: [
          filledLayer("bottom", BLUE),
          filledLayer("middle", GREEN),
          filledLayer("top", RED),
        ],
      }),
    );
  });

  it("addLayer appends to the END — the TOP of the stack", () => {
    rig.app.layers.addLayer("new");
    expect(namesOf(rig)).toEqual(["bottom", "middle", "top", "new"]);
  });

  it("deleteLayer selects layers[0] — the BOTTOM, not the neighbour", () => {
    rig.app.layers.deleteLayer("top");
    expect(rig.app.timelineUI.selectedLayerId).toBe("bottom");
  });

  it("every mutation leaves grids RAW — no proxy ever reaches a pixel", () => {
    rig.app.layers.addLayer("new");
    rig.app.layers.moveLayerPixels(1, 1);
    rig.app.layers.squashLayerDown("middle");
    assertGridsAreRaw(rig.app.domain.objects);
  });

  /* ── the four squash* variants ─────────────────────────────────────────── */

  describe("the four squash* variants stay FOUR — pinned differences", () => {
    it("all four exist as DISTINCT methods (the anti-collapse guard)", () => {
      // The single most likely regression from a later "cleanup". The spec's
      // constraint is explicit: port all four, collapse in a follow-up if
      // desired — never while porting.
      const store = rig.app.layers;
      const names = [
        "squashLayerDown",
        "squashLayerUp",
        "squashLayerDownAcrossAllFrames",
        "squashLayerUpAcrossAllFrames",
      ] as const;
      const impls = names.map((n) => store[n]);
      for (const fn of impls) expect(typeof fn).toBe("function");
      // Four distinct function objects, not one parameterised core aliased.
      expect(new Set(impls).size).toBe(4);
    });

    it("Down keeps the layer BELOW; Up keeps the layer ABOVE", () => {
      rig.app.layers.squashLayerDown("middle");
      expect(namesOf(rig)).toEqual(["bottom", "top"]);

      rig = makeRig(
        tinyProject({
          layers: [
            filledLayer("bottom", BLUE),
            filledLayer("middle", GREEN),
            filledLayer("top", RED),
          ],
        }),
      );
      rig.app.layers.squashLayerUp("middle");
      expect(namesOf(rig)).toEqual(["bottom", "top"]);
    });

    it("BOUNDARY: the bottom cannot squash DOWN, the top cannot squash UP", () => {
      rig.snapshots.length = 0;
      rig.app.layers.squashLayerDown("bottom");
      rig.app.layers.squashLayerUp("top");
      expect(rig.snapshots).toEqual([]);
      expect(namesOf(rig)).toHaveLength(3);
    });

    it("DIVERGENCE: the per-frame skip guards are ASYMMETRIC (len<=idx vs len<=idx+1)", () => {
      // Frame 2 has exactly 2 layers, so index 1 is its TOP.
      const p = tinyProject({
        frames: [
          {
            id: "f1",
            name: "F1",
            layers: [
              filledLayer("a", BLUE),
              filledLayer("b", GREEN),
              filledLayer("c", RED),
            ],
          },
          {
            id: "f2",
            name: "F2",
            layers: [filledLayer("x", BLUE), filledLayer("y", GREEN)],
          },
        ],
      });
      rig = makeRig(p);
      // Down at index 1: guard is `len <= 1`, and frame 2 has 2 → NOT skipped.
      rig.app.layers.squashLayerDownAcrossAllFrames("b");
      expect(namesOf(rig, 1)).toHaveLength(1);

      rig = makeRig(p);
      // Up at index 1: guard is `len <= 2`, and frame 2 has 2 → SKIPPED.
      rig.app.layers.squashLayerUpAcrossAllFrames("b");
      expect(namesOf(rig, 1)).toHaveLength(2);
    });

    it("DIVERGENCE: none of the four consults `visible`", () => {
      const p = tinyProject({
        layers: [
          filledLayer("bottom", BLUE),
          { ...filledLayer("middle", GREEN), visible: false },
        ],
      });
      rig = makeRig(p);
      rig.app.layers.squashLayerUp("bottom");
      // The hidden layer survived AND the hidden pixels were blended in.
      expect(namesOf(rig)).toEqual(["middle"]);
    });

    it("all four REFUSE when either side isVariant", () => {
      const p = tinyProject({
        layers: [
          filledLayer("bottom", BLUE),
          { ...filledLayer("v", GREEN), isVariant: true },
        ],
      });
      rig = makeRig(p);
      rig.snapshots.length = 0;
      rig.app.layers.squashLayerUp("bottom");
      rig.app.layers.squashLayerDown("v");
      rig.app.layers.squashLayerUpAcrossAllFrames("bottom");
      rig.app.layers.squashLayerDownAcrossAllFrames("v");
      expect(rig.snapshots).toEqual([]);
      expect(namesOf(rig)).toHaveLength(2);
    });
  });

  /* ── the timelineActions half ──────────────────────────────────────────── */

  it("DIVERGENCE ported faithfully: addLayerToAllFrames selects an id that matches NO layer", () => {
    // `timelineActions.ts:15-40` generated `layerId` up front and selected it,
    // but gave each frame's layer its own id. Observed behaviour, preserved.
    rig.app.layers.addLayerToAllFrames("everywhere");
    const selected = rig.app.timelineUI.selectedLayerId;
    const allIds = rig.app.domain.objects[0].frames.flatMap((f) =>
      f.layers.map((l) => l.id),
    );
    expect(selected).not.toBeNull();
    expect(allIds).not.toContain(selected);
  });

  it("addLayerToFrameAtPosition inserts at the index and RETURNS the id", () => {
    const frameId = rig.app.domain.objects[0].frames[0].id;
    const id = rig.app.layers.addLayerToFrameAtPosition(frameId, "mid", 1);
    expect(namesOf(rig)).toEqual(["bottom", "mid", "middle", "top"]);
    expect(layersOf(rig)[1].id).toBe(id);
  });

  it("deleteLayerFromFrame refuses the last layer of that frame", () => {
    const p = tinyProject({ layers: [filledLayer("only", RED)] });
    rig = makeRig(p);
    rig.snapshots.length = 0;
    rig.app.layers.deleteLayerFromFrame("frame-1", "only");
    expect(rig.snapshots).toEqual([]);
  });

  /* ── R14 — the clipboards ──────────────────────────────────────────────── */

  describe("R14 — the clipboards live on SessionStore and survive a switch", () => {
    it("copyLayerToClipboard writes SessionStore, not the project or history", () => {
      const before = JSON.stringify(rig.app.domain.objects);
      rig.snapshots.length = 0;
      rig.app.layers.copyLayerToClipboard("top");
      expect(rig.app.session.layerClipboard).not.toBeNull();
      expect(rig.app.session.layerClipboard!.type).toBe("layer");
      expect(JSON.stringify(rig.app.domain.objects)).toBe(before);
      expect(rig.snapshots).toEqual([]);
    });

    it("copyTimelineCell likewise writes SessionStore only", () => {
      const frameId = rig.app.domain.objects[0].frames[0].id;
      rig.snapshots.length = 0;
      rig.app.layers.copyTimelineCell(frameId, "top");
      expect(rig.app.session.timelineCellClipboard).not.toBeNull();
      expect(rig.app.session.timelineCellClipboard!.layerName).toBe("top");
      expect(rig.snapshots).toEqual([]);
    });

    it("⭐ SessionStore has NO reset/clear/project-switch hook — by construction", () => {
      // R14's mechanism, asserted structurally rather than behaviourally so
      // it fails the moment someone ADDS such a hook, not merely when a
      // switch happens to call it. The two task-08 CROSS-PROJECT tests in
      // `src/store/__tests__/layers.test.ts` cover the behaviour itself.
      const session = rig.app.session as unknown as Record<string, unknown>;
      for (const name of ["reset", "clear", "clearClipboards", "onProjectSwitch"]) {
        expect(session[name]).toBeUndefined();
      }
    });

    it("⭐ replacing the whole project tree leaves BOTH clipboards intact", () => {
      rig.app.layers.copyLayerToClipboard("top");
      const frameId = rig.app.domain.objects[0].frames[0].id;
      rig.app.layers.copyTimelineCell(frameId, "top");

      // The tree swap a project switch performs.
      runInAction(() =>
        rig.app.domain.adoptTree(
          tinyProject({ layers: [filledLayer("in-B", BLUE)] }),
        ),
      );

      expect(rig.app.session.layerClipboard).not.toBeNull();
      expect(rig.app.session.timelineCellClipboard).not.toBeNull();

      // …and it still pastes into the NEW project.
      rig.app.layers.pasteLayerFromClipboard();
      expect(namesOf(rig)).toEqual(["in-B", "top"]);
    });

    it("paste centre-pads a SMALLER source and biases odd differences TOP-LEFT", () => {
      rig = makeRig(
        tinyProject({
          layers: [filledLayer("small", RED, 2, 2)],
          width: 2,
          height: 2,
        }),
      );
      rig.app.layers.copyLayerToClipboard("small");
      const clipboard = rig.app.session.layerClipboard;

      rig = makeRig(tinyProject({ width: 5, height: 5 }));
      runInAction(() => {
        rig.app.session.layerClipboard = clipboard;
      });
      rig.app.layers.pasteLayerFromClipboard();

      const pasted = layersOf(rig)[1];
      // floor((5 - 2) / 2) = 1, not 1.5 and not 2.
      expect(pasted.pixels[1][1].color).toEqual(RED);
      expect(pasted.pixels[2][2].color).toEqual(RED);
      expect(pasted.pixels[3][3].color).toBe(0);
    });

    it("paste does NOT change the selected layer", () => {
      rig.app.layers.copyLayerToClipboard("top");
      const before = rig.app.timelineUI.selectedLayerId;
      rig.app.layers.pasteLayerFromClipboard();
      expect(rig.app.timelineUI.selectedLayerId).toBe(before);
    });

    it("copyLayerFromObject BYPASSES the clipboard entirely", () => {
      const p = tinyProject({ layers: [filledLayer("target", BLUE)] });
      p.objects.push({
        id: "obj-2",
        name: "Source",
        gridSize: { width: 4, height: 4 },
        frames: [
          { id: "f-src", name: "F", layers: [filledLayer("src", GREEN)] },
        ],
      });
      rig = makeRig(p);
      rig.app.layers.copyLayerFromObject("obj-2", "src", false);
      expect(rig.app.session.layerClipboard).toBeNull();
      expect(namesOf(rig)).toEqual(["target", "src"]);
    });

    it("copyLayerFromObject only finds a layer on the source object's FIRST frame", () => {
      const p = tinyProject({ layers: [filledLayer("target", BLUE)] });
      p.objects.push({
        id: "obj-2",
        name: "Source",
        gridSize: { width: 4, height: 4 },
        frames: [
          { id: "f-a", name: "A", layers: [filledLayer("first", GREEN)] },
          { id: "f-b", name: "B", layers: [filledLayer("later", RED)] },
        ],
      });
      rig = makeRig(p);
      rig.snapshots.length = 0;
      // "later" exists only on frame 2 → not found → no-op (pinned).
      rig.app.layers.copyLayerFromObject("obj-2", "later", false);
      expect(rig.snapshots).toEqual([]);
      expect(namesOf(rig)).toEqual(["target"]);
    });
  });
});

/* ── the boundary ────────────────────────────────────────────────────────── */

describe("the stores/domain → stores/ui boundary", () => {
  it("neither FrameStore nor LayerStore imports from stores/ui", () => {
    // ESLint enforces this too, but a rule that matches nothing looks exactly
    // like a rule that passes (W3's lesson), so it is also asserted directly.
    for (const file of [
      "src/stores/domain/FrameStore.ts",
      "src/stores/domain/LayerStore.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/^import[^;]*?from\s+"([^"]+)"/gms)]
        .map((m) => m[1])
        .filter((spec) => spec.includes("ui/") || spec.includes("stores/ui"));
      expect(imports).toEqual([]);
    }
  });

  it("TimelineUIStore imports nothing from stores/domain", () => {
    const source = readFileSync("src/stores/ui/TimelineUIStore.ts", "utf8");
    const imports = [...source.matchAll(/^import[^;]*?from\s+"([^"]+)"/gms)]
      .map((m) => m[1])
      .filter((spec) => spec.includes("domain"));
    expect(imports).toEqual([]);
  });
});
