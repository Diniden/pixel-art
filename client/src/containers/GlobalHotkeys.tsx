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
 * ── Why the stores, not the bridge ────────────────────────────────────────
 *
 * `App.tsx` read all five members off `useEditorStore()`. All five have MobX
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

/** True when the keystroke belongs to a text field, not to the app. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export const GlobalHotkeys = observer(function GlobalHotkeys() {
  const { ui, lightingUI } = useStores();
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

      // Shift + ` to cycle studio modes
      if (
        e.code === "Backquote" &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (isTypingTarget(e.target)) return;

        e.preventDefault();
        lightingUI.setStudioMode(studioMode === "lighting" ? "pixel" : "lighting");
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
  }, [hasColorAdjustment, studioMode, tool, viewport, lightingUI]);

  return null;
});
