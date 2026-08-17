/**
 * Behaviour contract — `store/drawingActions.ts`.
 *
 * Three things are pinned here and nothing else in the plan pins them:
 *
 * 1. **Stroke batching.** `let _strokeActive = false` at drawingActions.ts:10 is
 *    a module-closure flag, not store state. `beginStroke` snapshots ONCE then
 *    sets it; every subsequent `setPixel` passes `!_strokeActive === false` and
 *    therefore does NOT snapshot. A 50-pixel drag must be exactly one undo step.
 * 2. **The selection gate.** `isEditMaskActiveFor` (`:11-24`) silently drops
 *    writes outside the mask when `selectionBehavior === "editMask"`.
 * 3. **Variant frame indices.** `uiState.variantFrameIndices` is read on the
 *    pixel-write path (`:73`, `:217`) and decides WHICH variant frame is hit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  colorAt,
  layerOf,
  mkLayer,
  pixelAt,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import type { Layer, Project } from "@/types";

vi.mock("@/services/api", async () => (await import("./mockApi")).apiMockFactory());

/** A project whose single layer hosts a 2-frame variant on a 2×2 grid. */
function variantProject(): Project {
  const host: Layer = {
    ...mkLayer("layer-1"),
    isVariant: true,
    variantGroupId: "vg-1",
    selectedVariantId: "v-1",
  };
  const project = tinyProject({
    frames: [{ id: "frame-1", name: "Frame 1", layers: [host] }],
  });
  project.variants = [
    {
      id: "vg-1",
      name: "Group",
      variants: [
        {
          id: "v-1",
          name: "V1",
          gridSize: { width: 2, height: 2 },
          frames: [
            { id: "vf-0", layers: [mkLayer("vl-0", 2, 2)] },
            { id: "vf-1", layers: [mkLayer("vl-1", 2, 2)] },
          ],
          baseFrameOffsets: {},
        },
      ],
    },
  ];
  project.uiState.variantFrameIndices = { "vg-1": 0 };
  return project;
}

const variantPixel = (
  project: Project | null,
  frameIndex: number,
  x: number,
  y: number,
) =>
  project?.variants?.[0]?.variants[0]?.frames[frameIndex]?.layers[0]?.pixels[y]?.[
    x
  ]?.color ?? 0;

describe.each(HARNESSES)("%s — drawing", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
    harness.load(tinyProject());
  });

  afterEach(() => {
    // `_strokeActive` is module state, NOT store state — `reset()` cannot clear
    // it. Leaving it set would silently suppress history in the next test.
    harness.dispatch("endStroke");
    harness.reset();
  });

  /* ── setPixel basics ───────────────────────────────────────────────────── */

  describe("setPixel", () => {
    it("writes the colour at the given coordinate", () => {
      harness.dispatch("setPixel", 2, 3, RED);
      expect(colorAt(harness.getProject(), 2, 3)).toEqual(RED);
    });

    it("OBSERVED: painting over a materialised empty cell keeps height 0, NOT the `?? 1` default", () => {
      // drawingActions.ts:171-173 is `height: existing?.height ?? 1`. Every grid
      // built by `createEmptyPixelGrid` materialises {color:0, normal:0,
      // height:0}, so `existing` is an OBJECT and `existing.height` is 0 — a
      // present, non-nullish value. `??` does not fire and the height stays 0.
      // The `?? 1` fallback is therefore reachable only on a SPARSE row where
      // the cell is genuinely `undefined` (asserted below). Recorded, not fixed:
      // a later "fix" to `|| 1` would give every freshly-painted pixel a height
      // of 1 and change how the lighting renderer shades existing art.
      harness.dispatch("setPixel", 0, 0, RED);
      expect(pixelAt(harness.getProject(), 0, 0)).toEqual({
        color: RED,
        normal: 0,
        height: 0,
      });
    });

    it("the `?? 1` height default DOES fire on a genuinely sparse cell", () => {
      const p = tinyProject();
      // Delete the cell so `existing` is `undefined` rather than an empty
      // PixelData. This is the only path that reaches the fallback.
      delete (p.objects[0].frames[0].layers[0].pixels[0] as unknown as unknown[])[0];
      harness.load(p);
      harness.dispatch("setPixel", 0, 0, RED);
      expect(pixelAt(harness.getProject(), 0, 0)).toEqual({
        color: RED,
        normal: 0,
        height: 1,
      });
    });

    it("PRESERVES an existing normal and height when repainting", () => {
      const p = tinyProject();
      p.objects[0].frames[0].layers[0].pixels[1][1] = {
        color: BLUE,
        normal: { x: 1, y: 2, z: 3 },
        height: 42,
      };
      harness.load(p);
      harness.dispatch("setPixel", 1, 1, RED);
      expect(pixelAt(harness.getProject(), 1, 1)).toEqual({
        color: RED,
        normal: { x: 1, y: 2, z: 3 },
        height: 42,
      });
    });

    it("ERASING (colour 0) clears normal and height too", () => {
      const p = tinyProject();
      p.objects[0].frames[0].layers[0].pixels[1][1] = {
        color: BLUE,
        normal: { x: 1, y: 2, z: 3 },
        height: 42,
      };
      harness.load(p);
      harness.dispatch("setPixel", 1, 1, 0);
      expect(pixelAt(harness.getProject(), 1, 1)).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
    });

    it("is a NO-OP when the pixel already holds that exact colour", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      const length = harness.getHistoryLength();
      harness.dispatch("setPixel", 1, 1, { ...RED });
      expect(harness.getHistoryLength()).toBe(length);
    });

    it("is a NO-OP when erasing an already-empty pixel", () => {
      harness.dispatch("setPixel", 1, 1, 0);
      expect(harness.getHistoryLength()).toBe(0);
    });

    it("ignores out-of-bounds coordinates", () => {
      for (const [x, y] of [
        [-1, 0],
        [0, -1],
        [4, 0],
        [0, 4],
        [99, 99],
      ]) {
        harness.dispatch("setPixel", x, y, RED);
      }
      expect(harness.getHistoryLength()).toBe(0);
    });

    it("does nothing when no project is loaded", () => {
      harness.reset();
      expect(() => harness.dispatch("setPixel", 0, 0, RED)).not.toThrow();
      expect(harness.getProject()).toBeNull();
    });

    it("copies ONLY the affected row — the other rows keep their identity", () => {
      const before = layerOf(harness.getProject())!.pixels;
      const row0 = before[0];
      const row2 = before[2];
      harness.dispatch("setPixel", 1, 1, RED);
      const after = layerOf(harness.getProject())!.pixels;
      expect(after[1]).not.toBe(before[1]);
      expect(after[0]).toBe(row0);
      expect(after[2]).toBe(row2);
    });
  });

  /* ── setPixels ─────────────────────────────────────────────────────────── */

  describe("setPixels", () => {
    it("writes a batch in one action", () => {
      harness.dispatch("setPixels", [
        { x: 0, y: 0, color: RED },
        { x: 1, y: 1, color: BLUE },
        { x: 2, y: 2, color: GREEN },
      ]);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      expect(colorAt(harness.getProject(), 1, 1)).toEqual(BLUE);
      expect(colorAt(harness.getProject(), 2, 2)).toEqual(GREEN);
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("FILTERS out-of-bounds entries rather than throwing", () => {
      harness.dispatch("setPixels", [
        { x: -1, y: 0, color: RED },
        { x: 0, y: 0, color: BLUE },
        { x: 99, y: 99, color: RED },
      ]);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(BLUE);
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("is a NO-OP for an empty batch", () => {
      harness.dispatch("setPixels", []);
      expect(harness.getHistoryLength()).toBe(0);
    });

    it("is a NO-OP when every entry is filtered out", () => {
      harness.dispatch("setPixels", [{ x: -5, y: -5, color: RED }]);
      expect(harness.getHistoryLength()).toBe(0);
    });

    it("OBSERVED: unlike setPixel, it does NOT skip same-colour writes", () => {
      // `setPixel` has an explicit "already this colour" early return;
      // `setPixels` has no such check, so a redundant batch still snapshots.
      // Recorded, not fixed.
      harness.dispatch("setPixels", [{ x: 0, y: 0, color: RED }]);
      expect(harness.getHistoryLength()).toBe(1);
      harness.dispatch("setPixels", [{ x: 0, y: 0, color: { ...RED } }]);
      expect(harness.getHistoryLength()).toBe(2);
    });

    it("the LAST entry wins when a batch names the same pixel twice", () => {
      harness.dispatch("setPixels", [
        { x: 0, y: 0, color: RED },
        { x: 0, y: 0, color: BLUE },
      ]);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(BLUE);
    });
  });

  /* ══ STROKE BATCHING ═══════════════════════════════════════════════════ */

  describe("stroke batching", () => {
    it("ONE continuous 50-pixel drag produces EXACTLY ONE history entry", () => {
      // A 4×4 grid only holds 16 distinct cells, so the drag alternates colours
      // to guarantee 50 real writes (the same-colour early return would
      // otherwise swallow the repeats).
      harness.dispatch("beginStroke");
      for (let i = 0; i < 50; i++) {
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, {
          r: i * 5,
          g: 0,
          b: 0,
          a: 255,
        });
      }
      harness.dispatch("endStroke");

      expect(harness.getHistoryLength()).toBe(1);
      expect(harness.getHistoryIndex()).toBe(0);
    });

    it("the single entry is the state BEFORE the stroke began", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("beginStroke");
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("setPixel", 2, 2, GREEN);
      harness.dispatch("endStroke");

      // Entry 1 is the pre-stroke state: RED present, BLUE/GREEN absent.
      const entry = harness.getHistoryEntry(1)!;
      expect(colorAt(entry, 0, 0)).toEqual(RED);
      expect(colorAt(entry, 1, 1)).toBe(0);
      expect(colorAt(entry, 2, 2)).toBe(0);
    });

    it("ONE undo reverts the WHOLE stroke", () => {
      harness.dispatch("beginStroke");
      for (let i = 0; i < 16; i++) {
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4), RED);
      }
      harness.dispatch("endStroke");

      harness.dispatch("undo");
      const painted = layerOf(harness.getProject())!
        .pixels.flat()
        .filter((p) => p.color !== 0);
      expect(painted).toHaveLength(0);
    });

    it("after endStroke, tracking resumes per-edit", () => {
      harness.dispatch("beginStroke");
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 0, RED);
      harness.dispatch("endStroke");
      expect(harness.getHistoryLength()).toBe(1);

      harness.dispatch("setPixel", 2, 0, BLUE);
      harness.dispatch("setPixel", 3, 0, GREEN);
      expect(harness.getHistoryLength()).toBe(3);
    });

    it("beginStroke ALWAYS snapshots, even on a stroke that paints nothing", () => {
      harness.dispatch("beginStroke");
      harness.dispatch("endStroke");
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("batches setPixels the same way", () => {
      harness.dispatch("beginStroke");
      harness.dispatch("setPixels", [{ x: 0, y: 0, color: RED }]);
      harness.dispatch("setPixels", [{ x: 1, y: 1, color: BLUE }]);
      harness.dispatch("setPixels", [{ x: 2, y: 2, color: GREEN }]);
      harness.dispatch("endStroke");
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("OBSERVED: `_strokeActive` is MODULE state, so it survives a store reset", () => {
      // drawingActions.ts:10 is a closure variable captured when the store was
      // CREATED. Nothing in `EditorState` mirrors it, so a MobX port that puts
      // the flag on an instance changes this. Recorded so the difference is
      // deliberate rather than accidental.
      harness.dispatch("beginStroke");
      harness.reset();
      harness.load(tinyProject());
      harness.dispatch("setPixel", 0, 0, RED);
      // Still batching: no snapshot was taken.
      expect(harness.getHistoryLength()).toBe(0);
      harness.dispatch("endStroke");
    });

    it("nested beginStroke calls each snapshot (the flag is not a counter)", () => {
      harness.dispatch("beginStroke");
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("beginStroke");
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("endStroke");
      // Two snapshots, one per beginStroke. A single endStroke clears the flag.
      expect(harness.getHistoryLength()).toBe(2);
    });
  });

  /* ══ THE SELECTION / editMask GATE ═════════════════════════════════════ */

  describe("the editMask gate", () => {
    const selectRect = (x0: number, y0: number, x1: number, y1: number) =>
      harness.dispatch("setSelection", {
        x: x0,
        y: y0,
        width: x1 - x0 + 1,
        height: y1 - y0 + 1,
      });

    it('with behaviour "editMask", a pixel OUTSIDE the mask is NOT written', () => {
      harness.dispatch("setSelectionBehavior", "editMask");
      selectRect(0, 0, 1, 1);

      harness.dispatch("setPixel", 0, 0, RED); // inside
      harness.dispatch("setPixel", 3, 3, BLUE); // outside

      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      expect(colorAt(harness.getProject(), 3, 3)).toBe(0);
    });

    it('with behaviour "movePixels", the mask does NOT gate writes', () => {
      harness.dispatch("setSelectionBehavior", "movePixels");
      selectRect(0, 0, 1, 1);
      harness.dispatch("setPixel", 3, 3, BLUE);
      expect(colorAt(harness.getProject(), 3, 3)).toEqual(BLUE);
    });

    it('with behaviour "moveSelection", the mask does NOT gate writes', () => {
      harness.dispatch("setSelectionBehavior", "moveSelection");
      selectRect(0, 0, 1, 1);
      harness.dispatch("setPixel", 3, 3, BLUE);
      expect(colorAt(harness.getProject(), 3, 3)).toEqual(BLUE);
    });

    it('with "editMask" but NO selection, every write is allowed', () => {
      // `if (!selection) return true` — drawingActions.ts:20.
      harness.dispatch("setSelectionBehavior", "editMask");
      harness.dispatch("clearSelection");
      harness.dispatch("setPixel", 3, 3, BLUE);
      expect(colorAt(harness.getProject(), 3, 3)).toEqual(BLUE);
    });

    it('OBSERVED: with "editMask", a DIMENSION MISMATCH disables the gate entirely', () => {
      // `if (selection.width !== width || selection.height !== height)
      //    return true` — drawingActions.ts:21. A selection captured on one grid
      // size stops gating the moment the grid differs, rather than being
      // invalidated. Recorded, not fixed.
      harness.dispatch("setSelectionBehavior", "editMask");
      selectRect(0, 0, 1, 1);
      const p = harness.getProject()!;
      // Grow the object so the selection dims no longer match.
      p.objects[0].gridSize = { width: 8, height: 8 };
      harness.dispatch("setPixel", 3, 3, BLUE);
      expect(colorAt(harness.getProject(), 3, 3)).toEqual(BLUE);
    });

    it("setPixels honours the same gate, filtering the batch", () => {
      harness.dispatch("setSelectionBehavior", "editMask");
      selectRect(0, 0, 1, 1);
      harness.dispatch("setPixels", [
        { x: 0, y: 0, color: RED },
        { x: 3, y: 3, color: BLUE },
      ]);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      expect(colorAt(harness.getProject(), 3, 3)).toBe(0);
    });

    it("a batch entirely outside the mask is a NO-OP, not a snapshot", () => {
      harness.dispatch("setSelectionBehavior", "editMask");
      selectRect(0, 0, 1, 1);
      const before = harness.getHistoryLength();
      harness.dispatch("setPixels", [{ x: 3, y: 3, color: BLUE }]);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  /* ══ VARIANT FRAME INDICES ON THE WRITE PATH ═══════════════════════════ */

  describe("variantFrameIndices on the pixel-write path", () => {
    beforeEach(() => harness.load(variantProject()));

    it("writes land on variant frame 0 by default", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      expect(variantPixel(harness.getProject(), 0, 1, 1)).toEqual(RED);
      expect(variantPixel(harness.getProject(), 1, 1, 1)).toBe(0);
    });

    it("writes follow variantFrameIndices to a DIFFERENT variant frame", () => {
      const p = variantProject();
      p.uiState.variantFrameIndices = { "vg-1": 1 };
      harness.load(p);

      harness.dispatch("setPixel", 1, 1, RED);
      expect(variantPixel(harness.getProject(), 1, 1, 1)).toEqual(RED);
      expect(variantPixel(harness.getProject(), 0, 1, 1)).toBe(0);
    });

    it("the index WRAPS modulo the variant frame count", () => {
      const p = variantProject();
      p.uiState.variantFrameIndices = { "vg-1": 3 }; // 3 % 2 === 1
      harness.load(p);
      harness.dispatch("setPixel", 0, 0, RED);
      expect(variantPixel(harness.getProject(), 1, 0, 0)).toEqual(RED);
    });

    it("writes are bounded by the VARIANT grid, not the base object grid", () => {
      // The variant is 2×2 while the object is 4×4.
      harness.dispatch("setPixel", 3, 3, RED);
      expect(harness.getHistoryLength()).toBe(0);
      harness.dispatch("setPixel", 1, 1, RED);
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("the HOST layer's own pixels are never touched", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);
    });

    it("setPixels routes to the variant frame the same way", () => {
      const p = variantProject();
      p.uiState.variantFrameIndices = { "vg-1": 1 };
      harness.load(p);
      harness.dispatch("setPixels", [
        { x: 0, y: 0, color: RED },
        { x: 1, y: 1, color: BLUE },
        { x: 9, y: 9, color: GREEN },
      ]);
      expect(variantPixel(harness.getProject(), 1, 0, 0)).toEqual(RED);
      expect(variantPixel(harness.getProject(), 1, 1, 1)).toEqual(BLUE);
      expect(variantPixel(harness.getProject(), 0, 0, 0)).toBe(0);
    });

    it("does nothing when the variant group does not resolve", () => {
      const p = variantProject();
      p.objects[0].frames[0].layers[0].variantGroupId = "no-such-group";
      harness.load(p);
      harness.dispatch("setPixel", 1, 1, RED);
      expect(harness.getHistoryLength()).toBe(0);
    });
  });

  /* ── the transient drawing flags ───────────────────────────────────────── */

  describe("startDrawing / updateDrawing / endDrawing / preview pixels", () => {
    it("none of them touch the project or the history", () => {
      const before = JSON.stringify(harness.getProject());
      harness.dispatch("startDrawing", { x: 1, y: 1 });
      harness.dispatch("updateDrawing", { x: 2, y: 2 });
      harness.dispatch("setPreviewPixels", [{ x: 1, y: 1 }]);
      harness.dispatch("clearPreviewPixels");
      harness.dispatch("endDrawing");
      expect(JSON.stringify(harness.getProject())).toBe(before);
      expect(harness.getHistoryLength()).toBe(0);
    });

    it("startDrawing CLEARS any active colour adjustment", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("startColorAdjustment", RED, false);
      harness.dispatch("startDrawing", { x: 0, y: 0 });
      // Observable only through behaviour: adjustColor now finds nothing to do.
      const before = JSON.stringify(harness.getProject());
      harness.dispatch("adjustColor", BLUE, false);
      expect(JSON.stringify(harness.getProject())).toBe(before);
    });
  });
});
