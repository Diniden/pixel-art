/**
 * GlobalHotkeys — the window-level keydown handler, headless (REFRESH task 37).
 *
 * Transcribed from `App.tsx:132-193`. It renders `null`; its entire output is
 * an effect. It lives in `containers/` and not in `ui/` for one reason: it
 * calls three store actions, and `ui/` may not touch a store.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE ESCAPE PRECEDENCE MATRIX — THREE HANDLERS, ONE KEY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Escape is claimed by three independent listeners. They do not conflict, and
 * the reason they do not is phase and target, not luck:
 *
 * | Handler | Attached to | Phase | Fires when |
 * | --- | --- | --- | --- |
 * | `Modal` primitive (task 19) | the modal's own node | bubble | a modal is open |
 * | `useCanvasKeyboard` (task 31) | `window` | **capture** | canvas has focus |
 * | this file | `window` | bubble | always |
 *
 * `useCanvasKeyboard`'s capture-phase listener runs FIRST and applies the
 * 3-level precedence (clear the in-progress shape → clear the selection → do
 * nothing), calling `stopPropagation()` when it consumes the key. This
 * bubble-phase handler then never sees it. When the canvas does not consume
 * Escape, this handler clears `colorAdjustment`.
 *
 * With a modal open, the modal's own Escape closes it and neither of the other
 * two runs, because focus is inside the modal and the canvas handler
 * early-returns on a non-canvas target.
 *
 * ⚠️ This ordering is NOT automatable here — it depends on real focus and real
 * event phases in a real browser. It is manual check 4 in the task 37 spec and
 * is reported as NOT PERFORMED.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE TYPING GUARD IS DUPLICATED ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Both backquote branches re-test `HTMLInputElement` / `HTMLTextAreaElement` /
 * `isContentEditable`, exactly as `App.tsx` did. Hoisting it above the Escape
 * branch would CHANGE BEHAVIOUR: Escape currently clears `colorAdjustment`
 * even while the caret is in a text field, and that is the legacy contract.
 * The duplication is transcribed, not tidied.
 *
 * The `X` swap branch (plan 09 task 11) makes it three call sites of the same
 * guard, for the same reason: typing an `x` into the colour picker's hex field
 * or a layer-rename box must insert a character, not swap the colours. It is
 * placed with the backquote branches, on the guarded side of that asymmetry.
 * In brush mode the same branch swaps `brushUI`'s edge/fill DELTAS instead
 * (brush follow-ups task 07, MASTER D11) — see the note on the branch.
 *
 * ── Why the stores, not the bridge ────────────────────────────────────────
 *
 * `App.tsx` read all five members off the legacy Zustand hook. All five have MobX
 * owners now — `ToolUIStore.colorAdjustment` / `.setColorAdjustment`,
 * `ViewportUIStore.toggleFocusMode`, `LightingUIStore.studioMode` /
 * `.setStudioMode` — so this container reads them directly and the bridge is
 * not involved.
 *
 * ⚠️ `setStudioMode` is a COUPLED write: `LightingUIStore.setStudioMode` also
 * rewrites `selectedTool`. That coupling is the store's, and calling the store
 * action (rather than reproducing the two halves here) is what keeps it
 * single-sourced.
 */
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "../stores/context";
import { usePencilDoubleTap } from "../ui/hooks/usePencilDoubleTap";

/** True when the keystroke belongs to a text field, not to the app. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export const GlobalHotkeys = observer(function GlobalHotkeys() {
  const app = useStores();
  const { ui, lightingUI } = app;
  const { tool, viewport } = ui;

  // `colorAdjustment` is read during render so `observer()` tracks it and the
  // effect below re-subscribes with a fresh closure when it appears or clears
  // — the same dependency `App.tsx:188` listed.
  const hasColorAdjustment = tool.colorAdjustment !== null;
  const studioMode = lightingUI.studioMode;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasColorAdjustment) {
        e.preventDefault();
        tool.setColorAdjustment(null);
      }

      // Shift + ` toggles pixel <-> lighting. Per brush-studio MASTER D22 the
      // hotkey does NOT reach "brush" (that mode is entered only from the
      // toolbar button); from brush it goes to PIXEL, never to lighting by
      // accident — hence `=== "pixel"`, not `=== "lighting"`.
      if (
        e.code === "Backquote" &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (isTypingTarget(e.target)) return;

        e.preventDefault();
        lightingUI.setStudioMode(studioMode === "pixel" ? "lighting" : "pixel");
        return;
      }

      /* ── X swaps the edge and fill colours (plan 09 task 11) ────────────
         `X` is the paint-application convention (Photoshop, Krita, Aseprite,
         GIMP all bind it) and nothing else in the app claims it: it is absent
         from `useCanvasKeyboard`'s `TOOL_HOTKEYS` and from both branches
         below.

         ⚠️ SUPPRESSED WHILE A TEXT FIELD HAS FOCUS, using this file's own
         `isTypingTarget` guard — the same one both backquote branches use.
         Without it, typing an `x` into the hex field or a layer-rename box
         would swap the colours instead of inserting a character. The guard
         deliberately does NOT extend to the Escape branch above; that
         asymmetry is the transcribed legacy contract, documented in the
         header.

         ⚠️ Bare `x` only. A modified `X` is left alone so Cmd/Ctrl+X still
         cuts and Alt+X reaches the browser. Shift is not tested, so a
         capital `X` from Caps Lock or a held Shift also swaps — matching how
         the tool hotkeys list `g`/`G`, `r`/`R` in both cases.

         ⚠️ ONE undo step. `swapEdgeAndFillColors` snapshots once before it
         mutates; do not bracket this with another `saveStateToHistory`.

         ── Brush mode swaps the DELTAS instead (follow-ups task 07, D11) ──
         The brush studio's twin of the edge/fill pair is `brushUI`'s
         `selectedDelta` / `fillDelta`, and the pixel studio's colours are not
         on screen there, so `X` exchanges the deltas and leaves `ui.tool`
         alone. `swapDeltas` takes NO history snapshot — the deltas are UI
         state, not undoable (brush-studio D17) — and must not be given one
         here. The guard and `preventDefault` are shared by both branches;
         only the store action differs. Lighting mode keeps the colour swap:
         the colour picker is still the panel there. */
      if (
        (e.key === "x" || e.key === "X") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (isTypingTarget(e.target)) return;

        e.preventDefault();
        if (studioMode === "brush") app.brushUI.swapDeltas();
        else app.swapEdgeAndFillColors();
        return;
      }

      // ` to toggle focus mode (hide left + bottom panels)
      if (
        (e.code === "Backquote" || e.key === "`") &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (isTypingTarget(e.target)) return;

        e.preventDefault();
        viewport.toggleFocusMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasColorAdjustment, studioMode, tool, viewport, lightingUI, app]);

  /**
   * The Apple Pencil double-tap, forwarded by the companion app.
   *
   * ⚠️ It lives beside the keyboard shortcuts because it IS one: a global
   * input gesture with no owning component. WebKit exposes no such event to
   * JavaScript — see `usePencilDoubleTap`'s header — so this fires only
   * inside `ios-companion`, and the toolbar's swap button remains the route
   * everywhere else.
   */
  usePencilDoubleTap(() => tool.swapTools());

  return null;
});
