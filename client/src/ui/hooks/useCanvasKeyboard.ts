/**
 * The canvas keyboard map — tool hotkeys, WASD nudging, arrows, Escape, and
 * frame navigation.
 *
 * ## 🔴 The Escape bug this hook fixes
 *
 * The legacy handler registered with `useCapture = true` and, with a selection
 * active, called `stopPropagation()` on Escape. Capture phase runs from the
 * window DOWN to the target, so this fired **before any modal could see the
 * key** — a dialog opened while a canvas selection existed could not be closed
 * with Escape. W12 measured this and built the fix into the primitives: every
 * dialog carries `aria-modal="true"` and a `data-ui-dialog` marker, so the guard
 * is a single `closest()` test, applied at the very top of the handler.
 *
 * The guard tests the EVENT TARGET, not focus, and that distinction matters: a
 * dialog can be open while focus sits on the body, in which case the canvas
 * should still receive the key. Only a keystroke that actually originated inside
 * a dialog is yielded.
 *
 * ## ⚠️ `useCapture = true` is load-bearing — preserved
 *
 * Capture phase orders this handler ahead of `FrameTimeline.tsx`'s Escape
 * handling and `App.tsx`'s window-level keydown. Task 31's constraints call it
 * out explicitly. It is unchanged; only the dialog guard is new.
 *
 * ## The three precedence orderings, all preserved verbatim
 *
 * 1. **WASD** — reference-trace > frame-trace > variant offset. Each branch
 *    returns, so an active reference trace consumes the key and the frame-trace
 *    and variant branches never see it.
 * 2. **Escape** — selection > reference-trace > frame-trace, three levels, each
 *    `preventDefault()` + `stopPropagation()` + return.
 * 3. **Arrows** — under all three `selectionBehavior` values: `moveSelection`
 *    moves the mask, `movePixels` moves the pixels, `editMask` does nothing.
 *    With no selection at all, arrows move the whole layer.
 *
 * ## Purity
 *
 * No store, no MobX, no API. Every action is a callback and every mode flag is
 * a plain value, supplied by the caller.
 */

import { useEffect, useRef } from "react";

/** Tools reachable from the keyboard. A subset of the 16-member `Tool` union. */
export type HotkeyTool =
  | "pixel"
  | "eraser"
  | "eyedropper"
  | "fill-square"
  | "flood-fill"
  | "gaussian-fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "move"
  | "selection"
  | "origin";

/**
 * The 12 tool hotkeys, exported so a test can assert the map rather than
 * re-typing it. `g`/`G` and `o`/`O` are listed in both cases because the
 * lookup is by raw `e.key`, which is case-sensitive.
 */
export const TOOL_HOTKEYS: Readonly<Record<string, HotkeyTool>> = {
  "1": "pixel",
  "2": "eraser",
  "3": "eyedropper",
  "4": "fill-square",
  "5": "flood-fill",
  "6": "line",
  "7": "rectangle",
  "8": "ellipse",
  "9": "move",
  "0": "selection",
  g: "gaussian-fill",
  G: "gaussian-fill",
  o: "origin",
  O: "origin",
};

const WASD_KEYS = ["w", "a", "s", "d", "W", "A", "S", "D"];
const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

/**
 * True when the event came from inside an open dialog.
 *
 * Relies on the `aria-modal="true"` every W12 primitive sets. `closest` is
 * feature-tested because the target may be `window`, a text node, or (in older
 * jsdom) an element without it.
 */
export function isFromDialog(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.('[aria-modal="true"]'));
}

/** True when the event came from a text-entry control. */
function isFromTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}

export interface CanvasKeyboardOptions {
  /* — mode flags — */
  currentTool: string;
  hasSelection: boolean;
  selectionBehavior: "moveSelection" | "movePixels" | "editMask" | string;
  isReferenceTraceActive: boolean;
  frameTraceActive: boolean;
  editingVariant: boolean;
  /** Nudge distance for shift+WASD while tracing. */
  traceNudgeAmount: number;
  borderRadius: number;

  /* — actions — */
  undo: () => void;
  deleteSelectionPixels: () => void;
  deleteSelectedFrame: () => void;
  setTool: (tool: HotkeyTool) => void;
  clearSelection: () => void;
  moveReferenceOverlay: (dx: number, dy: number) => void;
  moveFrameOverlay: (dx: number, dy: number) => void;
  setVariantOffset: (dx: number, dy: number, large: boolean) => void;
  setBorderRadius: (value: number) => void;
  moveSelection: (dx: number, dy: number) => void;
  moveSelectedPixels: (dx: number, dy: number) => void;
  moveLayerPixels: (dx: number, dy: number) => void;
  /**
   * Exit frame-trace mode. The second argument is the frame INDEX, not an id —
   * verified against `Canvas.tsx`'s call site, which passes `null` here.
   */
  setFrameTraceActive: (active: boolean, frameIndex: number | null) => void;
  /** Step frames. `delta` is +1 for `.` and -1 for `,`. */
  stepFrame: (delta: number) => void;
}

/** Direction for a WASD key. Exported for testing. */
export function wasdDelta(key: string): { dx: number; dy: number } {
  const k = key.toLowerCase();
  return {
    dx: k === "a" ? -1 : k === "d" ? 1 : 0,
    dy: k === "w" ? -1 : k === "s" ? 1 : 0,
  };
}

/** Direction for an arrow key. Exported for testing. */
export function arrowDelta(key: string): { dx: number; dy: number } {
  return {
    dx: key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0,
    dy: key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0,
  };
}

/**
 * The handler itself, exported so tests can drive it without mounting a
 * component. `useCanvasKeyboard` is a thin registration wrapper around it.
 */
export function handleCanvasKeyDown(
  e: KeyboardEvent,
  o: CanvasKeyboardOptions,
): void {
  // 🔴 THE ESCAPE FIX. Must be first: below this line the handler calls
  // `stopPropagation()`, which in capture phase would stop the key ever
  // reaching an open dialog. Yield the whole keyboard map to a dialog.
  if (isFromDialog(e.target)) return;

  // Ignore if user is typing in an input
  if (isFromTextEntry(e.target)) return;

  // Cmd/Ctrl + Z for undo
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    o.undo();
    return;
  }

  // Delete key to delete selected frame
  if (e.key === "Delete" || e.key === "Backspace") {
    // The original re-tested for an input here. `isFromTextEntry` above already
    // covers it; the check is kept so a textarea-only future change cannot
    // silently start deleting frames.
    if (!(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      if (o.hasSelection) {
        o.deleteSelectionPixels();
      } else {
        o.deleteSelectedFrame();
      }
      return;
    }
  }

  // Number keys 1-9,0 for tool selection, O for origin
  const hotkeyTool = TOOL_HOTKEYS[e.key];
  if (hotkeyTool) {
    e.preventDefault();
    // Clear selection when switching away from selection tool
    if (o.currentTool === "selection" && hotkeyTool !== "selection") {
      o.clearSelection();
    }
    o.setTool(hotkeyTool);
    return;
  }

  /* — WASD, three-way precedence: reference-trace > frame-trace > variant — */

  if (WASD_KEYS.includes(e.key)) {
    const { dx, dy } = wasdDelta(e.key);
    const step = e.shiftKey ? o.traceNudgeAmount : 1;

    if (o.isReferenceTraceActive) {
      e.preventDefault();
      o.moveReferenceOverlay(dx * step, dy * step);
      return;
    }
    if (o.frameTraceActive) {
      e.preventDefault();
      o.moveFrameOverlay(dx * step, dy * step);
      return;
    }
    if (o.editingVariant) {
      e.preventDefault();
      // NOTE: variant offset takes the shift flag itself rather than a
      // pre-multiplied step — its own action decides the large-step size.
      o.setVariantOffset(dx, dy, e.shiftKey);
      return;
    }
    // No mode active: fall through. The legacy code did the same, so WASD
    // remains free for anything registered further up the capture chain.
  }

  /* — arrows, under each selectionBehavior — */

  if (ARROW_KEYS.includes(e.key)) {
    e.preventDefault();

    // Shift + Arrow for rectangle border radius adjustment
    if (e.shiftKey && o.currentTool === "rectangle") {
      if (e.key === "ArrowUp") {
        o.setBorderRadius(o.borderRadius + 1);
      } else if (e.key === "ArrowDown") {
        o.setBorderRadius(o.borderRadius - 1);
      }
      return;
    }

    const { dx, dy } = arrowDelta(e.key);

    if (o.hasSelection) {
      if (o.selectionBehavior === "moveSelection") {
        o.moveSelection(dx, dy);
      } else if (o.selectionBehavior === "movePixels") {
        o.moveSelectedPixels(dx, dy);
      } else {
        // editMask: arrows do nothing (prevents accidental moves)
      }
    } else {
      // Otherwise move all layer pixels
      o.moveLayerPixels(dx, dy);
    }
    return;
  }

  /* — Escape, three levels — */

  // Selection always clears first when active. Only changes the tool; does not
  // affect variant editing mode. `stopPropagation` keeps FrameTimeline from
  // also handling the key when exiting trace mode.
  if (e.key === "Escape") {
    if (o.hasSelection) {
      e.preventDefault();
      e.stopPropagation();
      o.clearSelection();
      return;
    }
    if (o.isReferenceTraceActive) {
      e.preventDefault();
      e.stopPropagation();
      o.setTool("pixel");
      return;
    }
    if (o.frameTraceActive) {
      e.preventDefault();
      e.stopPropagation();
      o.setFrameTraceActive(false, null);
      return;
    }
    return;
  }

  /* — frame navigation — */

  if (e.key === "." || e.key === ",") {
    e.preventDefault();
    o.stepFrame(e.key === "." ? 1 : -1);
    return;
  }
}

/**
 * Register the canvas keyboard map on `window`.
 *
 * ⚠️ `useCapture = true` is deliberate and must stay — see the module comment.
 */
export function useCanvasKeyboard(options: CanvasKeyboardOptions): void {
  // Read through a ref so the listener is registered once rather than being
  // torn down and rebuilt on every render. The legacy effect had a 25-entry
  // dependency array and re-registered constantly; this is behaviour-preserving
  // because the handler only ever reads the options at event time.
  const optionsRef = useLatest(options);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) =>
      handleCanvasKeyDown(e, optionsRef.current);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [optionsRef]);
}

/**
 * Keep a mutable ref pointing at the latest value.
 *
 * The render-phase write is flagged by `react-hooks/refs` and is deliberate:
 * the keydown listener is registered ONCE in capture phase, and re-registering
 * it on every render (as the legacy 25-entry dependency array did) would change
 * its position in the capture order relative to the other window-level handlers
 * this hook is documented to sit ahead of. Reading options through a ref keeps
 * registration stable while the handler still sees current values.
 */
function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  // eslint-disable-next-line react-hooks/refs
  ref.current = value;
  return ref;
}
