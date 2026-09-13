/**
 * pointerDevice — is this a touch device?
 *
 * Used to decide two things about Pencil-only input (2026-08-31):
 *
 *   1. whether to OFFER the toggle at all — the owner asked for a button on
 *      the iPad, and a mouse-only desktop has no stylus for it to mean
 *      anything about;
 *   2. what it DEFAULTS to when a project carries no stored preference — ON
 *      where there is a touch screen, which is the "selected by default" in
 *      the request.
 *
 * ⚠️ WHY THE DEFAULT IS RESOLVED HERE AND NOT IN THE WIRE FORMAT. `pencilOnly`
 * is stored per PROJECT, so it follows the artwork to every device. Baking a
 * `true` default into the schema would therefore switch it on for a desktop
 * that has no stylus at all, where `touchType` is never reported and every
 * contact reads as a finger — silently disabling drawing entirely. Keeping the
 * stored value tri-state (`undefined` = "the file says nothing") and resolving
 * the default against the actual device avoids that.
 *
 * ⚠️ Feature detection, never a user-agent string. `matchMedia("(pointer:
 * coarse)")` asks the question that actually matters — "is the primary input a
 * finger?" — and an iPad reports true for it. `maxTouchPoints` is the fallback
 * for anything without `matchMedia`.
 *
 * `ui/` boundary: DOM only. No store, no MobX.
 */

/**
 * True when the primary pointer is a finger — an iPad, a phone, a touch
 * laptop in tablet mode.
 *
 * Answers `false` in a non-DOM environment (SSR, a bare unit test), which is
 * the safe direction: it means "do not assume a stylus", so nothing is
 * disabled by accident.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;

  if (typeof window.matchMedia === "function") {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      // jsdom implements `matchMedia` incompletely in some versions; fall
      // through to the touch-point count rather than throwing during a render.
    }
  }

  return typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
}
