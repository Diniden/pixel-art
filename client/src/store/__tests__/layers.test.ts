/**
 * Behaviour contract — `store/layerActions.ts` and
 * `store/layerClipboardActions.ts`.
 *
 * ## The two things this file exists for
 *
 * 1. **The four `squash*` variants.** They are near-identical, a later task
 *    collapses them into one, and they DISAGREE in ways that are invisible
 *    unless pinned. Measured differences, all recorded below:
 *    - `Down`/`Up` differ in which neighbour survives AND, critically, in
 *      whether the composite respects stacking order. Both pass the squashed
 *      layer as `src` and the survivor as `dst`, so `squashLayerUp` composites
 *      the LOWER layer over the UPPER one — inverted relative to how the canvas
 *      renders.
 *    - The `AcrossAllFrames` pair matches layers **by ARRAY INDEX**, not by id
 *      and not by name. The single-frame pair matches by id.
 *    - The per-frame skip guards are asymmetric: `len <= idx` for Down,
 *      `len <= idx + 1` for Up.
 *    - **None of the four consults `visible`.** A hidden layer's pixels are
 *      blended in regardless.
 *
 * 2. **Cross-project clipboard survival.** `layerClipboard` lives on
 *    `EditorState`, not on `Project`, and NOTHING in `projectActions.ts` clears
 *    it. Copy in project A → switch project → paste in project B works, and
 *    that is load-bearing behaviour a MobX port must preserve.
 *
 * ARRAY-INDEX CONVENTION (measured): `layers[0]` is the BOTTOM of the stack,
 * `layers[length-1]` the TOP. "down" means index-1; "up" means index+1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  layerOf,
  mkLayer,
  tinyProject,
  wireAutoSave,
  type StoreHarness,
} from "./storeContract";
import { projectToCompact } from "@/types";
import type { Color, Layer, PixelData, Project } from "@/types";
import { useEditorStore } from "@/store";
// Task 16: the lifecycle actions are DomainStore flows behind bridge-installed
// delegates; the cross-project tests wire the stack and stub the typed API.
import { projectApi } from "@/api";

/* ── fixtures ────────────────────────────────────────────────────────────── */

const solid = (c: Color, height = 0): PixelData => ({
  color: { ...c },
  normal: 0,
  height,
});

/** A layer of the given size filled entirely with one colour. */
function filledLayer(
  id: string,
  c: Color,
  w = 4,
  h = 4,
  overrides: Partial<Layer> = {},
): Layer {
  return {
    id,
    name: id,
    visible: true,
    pixels: Array.from({ length: h }, () =>
      Array.from({ length: w }, () => solid(c)),
    ),
    ...overrides,
  };
}

/** 3 stacked layers: bottom=blue, middle=green, top=red (half alpha). */
function stackProject(topAlpha = 255): Project {
  return tinyProject({
    layers: [
      filledLayer("bottom", BLUE),
      filledLayer("middle", GREEN),
      filledLayer("top", { ...RED, a: topAlpha }),
    ],
  });
}

const layerIds = (harness: StoreHarness, frameIndex = 0): string[] =>
  harness.getProject()!.objects[0].frames[frameIndex].layers.map((l) => l.id);

const layerNames = (harness: StoreHarness, frameIndex = 0): string[] =>
  harness.getProject()!.objects[0].frames[frameIndex].layers.map((l) => l.name);

const pixelOf = (
  harness: StoreHarness,
  layerIndex: number,
  x = 0,
  y = 0,
  frameIndex = 0,
) =>
  harness.getProject()!.objects[0].frames[frameIndex].layers[layerIndex].pixels[
    y
  ][x];

const readClipboard = () => useEditorStore.getState().layerClipboard;

describe.each(HARNESSES)("%s — layers", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
    harness.load(tinyProject());
  });

  afterEach(() => {
    harness.dispatch("endStroke");
    harness.reset();
    useEditorStore.setState({ layerClipboard: null });
  });

  /* ── add / duplicate / delete / rename / visibility ────────────────────── */

  describe("addLayer", () => {
    it("appends to the END of the array — the TOP of the stack", () => {
      harness.dispatch("addLayer", "New");
      expect(layerNames(harness)).toEqual(["layer-1", "New"]);
    });

    it("gives the new layer a fresh id, an empty grid at the OBJECT size, and visible:true", () => {
      harness.dispatch("addLayer", "New");
      const added = layerOf(harness.getProject(), 1)!;
      expect(added.id).not.toBe("layer-1");
      expect(added.visible).toBe(true);
      expect(added.pixels).toHaveLength(4);
      expect(added.pixels[0]).toHaveLength(4);
      expect(added.pixels.flat().every((p) => p.color === 0)).toBe(true);
    });

    it("SELECTS the new layer", () => {
      harness.dispatch("addLayer", "New");
      expect(harness.getUiState().selectedLayerId).toBe(
        layerOf(harness.getProject(), 1)!.id,
      );
    });

    it("OBSERVED: does NOT uniquify names — duplicates are allowed", () => {
      harness.dispatch("addLayer", "Dup");
      harness.dispatch("addLayer", "Dup");
      expect(layerNames(harness)).toEqual(["layer-1", "Dup", "Dup"]);
    });

    it("affects the CURRENT frame only", () => {
      harness.load(
        tinyProject({
          frames: [
            { id: "frame-1", name: "F1", layers: [mkLayer("a")] },
            { id: "frame-2", name: "F2", layers: [mkLayer("b")] },
          ],
        }),
      );
      harness.dispatch("addLayer", "New");
      expect(layerNames(harness, 0)).toEqual(["a", "New"]);
      expect(layerNames(harness, 1)).toEqual(["b"]);
    });

    it("tracks history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("addLayer", "New");
      expect(harness.getHistoryLength()).toBe(before + 1);
    });
  });

  describe("duplicateLayer", () => {
    it("inserts DIRECTLY ABOVE the source, not at the top", () => {
      harness.load(stackProject());
      harness.dispatch("duplicateLayer", "bottom");
      expect(layerNames(harness)).toEqual([
        "bottom",
        "bottom Copy",
        "middle",
        "top",
      ]);
    });

    it('names the copy "<source> Copy" and gives it a fresh id', () => {
      harness.dispatch("duplicateLayer", "layer-1");
      const copy = layerOf(harness.getProject(), 1)!;
      expect(copy.name).toBe("layer-1 Copy");
      expect(copy.id).not.toBe("layer-1");
    });

    it("OBSERVED: the copy SHARES PixelData objects with the source", () => {
      // `sourceLayer.pixels.map(row => [...row])` copies the ROWS but not the
      // cells, so the two layers alias every PixelData. Everywhere else in this
      // codebase pixels are deep-copied field by field. Recorded, not fixed:
      // a "fix" changes memory behaviour on a 300k-cell project.
      harness.load(stackProject());
      harness.dispatch("duplicateLayer", "bottom");
      const source = layerOf(harness.getProject(), 0)!;
      const copy = layerOf(harness.getProject(), 1)!;
      expect(copy.pixels).not.toBe(source.pixels);
      expect(copy.pixels[0]).not.toBe(source.pixels[0]);
      expect(copy.pixels[0][0]).toBe(source.pixels[0][0]);
    });

    it("selects the copy, and is a no-op for an unknown id", () => {
      harness.dispatch("duplicateLayer", "layer-1");
      expect(harness.getUiState().selectedLayerId).toBe(
        layerOf(harness.getProject(), 1)!.id,
      );

      const before = harness.getHistoryLength();
      harness.dispatch("duplicateLayer", "no-such-layer");
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  describe("deleteLayer", () => {
    it("REFUSES to delete the last remaining layer", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("deleteLayer", "layer-1");
      expect(layerIds(harness)).toEqual(["layer-1"]);
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("removes the named layer", () => {
      harness.load(stackProject());
      harness.dispatch("deleteLayer", "middle");
      expect(layerIds(harness)).toEqual(["bottom", "top"]);
    });

    it("OBSERVED: always selects layers[0] — the BOTTOM, not the neighbour", () => {
      harness.load(stackProject());
      harness.dispatch("deleteLayer", "top");
      expect(harness.getUiState().selectedLayerId).toBe("bottom");
    });

    it("affects the current frame only", () => {
      harness.load(
        tinyProject({
          frames: [
            { id: "frame-1", name: "F1", layers: [mkLayer("a"), mkLayer("b")] },
            {
              id: "frame-2",
              name: "F2",
              layers: [mkLayer("a2"), mkLayer("b2")],
            },
          ],
        }),
      );
      harness.dispatch("deleteLayer", "b");
      expect(layerIds(harness, 0)).toEqual(["a"]);
      expect(layerIds(harness, 1)).toEqual(["a2", "b2"]);
    });
  });

  describe("renameLayer / toggleLayerVisibility / toggleAllLayersVisibility", () => {
    it("renameLayer sets the name and leaves the selection alone", () => {
      const selected = harness.getUiState().selectedLayerId;
      harness.dispatch("renameLayer", "layer-1", "Renamed");
      expect(layerNames(harness)).toEqual(["Renamed"]);
      expect(harness.getUiState().selectedLayerId).toBe(selected);
    });

    it("toggleLayerVisibility FLIPS one layer in the current frame only", () => {
      harness.load(stackProject());
      harness.dispatch("toggleLayerVisibility", "middle");
      expect(layerOf(harness.getProject(), 1)!.visible).toBe(false);
      harness.dispatch("toggleLayerVisibility", "middle");
      expect(layerOf(harness.getProject(), 1)!.visible).toBe(true);
    });

    it("toggleAllLayersVisibility SETS an absolute value, it does not toggle", () => {
      harness.load(stackProject());
      harness.dispatch("toggleLayerVisibility", "middle"); // now false
      harness.dispatch("toggleAllLayersVisibility", true);
      expect(
        harness
          .getProject()!
          .objects[0].frames[0].layers.every((l) => l.visible),
      ).toBe(true);

      harness.dispatch("toggleAllLayersVisibility", true);
      expect(
        harness
          .getProject()!
          .objects[0].frames[0].layers.every((l) => l.visible),
      ).toBe(true);
    });
  });

  describe("selectLayer", () => {
    it("does NOT track history (the lone `false` in this file)", () => {
      harness.load(stackProject());
      const before = harness.getHistoryLength();
      harness.dispatch("selectLayer", "top");
      expect(harness.getHistoryLength()).toBe(before);
      expect(harness.getUiState().selectedLayerId).toBe("top");
    });

    it("INCREMENTS layerSelectionCounter on every call, re-selection included", () => {
      harness.load(stackProject());
      const start = harness.getUiState().layerSelectionCounter ?? 0;
      harness.dispatch("selectLayer", "top");
      harness.dispatch("selectLayer", "top");
      harness.dispatch("selectLayer", "top");
      expect(harness.getUiState().layerSelectionCounter).toBe(start + 3);
    });

    it("OBSERVED: accepts an id that does not exist", () => {
      harness.dispatch("selectLayer", "no-such-layer");
      expect(harness.getUiState().selectedLayerId).toBe("no-such-layer");
    });
  });

  /* ── reorder ───────────────────────────────────────────────────────────── */

  describe("moveLayer / moveLayerAcrossAllFrames", () => {
    it("moveLayer splices from -> to", () => {
      harness.load(stackProject());
      harness.dispatch("moveLayer", 0, 2);
      expect(layerIds(harness)).toEqual(["middle", "top", "bottom"]);
    });

    it('moveLayerAcrossAllFrames "up" means index + 1', () => {
      harness.load(stackProject());
      harness.dispatch("moveLayerAcrossAllFrames", "bottom", "up");
      expect(layerIds(harness)).toEqual(["middle", "bottom", "top"]);
    });

    it('"down" means index - 1, and the bottom layer cannot move down', () => {
      harness.load(stackProject());
      harness.dispatch("moveLayerAcrossAllFrames", "top", "down");
      expect(layerIds(harness)).toEqual(["bottom", "top", "middle"]);

      const before = harness.getHistoryLength();
      harness.dispatch("moveLayerAcrossAllFrames", "bottom", "down");
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("OBSERVED: AcrossAllFrames reorders BY INDEX, ignoring ids in other frames", () => {
      harness.load(
        tinyProject({
          frames: [
            {
              id: "frame-1",
              name: "F1",
              layers: [mkLayer("a"), mkLayer("b"), mkLayer("c")],
            },
            {
              id: "frame-2",
              name: "F2",
              // DIFFERENT ids at the same indices.
              layers: [mkLayer("x"), mkLayer("y"), mkLayer("z")],
            },
          ],
        }),
      );
      harness.dispatch("moveLayerAcrossAllFrames", "a", "up");
      expect(layerIds(harness, 0)).toEqual(["b", "a", "c"]);
      // Frame 2 was reordered by the SAME index, matching nothing by id.
      expect(layerIds(harness, 1)).toEqual(["y", "x", "z"]);
    });

    it("SKIPS a frame that has too few layers", () => {
      harness.load(
        tinyProject({
          frames: [
            { id: "frame-1", name: "F1", layers: [mkLayer("a"), mkLayer("b")] },
            { id: "frame-2", name: "F2", layers: [mkLayer("x")] },
          ],
        }),
      );
      harness.dispatch("moveLayerAcrossAllFrames", "a", "up");
      expect(layerIds(harness, 0)).toEqual(["b", "a"]);
      expect(layerIds(harness, 1)).toEqual(["x"]);
    });
  });

  describe("deleteLayerAcrossAllFrames", () => {
    it("deletes by INDEX in every frame", () => {
      harness.load(
        tinyProject({
          frames: [
            { id: "frame-1", name: "F1", layers: [mkLayer("a"), mkLayer("b")] },
            { id: "frame-2", name: "F2", layers: [mkLayer("x"), mkLayer("y")] },
          ],
        }),
      );
      harness.dispatch("deleteLayerAcrossAllFrames", "b");
      expect(layerIds(harness, 0)).toEqual(["a"]);
      expect(layerIds(harness, 1)).toEqual(["x"]);
    });

    it("refuses when the current frame has only one layer", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("deleteLayerAcrossAllFrames", "layer-1");
      expect(layerIds(harness)).toEqual(["layer-1"]);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  /* ══ THE FOUR SQUASH VARIANTS ══════════════════════════════════════════ */

  describe("the four squash* variants — pinned differences", () => {
    /**
     * Bottom=BLUE opaque, middle=GREEN opaque, top=RED at HALF ALPHA. The half
     * alpha is essential: with everything opaque, `blendPixels` returns the src
     * verbatim and the up/down composite-order difference is invisible.
     */
    const half = { ...RED, a: 128 };

    beforeEach(() =>
      harness.load(
        tinyProject({
          layers: [
            filledLayer("bottom", BLUE),
            filledLayer("middle", GREEN),
            filledLayer("top", half),
          ],
        }),
      ),
    );

    it("squashLayerDown: the layer BELOW survives, the target is deleted", () => {
      harness.dispatch("squashLayerDown", "top");
      expect(layerIds(harness)).toEqual(["bottom", "middle"]);
    });

    it("squashLayerUp: the layer ABOVE survives, the target is deleted", () => {
      harness.dispatch("squashLayerUp", "middle");
      expect(layerIds(harness)).toEqual(["bottom", "top"]);
    });

    it("the survivor KEEPS its own id, name and visible flag", () => {
      harness.dispatch("squashLayerDown", "top");
      const survivor = layerOf(harness.getProject(), 1)!;
      expect(survivor.id).toBe("middle");
      expect(survivor.name).toBe("middle");
      expect(survivor.visible).toBe(true);
    });

    it("SELECTS the survivor", () => {
      harness.dispatch("squashLayerDown", "top");
      expect(harness.getUiState().selectedLayerId).toBe("middle");
      harness.load(stackProject());
      harness.dispatch("squashLayerUp", "middle");
      expect(harness.getUiState().selectedLayerId).toBe("top");
    });

    it("BOUNDARY: the BOTTOM layer cannot squash DOWN", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("squashLayerDown", "bottom");
      expect(layerIds(harness)).toEqual(["bottom", "middle", "top"]);
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("BOUNDARY: the TOP layer cannot squash UP", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("squashLayerUp", "top");
      expect(layerIds(harness)).toEqual(["bottom", "middle", "top"]);
      expect(harness.getHistoryLength()).toBe(before);
    });

    // ══ THE COMPOSITE-ORDER DIVERGENCE ═══════════════════════════════════
    it("DIVERGENCE: Down composites correctly, Up composites the LOWER layer OVER the upper", () => {
      // Both call `blendPixels(squashedPixel, survivorPixel)` — the target is
      // always `src` and the survivor always `dst`. For DOWN that matches the
      // real stacking order (upper over lower). For UP it INVERTS it.
      //
      // Blending half-alpha RED (128) over opaque GREEN gives {128,127,0,255};
      // blending opaque GREEN over half-alpha RED short-circuits to the src.
      harness.dispatch("squashLayerDown", "top");
      const downResult = pixelOf(harness, 1).color;
      expect(downResult).toEqual({ r: 128, g: 127, b: 0, a: 255 });

      harness.load(
        tinyProject({
          layers: [
            filledLayer("bottom", BLUE),
            filledLayer("middle", GREEN),
            filledLayer("top", half),
          ],
        }),
      );
      harness.dispatch("squashLayerUp", "middle");
      const upResult = pixelOf(harness, 1).color;
      // GREEN is opaque so it wins outright, obliterating the half-alpha red
      // that was ABOVE it. A correct implementation would have produced the
      // same {128,127,0,255} as the DOWN case.
      expect(upResult).toEqual(GREEN);
      expect(upResult).not.toEqual(downResult);
    });

    it("DIVERGENCE: NONE of the four consults `visible`", () => {
      // Squashing a HIDDEN layer into a visible one makes its pixels appear.
      harness.load(
        tinyProject({
          layers: [
            filledLayer("bottom", BLUE),
            filledLayer("hidden", GREEN, 4, 4, { visible: false }),
          ],
        }),
      );
      harness.dispatch("squashLayerDown", "hidden");
      expect(layerIds(harness)).toEqual(["bottom"]);
      // GREEN was invisible and is now the composited result.
      expect(pixelOf(harness, 0).color).toEqual(GREEN);
      // …and the survivor kept its OWN visible flag.
      expect(layerOf(harness.getProject(), 0)!.visible).toBe(true);
    });

    it("all four REFUSE when either side isVariant", () => {
      harness.load(
        tinyProject({
          layers: [
            filledLayer("bottom", BLUE),
            filledLayer("v", GREEN, 4, 4, {
              isVariant: true,
              variantGroupId: "vg",
              selectedVariantId: "v1",
            }),
          ],
        }),
      );
      const before = harness.getHistoryLength();
      harness.dispatch("squashLayerDown", "v");
      harness.dispatch("squashLayerUp", "bottom");
      harness.dispatch("squashLayerDownAcrossAllFrames", "v");
      harness.dispatch("squashLayerUpAcrossAllFrames", "bottom");
      expect(layerIds(harness)).toEqual(["bottom", "v"]);
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("the single-frame pair touches ONLY the current frame", () => {
      harness.load(
        tinyProject({
          frames: [
            {
              id: "frame-1",
              name: "F1",
              layers: [filledLayer("a", BLUE), filledLayer("b", GREEN)],
            },
            {
              id: "frame-2",
              name: "F2",
              layers: [filledLayer("x", BLUE), filledLayer("y", GREEN)],
            },
          ],
        }),
      );
      harness.dispatch("squashLayerDown", "b");
      expect(layerIds(harness, 0)).toEqual(["a"]);
      expect(layerIds(harness, 1)).toEqual(["x", "y"]);
    });

    it("DIVERGENCE: the AcrossAllFrames pair matches by ARRAY INDEX, not by id", () => {
      harness.load(
        tinyProject({
          frames: [
            {
              id: "frame-1",
              name: "F1",
              layers: [filledLayer("a", BLUE), filledLayer("b", GREEN)],
            },
            {
              id: "frame-2",
              name: "F2",
              // Completely different ids at the same indices.
              layers: [filledLayer("x", BLUE), filledLayer("y", RED)],
            },
          ],
        }),
      );
      harness.dispatch("squashLayerDownAcrossAllFrames", "b");
      expect(layerIds(harness, 0)).toEqual(["a"]);
      // Frame 2's index-1 layer was squashed too, despite matching no id.
      expect(layerIds(harness, 1)).toEqual(["x"]);
      expect(pixelOf(harness, 0, 0, 0, 1).color).toEqual(RED);
    });

    it("DIVERGENCE: the per-frame skip guards are ASYMMETRIC (len<=idx vs len<=idx+1)", () => {
      // A frame with FEWER layers than the current one is skipped. The Down
      // variant's guard is `f.layers.length <= layerIndex`; Up's is
      // `f.layers.length <= layerIndex + 1`.
      harness.load(
        tinyProject({
          frames: [
            {
              id: "frame-1",
              name: "F1",
              layers: [
                filledLayer("a", BLUE),
                filledLayer("b", GREEN),
                filledLayer("c", RED),
              ],
            },
            {
              id: "frame-2",
              name: "F2",
              layers: [filledLayer("x", BLUE), filledLayer("y", GREEN)],
            },
          ],
        }),
      );
      // layerIndex of "b" is 1. Frame 2 has 2 layers.
      //   Down guard: 2 <= 1 -> false -> frame 2 IS squashed.
      //   Up   guard: 2 <= 2 -> true  -> frame 2 is SKIPPED.
      harness.dispatch("squashLayerDownAcrossAllFrames", "b");
      expect(layerIds(harness, 1)).toEqual(["x"]);

      harness.load(
        tinyProject({
          frames: [
            {
              id: "frame-1",
              name: "F1",
              layers: [
                filledLayer("a", BLUE),
                filledLayer("b", GREEN),
                filledLayer("c", RED),
              ],
            },
            {
              id: "frame-2",
              name: "F2",
              layers: [filledLayer("x", BLUE), filledLayer("y", GREEN)],
            },
          ],
        }),
      );
      harness.dispatch("squashLayerUpAcrossAllFrames", "b");
      expect(layerIds(harness, 0)).toEqual(["a", "c"]);
      expect(layerIds(harness, 1)).toEqual(["x", "y"]);
    });

    it("all four track history — one undo restores the deleted layer", () => {
      for (const action of [
        "squashLayerDown",
        "squashLayerUp",
        "squashLayerDownAcrossAllFrames",
        "squashLayerUpAcrossAllFrames",
      ] as const) {
        harness.load(stackProject());
        const before = harness.getHistoryLength();
        harness.dispatch(action, "middle");
        expect(harness.getHistoryLength()).toBe(before + 1);
        harness.dispatch("undo");
        expect(layerIds(harness)).toEqual(["bottom", "middle", "top"]);
      }
    });

    it("an EMPTY squashed layer leaves the survivor untouched", () => {
      harness.load(
        tinyProject({
          layers: [filledLayer("bottom", BLUE), mkLayer("empty")],
        }),
      );
      harness.dispatch("squashLayerDown", "empty");
      expect(pixelOf(harness, 0).color).toEqual(BLUE);
    });

    it("squashing onto an EMPTY survivor keeps the squashed pixels", () => {
      harness.load(
        tinyProject({
          layers: [mkLayer("empty"), filledLayer("top", GREEN)],
        }),
      );
      harness.dispatch("squashLayerDown", "top");
      expect(pixelOf(harness, 0).color).toEqual(GREEN);
    });
  });

  /* ── moveLayerPixels ───────────────────────────────────────────────────── */

  describe("moveLayerPixels", () => {
    it("translates WITHOUT wrapping, clipping what falls off the edge", () => {
      const p = tinyProject();
      p.objects[0].frames[0].layers[0].pixels[0][0] = solid(RED);
      p.objects[0].frames[0].layers[0].pixels[0][3] = solid(BLUE);
      harness.load(p);

      harness.dispatch("moveLayerPixels", 1, 1);
      const px = layerOf(harness.getProject())!.pixels;
      expect(px[1][1].color).toEqual(RED);
      expect(px[0][0].color).toBe(0);
      // BLUE was at x=3; +1 pushes it off the right edge and it is LOST.
      expect(px.flat().filter((c) => c.color !== 0)).toHaveLength(1);
    });

    it("moves ONLY the selected layer when moveAllLayers is false", () => {
      const p = tinyProject({
        layers: [filledLayer("bottom", BLUE), filledLayer("top", GREEN)],
      });
      p.uiState.moveAllLayers = false;
      p.uiState.selectedLayerId = "top";
      harness.load(p);

      harness.dispatch("moveLayerPixels", 1, 0);
      expect(pixelOf(harness, 0, 0, 0).color).toEqual(BLUE);
      expect(pixelOf(harness, 1, 0, 0).color).toBe(0);
    });

    it("moves EVERY layer when moveAllLayers is true", () => {
      const p = tinyProject({
        layers: [filledLayer("bottom", BLUE), filledLayer("top", GREEN)],
      });
      p.uiState.moveAllLayers = true;
      harness.load(p);

      harness.dispatch("moveLayerPixels", 1, 0);
      expect(pixelOf(harness, 0, 0, 0).color).toBe(0);
      expect(pixelOf(harness, 1, 0, 0).color).toBe(0);
    });

    it("tracks history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("moveLayerPixels", 1, 1);
      expect(harness.getHistoryLength()).toBe(before + 1);
    });
  });

  /* ══ THE CLIPBOARD ═════════════════════════════════════════════════════ */

  describe("copyLayerToClipboard / pasteLayerFromClipboard", () => {
    beforeEach(() =>
      harness.load(tinyProject({ layers: [filledLayer("layer-1", RED)] })),
    );

    it("copy populates the clipboard WITHOUT touching the project or history", () => {
      const before = JSON.stringify(harness.getProject());
      const history = harness.getHistoryLength();
      harness.dispatch("copyLayerToClipboard", "layer-1");
      expect(readClipboard()).not.toBeNull();
      expect(readClipboard()!.type).toBe("layer");
      expect(JSON.stringify(harness.getProject())).toBe(before);
      expect(harness.getHistoryLength()).toBe(history);
    });

    it("paste appends the layer to the TOP of the stack with a fresh id", () => {
      harness.dispatch("copyLayerToClipboard", "layer-1");
      harness.dispatch("pasteLayerFromClipboard");
      expect(layerNames(harness)).toEqual(["layer-1", "layer-1"]);
      expect(layerIds(harness)[1]).not.toBe("layer-1");
      expect(pixelOf(harness, 1).color).toEqual(RED);
    });

    it("OBSERVED: paste does NOT change the selected layer", () => {
      harness.dispatch("copyLayerToClipboard", "layer-1");
      harness.dispatch("pasteLayerFromClipboard");
      expect(harness.getUiState().selectedLayerId).toBe("layer-1");
    });

    it("paste tracks history", () => {
      harness.dispatch("copyLayerToClipboard", "layer-1");
      const before = harness.getHistoryLength();
      harness.dispatch("pasteLayerFromClipboard");
      expect(harness.getHistoryLength()).toBe(before + 1);
    });

    it("paste with an EMPTY clipboard is a no-op", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("pasteLayerFromClipboard");
      expect(harness.getHistoryLength()).toBe(before);
      expect(layerIds(harness)).toHaveLength(1);
    });

    // ── SIZE MISMATCH: centre-pad / centre-crop, never scale, never refuse ──
    it("SIZE MISMATCH — a SMALLER source is CENTRED and padded", () => {
      harness.load(
        tinyProject({
          layers: [filledLayer("small", RED, 2, 2)],
          width: 2,
          height: 2,
        }),
      );
      harness.dispatch("copyLayerToClipboard", "small");

      // Paste into a 6×6 object.
      harness.load(tinyProject({ width: 6, height: 6 }));
      harness.dispatch("pasteLayerFromClipboard");

      const pasted = layerOf(harness.getProject(), 1)!;
      // offset = floor((6 - 2) / 2) = 2, so the 2×2 lands at (2,2)..(3,3).
      expect(pasted.pixels[2][2].color).toEqual(RED);
      expect(pasted.pixels[3][3].color).toEqual(RED);
      expect(pasted.pixels[0][0].color).toBe(0);
      expect(pasted.pixels.flat().filter((c) => c.color !== 0)).toHaveLength(4);
    });

    it("SIZE MISMATCH — a LARGER source is centre-CROPPED, never scaled or refused", () => {
      harness.load(
        tinyProject({
          layers: [filledLayer("big", RED, 6, 6)],
          width: 6,
          height: 6,
        }),
      );
      harness.dispatch("copyLayerToClipboard", "big");

      harness.load(tinyProject({ width: 2, height: 2 }));
      harness.dispatch("pasteLayerFromClipboard");

      const pasted = layerOf(harness.getProject(), 1)!;
      expect(pasted.pixels).toHaveLength(2);
      expect(pasted.pixels.flat().every((c) => c.color !== 0)).toBe(true);
    });

    it("OBSERVED: with an ODD size difference the content is biased TOP-LEFT", () => {
      // `Math.floor((width - sourceWidth) / 2)`, so a 2-into-5 paste offsets by
      // floor(3/2) = 1, not 1.5 and not 2.
      harness.load(
        tinyProject({
          layers: [filledLayer("small", RED, 2, 2)],
          width: 2,
          height: 2,
        }),
      );
      harness.dispatch("copyLayerToClipboard", "small");
      harness.load(tinyProject({ width: 5, height: 5 }));
      harness.dispatch("pasteLayerFromClipboard");

      const pasted = layerOf(harness.getProject(), 1)!;
      expect(pasted.pixels[1][1].color).toEqual(RED);
      expect(pasted.pixels[2][2].color).toEqual(RED);
      expect(pasted.pixels[3][3].color).toBe(0);
    });

    it("currentFrameOnly=true adds the layer to ONE frame; false adds it to all", () => {
      harness.load(
        tinyProject({
          frames: [
            { id: "frame-1", name: "F1", layers: [filledLayer("a", RED)] },
            { id: "frame-2", name: "F2", layers: [filledLayer("a", BLUE)] },
          ],
        }),
      );
      harness.dispatch("copyLayerToClipboard", "a");

      harness.dispatch("pasteLayerFromClipboard", true);
      expect(layerIds(harness, 0)).toHaveLength(2);
      expect(layerIds(harness, 1)).toHaveLength(1);

      harness.dispatch("pasteLayerFromClipboard", false);
      expect(layerIds(harness, 0)).toHaveLength(3);
      expect(layerIds(harness, 1)).toHaveLength(2);
    });

    // ══ CROSS-PROJECT SURVIVAL ═══════════════════════════════════════════
    it("CROSS-PROJECT: copy in A, switch project, paste in B still works", async () => {
      // `layerClipboard` lives on EditorState, NOT on Project, and nothing in
      // projectActions.ts (createNewProject :67, switchToProject :95,
      // deleteCurrentProject :150, renameCurrentProject :119) clears it.
      // Verified by reading every `set()` in that file. This survival is
      // load-bearing behaviour the MobX port must preserve.
      harness.load(tinyProject({ layers: [filledLayer("from-A", GREEN)] }));
      harness.dispatch("copyLayerToClipboard", "from-A");
      expect(readClipboard()).not.toBeNull();

      // Genuinely switch projects through the real action (the bridge-installed
      // delegate into DomainStore.switchProject), not by re-loading.
      const projectB = tinyProject({ layers: [filledLayer("in-B", BLUE)] });
      const wired = wireAutoSave();
      vi.spyOn(projectApi, "switchTo").mockResolvedValue(undefined);
      vi.spyOn(projectApi, "get").mockResolvedValue(projectToCompact(projectB));
      try {
        await harness.dispatch("switchToProject", "project-B");
      } finally {
        wired.dispose();
        vi.restoreAllMocks();
      }

      // The switch cleared history but NOT the clipboard.
      expect(harness.getHistoryLength()).toBe(0);
      expect(readClipboard()).not.toBeNull();

      harness.dispatch("pasteLayerFromClipboard");
      expect(layerNames(harness)).toEqual(["in-B", "from-A"]);
      expect(pixelOf(harness, 1).color).toEqual(GREEN);
    });

    it("CROSS-PROJECT: createNewProject also leaves the clipboard intact", async () => {
      harness.load(tinyProject({ layers: [filledLayer("from-A", GREEN)] }));
      harness.dispatch("copyLayerToClipboard", "from-A");

      const wired = wireAutoSave();
      vi.spyOn(projectApi, "create").mockResolvedValue({
        success: true,
        projectName: "fresh",
      });
      vi.spyOn(projectApi, "list").mockResolvedValue(["a", "b"]);
      try {
        await harness.dispatch("createNewProject", "fresh");
      } finally {
        wired.dispose();
        vi.restoreAllMocks();
      }

      expect(readClipboard()).not.toBeNull();
    });
  });

  describe("copyLayerFromObject", () => {
    it("copies a layer from ANOTHER object into every frame of the current one", () => {
      const p = tinyProject({ layers: [filledLayer("target", BLUE)] });
      p.objects.push({
        id: "obj-2",
        name: "Source",
        gridSize: { width: 4, height: 4 },
        frames: [
          { id: "src-frame", name: "SF", layers: [filledLayer("src", RED)] },
        ],
      });
      harness.load(p);

      harness.dispatch("copyLayerFromObject", "obj-2", "src", false);
      expect(layerNames(harness)).toEqual(["target", "src"]);
      expect(pixelOf(harness, 1).color).toEqual(RED);
    });

    it("BYPASSES the clipboard entirely", () => {
      const p = tinyProject({ layers: [filledLayer("target", BLUE)] });
      p.objects.push({
        id: "obj-2",
        name: "Source",
        gridSize: { width: 4, height: 4 },
        frames: [
          { id: "src-frame", name: "SF", layers: [filledLayer("src", RED)] },
        ],
      });
      harness.load(p);

      harness.dispatch("copyLayerFromObject", "obj-2", "src", false);
      expect(readClipboard()).toBeNull();
    });

    it("OBSERVED: only finds a source layer that exists on the source object's FIRST frame", () => {
      const p = tinyProject({ layers: [filledLayer("target", BLUE)] });
      p.objects.push({
        id: "obj-2",
        name: "Source",
        gridSize: { width: 4, height: 4 },
        frames: [
          { id: "sf1", name: "SF1", layers: [filledLayer("other", RED)] },
          { id: "sf2", name: "SF2", layers: [filledLayer("late", GREEN)] },
        ],
      });
      harness.load(p);

      const before = harness.getHistoryLength();
      harness.dispatch("copyLayerFromObject", "obj-2", "late", false);
      expect(harness.getHistoryLength()).toBe(before);
      expect(layerNames(harness)).toEqual(["target"]);
    });

    it("is a no-op for an unknown source object", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("copyLayerFromObject", "no-such-object", "x", false);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });
});
