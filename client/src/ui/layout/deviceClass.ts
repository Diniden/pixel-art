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
