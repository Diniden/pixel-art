/**
 * brushCommands unit suite (Brush Studio task 07; multi-brush task 07).
 *
 * Pure command objects against fake hosts — no store, no MobX, no network.
 * The store-side round trip (record → undo → redo through `BrushStore`) is
 * covered by `stores/domain/__tests__/BrushStore.test.ts`.
 *
 * Documents are brush-2 projects (`{ version, brushes: Brush[] }`); a
 * structural edit to "the" brush is `{ ...doc, brushes: [{ ...doc.brushes[0],
 * … }] }` — the spine copy every store write path performs.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createBrushPixelCommand,
  createBrushSnapshotCommand,
  estimateBrushBytes,
  isBrushPixelCommand,
  type BrushPatch,
  type BrushPatchHost,
  type BrushSnapshotHost,
} from "@/stores/history/brushCommands";
import { HistoryStore } from "@/stores/history/HistoryStore";
import {
  createBrush,
  createBrushDocument,
  createBrushLayer,
  type Brush,
  type BrushDocument,
} from "@/types";

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** A host over a single mutable slot — what `BrushStore` does with `document`. */
function makeSnapshotHost(initial: BrushDocument | null) {
  let live = initial;
  const restore = vi.fn((doc: BrushDocument) => {
    live = doc;
  });
  const host: BrushSnapshotHost = { current: () => live, restore };
  return {
    host,
    restore,
    get live() {
      return live;
    },
  };
}

/** Spine-copy `doc` with its first brush replaced by `patch(brushes[0])`. */
function withFirstBrush(
  doc: BrushDocument,
  patch: (brush: Brush) => Brush,
): BrushDocument {
  return {
    ...doc,
    brushes: [patch(doc.brushes[0]), ...doc.brushes.slice(1)],
  };
}

const TARGET = {
  brushId: "brush-1",
  frameId: "frame-1",
  layerId: "layer-1",
} as const;

/* ── the snapshot family ─────────────────────────────────────────────────── */

describe("createBrushSnapshotCommand", () => {
  it("undo restores `before` and redo restores the document live at undo time", () => {
    const before = createBrushDocument(4, 4);
    const after = withFirstBrush(before, (b) => ({ ...b, width: 8 }));
    const rig = makeSnapshotHost(after);
    const command = createBrushSnapshotCommand({
      label: "Resize",
      before,
      host: rig.host,
    });

    expect(command.kind).toBe("brush-snapshot");
    expect(command.label).toBe("Resize");
    expect(command.before).toBe(before);

    command.undo();
    expect(rig.live).toBe(before);

    command.redo();
    expect(rig.live).toBe(after);

    // A second cycle round-trips the SAME references — nothing is cloned.
    command.undo();
    expect(rig.live).toBe(before);
    command.redo();
    expect(rig.live).toBe(after);
    expect(rig.restore).toHaveBeenCalledTimes(4);
  });

  it("redo before any undo is a no-op (nothing captured yet)", () => {
    const before = createBrushDocument();
    const rig = makeSnapshotHost(before);
    const command = createBrushSnapshotCommand({
      label: "x",
      before,
      host: rig.host,
    });
    command.redo();
    expect(rig.restore).not.toHaveBeenCalled();
  });

  it("undo with no live document still restores `before`; redo then stays a no-op", () => {
    const before = createBrushDocument();
    const rig = makeSnapshotHost(null);
    const command = createBrushSnapshotCommand({
      label: "x",
      before,
      host: rig.host,
    });
    command.undo();
    expect(rig.live).toBe(before);
    rig.restore.mockClear();
    command.redo();
    expect(rig.restore).not.toHaveBeenCalled();
  });

  it("charges estimateBrushBytes(before) against the budget", () => {
    const before = createBrushDocument(16, 16);
    const command = createBrushSnapshotCommand({
      label: "x",
      before,
      host: makeSnapshotHost(before).host,
    });
    expect(command.bytes).toBe(estimateBrushBytes(before));
  });

  it("round-trips through a real HistoryStore", () => {
    const history = new HistoryStore();
    const v0 = createBrushDocument(2, 2);
    const v1 = withFirstBrush(v0, (b) => ({ ...b, width: 3 }));
    const v2 = withFirstBrush(v1, (b) => ({ ...b, width: 4 }));
    const rig = makeSnapshotHost(v0);

    // Two edits, each recorded BEFORE its mutation is applied.
    history.record(
      createBrushSnapshotCommand({ label: "a", before: v0, host: rig.host }),
    );
    rig.host.restore(v1);
    history.record(
      createBrushSnapshotCommand({ label: "b", before: v1, host: rig.host }),
    );
    rig.host.restore(v2);

    history.undo();
    expect(rig.live).toBe(v1);
    history.undo();
    expect(rig.live).toBe(v0);
    history.redo();
    expect(rig.live).toBe(v1);
    history.redo();
    expect(rig.live).toBe(v2);
  });
});

describe("estimateBrushBytes", () => {
  it("is positive for the smallest document", () => {
    expect(estimateBrushBytes(createBrushDocument(1, 1))).toBeGreaterThan(0);
  });

  it("scales with frames × layers × width × height and never walks cells", () => {
    const one = createBrushDocument(4, 4); // 1 brush, 1 frame, 1 layer, 16 cells
    const base = estimateBrushBytes(one);
    const frame0 = one.brushes[0].frames[0];

    const twoLayers = withFirstBrush(one, (b) => ({
      ...b,
      frames: [
        {
          ...frame0,
          layers: [
            ...frame0.layers,
            createBrushLayer("layer-2", "Layer 2", 4, 4),
          ],
        },
      ],
    }));
    const twoFrames = withFirstBrush(one, (b) => ({
      ...b,
      frames: [frame0, { ...frame0, id: "frame-2" }],
    }));
    const bigger = withFirstBrush(one, (b) => ({ ...b, width: 8, height: 8 }));

    const perLayer = base - 256;
    expect(estimateBrushBytes(twoLayers)).toBe(256 + 2 * perLayer);
    expect(estimateBrushBytes(twoFrames)).toBe(256 + 2 * perLayer);
    expect(estimateBrushBytes(bigger)).toBe(256 + 4 * perLayer);

    // Cell CONTENT is irrelevant — the estimate reads width/height, not grids.
    const painted = withFirstBrush(one, (b) => ({
      ...b,
      frames: [
        {
          ...frame0,
          layers: [
            {
              ...frame0.layers[0],
              pixels: frame0.layers[0].pixels.map((row) =>
                row.map((): [number, number, number, number] => [1, 2, 3, 4]),
              ),
            },
          ],
        },
      ],
    }));
    expect(estimateBrushBytes(painted)).toBe(base);
  });

  it("sums every brush by its OWN width × height × layers (multi-brush D7)", () => {
    // Brush A: 4×4, 1 frame × 2 layers → 16 × 2 = 32 cells.
    const a = createBrush("brush-a", "A", 4, 4);
    const aFrame = a.frames[0];
    const brushA: Brush = {
      ...a,
      frames: [
        {
          ...aFrame,
          layers: [
            ...aFrame.layers,
            createBrushLayer("layer-2", "Layer 2", 4, 4),
          ],
        },
      ],
    };
    // Brush B: 2×2, 3 frames × 1 layer → 4 × 3 = 12 cells.
    const b = createBrush("brush-b", "B", 2, 2);
    const bFrame = b.frames[0];
    const brushB: Brush = {
      ...b,
      frames: [
        bFrame,
        { ...bFrame, id: "frame-2" },
        { ...bFrame, id: "frame-3" },
      ],
    };
    const doc: BrushDocument = {
      ...createBrushDocument(1, 1),
      brushes: [brushA, brushB],
    };

    // (32 + 12) cells × BYTES_PER_BRUSH_CELL (10) + BYTES_SNAPSHOT_BASE (256).
    expect(estimateBrushBytes(doc)).toBe((32 + 12) * 10 + 256);
    expect(estimateBrushBytes(doc)).toBe(696);

    // The sum is order-independent and equals the per-brush parts minus the
    // base counted once.
    const onlyA: BrushDocument = { ...doc, brushes: [brushA] };
    const onlyB: BrushDocument = { ...doc, brushes: [brushB] };
    expect(estimateBrushBytes({ ...doc, brushes: [brushB, brushA] })).toBe(696);
    expect(estimateBrushBytes(onlyA) + estimateBrushBytes(onlyB) - 256).toBe(
      696,
    );
  });
});

/* ── the inverse-patch family ────────────────────────────────────────────── */

describe("createBrushPixelCommand", () => {
  const cells: BrushPatch[] = [
    { x: 0, y: 0, before: 0, after: [10, 0, 0, 0] },
    { x: 1, y: 0, before: [1, 1, 1, 1], after: [20, 0, 0, 0] },
    // The same cell revisited — its FIRST `before` must win on undo.
    { x: 0, y: 0, before: [10, 0, 0, 0], after: [30, 0, 0, 0] },
  ];

  function makePatchHost() {
    const applyPatch = vi.fn<BrushPatchHost["applyPatch"]>();
    return { host: { applyPatch }, applyPatch };
  }

  it("carries its kind, target and cells", () => {
    const { host } = makePatchHost();
    const command = createBrushPixelCommand({
      label: "Draw",
      target: TARGET,
      cells,
      host,
    });
    expect(command.kind).toBe("brush-pixel");
    expect(isBrushPixelCommand(command)).toBe(true);
    expect(command.label).toBe("Draw");
    expect(command.target).toEqual(TARGET);
    expect(command.cells).toEqual(cells);
  });

  it("undo hands the host the cells in REVERSE order with direction 'undo'", () => {
    const { host, applyPatch } = makePatchHost();
    createBrushPixelCommand({
      label: "Draw",
      target: TARGET,
      cells,
      host,
    }).undo();

    expect(applyPatch).toHaveBeenCalledTimes(1);
    const [target, applied, direction] = applyPatch.mock.calls[0];
    expect(target).toEqual(TARGET);
    expect(target.brushId).toBe("brush-1");
    expect(direction).toBe("undo");
    expect(applied.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [1, 0],
      [0, 0],
    ]);
    // Reversed: the last write of the revisited cell comes first, so a
    // forward walk by the host ends on the FIRST recorded `before` (0).
    expect(applied[0].before).toEqual([10, 0, 0, 0]);
    expect(applied[2].before).toBe(0);
  });

  it("redo hands the host the cells FORWARD with direction 'redo'", () => {
    const { host, applyPatch } = makePatchHost();
    createBrushPixelCommand({
      label: "Draw",
      target: TARGET,
      cells,
      host,
    }).redo();

    const [target, applied, direction] = applyPatch.mock.calls[0];
    expect(target).toEqual(TARGET);
    expect(target.brushId).toBe("brush-1");
    expect(direction).toBe("redo");
    expect(applied).toEqual(cells);
  });

  it("passes the brush id through to the host unchanged in BOTH directions", () => {
    const { host, applyPatch } = makePatchHost();
    const target = {
      brushId: "brush-second",
      frameId: "frame-1",
      layerId: "layer-1",
    };
    const command = createBrushPixelCommand({
      label: "Draw",
      target,
      cells,
      host,
    });
    expect(command.target.brushId).toBe("brush-second");

    command.undo();
    command.redo();
    expect(applyPatch).toHaveBeenCalledTimes(2);
    const [undoTarget, , undoDirection] = applyPatch.mock.calls[0];
    const [redoTarget, , redoDirection] = applyPatch.mock.calls[1];
    expect(undoDirection).toBe("undo");
    expect(redoDirection).toBe("redo");
    expect(undoTarget.brushId).toBe("brush-second");
    expect(redoTarget.brushId).toBe("brush-second");
    // The same target object each time — frame and layer ids ride along, and
    // two brushes sharing "frame-1"/"layer-1" are told apart by brushId alone.
    expect(undoTarget).toBe(target);
    expect(redoTarget).toBe(target);
  });

  it("copies the cells so the caller's working buffer cannot alter it later", () => {
    const { host, applyPatch } = makePatchHost();
    const buffer: BrushPatch[] = [
      { x: 0, y: 0, before: 0, after: [1, 2, 3, 4] },
    ];
    const command = createBrushPixelCommand({
      label: "Draw",
      target: TARGET,
      cells: buffer,
      host,
    });
    buffer.push({ x: 5, y: 5, before: 0, after: [9, 9, 9, 9] });
    (buffer[0].after as [number, number, number, number])[0] = 99;

    command.redo();
    const [, applied] = applyPatch.mock.calls[0];
    expect(applied).toHaveLength(1);
    expect(applied[0].after).toEqual([1, 2, 3, 4]);
  });

  it("bytes is positive and linear in the cell count", () => {
    const { host } = makePatchHost();
    const make = (n: number) =>
      createBrushPixelCommand({
        label: "Draw",
        target: TARGET,
        cells: Array.from({ length: n }, (_, i) => ({
          x: i,
          y: 0,
          before: 0 as const,
          after: [i, 0, 0, 0] as [number, number, number, number],
        })),
        host,
      }).bytes;

    expect(make(0)).toBeGreaterThan(0);
    const step = make(1) - make(0);
    expect(step).toBeGreaterThan(0);
    expect(make(50) - make(0)).toBe(50 * step);
    expect(make(50)).toBe(50 * 40 + 128);
  });
});
