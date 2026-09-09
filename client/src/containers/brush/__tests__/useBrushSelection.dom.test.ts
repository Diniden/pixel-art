/**
 * `useBrushSelection` — the brush canvas's selection state hook (Brush
 * Studio task 21).
 *
 * The pure maths and the store round trips are in `brushSelection.test.ts`;
 * these tests pin what only the HOOK owns: the mask as React state that
 * resets when the document identity or the grid size changes, the Escape /
 * Delete / Backspace keys and their guards, the stable facade over the
 * gesture (an open drag survives the re-render its own preview causes), and
 * the derived chrome. Every store effect is a spy — no store, no canvas.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBrushSelection } from "../useBrushSelection";
import type { BrushSelectionArgs } from "../useBrushSelection";
import { maskToCells, packCell } from "../brushSelection";
import type { BrushCell } from "../../../types";

const GRID: BrushCell[][] = [
  [[1, 2, 3, 4], 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

function makeArgs(
  overrides: Partial<BrushSelectionArgs> = {},
): BrushSelectionArgs {
  return {
    resetKey: 1,
    width: 4,
    height: 4,
    channelType: "rgb",
    pixelVersion: 0,
    enabled: true,
    overlayCanvasRef: { current: null },
    readGrid: () => GRID,
    beginGesture: vi.fn(),
    writeMove: vi.fn(),
    clearCells: vi.fn(),
    ...overrides,
  };
}

function mount(overrides: Partial<BrushSelectionArgs> = {}) {
  const args = makeArgs(overrides);
  const hook = renderHook(
    (props: BrushSelectionArgs) => useBrushSelection(props),
    {
      initialProps: args,
    },
  );
  /** A rect drag from `a` to `b`, released. */
  const selectRect = (a: [number, number], b: [number, number]) => {
    act(() => hook.result.current.controller.down({ x: a[0], y: a[1] }));
    act(() => hook.result.current.controller.move({ x: b[0], y: b[1] }));
    act(() => hook.result.current.controller.end());
  };
  return { args, selectRect, ...hook };
}

const cells = (mask: ReadonlySet<number> | null) =>
  mask
    ? maskToCells(mask, 4)
        .map((c) => `${c.x},${c.y}`)
        .sort()
    : null;

const keydown = (key: string, target: EventTarget = window) => {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
};

describe("the rect gesture through the facade", () => {
  it("⭐ starts empty; a drag previews the rubber band and commits the mask on release", () => {
    const { result, args } = mount();
    expect(result.current.mask).toBeNull();
    expect(result.current.hasChrome).toBe(false);
    expect(result.current.marchingAnts).toBeNull();
    expect(result.current.writeOptions).toEqual({});

    act(() => result.current.controller.down({ x: 1, y: 1 }));
    expect(args.beginGesture).toHaveBeenCalledWith({ x: 1, y: 1 });
    expect(result.current.controller.isActive).toBe(true);
    expect(result.current.previewRect).toEqual({
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
    // The preview's own re-render must NOT have dropped the open gesture.
    act(() => result.current.controller.move({ x: 2, y: 2 }));
    expect(result.current.controller.isActive).toBe(true);
    expect(result.current.previewRect).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
    expect(result.current.hasChrome).toBe(true);
    expect(result.current.mask).toBeNull();

    act(() => result.current.controller.end());
    expect(result.current.controller.isActive).toBe(false);
    expect(result.current.previewRect).toBeNull();
    expect(cells(result.current.mask)).toEqual(["1,1", "1,2", "2,1", "2,2"]);
    expect(result.current.bounds).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(result.current.writeOptions).toEqual({
      mask: result.current.mask,
      maskSize: { width: 4, height: 4 },
    });
    expect(result.current.marchingAnts).not.toBeNull();
  });

  it("a rect entirely off the grid clears the selection", () => {
    const { result, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    expect(result.current.mask).not.toBeNull();
    selectRect([7, 7], [9, 9]);
    expect(result.current.mask).toBeNull();
  });

  it("end(false) abandons the drag without touching the previous mask", () => {
    const { result, selectRect } = mount();
    selectRect([0, 0], [0, 0]);
    // Press OUTSIDE the mask → a rect drag; abort it.
    act(() => result.current.controller.down({ x: 3, y: 3 }));
    act(() => result.current.controller.end(false));
    expect(cells(result.current.mask)).toEqual(["0,0"]);
    expect(result.current.previewRect).toBeNull();
  });
});

describe("the move gesture", () => {
  it("⭐ a drag inside the mask previews the vector, then writes ONCE and shifts the mask", () => {
    const { result, args, selectRect } = mount();
    selectRect([0, 0], [1, 1]);

    act(() => result.current.controller.down({ x: 0, y: 0 }));
    expect(result.current.dragOffset).toEqual({ dx: 0, dy: 0 });
    act(() => result.current.controller.move({ x: 1, y: 0 }));
    act(() => result.current.controller.move({ x: 2, y: 1 }));
    expect(result.current.dragOffset).toEqual({ dx: 2, dy: 1 });
    expect(args.writeMove).not.toHaveBeenCalled();
    expect(cells(result.current.mask)).toEqual(["0,0", "0,1", "1,0", "1,1"]);

    act(() => result.current.controller.end());
    expect(args.writeMove).toHaveBeenCalledTimes(1);
    const { clears, writes } = (args.writeMove as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    // 4 clears + 4 in-bounds destinations; (0,0)'s tuple moves to (2,1).
    expect(clears).toHaveLength(4);
    expect(writes).toHaveLength(4);
    expect(writes[0]).toEqual({ x: 2, y: 1, value: [1, 2, 3, 4] });
    expect(result.current.dragOffset).toBeNull();
    expect(cells(result.current.mask)).toEqual(["2,1", "2,2", "3,1", "3,2"]);
  });

  it("a move with no net vector writes nothing", () => {
    const { result, args, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    act(() => result.current.controller.down({ x: 1, y: 1 }));
    act(() => result.current.controller.move({ x: 2, y: 2 }));
    act(() => result.current.controller.move({ x: 1, y: 1 }));
    act(() => result.current.controller.end());
    expect(args.writeMove).not.toHaveBeenCalled();
    expect(cells(result.current.mask)).toEqual(["0,0", "0,1", "1,0", "1,1"]);
  });
});

describe("reset on document identity / size", () => {
  it("⭐ a new resetKey (brush switch, reload) drops the mask", () => {
    const { result, rerender, args, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    expect(result.current.mask).not.toBeNull();
    rerender({ ...args, resetKey: 2 });
    expect(result.current.mask).toBeNull();
    expect(result.current.hasChrome).toBe(false);
  });

  it("a grid size change drops the mask (it would be expressed against the wrong width)", () => {
    const { result, rerender, args, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    rerender({ ...args, width: 8 });
    expect(result.current.mask).toBeNull();
  });

  it("an unrelated re-render keeps the mask", () => {
    const { result, rerender, args, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    rerender({ ...args, pixelVersion: 5, channelType: "hsl" });
    expect(cells(result.current.mask)).toEqual(["0,0", "0,1", "1,0", "1,1"]);
  });
});

describe("keys", () => {
  it("⭐ Escape clears the selection and is consumed", () => {
    const { result, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    const e = keydown("Escape");
    expect(result.current.mask).toBeNull();
    expect(e.defaultPrevented).toBe(true);
  });

  it("⭐ Delete and Backspace erase the selected cells and keep the selection", () => {
    const { result, args, selectRect } = mount();
    selectRect([0, 0], [1, 0]);
    keydown("Delete");
    expect(args.clearCells).toHaveBeenCalledTimes(1);
    expect(args.clearCells).toHaveBeenLastCalledWith([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    keydown("Backspace");
    expect(args.clearCells).toHaveBeenCalledTimes(2);
    expect(cells(result.current.mask)).toEqual(["0,0", "1,0"]);
  });

  it("with no selection the keys are untouched (a Delete elsewhere still works)", () => {
    const { args } = mount();
    const e = keydown("Delete");
    expect(args.clearCells).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("keys from a text input or an open dialog are ignored", () => {
    const { args, selectRect } = mount();
    selectRect([0, 0], [1, 1]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    keydown("Delete", input);
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    const inside = document.createElement("button");
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    keydown("Delete", inside);
    expect(args.clearCells).not.toHaveBeenCalled();
    input.remove();
    dialog.remove();
  });

  it("disabled (no document) binds nothing", () => {
    const { result, args, selectRect } = mount({ enabled: false });
    selectRect([0, 0], [1, 1]);
    keydown("Escape");
    expect(result.current.mask).not.toBeNull();
    keydown("Delete");
    expect(args.clearCells).not.toHaveBeenCalled();
  });

  it("⭐ enabled: false registers NO keydown listener at all (the non-owning pane, task 09); flipping it binds one", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const keydownBinds = () =>
      addSpy.mock.calls.filter(([type]) => type === "keydown").length;
    try {
      const { rerender, args, selectRect } = mount({ enabled: false });
      expect(keydownBinds()).toBe(0);
      // Gestures are untouched: a click in the non-owning pane still selects.
      selectRect([0, 0], [1, 1]);
      expect(keydownBinds()).toBe(0);

      rerender({ ...args, enabled: true });
      expect(keydownBinds()).toBe(1);
      keydown("Delete");
      expect(args.clearCells).toHaveBeenCalledTimes(1);

      // Losing ownership unbinds again.
      rerender({ ...args, enabled: false });
      expect(
        removeSpy.mock.calls.filter(([type]) => type === "keydown"),
      ).toHaveLength(1);
      keydown("Delete");
      expect(args.clearCells).toHaveBeenCalledTimes(1);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it("the listener is removed on unmount", () => {
    const { args, selectRect, unmount } = mount();
    selectRect([0, 0], [1, 1]);
    unmount();
    keydown("Delete");
    expect(args.clearCells).not.toHaveBeenCalled();
  });
});

describe("the derived chrome", () => {
  it("marchingAnts follows the preview while dragging, else the mask, shifted by a move", () => {
    const { result, selectRect } = mount();
    selectRect([1, 1], [2, 2]);
    const settled = result.current.marchingAnts!.outer.d;
    act(() => result.current.controller.down({ x: 1, y: 1 }));
    act(() => result.current.controller.move({ x: 2, y: 1 }));
    const dragging = result.current.marchingAnts!.outer.d;
    expect(dragging).not.toBe(settled);
    act(() => result.current.controller.end(false));
    expect(result.current.marchingAnts!.outer.d).toBe(settled);
  });

  it("writeOptions is the packed mask against the brush grid", () => {
    const { result, selectRect } = mount();
    selectRect([3, 0], [3, 0]);
    expect(result.current.writeOptions.mask?.has(packCell(3, 0, 4))).toBe(true);
    expect(result.current.writeOptions.maskSize).toEqual({
      width: 4,
      height: 4,
    });
  });
});
