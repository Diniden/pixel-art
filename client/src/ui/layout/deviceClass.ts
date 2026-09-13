/**
 * deviceClass — which KIND of device is looking at the project.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A CLASS AND NOT A DEVICE ID (owner decision)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The layout is persisted per device INSIDE the project, so a laptop and an
 * iPad opening the same project each get the arrangement that suits their
 * screen. The key could have been a random per-browser id in localStorage;
 * the owner chose a device CLASS instead, and the trade is deliberate:
 *
 *  - a class survives a cleared cache, a new browser, and a second laptop —
 *    all of which would read as a brand-new device under a random id, and
 *    would silently reset the user's layout to defaults;
 *  - it keeps the persisted record to at most THREE entries, whatever the
 *    number of machines. A random id grows without bound inside a project
 *    file that is already 1.1 MB of real work;
 *  - the cost, stated plainly: two different laptops cannot hold different
 *    layouts. That is the intended behaviour here, not a limitation to work
 *    around.
 *
 * ── The classification, and why it is measured this way ───────────────────
 *
 * Touch capability alone is wrong: touch-screen laptops are common and want
 * the desktop layout. Width alone is wrong too: an iPad Pro in landscape is
 * as wide as a small laptop. The test is therefore BOTH — a device is a
 * tablet or phone only when it is primarily touch-driven (`pointer: coarse`,
 * i.e. no precise pointer) AND narrow enough to need it.
 *
 * `matchMedia` is absent under jsdom in some suites and in non-browser
 * contexts, so every branch is guarded and falls back to `"desktop"` — the
 * historical layout, which is always a safe answer.
 *
 * `ui/` boundary: DOM only. No store, no API, no MobX.
 */

/** The three device classes a layout can be stored against. */
export const DEVICE_CLASSES = ["desktop", "tablet", "phone"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export function isDeviceClass(value: unknown): value is DeviceClass {
  return (DEVICE_CLASSES as readonly unknown[]).includes(value);
}

/** Breakpoints, in CSS px of the SHORT edge — orientation must not reclassify. */
const PHONE_MAX_SHORT_EDGE = 480;
const TABLET_MAX_SHORT_EDGE = 900;

/**
 * Classify the current device.
 *
 * ⚠️ The short edge, not `innerWidth`. Rotating an iPad must not move it
 * between classes — that would swap the user's layout mid-session and, worse,
 * write the tablet's arrangement into the phone's slot.
 */
export function detectDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "desktop";

  // A precise pointer (mouse/trackpad/stylus-with-hover) means desktop,
  // however narrow the window — a resized browser is not a phone.
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return "desktop";

  const shortEdge = Math.min(
    window.screen?.width || window.innerWidth || 0,
    window.screen?.height || window.innerHeight || 0,
  );
  if (shortEdge <= 0) return "desktop";
  if (shortEdge <= PHONE_MAX_SHORT_EDGE) return "phone";
  if (shortEdge <= TABLET_MAX_SHORT_EDGE) return "tablet";
  return "desktop";
}

/* ── Orientation: the SECOND dimension of the layout key ──────────────────
 *
 * An iPad held in portrait and the same iPad held in landscape want
 * genuinely different rail arrangements — a rail that reads as a comfortable
 * side column at 1024 px wide is half the screen at 768 px. Before this,
 * both orientations shared ONE saved record, so arranging the rails in
 * landscape destroyed the portrait arrangement and vice versa.
 *
 * ⚠️ This is deliberately NOT folded into `detectDeviceClass` above.
 * Rotating an iPad must not move it between device classes — that is the
 * whole reason the classification measures the SHORT edge — so orientation
 * is added as a separate dimension of the layout key rather than as a
 * redefinition of the first. `detectDeviceClass` is unchanged.
 */

/** Which way round the device is being held. */
export type Orientation = "portrait" | "landscape";

/** The media query the store listens to. Exported so the two agree. */
export const PORTRAIT_QUERY = "(orientation: portrait)";

/**
 * Which way round the viewport currently is.
 *
 * `matchMedia` first, because it is the value the CSS media queries in
 * `OtherHand.css`, `CanvasSplit.css` and `Header.css` already act on — the
 * layout key and the stylesheet must never disagree about the orientation.
 * `innerWidth`/`innerHeight` is the fallback for jsdom and other non-browser
 * contexts where `matchMedia` is absent, and a square or unmeasurable
 * viewport answers "landscape", the historical single-record orientation.
 */
export function detectOrientation(): Orientation {
  if (typeof window === "undefined") return "landscape";
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(PORTRAIT_QUERY).matches ? "portrait" : "landscape";
  }
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  return h > w ? "portrait" : "landscape";
}

/**
 * The `railLayouts` / key under which THIS device's arrangement is stored.
 *
 * ⚠️ DESKTOP KEEPS ITS BARE `"desktop"` KEY, and that asymmetry is the
 * point. A desktop window is freely resizable and "portrait" means nothing
 * there — dragging a window taller than it is wide would otherwise swap the
 * user's whole layout out from under them. Keeping `"desktop"` unchanged
 * also means no desktop user's already-saved layout moves to a new key.
 *
 * Tablets and phones get `` `${deviceClass}:${orientation}` `` — a device
 * whose orientation is a physical fact about how it is being held, and whose
 * two orientations really are two different screens.
 *
 * No new WIRE key: `railLayouts` has always been `{ [key: string]: … }`, so
 * this enriches the map's keys and changes nothing about the format's shape.
 * An untouched project still has `railLayouts === {}` and still emits no key
 * at all.
 */
export function layoutKey(
  deviceClass: DeviceClass,
  orientation: Orientation,
): string {
  if (deviceClass === "desktop") return deviceClass;
  return `${deviceClass}:${orientation}`;
}
