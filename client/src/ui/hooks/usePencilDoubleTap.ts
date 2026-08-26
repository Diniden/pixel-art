/**
 * usePencilDoubleTap — the Apple Pencil double-tap, bridged from the
 * companion app.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WEBKIT DOES NOT EXPOSE THIS GESTURE TO JAVASCRIPT. AT ALL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no event, no `PointerEvent` field, and no permission to request.
 * Apple surfaces the double-tap only natively, through `UIPencilInteraction`
 * — so a page loaded in mobile Safari cannot see it, and no amount of
 * pointer-event cleverness will change that. Anyone revisiting this should
 * not go looking for the missing web API; it does not exist.
 *
 * What makes the feature possible here is that the iPad does not run the
 * editor in Safari: `ios-companion` loads it in a `WKWebView` that we own.
 * That app attaches a `UIPencilInteraction` and forwards each double-tap into
 * the page. This hook is the receiving end.
 *
 * ── The wire ──────────────────────────────────────────────────────────────
 *
 * The companion evaluates `window.dispatchEvent(new CustomEvent(
 * "pencil:doubletap"))` in the page. A DOM event rather than a global
 * callback, deliberately: several consumers can listen without coordinating,
 * nothing has to be registered before the webview loads, and a page opened in
 * a plain browser simply never receives one — which degrades to "the feature
 * is absent", not "the page is broken".
 *
 * ── Degradation is a REQUIREMENT, not a nicety ────────────────────────────
 *
 * The same build runs on desktop, in Safari, and in the companion app. Only
 * the last can deliver this event, so the swap must ALSO be reachable another
 * way — the toolbar's swap button and long-press exist for that reason, and
 * must not be removed on the grounds that "the Pencil does it".
 *
 * `ui/` boundary: DOM only. No store, no MobX.
 */
import { useEffect, useRef } from "react";

/** The event the companion app dispatches into the page. */
export const PENCIL_DOUBLE_TAP_EVENT = "pencil:doubletap";

export function usePencilDoubleTap(onDoubleTap: () => void): void {
  // Read through a ref so an inline arrow from the caller does not re-bind
  // the listener on every render.
  const callbackRef = useRef(onDoubleTap);
  useEffect(() => {
    callbackRef.current = onDoubleTap;
  }, [onDoubleTap]);

  useEffect(() => {
    const handler = () => callbackRef.current();
    window.addEventListener(PENCIL_DOUBLE_TAP_EVENT, handler);
    return () => window.removeEventListener(PENCIL_DOUBLE_TAP_EVENT, handler);
  }, []);
}
