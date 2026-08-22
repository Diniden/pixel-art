/**
 * W29h — `PixelTarget.variant.layerIndex`: the MobX write engine learns to
 * address a variant layer OTHER than `layers[0]`.
 *
 * ## Why this file exists
 *
 * W29g pinned the legacy variant colour path with 38 assertions on both
 * harness rows and found the blocker to bridge deletion is STRUCTURAL, not
 * behavioural:
 *
 *  - `PixelStore.writeGridInAction` was hard-wired to `li === 0`;
 *  - `PixelStore.findLayer` (the UNDO re-resolve) was hard-wired to
 *    `layers[0]`;
 *  - `PixelTarget.variant` carried `variantGroupId` / `variantId` /
 *    `frameIndex` and no layer index at all.
 *
 * W29g's pin "all-frames variant colour adjustment recolours EVERY layer of
 * every variant frame" is therefore inexpressible on this store: MobX can
 * only ever write variant layer 0. This suite pins the engine change that
 * makes it expressible.
 *
 * ## ⚠️ THE COALESCING COMPARATOR IS THE SUBTLE HALF
 *
 * `coalescePixelCommands`' `sameTarget` compared `frameId`, `layerId` and the
 * three variant fields. Adding a fourth variant field WITHOUT teaching the
 * comparator about it makes two writes to DIFFERENT variant layers look like
 * one target — they merge into a single command whose `target` is whichever
 * one happened to be last, and undo then restores BOTH layers' cells onto
 * that one layer. That is silent artwork corruption in the undo path, so it
 * gets its own failing-before pin below.
 *
 * ## What this does NOT change
 *
 * Nothing about `resolveTarget`'s variant branch, which still selects
 * `frames[frameIndex].layers[0]` — W29g pinned that `getSelectedVariantLayer()`
 * ignores `selectedLayerId`, and that defect stays pinned pending owner
 * sign-off. This suite enables the ENGINE; it does not change any semantic a
 * gesture can reach.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";
import { PixelStore } from "../PixelStore";
import type { PixelMirror } from "../PixelStore";
import { DomainStore } from "../DomainStore";
import { HistoryStore } from "../../history/HistoryStore";
import {
  createPixelCommand,
  collapseTransaction,
  isPixelCommand,
} from "../../history/commands";
import type {
  PixelPatch,
  PixelPatchHost,
  PixelTarget,
} from "../../history/commands";
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
const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };

function emptyGrid(w: number, h: number): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from(
      { length: w },
      () => ({ color: 0, normal: 0, height: 0 }) as PixelData,
    ),
  );
}

/**
 * A variant project with THREE layers per variant frame — the fixture the
 * existing `mkVariantProject` (one layer) could not express.
 */
function mkMultiLayerVariantProject(width = 4, height = 4): Project {
  const layer: Layer = {
    id: "layer-1",
    name: "Layer 1",
    visible: true,
    pixels: emptyGrid(width, height),
    isVariant: true,
    variantGroupId: "vg-1",
    selectedVariantId: "v-1",
  };
  const frame: Frame = { id: "frame-1", name: "Frame 1", layers: [layer] };
  const object: PixelObject = {
    id: "obj-1",
    name: "Object 1",
    gridSize: { width, height },
    frames: [frame],
  };
  const group: VariantGroup = {
    id: "vg-1",
    name: "Group",
    variants: [
      {
        id: "v-1",
        name: "Variant 1",
        gridSize: { width, height },
        baseFrameOffsets: {},
        frames: [0, 1].map((f) => ({
          id: `vf-${f}`,
          name: `VF ${f}`,
          layers: [0, 1, 2].map((l) => ({
            id: `vl-${f}-${l}`,
            name: `VL ${l}`,
            visible: true,
            pixels: emptyGrid(width, height),
          })),
        })),
      },
    ],
  } as VariantGroup;

  return {
    version: "1.1.0",
    objects: [object],
    palettes: [],
    variants: [group],
    uiState: {
      ...DEFAULT_UI_STATE,
      selectedObjectId: "obj-1",
      selectedFrameId: "frame-1",
      selectedLayerId: "layer-1",
    },
  };
}

interface Rig {
  domain: DomainStore;
  history: HistoryStore;
  pixels: PixelStore;
  /** `frames[f].layers[l]` of the live tree. */
  vlayer(f: number, l: number): Layer;
  colorAt(f: number, l: number, x: number, y: number): Color | 0;
}

function makeRig(project: Project = mkMultiLayerVariantProject()): Rig {
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
  const mirror: PixelMirror = {
    publish: () => {},
    syncHistory: () => {},
    reconcile: () => {},
    snapshot: () => {},
  };

  const pixels = new PixelStore({
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
  history.setPatchHost(pixels as unknown as PixelPatchHost);

  const vlayer = (f: number, l: number) =>
    domain.variants[0].variants[0].frames[f].layers[l];

  return {
    domain,
    history,
    pixels,
    vlayer,
    colorAt: (f, l, x, y) => vlayer(f, l).pixels[y][x].color,
  };
}

/** Reach the private write engine — this suite pins the ENGINE, not a gesture. */
function writeCell(
  pixels: PixelStore,
  target: PixelTarget,
  x: number,
  y: number,
  color: Color,
  trackHistory = true,
): void {
  const store = pixels as unknown as {
    findLayer(t: PixelTarget): Layer | null;
    commitCells(
      t: PixelTarget,
      layer: Layer,
      label: string,
      patches: readonly PixelPatch[],
      trackHistory: boolean,
    ): void;
  };
  const layer = store.findLayer(target);
  if (!layer) throw new Error("target did not resolve");
  const before = layer.pixels[y][x];
  store.commitCells(
    target,
    layer,
    "Write",
    [
      {
        x,
        y,
        before: { ...before },
        after: { color, normal: before.normal, height: before.height },
      },
    ],
    trackHistory,
  );
}

const vt = (frameIndex: number, layerIndex?: number): PixelTarget => ({
  objectId: "obj-1",
  frameId: "frame-1",
  layerId: "layer-1",
  variant: {
    variantGroupId: "vg-1",
    variantId: "v-1",
    frameIndex,
    ...(layerIndex === undefined ? {} : { layerIndex }),
  },
});

describe("W29h — the variant write engine can address any layer", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  /* ══ THE WRITE PATH ════════════════════════════════════════════════════ */

  describe("writeGridInAction honours layerIndex", () => {
    it("FAILS BEFORE W29h: writes land on variant layer 2, not layer 0", () => {
      writeCell(rig.pixels, vt(0, 2), 1, 1, RED);

      expect(rig.colorAt(0, 2, 1, 1)).toEqual(RED);
      // The pre-W29h engine wrote here instead — the whole blocker.
      expect(rig.colorAt(0, 0, 1, 1)).toBe(0);
      expect(rig.colorAt(0, 1, 1, 1)).toBe(0);
    });

    it("addresses each of the three layers independently", () => {
      writeCell(rig.pixels, vt(0, 0), 0, 0, RED);
      writeCell(rig.pixels, vt(0, 1), 0, 0, BLUE);
      writeCell(rig.pixels, vt(0, 2), 0, 0, GREEN);

      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 1, 0, 0)).toEqual(BLUE);
      expect(rig.colorAt(0, 2, 0, 0)).toEqual(GREEN);
    });

    it("layerIndex is scoped to its frame — frame 1 layer 2 is not frame 0's", () => {
      writeCell(rig.pixels, vt(1, 2), 2, 2, RED);

      expect(rig.colorAt(1, 2, 2, 2)).toEqual(RED);
      expect(rig.colorAt(0, 2, 2, 2)).toBe(0);
    });

    it("leaves every untouched variant layer grid REFERENCE identical (R2)", () => {
      const untouched = [
        rig.vlayer(0, 0).pixels,
        rig.vlayer(0, 1).pixels,
        rig.vlayer(1, 0).pixels,
        rig.vlayer(1, 1).pixels,
        rig.vlayer(1, 2).pixels,
      ];
      writeCell(rig.pixels, vt(0, 2), 1, 1, RED);

      expect(rig.vlayer(0, 0).pixels).toBe(untouched[0]);
      expect(rig.vlayer(0, 1).pixels).toBe(untouched[1]);
      expect(rig.vlayer(1, 0).pixels).toBe(untouched[2]);
      expect(rig.vlayer(1, 1).pixels).toBe(untouched[3]);
      expect(rig.vlayer(1, 2).pixels).toBe(untouched[4]);
    });

    it("an out-of-range layerIndex writes NOTHING rather than falling back", () => {
      // `findLayer` returns null, so `writeCell` cannot even resolve — the
      // engine never guesses at layer 0.
      expect(() => writeCell(rig.pixels, vt(0, 9), 0, 0, RED)).toThrow(
        /did not resolve/,
      );
      expect(rig.colorAt(0, 0, 0, 0)).toBe(0);
    });
  });

  /* ══ BACKWARDS COMPATIBILITY — the field is OPTIONAL ═══════════════════ */

  describe("a target with NO layerIndex behaves exactly as today", () => {
    it("writes to layer 0", () => {
      writeCell(rig.pixels, vt(0), 1, 1, RED);

      expect(rig.colorAt(0, 0, 1, 1)).toEqual(RED);
      expect(rig.colorAt(0, 1, 1, 1)).toBe(0);
      expect(rig.colorAt(0, 2, 1, 1)).toBe(0);
    });

    it("undoes back onto layer 0", () => {
      writeCell(rig.pixels, vt(0), 1, 1, RED);
      rig.history.undo();

      expect(rig.colorAt(0, 0, 1, 1)).toBe(0);
    });

    it("`layerIndex: 0` and an ABSENT layerIndex are the same layer", () => {
      writeCell(rig.pixels, vt(0), 0, 0, RED);
      writeCell(rig.pixels, vt(0, 0), 1, 0, BLUE);

      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 0, 1, 0)).toEqual(BLUE);
    });
  });

  /* ══ THE UNDO / REDO ROUND TRIP ════════════════════════════════════════ */

  describe("undo and redo land on layer N, never on layer 0", () => {
    it("ROUND TRIP: write layer 2 -> undo -> redo, all on layer 2", () => {
      writeCell(rig.pixels, vt(0, 2), 1, 1, RED);
      expect(rig.colorAt(0, 2, 1, 1)).toEqual(RED);

      rig.history.undo();
      expect(rig.colorAt(0, 2, 1, 1)).toBe(0);
      // The pre-W29h `findLayer` re-resolved to layers[0] and undo would have
      // written the cleared cell THERE.
      expect(rig.colorAt(0, 0, 1, 1)).toBe(0);

      rig.history.redo();
      expect(rig.colorAt(0, 2, 1, 1)).toEqual(RED);
      expect(rig.colorAt(0, 0, 1, 1)).toBe(0);
    });

    it("undo restores a PRE-EXISTING colour on layer 1, not on layer 0", () => {
      writeCell(rig.pixels, vt(0, 1), 2, 2, BLUE);
      writeCell(rig.pixels, vt(0, 1), 2, 2, RED);

      rig.history.undo();
      expect(rig.colorAt(0, 1, 2, 2)).toEqual(BLUE);
      expect(rig.colorAt(0, 0, 2, 2)).toBe(0);
    });

    it("interleaved writes to three layers undo in reverse, each on its own", () => {
      writeCell(rig.pixels, vt(0, 0), 0, 0, RED);
      writeCell(rig.pixels, vt(0, 1), 0, 0, BLUE);
      writeCell(rig.pixels, vt(0, 2), 0, 0, GREEN);

      rig.history.undo();
      expect(rig.colorAt(0, 2, 0, 0)).toBe(0);
      expect(rig.colorAt(0, 1, 0, 0)).toEqual(BLUE);
      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);

      rig.history.undo();
      expect(rig.colorAt(0, 1, 0, 0)).toBe(0);
      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);

      rig.history.undo();
      expect(rig.colorAt(0, 0, 0, 0)).toBe(0);

      rig.history.redo();
      rig.history.redo();
      rig.history.redo();
      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 1, 0, 0)).toEqual(BLUE);
      expect(rig.colorAt(0, 2, 0, 0)).toEqual(GREEN);
    });
  });

  /* ══ ⚠️ THE COALESCING COMPARATOR ══════════════════════════════════════ */

  describe("⚠️ coalescing must NOT merge across variant layers", () => {
    /**
     * Build two pixel commands against a shared host, collapse them exactly
     * as `HistoryStore.endTransaction` does, and count what came out.
     */
    const collapse = (targets: PixelTarget[]) => {
      const applied: {
        target: PixelTarget;
        cells: readonly PixelPatch[];
        direction: string;
      }[] = [];
      const host: PixelPatchHost = {
        applyPatch: (target, cells, direction) => {
          applied.push({ target, cells, direction });
        },
      };
      const commands = targets.map((target, i) =>
        createPixelCommand({
          label: "Write",
          target,
          cells: [
            {
              x: i,
              y: 0,
              before: { color: 0, normal: 0, height: 0 },
              after: { color: RED, normal: 0, height: 0 },
            },
          ],
          host,
        }),
      );
      const collapsed = collapseTransaction("Write", commands, host);
      return { collapsed, applied };
    };

    it("FAILS BEFORE W29h: two variant LAYERS stay two commands", () => {
      const { collapsed } = collapse([vt(0, 0), vt(0, 1)]);

      // Pre-W29h `sameTarget` ignored the layer index, so these merged into
      // ONE pixel command — and undo replayed BOTH cells onto whichever
      // layer the surviving target named. Silent artwork corruption.
      expect(isPixelCommand(collapsed)).toBe(false);
      expect(
        (collapsed as unknown as { children: unknown[] }).children,
      ).toHaveLength(2);
    });

    it("FAILS BEFORE W29h: the merged command would undo onto the WRONG layer", () => {
      const { collapsed, applied } = collapse([vt(0, 0), vt(0, 1)]);
      collapsed.undo();

      // Two undos, one per layer — each carrying exactly its own cell.
      expect(applied).toHaveLength(2);
      const byLayer = applied.map((a) => a.target.variant?.layerIndex);
      expect(byLayer.sort()).toEqual([0, 1]);
      for (const a of applied) expect(a.cells).toHaveLength(1);
    });

    it("STILL coalesces two writes to the SAME variant layer", () => {
      const { collapsed } = collapse([vt(0, 2), vt(0, 2)]);

      expect(isPixelCommand(collapsed)).toBe(true);
      expect((collapsed as unknown as { cells: readonly PixelPatch[] }).cells).toHaveLength(
        2,
      );
      expect(
        (collapsed as unknown as { target: PixelTarget }).target.variant?.layerIndex,
      ).toBe(2);
    });

    it("treats an ABSENT layerIndex and `0` as the same target (no split)", () => {
      // Backwards compatibility: an old-shaped target must still coalesce
      // with a layer-0 one, or every legacy stroke would stop merging and
      // the 5 kB byte gate would regress.
      const { collapsed } = collapse([vt(0), vt(0, 0)]);

      expect(isPixelCommand(collapsed)).toBe(true);
      expect((collapsed as unknown as { cells: readonly PixelPatch[] }).cells).toHaveLength(
        2,
      );
    });

    it("still splits on frameIndex, as before", () => {
      const { collapsed } = collapse([vt(0, 1), vt(1, 1)]);
      expect(isPixelCommand(collapsed)).toBe(false);
    });
  });

  /* ══ THE SAME THING, END TO END THROUGH THE STORE ══════════════════════ */

  describe("end to end: a transaction across variant layers", () => {
    it("collapses to ONE entry that undoes each layer correctly", () => {
      rig.history.beginTransaction("Adjust color");
      writeCell(rig.pixels, vt(0, 0), 0, 0, RED);
      writeCell(rig.pixels, vt(0, 1), 0, 0, RED);
      writeCell(rig.pixels, vt(0, 2), 0, 0, RED);
      rig.history.endTransaction();

      expect(rig.history.entries).toHaveLength(1);
      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 1, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 2, 0, 0)).toEqual(RED);

      rig.history.undo();
      expect(rig.colorAt(0, 0, 0, 0)).toBe(0);
      expect(rig.colorAt(0, 1, 0, 0)).toBe(0);
      expect(rig.colorAt(0, 2, 0, 0)).toBe(0);

      rig.history.redo();
      expect(rig.colorAt(0, 0, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 1, 0, 0)).toEqual(RED);
      expect(rig.colorAt(0, 2, 0, 0)).toEqual(RED);
    });
  });
});
