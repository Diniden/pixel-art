/**
 * useSuppressBrowserZoom — kill iOS page zoom everywhere, app-wide.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS IS HALF OF A TWO-PART FIX. THE OTHER HALF IS CSS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `styles/reset.css` sets `touch-action: none` on `html, body, #root` inside
 * `@media (pointer: coarse)`. That is not redundant with this file and this
 * file is not redundant with it. The rule is already written down in this
 * repo, at `ui/hooks/useCanvasViewport.ts:519-618`, for the canvas's own
 * pinch listener:
 *
 *   "`touch-action: none` in the CSS stops the browser claiming the gesture
 *    before the listener runs; this listener stops it claiming it afterwards.
 *    Both are needed — neither alone is sufficient on iOS."
 *
 * Ship one without the other and it will look correct in Chrome DevTools'
 * device emulation and fail on the actual iPad.
 *
 * ── Why `{ passive: false }` on every touch binding ───────────────────────
 *
 * React attaches touch handlers PASSIVELY, so `e.preventDefault()` inside a
 * synthetic `onTouchMove` is a no-op in Safari — it does not throw, it does
 * not warn, it simply does nothing. A non-passive NATIVE listener is the only
 * way to claim the gesture. That is why this is a hook binding to `document`
 * rather than props on a component, and it is also why there is no synthetic
 * option for `gesturestart` at all: React has no such event.
 *
 * ── The four things that zoom an iPad page ────────────────────────────────
 *
 *  1. `gesturestart`/`gesturechange`/`gestureend` — Safari's own non-standard
 *     pinch events. `preventDefault()` on these is THE standard iOS
 *     page-pinch suppression, and they exist on no other engine.
 *  2. A multi-touch `touchmove`. Belt to `gesturestart`'s braces: WKWebView
 *     does not always deliver the gesture events, and a two-finger move that
 *     nothing claims is a page pinch. Single-touch moves are deliberately
 *     untouched — that is drawing, scrolling, and every drag in the app.
 *  3. `dblclick`, which iOS synthesises after a double-tap.
 *  4. The double-tap itself, which zooms BEFORE any `dblclick` is
 *     synthesised. Only a `touchend`-to-`touchend` interval measured by hand
 *     catches it.
 *
 * ── What this deliberately does NOT do ────────────────────────────────────
 *
 * The editor's own canvas zoom is untouched. `.canvas__viewport` carries its
 * own `touch-action: none` (`CanvasSurface.css:43`) and its own non-passive
 * pinch listener (`useCanvasViewport.ts:519-618`), which calls
 * `preventDefault()` on the two-finger `touchstart`/`touchmove` first — this
 * document-level listener runs in the bubble phase, after it, and only ever
 * ADDS a `preventDefault` that the canvas already applied. Suppressing the
 * browser's zoom is not the same as suppressing the app's, and the canvas
 * keeps `viewZoom` exactly as it is today.
 *
 * `ui/` boundary: DOM only. No store, no API, no MobX.
 */
import { useEffect } from "react";

/**
 * Two `touchend`s closer together than this are a double-tap.
 *
 * iOS's own double-tap-to-zoom threshold is ~300 ms and is not exposed, so
 * this matches the platform convention rather than deriving anything.
 */
const DOUBLE_TAP_MS = 300;

/**
 * Bind the suppression to `document`; returns the matching unbind.
 *
 * Exported as a plain function, not only as a hook, because the app's single
 * mount point is `main.tsx` — which has no component of its own and must not
 * grow one: `react-refresh/only-export-components` errors on a component in a
 * file with no exports, and the entry module deliberately exports nothing.
 * `main.tsx` calls this directly as a top-level side effect, alongside
 * `initTheme()`, and never unbinds — the listeners live as long as the
 * document does, which is exactly the intended lifetime.
 */
export function bindBrowserZoomSuppression(): () => void {
  // Safari's pinch events. Non-standard, absent from the TS DOM lib, and
  // the reason this module exists at all — typed as `Event` because that is
  // genuinely all we need from them.
  const onGesture = (e: Event) => e.preventDefault();

  // ⚠️ ONLY multi-touch. A one-finger `touchmove` is a stroke, a pan, a
  // slider drag or a rail scroll; claiming those here would break the
  // entire app rather than just its zoom.
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  };

  const onDoubleClick = (e: MouseEvent) => e.preventDefault();

  // The double-tap guard. `dblclick` alone is too late: iOS zooms on the
  // second tap and only afterwards synthesises the mouse event.
  let lastTouchEnd = 0;
  const onTouchEnd = (e: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= DOUBLE_TAP_MS) e.preventDefault();
    lastTouchEnd = now;
  };

  // `{ passive: false }` on every touch binding — see the header. Without
  // it each `preventDefault` above is silently discarded by Safari.
  const opts: AddEventListenerOptions = { passive: false };
  document.addEventListener("gesturestart", onGesture, opts);
  document.addEventListener("gesturechange", onGesture, opts);
  document.addEventListener("gestureend", onGesture, opts);
  document.addEventListener("touchmove", onTouchMove, opts);
  document.addEventListener("touchend", onTouchEnd, opts);
  document.addEventListener("dblclick", onDoubleClick, opts);

  return () => {
    document.removeEventListener("gesturestart", onGesture, opts);
    document.removeEventListener("gesturechange", onGesture, opts);
    document.removeEventListener("gestureend", onGesture, opts);
    document.removeEventListener("touchmove", onTouchMove, opts);
    document.removeEventListener("touchend", onTouchEnd, opts);
    document.removeEventListener("dblclick", onDoubleClick, opts);
  };
}

/**
 * Suppress every browser-level zoom gesture for the lifetime of the caller.
 *
 * Takes no arguments and returns nothing. The React-facing form, for any
 * component that wants the suppression scoped to its own mount; the app
 * itself binds once at startup through `bindBrowserZoomSuppression`.
 */
export function useSuppressBrowserZoom(): void {
  useEffect(() => bindBrowserZoomSuppression(), []);
}
