/**
 * `useCanvasKeyboard` — the Escape-reaches-dialog fix and the three precedence
 * orderings (task 31).
 *
 * ## The bug being fixed
 *
 * `Canvas.tsx:1310` registered its keydown handler in CAPTURE phase. With a
 * selection active, Escape hit `clearSelection()` + `stopPropagation()` before
 * the event could descend to an open dialog, so the dialog could not be closed
 * with Escape. The fix is one guard at the top of the handler, keyed on the
 * `aria-modal="true"` every W12 primitive already sets.
 *
 * ## Probe discipline
 *
 * Per the W3 lesson that "a rule matching nothing looks exactly like a rule that
 * passes", the starred test below is paired with a probe: it asserts BOTH that
 * the dialog case is now yielded AND that the identical canvas-origin case is
 * still handled. A guard that simply disabled Escape everywhere would pass the
 * first assertion and fail the second.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleCanvasKeyDown,
  isFromDialog,
  TOOL_HOTKEYS,
  wasdDelta,
  arrowDelta,
} from "../useCanvasKeyboard";
import type { CanvasKeyboardOptions } from "../useCanvasKeyboard";

function makeOptions(
  over: Partial<CanvasKeyboardOptions> = {},
): CanvasKeyboardOptions {
  return {
    currentTool: "pixel",
    hasSelection: false,
    selectionBehavior: "movePixels",
    isReferenceTraceActive: false,
    frameTraceActive: false,
    editingVariant: false,
    traceNudgeAmount: 10,
    borderRadius: 0,
    undo: vi.fn(),
    deleteSelectionPixels: vi.fn(),
    deleteSelectedFrame: vi.fn(),
    setTool: vi.fn(),
    clearSelection: vi.fn(),
    moveReferenceOverlay: vi.fn(),
    moveFrameOverlay: vi.fn(),
    setVariantOffset: vi.fn(),
    setBorderRadius: vi.fn(),
    moveSelection: vi.fn(),
    moveSelectedPixels: vi.fn(),
    moveLayerPixels: vi.fn(),
    setFrameTraceActive: vi.fn(),
    stepFrame: vi.fn(),
    ...over,
  };
}

/** A keydown event whose target is a real element in the document. */
function keyOn(target: Element, key: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperty(e, "target", { value: target, configurable: true });
  vi.spyOn(e, "stopPropagation");
  vi.spyOn(e, "preventDefault");
  return e;
}

let canvasEl: HTMLDivElement;
let dialogEl: HTMLDivElement;
let buttonInDialog: HTMLButtonElement;

beforeEach(() => {
  canvasEl = document.createElement("div");
  document.body.appendChild(canvasEl);

  // Exactly the shape the W12 `Modal` primitive renders.
  dialogEl = document.createElement("div");
  dialogEl.setAttribute("role", "dialog");
  dialogEl.setAttribute("aria-modal", "true");
  dialogEl.setAttribute("data-ui-dialog", "");
  buttonInDialog = document.createElement("button");
  dialogEl.appendChild(buttonInDialog);
  document.body.appendChild(dialogEl);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Escape reaches an open dialog (the W23 fix)", () => {
  it("⭐ Escape from inside a dialog is IGNORED by the canvas even with a selection active", () => {
    const o = makeOptions({ hasSelection: true });
    const e = keyOn(buttonInDialog, "Escape");

    handleCanvasKeyDown(e, o);

    // The canvas must not consume it...
    expect(o.clearSelection).not.toHaveBeenCalled();
    // ...and above all must not stop it reaching the dialog's own handler.
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("⭐ PROBE: the same Escape from the CANVAS still clears the selection", () => {
    // If this fails, the guard is over-broad — it disabled Escape rather than
    // yielding only to dialogs, and the test above would pass for a bad reason.
    const o = makeOptions({ hasSelection: true });
    const e = keyOn(canvasEl, "Escape");

    handleCanvasKeyDown(e, o);

    expect(o.clearSelection).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("yields on a nested element deep inside the dialog", () => {
    const nested = document.createElement("span");
    buttonInDialog.appendChild(nested);
    const o = makeOptions({ hasSelection: true });
    handleCanvasKeyDown(keyOn(nested, "Escape"), o);
    expect(o.clearSelection).not.toHaveBeenCalled();
  });

  it("yields the WHOLE keyboard map to a dialog, not just Escape", () => {
    const o = makeOptions();
    handleCanvasKeyDown(keyOn(buttonInDialog, "2"), o);
    handleCanvasKeyDown(keyOn(buttonInDialog, "ArrowUp"), o);
    handleCanvasKeyDown(keyOn(buttonInDialog, "."), o);
    expect(o.setTool).not.toHaveBeenCalled();
    expect(o.moveLayerPixels).not.toHaveBeenCalled();
    expect(o.stepFrame).not.toHaveBeenCalled();
  });

  it("a dialog without aria-modal does NOT capture the keyboard", () => {
    // Guards against yielding to any old container: only real modals count.
    const plain = document.createElement("div");
    document.body.appendChild(plain);
    expect(isFromDialog(plain)).toBe(false);
    const o = makeOptions({ hasSelection: true });
    handleCanvasKeyDown(keyOn(plain, "Escape"), o);
    expect(o.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("isFromDialog tolerates a null / non-element target", () => {
    expect(isFromDialog(null)).toBe(false);
    expect(isFromDialog(window as unknown as EventTarget)).toBe(false);
  });
});

describe("Escape — the three-level precedence, preserved", () => {
  it("level 1: selection wins over both trace modes", () => {
    const o = makeOptions({
      hasSelection: true,
      isReferenceTraceActive: true,
      frameTraceActive: true,
    });
    handleCanvasKeyDown(keyOn(canvasEl, "Escape"), o);
    expect(o.clearSelection).toHaveBeenCalledTimes(1);
    expect(o.setTool).not.toHaveBeenCalled();
    expect(o.setFrameTraceActive).not.toHaveBeenCalled();
  });

  it("level 2: reference trace wins over frame trace", () => {
    const o = makeOptions({
      isReferenceTraceActive: true,
      frameTraceActive: true,
    });
    handleCanvasKeyDown(keyOn(canvasEl, "Escape"), o);
    expect(o.setTool).toHaveBeenCalledWith("pixel");
    expect(o.setFrameTraceActive).not.toHaveBeenCalled();
  });

  it("level 3: frame trace is cleared when nothing else is active", () => {
    const o = makeOptions({ frameTraceActive: true });
    handleCanvasKeyDown(keyOn(canvasEl, "Escape"), o);
    expect(o.setFrameTraceActive).toHaveBeenCalledWith(false, null);
  });

  it("does nothing — and does NOT stop propagation — when no level applies", () => {
    const o = makeOptions();
    const e = keyOn(canvasEl, "Escape");
    handleCanvasKeyDown(e, o);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });
});

describe("WASD — reference-trace > frame-trace > variant", () => {
  it("reference trace wins over both others", () => {
    const o = makeOptions({
      isReferenceTraceActive: true,
      frameTraceActive: true,
      editingVariant: true,
    });
    handleCanvasKeyDown(keyOn(canvasEl, "w"), o);
    expect(o.moveReferenceOverlay).toHaveBeenCalledWith(0, -1);
    expect(o.moveFrameOverlay).not.toHaveBeenCalled();
    expect(o.setVariantOffset).not.toHaveBeenCalled();
  });

  it("frame trace wins over variant", () => {
    const o = makeOptions({ frameTraceActive: true, editingVariant: true });
    handleCanvasKeyDown(keyOn(canvasEl, "s"), o);
    expect(o.moveFrameOverlay).toHaveBeenCalledWith(0, 1);
    expect(o.setVariantOffset).not.toHaveBeenCalled();
  });

  it("variant offset applies only when neither trace is active", () => {
    const o = makeOptions({ editingVariant: true });
    handleCanvasKeyDown(keyOn(canvasEl, "d"), o);
    expect(o.setVariantOffset).toHaveBeenCalledWith(1, 0, false);
  });

  it("shift multiplies the trace nudge by traceNudgeAmount", () => {
    const o = makeOptions({
      isReferenceTraceActive: true,
      traceNudgeAmount: 10,
    });
    handleCanvasKeyDown(keyOn(canvasEl, "a", { shiftKey: true }), o);
    expect(o.moveReferenceOverlay).toHaveBeenCalledWith(-10, 0);
  });

  it("variant offset receives the shift FLAG, not a pre-multiplied step", () => {
    const o = makeOptions({ editingVariant: true, traceNudgeAmount: 10 });
    handleCanvasKeyDown(keyOn(canvasEl, "w", { shiftKey: true }), o);
    expect(o.setVariantOffset).toHaveBeenCalledWith(0, -1, true);
  });

  it("uppercase WASD works identically", () => {
    const o = makeOptions({ isReferenceTraceActive: true });
    handleCanvasKeyDown(keyOn(canvasEl, "W"), o);
    expect(o.moveReferenceOverlay).toHaveBeenCalledWith(0, -1);
  });

  it("does nothing when no mode is active", () => {
    const o = makeOptions();
    handleCanvasKeyDown(keyOn(canvasEl, "w"), o);
    expect(o.moveReferenceOverlay).not.toHaveBeenCalled();
    expect(o.moveFrameOverlay).not.toHaveBeenCalled();
    expect(o.setVariantOffset).not.toHaveBeenCalled();
  });

  it("wasdDelta maps all four directions", () => {
    expect(wasdDelta("w")).toEqual({ dx: 0, dy: -1 });
    expect(wasdDelta("s")).toEqual({ dx: 0, dy: 1 });
    expect(wasdDelta("a")).toEqual({ dx: -1, dy: 0 });
    expect(wasdDelta("d")).toEqual({ dx: 1, dy: 0 });
  });
});

describe("enabled gate — one keyboard owner (split-canvas task 04)", () => {
  it("enabled: false ignores WASD and ⌘Z", () => {
    const o = makeOptions({ enabled: false, editingVariant: true });
    const w = keyOn(canvasEl, "w");
    handleCanvasKeyDown(w, o);
    expect(o.setVariantOffset).not.toHaveBeenCalled();
    expect(w.preventDefault).not.toHaveBeenCalled();

    const z = keyOn(canvasEl, "z", { metaKey: true });
    handleCanvasKeyDown(z, o);
    expect(o.undo).not.toHaveBeenCalled();
    expect(z.preventDefault).not.toHaveBeenCalled();
  });

  it("enabled: false ignores tool hotkeys and Delete too", () => {
    const o = makeOptions({ enabled: false, hasSelection: true });
    handleCanvasKeyDown(keyOn(canvasEl, "1"), o);
    handleCanvasKeyDown(keyOn(canvasEl, "Delete"), o);
    expect(o.setTool).not.toHaveBeenCalled();
    expect(o.deleteSelectionPixels).not.toHaveBeenCalled();
  });

  it("enabled omitted (the default) still handles WASD and ⌘Z", () => {
    const o = makeOptions({ editingVariant: true });
    handleCanvasKeyDown(keyOn(canvasEl, "w"), o);
    expect(o.setVariantOffset).toHaveBeenCalledWith(0, -1, false);
    handleCanvasKeyDown(keyOn(canvasEl, "z", { metaKey: true }), o);
    expect(o.undo).toHaveBeenCalledTimes(1);
  });

  it("enabled: true behaves like the default", () => {
    const o = makeOptions({ enabled: true, editingVariant: true });
    handleCanvasKeyDown(keyOn(canvasEl, "d"), o);
    expect(o.setVariantOffset).toHaveBeenCalledWith(1, 0, false);
  });
});

describe("arrows — under each selectionBehavior", () => {
  it("moveSelection moves the mask", () => {
    const o = makeOptions({
      hasSelection: true,
      selectionBehavior: "moveSelection",
    });
    handleCanvasKeyDown(keyOn(canvasEl, "ArrowLeft"), o);
    expect(o.moveSelection).toHaveBeenCalledWith(-1, 0);
    expect(o.moveSelectedPixels).not.toHaveBeenCalled();
  });

  it("movePixels moves the selected pixels", () => {
    const o = makeOptions({
      hasSelection: true,
      selectionBehavior: "movePixels",
    });
    handleCanvasKeyDown(keyOn(canvasEl, "ArrowRight"), o);
    expect(o.moveSelectedPixels).toHaveBeenCalledWith(1, 0);
    expect(o.moveSelection).not.toHaveBeenCalled();
  });

  it("editMask does NOTHING — the accidental-move guard", () => {
    const o = makeOptions({
      hasSelection: true,
      selectionBehavior: "editMask",
    });
    handleCanvasKeyDown(keyOn(canvasEl, "ArrowUp"), o);
    expect(o.moveSelection).not.toHaveBeenCalled();
    expect(o.moveSelectedPixels).not.toHaveBeenCalled();
    expect(o.moveLayerPixels).not.toHaveBeenCalled();
  });

  it("with no selection, arrows move the whole layer", () => {
    const o = makeOptions({ hasSelection: false });
    handleCanvasKeyDown(keyOn(canvasEl, "ArrowDown"), o);
    expect(o.moveLayerPixels).toHaveBeenCalledWith(0, 1);
  });

  it("shift+arrow adjusts border radius for the rectangle tool", () => {
    const o = makeOptions({ currentTool: "rectangle", borderRadius: 3 });
    handleCanvasKeyDown(keyOn(canvasEl, "ArrowUp", { shiftKey: true }), o);
    expect(o.setBorderRadius).toHaveBeenCalledWith(4);
    handleCanvasKeyDown(keyOn(canvasEl, "ArrowDown", { shiftKey: true }), o);
    expect(o.setBorderRadius).toHaveBeenCalledWith(2);
    expect(o.moveLayerPixels).not.toHaveBeenCalled();
  });

  it("arrowDelta maps all four directions", () => {
    expect(arrowDelta("ArrowUp")).toEqual({ dx: 0, dy: -1 });
    expect(arrowDelta("ArrowDown")).toEqual({ dx: 0, dy: 1 });
    expect(arrowDelta("ArrowLeft")).toEqual({ dx: -1, dy: 0 });
    expect(arrowDelta("ArrowRight")).toEqual({ dx: 1, dy: 0 });
  });
});

describe("tool hotkeys", () => {
  it("maps all 12 tools", () => {
    // 12, not 13: `fill-square` ("Square Brush", key "4") was removed on
    // 2026-09-01 as a duplicate of the pencil's square shape setting. The
    // other digits were deliberately NOT renumbered, so "4" is simply absent.
    const tools = new Set(Object.values(TOOL_HOTKEYS));
    expect(tools.size).toBe(12);
  });

  it('"4" is unbound — the removed Square Brush left a deliberate gap', () => {
    expect(TOOL_HOTKEYS["4"]).toBeUndefined();
    const o = makeOptions();
    handleCanvasKeyDown(keyOn(canvasEl, "4"), o);
    expect(o.setTool).not.toHaveBeenCalled();
  });

  for (const [key, tool] of Object.entries(TOOL_HOTKEYS)) {
    it(`"${key}" selects ${tool}`, () => {
      const o = makeOptions();
      handleCanvasKeyDown(keyOn(canvasEl, key), o);
      expect(o.setTool).toHaveBeenCalledWith(tool);
    });
  }

  it("clears the selection when switching AWAY from the selection tool", () => {
    const o = makeOptions({ currentTool: "selection" });
    handleCanvasKeyDown(keyOn(canvasEl, "1"), o);
    expect(o.clearSelection).toHaveBeenCalledTimes(1);
    expect(o.setTool).toHaveBeenCalledWith("pixel");
  });

  it("does NOT clear when re-selecting the selection tool", () => {
    const o = makeOptions({ currentTool: "selection" });
    handleCanvasKeyDown(keyOn(canvasEl, "0"), o);
    expect(o.clearSelection).not.toHaveBeenCalled();
  });
});

describe("other keys", () => {
  it("cmd/ctrl+z undoes", () => {
    const o = makeOptions();
    handleCanvasKeyDown(keyOn(canvasEl, "z", { metaKey: true }), o);
    expect(o.undo).toHaveBeenCalledTimes(1);
    handleCanvasKeyDown(keyOn(canvasEl, "z", { ctrlKey: true }), o);
    expect(o.undo).toHaveBeenCalledTimes(2);
  });

  it("Delete removes selection pixels when a selection exists, else the frame", () => {
    const withSel = makeOptions({ hasSelection: true });
    handleCanvasKeyDown(keyOn(canvasEl, "Delete"), withSel);
    expect(withSel.deleteSelectionPixels).toHaveBeenCalledTimes(1);
    expect(withSel.deleteSelectedFrame).not.toHaveBeenCalled();

    const noSel = makeOptions({ hasSelection: false });
    handleCanvasKeyDown(keyOn(canvasEl, "Backspace"), noSel);
    expect(noSel.deleteSelectedFrame).toHaveBeenCalledTimes(1);
  });

  it(". and , step frames forward and back", () => {
    const o = makeOptions();
    handleCanvasKeyDown(keyOn(canvasEl, "."), o);
    expect(o.stepFrame).toHaveBeenCalledWith(1);
    handleCanvasKeyDown(keyOn(canvasEl, ","), o);
    expect(o.stepFrame).toHaveBeenCalledWith(-1);
  });

  it("ignores keys typed into an input or textarea", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    const o = makeOptions({ hasSelection: true });
    handleCanvasKeyDown(keyOn(input, "1"), o);
    handleCanvasKeyDown(keyOn(textarea, "Escape"), o);
    expect(o.setTool).not.toHaveBeenCalled();
    expect(o.clearSelection).not.toHaveBeenCalled();
  });
});
