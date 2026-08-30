/**
 * usePencilHover — the Apple Pencil's HOVER position, bridged from the
 * companion app.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WEBKIT DOES NOT GIVE A WEBVIEW USABLE PENCIL HOVER. THIS IS THE
 *     SAME PROBLEM AS `usePencilDoubleTap`, AND THE SAME ANSWER.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * An Apple Pencil reports its position while the tip is still ABOVE the
 * glass. Native UIKit surfaces that through `UIHoverGestureRecognizer`. A page
 * inside a `WKWebView` does not reliably receive it as a
 * `pointerover`/`pointermove` with `pointerType === "pen"` — so an editor
 * loaded in the companion app cannot see the pencil approach, and no amount of
 * pointer-event handling in the page changes that.
 *
 * ── ⚠️ HOVER IS HARDWARE-GATED, AND MOST HARDWARE DOES NOT HAVE IT ────────
 *
 * If the marker never appears on an iPad, check the hardware BEFORE the code.
 * Pencil hover needs an **M2-or-later iPad Pro / iPad Air** with an **Apple
 * Pencil (2nd gen), Pencil Pro, or Pencil (USB-C)**, "Show Effects when using
 * Pencil" enabled in Settings, and the tip within ~1 cm of the glass. On any
 * other combination the companion app delivers nothing, and this hook is
 * correctly silent.
 *
 * The misleading part, measured on the owner's hardware (2026-08-28): with
 * unsupported hardware you see nothing on hover but a ONE-FRAME marker after
 * a tap-and-release. That is not this hook half-working — it is the
 * `pointermove` Safari synthesises at touch-end reaching the mouse path in
 * `CanvasContainer`. Do not read that flicker as evidence the bridge is
 * nearly working; on unsupported hardware it is the ONLY thing you will
 * ever see.
 *
 * `ios-companion` owns its webview, so it can attach the recogniser and
 * forward each hover sample into the page. This hook is the receiving end.
 *
 * ── The wire ──────────────────────────────────────────────────────────────
 *
 * The companion dispatches
 *
 *     window.dispatchEvent(new CustomEvent("pencil:hover", {
 *       detail: { phase: "move" | "end", x, y }
 *     }))
 *
 * where `x`/`y` are CLIENT coordinates in CSS pixels — the same space a
 * `MouseEvent.clientX` is in, so consumers can hand them to the existing
 * `getPixelCoords` without a second mapping. `phase: "end"` carries no
 * coordinates and means the pencil left hover range.
 *
 * A `CustomEvent` on `window` rather than a `window.webkit` message handler in
 * the other direction, for the reasons `usePencilDoubleTap` documents:
 * several consumers can listen without coordinating, nothing has to be
 * registered before the webview loads, and a page opened in a plain browser
 * simply never receives one.
 *
 * ── Degradation is a REQUIREMENT ──────────────────────────────────────────
 *
 * The same build runs on desktop, in Safari, and in the companion app. Only
 * the last delivers this event, so the hover MARKER must also be driven by
 * ordinary mouse movement — `CanvasContainer` does exactly that, and this hook
 * is purely additive on top of it. A build that never receives a
 * `pencil:hover` loses nothing it had.
 *
 * ── Why the payload is validated ──────────────────────────────────────────
 *
 * `CustomEvent.detail` is `any`, and the producer is a separate codebase in a
 * different language shipped on its own release cycle. An older companion
 * against a newer editor (or the reverse) must degrade to "no hover", never to
 * `NaN` coordinates painting a marker at the top-left corner forever. So the
 * detail is shape-checked before it reaches the callback.
 *
 * `ui/` boundary: DOM only. No store, no MobX.
 */
import { useEffect, useRef } from "react";

/** The event the companion app dispatches into the page. */
export const PENCIL_HOVER_EVENT = "pencil:hover";

/** A hover sample, in client (CSS pixel) coordinates. */
export interface PencilHoverSample {
  x: number;
  y: number;
}

/**
 * What the page does with a sample: a position, or `null` when the pencil has
 * left hover range.
 */
export type PencilHoverHandler = (sample: PencilHoverSample | null) => void;

/**
 * Narrow a `CustomEvent.detail` to a sample, or `null` for "hover ended".
 *
 * Returns `undefined` for a payload this build does not understand, which the
 * caller drops. Exported for the unit test — the failure this guards against
 * (a version-skewed companion) cannot be reproduced from the web side.
 */
export function parseHoverDetail(
  detail: unknown,
): PencilHoverSample | null | undefined {
  if (typeof detail !== "object" || detail === null) return undefined;

  const d = detail as { phase?: unknown; x?: unknown; y?: unknown };
  if (d.phase === "end") return null;
  if (d.phase !== "move") return undefined;

  // `Number.isFinite` rather than `typeof === "number"`: NaN and Infinity are
  // both numbers and both paint a marker nowhere useful.
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return undefined;
  return { x: d.x as number, y: d.y as number };
}

/**
 * Subscribe to bridged Apple Pencil hover samples.
 *
 * @param onHover Called with a client-space position, or `null` when hover
 *                ends. Read through a ref, so an inline arrow at the call site
 *                does not re-bind the listener on every render.
 */
export function usePencilHover(onHover: PencilHoverHandler): void {
  const callbackRef = useRef(onHover);
  useEffect(() => {
    callbackRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    const handler = (event: Event) => {
      const sample = parseHoverDetail((event as CustomEvent).detail);
      if (sample === undefined) return;
      callbackRef.current(sample);
    };
    window.addEventListener(PENCIL_HOVER_EVENT, handler);
    return () => window.removeEventListener(PENCIL_HOVER_EVENT, handler);
  }, []);
}
