/**
 * brushCommands unit suite (Brush Studio task 07).
 *
 * Pure command objects against fake hosts — no store, no MobX, no network.
 * The store-side round trip (record → undo → redo through `BrushStore`) is
 * covered by `stores/domain/__tests__/BrushStore.test.ts`.
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
  createBrushDocument,
  createBrushLayer,
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

const TARGET = { frameId: "frame-1", layerId: "layer-1" } as const;

/* ── the snapshot family ─────────────────────────────────────────────────── */

describe("createBrushSnapshotCommand", () => {
  it("undo restores `before` and redo restores the document live at undo time", () => {
    const before = createBrushDocument(4, 4);
    const after: BrushDocument = { ...before, width: 8 };
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
    const v1: BrushDocument = { ...v0, width: 3 };
    const v2: BrushDocument = { ...v1, width: 4 };
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
    const one = createBrushDocument(4, 4); // 1 frame, 1 layer, 16 cells
    const base = estimateBrushBytes(one);

    const twoLayers: BrushDocument = {
      ...one,
      frames: [
        {
          ...one.frames[0],
          layers: [
            ...one.frames[0].layers,
            createBrushLayer("layer-2", "Layer 2", 4, 4),
          ],
        },
      ],
    };
    const twoFrames: BrushDocument = {
      ...one,
      frames: [one.frames[0], { ...one.frames[0], id: "frame-2" }],
    };
    const bigger: BrushDocument = { ...one, width: 8, height: 8 };

    const perLayer = base - 256;
    expect(estimateBrushBytes(twoLayers)).toBe(256 + 2 * perLayer);
    expect(estimateBrushBytes(twoFrames)).toBe(256 + 2 * perLayer);
    expect(estimateBrushBytes(bigger)).toBe(256 + 4 * perLayer);

    // Cell CONTENT is irrelevant — the estimate reads width/height, not grids.
    const painted: BrushDocument = {
      ...one,
      frames: [
        {
          ...one.frames[0],
          layers: [
            {
              ...one.frames[0].layers[0],
              pixels: one.frames[0].layers[0].pixels.map((row) =>
                row.map((): [number, number, number, number] => [1, 2, 3, 4]),
              ),
            },
          ],
        },
      ],
    };
    expect(estimateBrushBytes(painted)).toBe(base);
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

    const [, applied, direction] = applyPatch.mock.calls[0];
    expect(direction).toBe("redo");
    expect(applied).toEqual(cells);
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
