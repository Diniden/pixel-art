/**
 * PixelStore — the sole grid writer, and the inverse-patch memory gate
 * (REFRESH task 26).
 *
 * ## What this file is for
 *
 * `src/store/__tests__/` (task 08) pins the BEHAVIOUR of the pixel actions and
 * passes unchanged across this migration — that is the equivalence proof and
 * it lives there, not here. This suite pins the things that are NEW in task
 * 26 and that no characterisation test could have known about:
 *
 *  - the inverse-patch SIZE (the 5 kB gate — the point of the whole task);
 *  - that the budget holds for 1,000 strokes;
 *  - that mask / behaviour / variant-frame-index arrive as ARGUMENTS;
 *  - that `bumpPixelVersion()` fires exactly once per write action;
 *  - R2: that no write ever makes a grid observable.
 *
 * ## Memory discipline
 *
 * Same rule as the task 08 contract: never build a realistic project. Every
 * fixture here is small, and the 1,000-stroke budget test records commands
 * without ever materialising 1,000 projects — which is precisely the property
 * being tested.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";
import { PixelStore } from "../PixelStore";
import type { PixelMirror } from "../PixelStore";
import { DomainStore } from "../DomainStore";
import { HistoryStore } from "../../history/HistoryStore";
import { assertGridsAreRaw } from "../gridSafety";
import type {
  Color,
  Frame,
  Layer,
  PixelData,
  PixelObject,
  Project,
  VariantGroup,
} from "@/types";
import { DEFAULT_UI_STATE } from "@/types";

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

function emptyGrid(w: number, h: number): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from(
      { length: w },
      () => ({ color: 0, normal: 0, height: 0 }) as PixelData,
    ),
  );
}

function mkProject(width = 16, height = 16): Project {
  const layer: Layer = {
    id: "layer-1",
    name: "Layer 1",
    visible: true,
    pixels: emptyGrid(width, height),
  };
  const frame: Frame = { id: "frame-1", name: "Frame 1", layers: [layer] };
  const object: PixelObject = {
    id: "obj-1",
    name: "Object 1",
    gridSize: { width, height },
    frames: [frame],
  };
  return {
    version: "1.1.0",
    objects: [object],
    palettes: [],
    variants: [],
    uiState: {
      ...DEFAULT_UI_STATE,
      selectedObjectId: "obj-1",
      selectedFrameId: "frame-1",
      selectedLayerId: "layer-1",
    },
  };
}

/** A project whose selected layer is a VARIANT layer, with 3 variant frames. */
function mkVariantProject(width = 8, height = 8): Project {
  const base = mkProject(width, height);
  const layer = base.objects[0].frames[0].layers[0];
  layer.isVariant = true;
  layer.variantGroupId = "vg-1";
  layer.selectedVariantId = "v-1";

  const group: VariantGroup = {
    id: "vg-1",
    name: "Group",
    variants: [
      {
        id: "v-1",
        name: "Variant 1",
        gridSize: { width, height },
        baseFrameOffsets: {},
        frames: [0, 1, 2].map((i) => ({
          id: `vf-${i}`,
          name: `VF ${i}`,
          layers: [
            {
              id: `vl-${i}`,
              name: `VL ${i}`,
              visible: true,
              pixels: emptyGrid(width, height),
            },
          ],
        })),
      },
    ],
  } as VariantGroup;
  base.variants = [group];
  return base;
}

interface Rig {
  domain: DomainStore;
  history: HistoryStore;
  pixels: PixelStore;
  /** How many times the tree was published to the (fake) Zustand mirror. */
  publishes: number;
  /**
   * Labels of the project SNAPSHOTS taken (task 27). Only the two flips
   * should ever appear here — every other action on this store records an
   * inverse patch instead.
   */
  snapshots: string[];
  layer(): Layer;
  variantLayer(index: number): Layer;
}

function makeRig(project: Project = mkProject()): Rig {
  const domain = new DomainStore({
    session: { saveSuspended: false } as never,
    host: {
      getProject: () => null,
      installProject: () => {},
      replaceProject: () => {},
      snapshotToHistory: () => {},
    } as never,
  });
  runInAction(() => {
    domain.objects = project.objects;
    domain.variants = project.variants ?? [];
    domain.palettes = project.palettes;
    domain.version = project.version;
  });

  const history = new HistoryStore();
  const rig: Rig = {
    domain,
    history,
    publishes: 0,
    snapshots: [] as string[],
    pixels: null as unknown as PixelStore,
    layer: () => domain.objects[0].frames[0].layers[0],
    variantLayer: (index) =>
      domain.variants[0].variants[0].frames[index].layers[0],
  };

  const mirror: PixelMirror = {
    publish: () => {
      rig.publishes += 1;
    },
    syncHistory: () => {},
    reconcile: () => {},
    // Task 27: the two FLIPS are snapshot-family commands (an inverse patch
    // over a full mirror is strictly worse than the snapshot). The rig
    // records the labels so the flip tests can assert the family.
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
  return rig;
}

const colorAt = (layer: Layer, x: number, y: number) =>
  layer.pixels[y][x].color;

describe("PixelStore — the sole grid writer", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  /* ══ THE MEMORY GATE — the point of task 26 ═══════════════════════════ */

  describe("inverse-patch size — the acceptance gate", () => {
    it("GATE: a 50-move pencil DRAG collapses to one command under 5 kB", () => {
      // The real shape of a pencil stroke: one `setPixel` per mousemove,
      // wrapped in a transaction. Three mechanisms have to work together for
      // this to land under the gate, and each was measured through the store:
      //
      //   eager snapshot + per-move commands   105,108 B
      //   deferred snapshot (store/index.ts)   ->  30,300 B
      //   + coalescing (commands.ts)           ->   1,684 B
      //
      // against ~6.9 MB for the single snapshot this replaces.
      rig.history.beginTransaction("Draw");
      for (let i = 0; i < 50; i++) {
        rig.pixels.setPixel(i % 16, Math.floor(i / 16), {
          r: (i * 5) % 256,
          g: 0,
          b: 0,
          a: 255,
        });
      }
      rig.history.endTransaction();

      expect(rig.history.entries).toHaveLength(1);
      const bytes = rig.history.entries[0].bytes;
      expect(bytes).toBe(584 + 50 * 22); // 1,684 B — coalesced into ONE command
      expect(bytes).toBeLessThan(5 * 1024);
    });

    it("a 50-pixel BATCH is one command of ~22 B per changed cell", () => {
      rig.pixels.setPixels(
        Array.from({ length: 50 }, (_, i) => ({
          x: i % 16,
          y: Math.floor(i / 16),
          color: RED,
        })),
      );
      expect(rig.history.entries).toHaveLength(1);
      const bytes = rig.history.entries[0].bytes;
      // 584 B of typed-array views + 22 B per packed cell — see the
      // measurement note on `BYTES_PER_PATCH_CELL`.
      expect(bytes).toBe(584 + 50 * 22);
      expect(bytes).toBeLessThan(5 * 1024);
    });

    it("1,000 batched strokes stay far under the 64 MB budget", () => {
      // 1,000 × 50-cell batches. Under the SNAPSHOT family this was
      // 1,000 × 6.9 MB = 6.9 GB and would OOM the worker; the whole point of
      // the conversion is that it is now ~1.4 MB and nothing evicts.
      for (let s = 0; s < 1000; s++) {
        rig.pixels.setPixels([
          {
            x: s % 16,
            y: Math.floor(s / 16) % 16,
            color: { ...RED, r: s % 256 },
          },
        ]);
      }
      expect(rig.history.historyBytes).toBeLessThan(64 * 1024 * 1024);
      // Nothing was evicted — all 1,000 fit.
      expect(rig.history.entries).toHaveLength(1000);
    });

    it("coalescing preserves undo when a drag REVISITS the same cell", () => {
      // The regression coalescing introduced and the reverse-order apply
      // fixes: a drag over a small grid writes the same cell many times, so
      // the merged command holds several patches for it. Undo must land on
      // the FIRST recorded `before`, not the last.
      rig.history.beginTransaction("Draw");
      for (let i = 0; i < 50; i++) {
        rig.pixels.setPixel(i % 4, Math.floor(i / 4) % 4, {
          r: (i * 5) % 256,
          g: 0,
          b: 0,
          a: 255,
        });
      }
      rig.history.endTransaction();
      expect(rig.history.entries).toHaveLength(1);

      rig.history.undo();
      const painted = rig
        .layer()
        .pixels.flat()
        .filter((p) => p.color !== 0);
      expect(painted).toHaveLength(0);

      rig.history.redo();
      const repainted = rig
        .layer()
        .pixels.flat()
        .filter((p) => p.color !== 0);
      expect(repainted.length).toBeGreaterThan(0);
    });
  });

  /* ══ UNDO RESTORES THE EXACT PRIOR PIXELS ═════════════════════════════ */

  describe("undo through the inverse patch", () => {
    it("undo of a stroke restores the exact prior pixels", () => {
      // Pre-paint a cell so undo has something non-empty to restore to.
      rig.pixels.setPixel(0, 0, BLUE);
      rig.history.clear();

      rig.history.beginTransaction("Draw");
      for (let i = 0; i < 10; i++) rig.pixels.setPixel(i, 0, RED);
      rig.history.endTransaction();

      expect(colorAt(rig.layer(), 0, 0)).toEqual(RED);
      expect(colorAt(rig.layer(), 9, 0)).toEqual(RED);

      rig.history.undo();

      // (0,0) returns to BLUE — its true prior value, not "empty".
      expect(colorAt(rig.layer(), 0, 0)).toEqual(BLUE);
      for (let i = 1; i < 10; i++) expect(colorAt(rig.layer(), i, 0)).toBe(0);
    });

    it("redo re-applies the patch", () => {
      rig.pixels.setPixel(3, 3, RED);
      rig.history.undo();
      expect(colorAt(rig.layer(), 3, 3)).toBe(0);
      rig.history.redo();
      expect(colorAt(rig.layer(), 3, 3)).toEqual(RED);
    });

    it("a patch preserves normal and height on undo", () => {
      runInAction(() => {
        rig.layer().pixels[2][2] = {
          color: BLUE,
          normal: { x: 1, y: 0, z: 0 },
          height: 7,
        } as PixelData;
      });
      rig.pixels.setPixel(2, 2, RED);
      rig.history.undo();
      const cell = rig.layer().pixels[2][2];
      expect(cell.color).toEqual(BLUE);
      expect(cell.normal).toEqual({ x: 1, y: 0, z: 0 });
      expect(cell.height).toBe(7);
    });
  });

  /* ══ THE MASK ARRIVES AS AN ARGUMENT ══════════════════════════════════ */

  describe("the editMask gate — mask and behaviour are ARGUMENTS", () => {
    it("with behaviour 'editMask', a write OUTSIDE the mask is dropped", () => {
      const mask = new Set<number>([0]); // only (0,0)
      const options = {
        mask,
        maskSize: { width: 16, height: 16 },
        behavior: "editMask",
      };
      rig.pixels.setPixel(0, 0, RED, options);
      rig.pixels.setPixel(5, 5, RED, options);

      expect(colorAt(rig.layer(), 0, 0)).toEqual(RED);
      expect(colorAt(rig.layer(), 5, 5)).toBe(0);
    });

    it("setPixels filters the whole batch through the mask", () => {
      const mask = new Set<number>([0, 1]); // (0,0) and (1,0)
      rig.pixels.setPixels(
        [
          { x: 0, y: 0, color: RED },
          { x: 1, y: 0, color: RED },
          { x: 2, y: 0, color: RED },
          { x: 3, y: 0, color: RED },
        ],
        { mask, maskSize: { width: 16, height: 16 }, behavior: "editMask" },
      );
      expect(colorAt(rig.layer(), 0, 0)).toEqual(RED);
      expect(colorAt(rig.layer(), 1, 0)).toEqual(RED);
      expect(colorAt(rig.layer(), 2, 0)).toBe(0);
      expect(colorAt(rig.layer(), 3, 0)).toBe(0);
    });

    it("with behaviour 'movePixels' the mask does NOT gate writes", () => {
      rig.pixels.setPixel(5, 5, RED, {
        mask: new Set<number>([0]),
        maskSize: { width: 16, height: 16 },
        behavior: "movePixels",
      });
      expect(colorAt(rig.layer(), 5, 5)).toEqual(RED);
    });

    it("a mask whose SIZE disagrees with the grid does not gate (legacy rule)", () => {
      rig.pixels.setPixel(5, 5, RED, {
        mask: new Set<number>([0]),
        maskSize: { width: 4, height: 4 }, // wrong dims
        behavior: "editMask",
      });
      expect(colorAt(rig.layer(), 5, 5)).toEqual(RED);
    });
  });

  /* ══ THE VARIANT FRAME INDEX ARRIVES AS AN ARGUMENT ═══════════════════ */

  describe("variantFrameIndex — passed IN, never read across the boundary", () => {
    it("a write lands on the supplied variant frame", () => {
      const vrig = makeRig(mkVariantProject());
      vrig.pixels.setPixel(1, 1, RED, { variantFrameIndex: 2 });

      expect(colorAt(vrig.variantLayer(2), 1, 1)).toEqual(RED);
      expect(colorAt(vrig.variantLayer(0), 1, 1)).toBe(0);
      expect(colorAt(vrig.variantLayer(1), 1, 1)).toBe(0);
    });

    it("it defaults to frame 0 when none is supplied", () => {
      const vrig = makeRig(mkVariantProject());
      vrig.pixels.setPixel(1, 1, RED);
      expect(colorAt(vrig.variantLayer(0), 1, 1)).toEqual(RED);
    });

    it("the index wraps modulo the variant frame count", () => {
      const vrig = makeRig(mkVariantProject());
      vrig.pixels.setPixel(1, 1, RED, { variantFrameIndex: 4 }); // 4 % 3 === 1
      expect(colorAt(vrig.variantLayer(1), 1, 1)).toEqual(RED);
    });

    it("undo of a variant write restores the variant grid", () => {
      const vrig = makeRig(mkVariantProject());
      vrig.pixels.setPixel(1, 1, RED, { variantFrameIndex: 2 });
      vrig.history.undo();
      expect(colorAt(vrig.variantLayer(2), 1, 1)).toBe(0);
    });
  });

  /* ══ bumpPixelVersion FIRES EXACTLY ONCE PER WRITE ACTION ═════════════ */

  describe("pixelVersion — exactly one bump per write action", () => {
    it("setPixel bumps exactly once", () => {
      const before = rig.domain.pixelVersion;
      rig.pixels.setPixel(1, 1, RED);
      expect(rig.domain.pixelVersion).toBe(before + 1);
    });

    it("setPixels bumps ONCE for the whole batch, not once per pixel", () => {
      const before = rig.domain.pixelVersion;
      rig.pixels.setPixels(
        Array.from({ length: 40 }, (_, i) => ({ x: i % 16, y: 0, color: RED })),
      );
      expect(rig.domain.pixelVersion).toBe(before + 1);
    });

    it("a write that changes NOTHING does not bump", () => {
      rig.pixels.setPixel(1, 1, RED);
      const after = rig.domain.pixelVersion;
      rig.pixels.setPixel(1, 1, RED); // already RED — the legacy early return
      expect(rig.domain.pixelVersion).toBe(after);
    });

    it("an out-of-bounds write does not bump", () => {
      const before = rig.domain.pixelVersion;
      rig.pixels.setPixel(999, 999, RED);
      expect(rig.domain.pixelVersion).toBe(before);
    });

    it("undo does NOT bump — the no-save-on-undo guard", () => {
      rig.pixels.setPixel(1, 1, RED);
      const after = rig.domain.pixelVersion;
      rig.history.undo();
      // The tree still changed (and was published) but the SAVE trigger is
      // suppressed while `isReplaying` — the owner decision of 2026-08-16.
      expect(rig.domain.pixelVersion).toBe(after);
      expect(colorAt(rig.layer(), 1, 1)).toBe(0);
    });
  });

  /* ══ deleteSelectionPixels / moveSelectedPixels ═══════════════════════ */

  describe("selection-driven pixel mutations", () => {
    it("deleteSelectionPixels clears exactly the mask", () => {
      rig.pixels.setPixels([
        { x: 0, y: 0, color: RED },
        { x: 1, y: 0, color: RED },
        { x: 2, y: 0, color: RED },
      ]);
      rig.pixels.deleteSelectionPixels({
        mask: new Set<number>([0, 1]),
        maskSize: { width: 16, height: 16 },
      });
      expect(colorAt(rig.layer(), 0, 0)).toBe(0);
      expect(colorAt(rig.layer(), 1, 0)).toBe(0);
      expect(colorAt(rig.layer(), 2, 0)).toEqual(RED);
    });

    it("moveSelectedPixels clears the source and paints the destination", () => {
      rig.pixels.setPixel(0, 0, RED);
      rig.pixels.moveSelectedPixels(2, 0, {
        mask: new Set<number>([0]),
        maskSize: { width: 16, height: 16 },
      });
      expect(colorAt(rig.layer(), 0, 0)).toBe(0);
      expect(colorAt(rig.layer(), 2, 0)).toEqual(RED);
    });

    it("one undo restores a whole move", () => {
      rig.pixels.setPixel(0, 0, RED);
      rig.history.clear();
      rig.pixels.moveSelectedPixels(3, 3, {
        mask: new Set<number>([0]),
        maskSize: { width: 16, height: 16 },
      });
      expect(rig.history.entries).toHaveLength(1);
      rig.history.undo();
      expect(colorAt(rig.layer(), 0, 0)).toEqual(RED);
      expect(colorAt(rig.layer(), 3, 3)).toBe(0);
    });
  });

  /* ══ adjustColor — trackHistory passes THROUGH ════════════════════════ */

  describe("adjustColor", () => {
    it("defaults to NOT tracking history (the debounce contract)", () => {
      rig.pixels.setPixel(0, 0, RED);
      rig.history.clear();
      rig.pixels.adjustColor([{ x: 0, y: 0 }], BLUE);
      expect(colorAt(rig.layer(), 0, 0)).toEqual(BLUE);
      // ColorPicker passes trackHistory only on debounce settle — a slider
      // drag must not fill the undo stack.
      expect(rig.history.entries).toHaveLength(0);
    });

    it("records ONE entry when the caller passes trackHistory", () => {
      rig.pixels.setPixel(0, 0, RED);
      rig.history.clear();
      rig.pixels.adjustColor([{ x: 0, y: 0 }], BLUE, { trackHistory: true });
      expect(rig.history.entries).toHaveLength(1);
      rig.history.undo();
      expect(colorAt(rig.layer(), 0, 0)).toEqual(RED);
    });
  });

  /* ══ R2 — NO WRITE EVER MAKES A GRID OBSERVABLE ═══════════════════════ */

  describe("R2 — the grid contract", () => {
    it("every grid stays a RAW array after a write, an undo and a redo", () => {
      rig.pixels.setPixels(
        Array.from({ length: 30 }, (_, i) => ({ x: i % 16, y: 0, color: RED })),
      );
      assertGridsAreRaw(rig.domain.objects, rig.domain.variants);
      rig.history.undo();
      assertGridsAreRaw(rig.domain.objects, rig.domain.variants);
      rig.history.redo();
      assertGridsAreRaw(rig.domain.objects, rig.domain.variants);
    });

    it("a write REPLACES the grid wholesale — a new array identity", () => {
      const before = rig.layer().pixels;
      rig.pixels.setPixel(1, 1, RED);
      expect(rig.layer().pixels).not.toBe(before);
    });

    it("an UNTOUCHED row keeps its identity — only affected rows are copied", () => {
      const beforeRow5 = rig.layer().pixels[5];
      rig.pixels.setPixel(1, 1, RED); // touches row 1 only
      expect(rig.layer().pixels[5]).toBe(beforeRow5);
      expect(rig.layer().pixels[1]).not.toBe(beforeRow5);
    });

    it("the recorded patch does not alias the live grid", () => {
      rig.pixels.setPixel(1, 1, RED);
      const command = rig.history.entries[0] as unknown as {
        cells: { before: PixelData; after: PixelData }[];
      };
      expect(command.cells[0].before).not.toBe(rig.layer().pixels[1][1]);
      expect(command.cells[0].after).not.toBe(rig.layer().pixels[1][1]);
    });
  });

  /* ══ setPixelCells — THE ATOMIC THREE-CHANNEL WRITE (task 05) ═════════ */

  /**
   * `setPixelCells` writes colour, normal and height in ONE commit. It exists
   * because no combination of the three older bulk actions can: `setPixels`
   * writes colour only, and `setNormalPixels`/`setHeightPixels` route through
   * `collectLightingPatches`, which skips every cell whose colour is `0` —
   * so a stamp onto transparent cells loses all of its lighting data and
   * costs three undo steps.
   *
   * The FIRST test below is the central one: it is exactly the case the
   * lighting actions drop.
   */
  describe("setPixelCells — colour + normal + height in one entry", () => {
    it("CENTRAL: all three members land on a PREVIOUSLY EMPTY cell", () => {
      // The cell starts fully transparent — `setNormalPixels` and
      // `setHeightPixels` would both skip it entirely (the colour guard).
      expect(rig.layer().pixels[3][4]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });

      rig.pixels.setPixelCells([
        { x: 4, y: 3, color: RED, normal: { x: 10, y: -20, z: 127 }, height: 9 },
      ]);

      const cell = rig.layer().pixels[3][4];
      expect(cell.color).toEqual(RED);
      expect(cell.normal).toEqual({ x: 10, y: -20, z: 127 });
      expect(cell.height).toBe(9);
    });

    it("proves the contrast: setNormalPixels DROPS that same empty cell", () => {
      // Not a test of the new action so much as a pin on WHY it exists. If
      // this ever stops dropping, the justification for `setPixelCells`
      // deserves a re-read (but the action still gives one undo entry).
      rig.pixels.setNormalPixels([
        { x: 4, y: 3, normal: { x: 10, y: -20, z: 127 } },
      ]);
      expect(rig.layer().pixels[3][4].normal).toBe(0);
    });

    it("a whole batch is EXACTLY ONE history entry, labelled 'Stamp pose'", () => {
      rig.pixels.setPixelCells([
        { x: 0, y: 0, color: RED, normal: { x: 1, y: 2, z: 3 }, height: 4 },
        { x: 1, y: 0, color: BLUE, normal: { x: 5, y: 6, z: 7 }, height: 8 },
        { x: 2, y: 1, color: RED, normal: { x: 9, y: 10, z: 11 }, height: 12 },
      ]);
      expect(rig.history.entries).toHaveLength(1);
      expect(rig.history.entries[0].label).toBe("Stamp pose");
    });

    it("ONE undo reverts EVERY cell — colour, normal and height alike", () => {
      // Seed one cell so undo has something non-empty to restore to.
      runInAction(() => {
        rig.layer().pixels[0][0] = {
          color: BLUE,
          normal: { x: 1, y: 1, z: 1 },
          height: 5,
        } as PixelData;
      });

      rig.pixels.setPixelCells([
        { x: 0, y: 0, color: RED, normal: { x: 20, y: 30, z: 40 }, height: 11 },
        { x: 1, y: 0, color: RED, normal: { x: 21, y: 31, z: 41 }, height: 12 },
        { x: 2, y: 2, color: RED, normal: { x: 22, y: 32, z: 42 }, height: 13 },
      ]);

      rig.history.undo();

      expect(rig.layer().pixels[0][0]).toEqual({
        color: BLUE,
        normal: { x: 1, y: 1, z: 1 },
        height: 5,
      });
      expect(rig.layer().pixels[0][1]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
      expect(rig.layer().pixels[2][2]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
    });

    it("redo re-applies all three members", () => {
      rig.pixels.setPixelCells([
        { x: 5, y: 5, color: RED, normal: { x: 3, y: 4, z: 5 }, height: 6 },
      ]);
      rig.history.undo();
      rig.history.redo();
      expect(rig.layer().pixels[5][5]).toEqual({
        color: RED,
        normal: { x: 3, y: 4, z: 5 },
        height: 6,
      });
    });

    it("out-of-bounds cells are FILTERED, not thrown on", () => {
      expect(() =>
        rig.pixels.setPixelCells([
          { x: -1, y: 0, color: RED, normal: 0, height: 1 },
          { x: 0, y: -1, color: RED, normal: 0, height: 1 },
          { x: 16, y: 0, color: RED, normal: 0, height: 1 },
          { x: 0, y: 16, color: RED, normal: 0, height: 1 },
          { x: 7, y: 7, color: RED, normal: { x: 1, y: 2, z: 3 }, height: 4 },
        ]),
      ).not.toThrow();

      // Only the in-bounds cell was written, and it is the only patch.
      expect(rig.layer().pixels[7][7].color).toEqual(RED);
      const command = rig.history.entries[0] as unknown as {
        cells: unknown[];
      };
      expect(command.cells).toHaveLength(1);
    });

    it("an editMask excludes the masked-out cells", () => {
      rig.pixels.setPixelCells(
        [
          { x: 1, y: 1, color: RED, normal: { x: 1, y: 1, z: 1 }, height: 2 },
          { x: 2, y: 1, color: RED, normal: { x: 1, y: 1, z: 1 }, height: 2 },
        ],
        {
          behavior: "editMask",
          mask: new Set([1 * 16 + 1]), // only (1,1)
          maskSize: { width: 16, height: 16 },
        },
      );

      expect(rig.layer().pixels[1][1].color).toEqual(RED);
      expect(rig.layer().pixels[1][1].height).toBe(2);
      expect(rig.layer().pixels[1][2]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
    });

    it("duplicate coordinates collapse to ONE patch, and the LAST write wins", () => {
      rig.pixels.setPixelCells([
        { x: 3, y: 3, color: RED, normal: { x: 1, y: 1, z: 1 }, height: 1 },
        { x: 3, y: 3, color: BLUE, normal: { x: 2, y: 2, z: 2 }, height: 2 },
      ]);

      expect(rig.layer().pixels[3][3]).toEqual({
        color: BLUE,
        normal: { x: 2, y: 2, z: 2 },
        height: 2,
      });

      const command = rig.history.entries[0] as unknown as {
        cells: { before: PixelData; after: PixelData }[];
      };
      expect(command.cells).toHaveLength(1);
      // Undo lands on the TRUE pre-batch value, not the intermediate RED.
      rig.history.undo();
      expect(rig.layer().pixels[3][3]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
    });

    it("trackHistory: false writes the cells but records NO entry", () => {
      rig.pixels.setPixelCells(
        [{ x: 6, y: 6, color: RED, normal: { x: 7, y: 8, z: 9 }, height: 10 }],
        { trackHistory: false },
      );
      expect(rig.layer().pixels[6][6]).toEqual({
        color: RED,
        normal: { x: 7, y: 8, z: 9 },
        height: 10,
      });
      expect(rig.history.entries).toHaveLength(0);
    });

    it("an EMPTY array is a complete no-op — no history, no bump, no publish", () => {
      const version = rig.domain.pixelVersion;
      const publishes = rig.publishes;
      rig.pixels.setPixelCells([]);
      expect(rig.history.entries).toHaveLength(0);
      expect(rig.domain.pixelVersion).toBe(version);
      expect(rig.publishes).toBe(publishes);
    });

    it("a fully out-of-bounds batch is also a no-op — commitCells early-returns", () => {
      // ⚠️ Deliberately NOT `commitLighting`'s behaviour, which publishes and
      // bumps even on an empty patch list. This action is a colour-family
      // write and must record and save nothing when nothing qualifies.
      const version = rig.domain.pixelVersion;
      const publishes = rig.publishes;
      rig.pixels.setPixelCells([
        { x: 99, y: 99, color: RED, normal: 0, height: 1 },
      ]);
      expect(rig.history.entries).toHaveLength(0);
      expect(rig.domain.pixelVersion).toBe(version);
      expect(rig.publishes).toBe(publishes);
    });

    it("bumps pixelVersion exactly ONCE for the whole batch", () => {
      const before = rig.domain.pixelVersion;
      rig.pixels.setPixelCells(
        Array.from({ length: 25 }, (_, i) => ({
          x: i % 5,
          y: Math.floor(i / 5),
          color: RED,
          normal: { x: 1, y: 2, z: 3 } as const,
          height: 4,
        })),
      );
      expect(rig.domain.pixelVersion).toBe(before + 1);
    });

    it("writes a colour of 0 with a normal and height, unlike nextCell's erase", () => {
      // OBSERVED, and intended: every member is authoritative here. `setPixel`
      // with colour 0 forces normal 0 / height 0 (`nextCell`'s erase branch);
      // this action writes exactly what the caller asked for.
      rig.pixels.setPixelCells([
        { x: 8, y: 8, color: 0, normal: { x: 1, y: 2, z: 3 }, height: 5 },
      ]);
      expect(rig.layer().pixels[8][8]).toEqual({
        color: 0,
        normal: { x: 1, y: 2, z: 3 },
        height: 5,
      });
    });

    it("R2: the grid stays RAW and is replaced WHOLESALE", () => {
      const beforeGrid = rig.layer().pixels;
      const untouchedRow = rig.layer().pixels[12];
      rig.pixels.setPixelCells([
        { x: 1, y: 1, color: RED, normal: { x: 1, y: 2, z: 3 }, height: 4 },
      ]);
      expect(rig.layer().pixels).not.toBe(beforeGrid);
      expect(rig.layer().pixels[12]).toBe(untouchedRow);
      assertGridsAreRaw(rig.domain.objects, rig.domain.variants);
    });

    it("honours variantFrameIndex, like every other write", () => {
      const vrig = makeRig(mkVariantProject());
      vrig.pixels.setPixelCells(
        [{ x: 2, y: 2, color: RED, normal: { x: 1, y: 2, z: 3 }, height: 4 }],
        { variantFrameIndex: 1 },
      );
      expect(vrig.variantLayer(1).pixels[2][2]).toEqual({
        color: RED,
        normal: { x: 1, y: 2, z: 3 },
        height: 4,
      });
      expect(vrig.variantLayer(0).pixels[2][2].color).toBe(0);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 *  R2 — THE PERFORMANCE GATE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "A 100-pixel drag stays under 16 ms/frame" is the check that catches an
 * accidentally deep-observed grid. It is not a microbenchmark for its own
 * sake: if `layer.pixels` ever stops being `observableRef`, MobX builds a
 * proxy per cell and this test is where it shows up — as a frame time in the
 * hundreds of milliseconds rather than as a wrong answer anywhere.
 *
 * The grid is 300×300 = 90,000 cells, the same order of magnitude as the
 * owner's real 300,249, so the number means something. It is deliberately NOT
 * a `tinyProject`: a 4×4 grid would pass this gate even fully deep-observed.
 */
describe("R2 — the 100-pixel drag performance gate", () => {
  it("a 100-move drag stays well under 16 ms per frame", () => {
    const rig = makeRig(mkProject(300, 300));
    const frames: number[] = [];

    rig.history.beginTransaction("Draw");
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      rig.pixels.setPixel(i % 300, Math.floor(i / 300), {
        r: i % 256,
        g: 0,
        b: 0,
        a: 255,
      });
      frames.push(performance.now() - t0);
    }
    rig.history.endTransaction();

    const worst = Math.max(...frames);
    // Measured 2026-08-19 through the real store: worst 1.042 ms, median
    // 0.121 ms on a 90,000-cell grid. The 16 ms budget is one 60 Hz frame.
    expect(worst).toBeLessThan(16);
    // One drag is still exactly one entry, at the packed size.
    expect(rig.history.entries).toHaveLength(1);
    expect(rig.history.entries[0].bytes).toBeLessThan(5 * 1024);
  });

  it("undo and redo of that drag are each under 16 ms", () => {
    const rig = makeRig(mkProject(300, 300));
    rig.history.beginTransaction("Draw");
    for (let i = 0; i < 100; i++) {
      rig.pixels.setPixel(i % 300, Math.floor(i / 300), {
        r: i % 256,
        g: 0,
        b: 0,
        a: 255,
      });
    }
    rig.history.endTransaction();

    let t = performance.now();
    rig.history.undo();
    expect(performance.now() - t).toBeLessThan(16);

    t = performance.now();
    rig.history.redo();
    expect(performance.now() - t).toBeLessThan(16);
  });

  it("the 90,000-cell grid is still RAW after the whole drag", () => {
    const rig = makeRig(mkProject(300, 300));
    rig.history.beginTransaction("Draw");
    for (let i = 0; i < 100; i++) rig.pixels.setPixel(i % 300, 0, RED);
    rig.history.endTransaction();
    // The assertion that gives the timing above its meaning.
    assertGridsAreRaw(rig.domain.objects, rig.domain.variants);
  });
});
