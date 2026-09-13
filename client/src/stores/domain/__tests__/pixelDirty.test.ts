/**
 * `DomainStore.pixelDirty` — the D7 dirty-region channel
 * (plan `docs/05-canvas-perf`, task 01).
 *
 * ## What this file is for
 *
 * `PixelStore.commitCells` has always held the exact `PixelPatch[]` for every
 * write and thrown it away at `publishAndBump()`. Task 01 publishes it on a
 * NEW observable instead of repurposing `pixelVersion`, because
 * `pixelVersion` is the auto-save trigger and its bump is suppressed during
 * undo/redo. This suite pins the two properties that separation exists for:
 *
 *  - a write publishes the cells it actually changed, on the right layer;
 *  - **an undo publishes a region even though `pixelVersion` does not move**
 *    (D8). That is the regression test — a dirty channel that inherited the
 *    `isReplaying` gate would leave undone pixels on screen, and nothing else
 *    in the suite would notice.
 *
 * Nothing consumes `pixelDirty` yet (task 07 does), so these assertions are
 * the only thing standing between the channel and a silent regression.
 *
 * ## Harness
 *
 * The rig is the one from `PixelStore.test.ts`, trimmed to what these cases
 * need. Same memory discipline: never build a realistic project.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";
import { PixelStore } from "../PixelStore";
import type { PixelMirror } from "../PixelStore";
import { DomainStore } from "../DomainStore";
import { HistoryStore } from "../../history/HistoryStore";
import type {
  Color,
  Frame,
  Layer,
  PixelData,
  PixelObject,
  Project,
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

interface Rig {
  domain: DomainStore;
  history: HistoryStore;
  pixels: PixelStore;
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
  return { domain, history, pixels, layer: () => domain.objects[0].frames[0].layers[0] };
}

/** `{x, y}` pairs as sortable keys, so assertions do not depend on order. */
const keys = (cells: readonly { x: number; y: number }[]) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

describe("DomainStore.pixelDirty — the D7 dirty-region channel", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = makeRig();
  });

  it("starts null — nothing has been written yet", () => {
    expect(rig.domain.pixelDirty).toBeNull();
  });

  /* ══ 1. the single-cell write ═════════════════════════════════════════ */

  describe("setPixel", () => {
    it("publishes the layer id and exactly the one cell written", () => {
      rig.pixels.setPixel(3, 5, RED);

      const region = rig.domain.pixelDirty;
      expect(region).not.toBeNull();
      expect(region?.layerId).toBe("layer-1");
      expect(region?.cells).toEqual([{ x: 3, y: 5 }]);
    });

    it("replaces the previous region rather than accumulating", () => {
      rig.pixels.setPixel(3, 5, RED);
      rig.pixels.setPixel(9, 1, BLUE);

      // The channel names the LAST write, not every write since load — a
      // consumer repaints on each publish and must not re-walk history.
      expect(rig.domain.pixelDirty?.cells).toEqual([{ x: 9, y: 1 }]);
    });
  });

  /* ══ 2. the bulk write ════════════════════════════════════════════════ */

  describe("setPixels", () => {
    it("publishes ONE region containing every written cell", () => {
      rig.pixels.setPixels([
        { x: 0, y: 0, color: RED },
        { x: 1, y: 0, color: RED },
        { x: 2, y: 4, color: BLUE },
      ]);

      const region = rig.domain.pixelDirty;
      expect(region?.layerId).toBe("layer-1");
      expect(region?.cells).toHaveLength(3);
      expect(keys(region?.cells ?? [])).toEqual(["0,0", "1,0", "2,4"]);
    });

    it("OBSERVED: does NOT filter same-colour writes — they appear in the region", () => {
      // `setPixels` has no same-colour early return (`PixelStore.ts` pins this
      // as observed legacy behaviour, deliberately NOT unified with
      // `setPixel`). The region therefore reports cells whose colour did not
      // actually change. Asserting the OBSERVED behaviour, not the desired
      // one — a consumer repainting them is correct-but-redundant, never
      // wrong.
      rig.pixels.setPixel(2, 2, RED);
      rig.pixels.setPixels([{ x: 2, y: 2, color: RED }]);

      expect(rig.domain.pixelDirty?.cells).toEqual([{ x: 2, y: 2 }]);
    });

    it("collapses a cell written twice in one batch into one entry", () => {
      // `setPixels` keeps ONE patch per cell (later writes win), so the
      // region must not list the cell twice either.
      rig.pixels.setPixels([
        { x: 4, y: 4, color: RED },
        { x: 4, y: 4, color: BLUE },
      ]);

      expect(rig.domain.pixelDirty?.cells).toEqual([{ x: 4, y: 4 }]);
    });
  });

  /* ══ 3. the no-op ═════════════════════════════════════════════════════ */

  describe("a no-op write publishes nothing", () => {
    it("setPixel on the colour it already has leaves the region untouched", () => {
      rig.pixels.setPixel(1, 1, RED);
      const version = rig.domain.pixelVersion;
      const region = rig.domain.pixelDirty;

      rig.pixels.setPixel(1, 1, RED); // the legacy same-colour early return

      // Neither channel moved: no region, no bump. `commitCells` is never
      // reached, so there is nothing to publish.
      expect(rig.domain.pixelDirty).toBe(region);
      expect(rig.domain.pixelVersion).toBe(version);
    });

    it("an out-of-bounds setPixel leaves the region untouched", () => {
      rig.pixels.setPixel(1, 1, RED);
      const region = rig.domain.pixelDirty;

      rig.pixels.setPixel(999, 999, BLUE);

      expect(rig.domain.pixelDirty).toBe(region);
    });
  });

  /* ══ 4 & 5. THE D8 REGRESSION — replay publishes, the bump does not ══ */

  describe("undo/redo — D8", () => {
    it("UNDO publishes a region even though pixelVersion does not change", () => {
      rig.pixels.setPixel(7, 2, RED);
      const versionAfterWrite = rig.domain.pixelVersion;

      // Clear the channel so a stale region cannot pass this test.
      runInAction(() => rig.domain.setPixelDirty(null));

      rig.history.undo();

      // ⚠️ THIS IS THE POINT OF THE WHOLE TASK. `publishAndBump` returns
      // early during a replay, so the SAVE trigger is silent — but the
      // canvas must still be told which cells to repaint, or the undone
      // pixel stays on screen.
      expect(rig.domain.pixelVersion).toBe(versionAfterWrite);
      expect(rig.domain.pixelDirty).not.toBeNull();
      expect(rig.domain.pixelDirty?.layerId).toBe("layer-1");
      expect(rig.domain.pixelDirty?.cells).toEqual([{ x: 7, y: 2 }]);
      // And the grid really did revert — the region describes a real change.
      expect(rig.layer().pixels[2][7].color).toBe(0);
    });

    it("REDO publishes a region even though pixelVersion does not change", () => {
      rig.pixels.setPixel(7, 2, RED);
      rig.history.undo();
      const versionAfterUndo = rig.domain.pixelVersion;

      runInAction(() => rig.domain.setPixelDirty(null));

      rig.history.redo();

      expect(rig.domain.pixelVersion).toBe(versionAfterUndo);
      expect(rig.domain.pixelDirty?.layerId).toBe("layer-1");
      expect(rig.domain.pixelDirty?.cells).toEqual([{ x: 7, y: 2 }]);
      expect(rig.layer().pixels[2][7].color).toEqual(RED);
    });

    it("undo of a multi-cell stroke names every cell of the stroke", () => {
      rig.history.beginTransaction("Draw");
      rig.pixels.setPixel(0, 0, RED);
      rig.pixels.setPixel(1, 0, RED);
      rig.pixels.setPixel(2, 0, RED);
      rig.history.endTransaction();

      runInAction(() => rig.domain.setPixelDirty(null));
      rig.history.undo();

      expect(keys(rig.domain.pixelDirty?.cells ?? [])).toEqual([
        "0,0",
        "1,0",
        "2,0",
      ]);
    });
  });

  /* ══ 6. the paths that cannot describe themselves ═════════════════════ */

  describe("a path that cannot name its cells publishes null", () => {
    it("a flip replaces the grid wholesale and publishes null", () => {
      rig.pixels.setPixel(0, 0, RED);
      expect(rig.domain.pixelDirty).not.toBeNull();

      rig.pixels.flipHorizontal();

      // R6: `flipInto` writes a transformed grid; there are no patches to
      // name and every cell may have moved. `null` = repaint everything, the
      // correct-but-slow default.
      expect(rig.domain.pixelDirty).toBeNull();
    });

    it("the empty-patch lighting path clears a stale region", () => {
      rig.pixels.setPixel(0, 0, RED);
      expect(rig.domain.pixelDirty).not.toBeNull();

      // Heights on an EMPTY grid: every target cell is transparent, so the
      // colour guard drops every patch and `commitLighting` takes its
      // publish-anyway branch. It must not leave the previous write's region
      // standing.
      rig.pixels.setHeightPixels([{ x: 5, y: 5, height: 42 }]);

      expect(rig.domain.pixelDirty).toBeNull();
    });
  });

  /* ══ R2 — the region must never be deep-observed ══════════════════════ */

  it("the published cells array is a RAW array, not a MobX proxy", () => {
    rig.pixels.setPixels([
      { x: 0, y: 0, color: RED },
      { x: 1, y: 1, color: RED },
    ]);

    const cells = rig.domain.pixelDirty?.cells;
    // `observableRef` stores the region by reference. If this ever becomes
    // `observable`, MobX proxies one entry per changed cell — the same
    // modelling error as deep-observing a pixel grid, at stroke frequency.
    expect(Array.isArray(cells)).toBe(true);
    expect(cells?.[0]).toEqual({ x: 0, y: 0 });
    expect(Object.getPrototypeOf(cells?.[0] as object)).toBe(Object.prototype);
  });
});
