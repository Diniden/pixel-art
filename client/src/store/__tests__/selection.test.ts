/**
 * Behaviour contract — `store/selectionActions.ts`.
 *
 * Two structural facts drive almost every assertion here, and both were
 * MEASURED rather than assumed:
 *
 * 1. **An empty mask always collapses `selection` to `null`.** Every setter ends
 *    in `set({ selection: bounds ? {...} : null })`, and `computeBounds` returns
 *    `null` for an empty set. There is no such thing as a present-but-empty
 *    selection.
 * 2. **NOTHING in this file reads `uiState.selectionBehavior`.** It is purely a
 *    call-site router in `Canvas.tsx:1724-1729` / `:2124-2137`, plus the draw
 *    clip in `drawingActions.ts:10-24` (pinned in `drawing.test.ts`). The three
 *    behaviours are therefore asserted as NO-OPS at this layer — a MobX port
 *    that starts consulting the flag inside the actions would be a real change.
 *
 * Mask indexing is `idx = y * width + x` throughout (selectionActions.ts:14-16).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  colorAt,
  layerOf,
  mkLayer,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import type { Project, SelectionBehavior } from "@/types";
import { useEditorStore } from "@/store";

// Task 16: the store no longer imports services/api (deleted) — dispatching
// actions can no longer reach the network, so the defensive module mock that
// used to live here is gone with it.

/* ── selection readers ───────────────────────────────────────────────────── */

/**
 * `selection` lives on `EditorState`, not on `Project`, and the harness
 * deliberately exposes neither (rule 1 of `storeContract.ts` — no shape
 * assertions). It is read here through one narrow accessor rather than by
 * spreading `getState()` across the file, so the MobX port has exactly one line
 * to re-point.
 */
const readSelection = () => useEditorStore.getState().selection;

const maskCoords = (): [number, number][] => {
  const s = readSelection();
  if (!s) return [];
  return [...s.mask]
    .sort((a, b) => a - b)
    .map((i) => [i % s.width, Math.floor(i / s.width)]);
};

const maskSize = () => readSelection()?.mask.size ?? 0;

/* ── fixtures ────────────────────────────────────────────────────────────── */

/** 4×4 with a 2×2 red block at (0,0) and a lone blue pixel at (3,3). */
function paintedProject(): Project {
  const p = tinyProject();
  const px = p.objects[0].frames[0].layers[0].pixels;
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    px[y][x] = { color: RED, normal: 0, height: 5 };
  px[3][3] = { color: BLUE, normal: 0, height: 7 };
  return p;
}

/** A 4×4 base object hosting a 2×2 variant, so the dims source can be probed. */
function variantProject(): Project {
  const p = tinyProject({
    frames: [
      {
        id: "frame-1",
        name: "Frame 1",
        layers: [
          {
            ...mkLayer("layer-1"),
            isVariant: true,
            variantGroupId: "vg-1",
            selectedVariantId: "v-1",
          },
        ],
      },
    ],
  });
  p.variants = [
    {
      id: "vg-1",
      name: "G",
      variants: [
        {
          id: "v-1",
          name: "V",
          gridSize: { width: 2, height: 2 },
          frames: [{ id: "vf-0", layers: [mkLayer("vl-0", 2, 2)] }],
          baseFrameOffsets: {},
        },
      ],
    },
  ];
  p.uiState.variantFrameIndices = { "vg-1": 0 };
  return p;
}

describe.each(HARNESSES)("%s — selection", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
    harness.load(paintedProject());
  });

  afterEach(() => {
    harness.dispatch("endStroke");
    harness.reset();
  });

  /* ── setSelection (rect) ───────────────────────────────────────────────── */

  describe("setSelection — the rect mode", () => {
    it("rasterises the box INCLUSIVELY into a mask", () => {
      harness.dispatch("setSelection", { x: 1, y: 1, width: 2, height: 2 });
      expect(maskCoords()).toEqual([
        [1, 1],
        [2, 1],
        [1, 2],
        [2, 2],
      ]);
    });

    it("stores the GRID dims, not the box dims", () => {
      harness.dispatch("setSelection", { x: 1, y: 1, width: 2, height: 2 });
      const s = readSelection()!;
      expect(s.width).toBe(4);
      expect(s.height).toBe(4);
      // …while `bounds` is the box.
      expect(s.bounds).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    });

    it("CLAMPS a box that overhangs the grid, and recomputes bounds from the clamp", () => {
      harness.dispatch("setSelection", { x: -2, y: -2, width: 5, height: 5 });
      expect(maskCoords()).toEqual([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ]);
      expect(readSelection()!.bounds).toEqual({
        x: 0,
        y: 0,
        width: 3,
        height: 3,
      });
    });

    it("null CLEARS the selection", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("setSelection", null);
      expect(readSelection()).toBeNull();
    });

    it("a wholly out-of-grid box collapses to null, not an empty selection", () => {
      harness.dispatch("setSelection", { x: 99, y: 99, width: 2, height: 2 });
      expect(readSelection()).toBeNull();
    });

    it("a zero-area box collapses to null", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 0, height: 0 });
      expect(readSelection()).toBeNull();
    });

    it("does NOT track history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("uses the VARIANT grid when a variant layer is selected", () => {
      harness.load(variantProject());
      harness.dispatch("setSelection", { x: 0, y: 0, width: 4, height: 4 });
      const s = readSelection()!;
      // Clamped to the 2×2 variant grid, not the 4×4 object grid.
      expect(s.width).toBe(2);
      expect(s.height).toBe(2);
      expect(s.mask.size).toBe(4);
    });

    it("OBSERVED: falls back to a hard-coded 32×32 when nothing resolves", () => {
      // selectionActions.ts:88. A selection can be created with no project at
      // all, sized to a magic constant. Recorded, not fixed.
      harness.reset();
      harness.dispatch("setSelection", { x: 0, y: 0, width: 100, height: 100 });
      const s = readSelection()!;
      expect(s.width).toBe(32);
      expect(s.height).toBe(32);
      expect(s.mask.size).toBe(32 * 32);
    });
  });

  /* ── setSelectionMask ──────────────────────────────────────────────────── */

  describe("setSelectionMask — replace / add / subtract", () => {
    const dims = { width: 4, height: 4 };

    it("replace (the default) discards the previous mask", () => {
      harness.dispatch("setSelectionMask", new Set([0, 1]), dims);
      harness.dispatch("setSelectionMask", new Set([5]), dims);
      expect(maskCoords()).toEqual([[1, 1]]);
    });

    it("add UNIONS with the previous mask", () => {
      harness.dispatch("setSelectionMask", new Set([0, 1]), dims);
      harness.dispatch("setSelectionMask", new Set([1, 2]), dims, "add");
      expect(maskCoords()).toEqual([
        [0, 0],
        [1, 0],
        [2, 0],
      ]);
    });

    it("subtract REMOVES from the previous mask", () => {
      harness.dispatch("setSelectionMask", new Set([0, 1, 2]), dims);
      harness.dispatch("setSelectionMask", new Set([1]), dims, "subtract");
      expect(maskCoords()).toEqual([
        [0, 0],
        [2, 0],
      ]);
    });

    it("subtracting everything collapses to null", () => {
      harness.dispatch("setSelectionMask", new Set([0, 1]), dims);
      harness.dispatch("setSelectionMask", new Set([0, 1]), dims, "subtract");
      expect(readSelection()).toBeNull();
    });

    it("BUG-SHAPED, OBSERVED: an EMPTY mask clears the selection regardless of op", () => {
      // selectionActions.ts:150-153 returns `set({selection:null})` before the
      // op switch, so `setSelectionMask(new Set(), dims, "subtract")` — a
      // semantic no-op — wipes the whole selection instead. Recorded, not fixed.
      harness.dispatch("setSelectionMask", new Set([0, 1, 2]), dims);
      harness.dispatch("setSelectionMask", new Set(), dims, "subtract");
      expect(readSelection()).toBeNull();

      harness.dispatch("setSelectionMask", new Set([0, 1, 2]), dims);
      harness.dispatch("setSelectionMask", new Set(), dims, "add");
      expect(readSelection()).toBeNull();
    });

    it("a null mask clears the selection", () => {
      harness.dispatch("setSelectionMask", new Set([0]), dims);
      harness.dispatch("setSelectionMask", null, dims);
      expect(readSelection()).toBeNull();
    });

    it("OBSERVED: a DIMENSION MISMATCH forces replace even for add/subtract", () => {
      harness.dispatch("setSelectionMask", new Set([0, 1]), dims);
      harness.dispatch(
        "setSelectionMask",
        new Set([5]),
        { width: 8, height: 8 },
        "add",
      );
      // The old mask is dropped, and the NEW dims are adopted verbatim.
      const s = readSelection()!;
      expect(s.width).toBe(8);
      expect(s.mask.size).toBe(1);
    });

    it("OBSERVED: the caller's dims are trusted verbatim — no grid validation", () => {
      // A 4×4 project, but a 64×64 selection is accepted. This is what makes
      // the `selection.width !== width` guards elsewhere reachable.
      harness.dispatch("setSelectionMask", new Set([0]), {
        width: 64,
        height: 64,
      });
      expect(readSelection()!.width).toBe(64);
    });

    it("does NOT mutate the caller's Set", () => {
      const input = new Set([0, 1]);
      harness.dispatch("setSelectionMask", input, dims);
      harness.dispatch("setSelectionMask", new Set([2]), dims, "add");
      expect([...input]).toEqual([0, 1]);
    });

    it("does NOT track history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("setSelectionMask", new Set([0]), dims);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  /* ── clearSelection ────────────────────────────────────────────────────── */

  describe("clearSelection", () => {
    it("nulls the selection", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("clearSelection");
      expect(readSelection()).toBeNull();
    });

    it("OBSERVED: clears NOTHING ELSE — not the tool, not preview, not history", () => {
      harness.dispatch("setTool", "selection");
      harness.dispatch("setSelectionBehavior", "editMask");
      harness.dispatch("setPixel", 3, 0, GREEN);
      const historyBefore = harness.getHistoryLength();

      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("clearSelection");

      expect(harness.getUiState().selectedTool).toBe("selection");
      expect(harness.getUiState().selectionBehavior).toBe("editMask");
      expect(harness.getHistoryLength()).toBe(historyBefore);
    });

    it("is safe when there is no selection", () => {
      expect(() => harness.dispatch("clearSelection")).not.toThrow();
      expect(readSelection()).toBeNull();
    });
  });

  /* ══ moveSelection vs moveSelectedPixels vs editMask ═══════════════════ */

  describe("moveSelection — mask only", () => {
    it("translates the mask and leaves every pixel where it was", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      const historyBefore = harness.getHistoryLength();

      harness.dispatch("moveSelection", 2, 1);

      expect(maskCoords()).toEqual([
        [2, 1],
        [3, 1],
        [2, 2],
        [3, 2],
      ]);
      // The red block is untouched.
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      expect(colorAt(harness.getProject(), 2, 1)).toBe(0);
      // And nothing was recorded.
      expect(harness.getHistoryLength()).toBe(historyBefore);
    });

    it("OBSERVED: cells pushed off-grid are DESTROYED, not clipped-and-restored", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("moveSelection", -1, 0);
      expect(maskSize()).toBe(2);
      // Moving back does NOT recover the lost column.
      harness.dispatch("moveSelection", 1, 0);
      expect(maskSize()).toBe(2);
      expect(maskCoords()).toEqual([
        [1, 0],
        [1, 1],
      ]);
    });

    it("moving entirely off-grid collapses to null", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("moveSelection", -10, 0);
      expect(readSelection()).toBeNull();
    });

    it("a zero delta is a no-op, and no selection is a no-op", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      const before = maskCoords();
      harness.dispatch("moveSelection", 0, 0);
      expect(maskCoords()).toEqual(before);

      harness.dispatch("clearSelection");
      expect(() => harness.dispatch("moveSelection", 1, 1)).not.toThrow();
      expect(readSelection()).toBeNull();
    });
  });

  describe("moveSelectedPixels — pixels AND mask", () => {
    it("MOVES the pixels and drags the mask along", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("moveSelectedPixels", 2, 1);

      // Source vacated…
      expect(colorAt(harness.getProject(), 0, 0)).toBe(0);
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);
      // …destination painted…
      expect(colorAt(harness.getProject(), 2, 1)).toEqual(RED);
      expect(colorAt(harness.getProject(), 3, 2)).toEqual(RED);
      // …and the mask followed (moveSelectedPixels calls moveSelection itself).
      expect(maskCoords()).toEqual([
        [2, 1],
        [3, 1],
        [2, 2],
        [3, 2],
      ]);
    });

    it("carries normal and height with the colour", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 1, height: 1 });
      harness.dispatch("moveSelectedPixels", 2, 2);
      expect(layerOf(harness.getProject())!.pixels[2][2]).toEqual({
        color: RED,
        normal: 0,
        height: 5,
      });
    });

    it("OVERWRITES the destination — no alpha compositing", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 1, height: 1 });
      harness.dispatch("moveSelectedPixels", 3, 3);
      // The blue pixel that was at (3,3) is gone, replaced by the red one.
      expect(colorAt(harness.getProject(), 3, 3)).toEqual(RED);
    });

    it("DESTROYS pixels pushed off-grid", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("moveSelectedPixels", -1, 0);
      const painted = layerOf(harness.getProject())!
        .pixels.flat()
        .filter((p) => p.color !== 0);
      // 4 red + 1 blue = 5; two red cells fell off the left edge.
      expect(painted).toHaveLength(3);
    });

    it("TRACKS history — one entry, one undo restores everything", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      const before = harness.getHistoryLength();
      harness.dispatch("moveSelectedPixels", 2, 1);
      expect(harness.getHistoryLength()).toBe(before + 1);

      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      expect(colorAt(harness.getProject(), 2, 1)).toBe(0);
    });

    it("OBSERVED: silently NO-OPS when selection dims differ from grid dims", () => {
      // selectionActions.ts:583 — no history entry, no pixel change, no warning.
      harness.dispatch("setSelectionMask", new Set([0]), {
        width: 8,
        height: 8,
      });
      const before = harness.getHistoryLength();
      harness.dispatch("moveSelectedPixels", 1, 1);
      expect(harness.getHistoryLength()).toBe(before);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
    });

    it("is a no-op with no selection or a zero delta", () => {
      harness.dispatch("clearSelection");
      const before = harness.getHistoryLength();
      harness.dispatch("moveSelectedPixels", 1, 1);
      expect(harness.getHistoryLength()).toBe(before);

      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("moveSelectedPixels", 0, 0);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  describe("the three selectionBehaviour values on the SAME drag", () => {
    // ⚠️ selectionActions.ts reads `selectionBehavior` NOWHERE. The routing
    // lives in Canvas.tsx:1724-1729 and :2124-2137. These assertions record
    // that the store layer is behaviour-blind, so a MobX port that moves the
    // routing INTO the store is a visible, deliberate change.
    const behaviours: SelectionBehavior[] = [
      "movePixels",
      "moveSelection",
      "editMask",
    ];

    it.each(behaviours)(
      "moveSelectedPixels behaves identically under %s",
      (behaviour) => {
        harness.load(paintedProject());
        harness.dispatch("setSelectionBehavior", behaviour);
        harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
        harness.dispatch("moveSelectedPixels", 2, 1);
        expect(colorAt(harness.getProject(), 2, 1)).toEqual(RED);
        expect(colorAt(harness.getProject(), 0, 0)).toBe(0);
      },
    );

    it.each(behaviours)(
      "moveSelection behaves identically under %s",
      (behaviour) => {
        harness.load(paintedProject());
        harness.dispatch("setSelectionBehavior", behaviour);
        harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
        harness.dispatch("moveSelection", 2, 1);
        expect(maskCoords()).toEqual([
          [2, 1],
          [3, 1],
          [2, 2],
          [3, 2],
        ]);
        expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      },
    );
  });

  /* ── deleteSelectionPixels ─────────────────────────────────────────────── */

  describe("deleteSelectionPixels", () => {
    it("clears colour, normal AND height inside the mask", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("deleteSelectionPixels");
      expect(layerOf(harness.getProject())!.pixels[0][0]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
      // Outside the mask survives.
      expect(colorAt(harness.getProject(), 3, 3)).toEqual(BLUE);
    });

    it("LEAVES the selection intact after deleting", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("deleteSelectionPixels");
      expect(maskSize()).toBe(4);
    });

    it("TRACKS history", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      const before = harness.getHistoryLength();
      harness.dispatch("deleteSelectionPixels");
      expect(harness.getHistoryLength()).toBe(before + 1);
      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
    });

    it("silently NO-OPS on a dimension mismatch", () => {
      harness.dispatch("setSelectionMask", new Set([0]), {
        width: 8,
        height: 8,
      });
      const before = harness.getHistoryLength();
      harness.dispatch("deleteSelectionPixels");
      expect(harness.getHistoryLength()).toBe(before);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
    });

    it("is a no-op with no selection", () => {
      harness.dispatch("clearSelection");
      const before = harness.getHistoryLength();
      harness.dispatch("deleteSelectionPixels");
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  /* ── expand / shrink ───────────────────────────────────────────────────── */

  describe("expandSelection / shrinkSelection", () => {
    it("expand is 4-CONNECTED — one pixel becomes a plus, not a 3×3 block", () => {
      harness.dispatch("setSelection", { x: 1, y: 1, width: 1, height: 1 });
      harness.dispatch("expandSelection", 1);
      expect(maskCoords()).toEqual([
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ]);
    });

    it("expand CLAMPS at the grid edge rather than wrapping", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 1, height: 1 });
      harness.dispatch("expandSelection", 1);
      expect(maskCoords()).toEqual([
        [0, 0],
        [1, 0],
        [0, 1],
      ]);
    });

    it("N steps dilate N times (a diamond of radius N)", () => {
      harness.dispatch("setSelection", { x: 2, y: 2, width: 1, height: 1 });
      harness.dispatch("expandSelection", 2);
      // Diamond of radius 2 around (2,2), clipped to the 4×4 grid.
      expect(maskSize()).toBe(11);
    });

    it("shrink is 4-connected erosion and treats the GRID EDGE as unselected", () => {
      // A full-grid selection loses its entire border ring in one step.
      harness.dispatch("setSelection", { x: 0, y: 0, width: 4, height: 4 });
      expect(maskSize()).toBe(16);
      harness.dispatch("shrinkSelection", 1);
      expect(maskCoords()).toEqual([
        [1, 1],
        [2, 1],
        [1, 2],
        [2, 2],
      ]);
    });

    it("shrinking to nothing collapses to null", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 4, height: 4 });
      harness.dispatch("shrinkSelection", 5);
      expect(readSelection()).toBeNull();
    });

    it("OBSERVED: steps <= 0 leaves the mask unchanged", () => {
      harness.dispatch("setSelection", { x: 1, y: 1, width: 2, height: 2 });
      const before = maskCoords();
      harness.dispatch("expandSelection", 0);
      expect(maskCoords()).toEqual(before);
      harness.dispatch("shrinkSelection", -3);
      expect(maskCoords()).toEqual(before);
    });

    it("neither tracks history", () => {
      harness.dispatch("setSelection", { x: 1, y: 1, width: 2, height: 2 });
      const before = harness.getHistoryLength();
      harness.dispatch("expandSelection", 1);
      harness.dispatch("shrinkSelection", 1);
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("both are no-ops with no selection", () => {
      harness.dispatch("clearSelection");
      expect(() => {
        harness.dispatch("expandSelection", 1);
        harness.dispatch("shrinkSelection", 1);
      }).not.toThrow();
      expect(readSelection()).toBeNull();
    });
  });

  /* ── flood / colour / lasso modes ──────────────────────────────────────── */

  describe("selectFloodFillAt — the flood mode", () => {
    it("selects the connected same-colour region, 4-connected", () => {
      harness.dispatch("selectFloodFillAt", 0, 0);
      expect(maskCoords()).toEqual([
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]);
    });

    it("selects the connected TRANSPARENT region when clicked on an empty pixel", () => {
      harness.dispatch("selectFloodFillAt", 3, 0);
      // Everything except the 2×2 red block and the lone blue pixel.
      expect(maskSize()).toBe(11);
    });

    it("does NOT cross a colour boundary", () => {
      harness.dispatch("selectFloodFillAt", 3, 3);
      expect(maskCoords()).toEqual([[3, 3]]);
    });

    it("ignores normal and height — colour only", () => {
      const p = paintedProject();
      p.objects[0].frames[0].layers[0].pixels[1][0] = {
        color: RED,
        normal: { x: 1, y: 2, z: 3 },
        height: 200,
      };
      harness.load(p);
      harness.dispatch("selectFloodFillAt", 0, 0);
      expect(maskSize()).toBe(4);
    });

    it("REPLACES any existing selection", () => {
      harness.dispatch("setSelection", { x: 3, y: 3, width: 1, height: 1 });
      harness.dispatch("selectFloodFillAt", 0, 0);
      expect(maskSize()).toBe(4);
    });

    it("is a no-op for out-of-bounds coordinates", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 1, height: 1 });
      harness.dispatch("selectFloodFillAt", 99, 99);
      expect(maskSize()).toBe(1);
    });

    it("does NOT track history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("selectFloodFillAt", 0, 0);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  describe("selectAllByColorAt — the colour mode", () => {
    it("selects EVERY matching pixel, contiguous or not", () => {
      const p = paintedProject();
      // A second, disconnected red pixel.
      p.objects[0].frames[0].layers[0].pixels[3][0] = {
        color: RED,
        normal: 0,
        height: 0,
      };
      harness.load(p);

      harness.dispatch("selectAllByColorAt", 0, 0);
      expect(maskSize()).toBe(5);
      // Flood would only have found the contiguous 4.
      harness.dispatch("selectFloodFillAt", 0, 0);
      expect(maskSize()).toBe(4);
    });

    it("selects every EMPTY pixel when clicked on one", () => {
      harness.dispatch("selectAllByColorAt", 3, 0);
      expect(maskSize()).toBe(11);
    });

    it("always contains the clicked pixel", () => {
      harness.dispatch("selectAllByColorAt", 3, 3);
      expect(maskCoords()).toContainEqual([3, 3]);
    });

    it("is a no-op for out-of-bounds coordinates and does not track history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("setSelection", { x: 0, y: 0, width: 1, height: 1 });
      harness.dispatch("selectAllByColorAt", -1, -1);
      expect(maskSize()).toBe(1);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });

  describe("selectLasso — the lasso mode", () => {
    it("CLOSES the polygon automatically — no duplicate final point needed", () => {
      // A triangle given as 3 points; the 3rd->1st edge is implicit.
      const open = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 0, y: 3 },
      ];
      harness.dispatch("selectLasso", open);
      const fromOpen = maskCoords();

      harness.dispatch("selectLasso", [...open, { x: 0, y: 0 }]);
      expect(maskCoords()).toEqual(fromOpen);
    });

    it("tests PIXEL CENTRES, so a full-grid rectangle selects everything", () => {
      harness.dispatch("selectLasso", [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]);
      expect(maskSize()).toBe(16);
    });

    it("uses the EVEN-ODD fill rule, so a self-intersecting lasso leaves holes", () => {
      // A bow-tie: the two lobes are inside, the crossing region is not.
      harness.dispatch("selectLasso", [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ]);
      const size = maskSize();
      // Strictly fewer than the 16 a nonzero rule would give.
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(16);
    });

    it("a SINGLE point selects exactly that pixel", () => {
      harness.dispatch("selectLasso", [{ x: 2, y: 1 }]);
      expect(maskCoords()).toEqual([[2, 1]]);
    });

    it("BUG-SHAPED, OBSERVED: a single OUT-OF-RANGE point is not validated", () => {
      // selectionActions.ts:343 packs `x` and `y` with no bounds check, so
      // `x = -1` yields `y*width - 1`, which unpacks to a DIFFERENT cell.
      // Recorded, not fixed.
      harness.dispatch("selectLasso", [{ x: -1, y: 2 }]);
      // pack(-1, 2, 4) === 2*4 + (-1) === 7 -> unpacks to (3, 1).
      expect(maskCoords()).toEqual([[3, 1]]);
    });

    it("an empty point list is a no-op, leaving any existing selection alone", () => {
      harness.dispatch("setSelection", { x: 0, y: 0, width: 2, height: 2 });
      harness.dispatch("selectLasso", []);
      expect(maskSize()).toBe(4);
    });

    it("a degenerate polygon containing no pixel centre collapses to null", () => {
      harness.dispatch("selectLasso", [
        { x: 0, y: 0 },
        { x: 0, y: 3 },
        { x: 0, y: 0 },
      ]);
      expect(readSelection()).toBeNull();
    });

    it("does NOT track history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("selectLasso", [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 0, y: 3 },
      ]);
      expect(harness.getHistoryLength()).toBe(before);
    });
  });
});
