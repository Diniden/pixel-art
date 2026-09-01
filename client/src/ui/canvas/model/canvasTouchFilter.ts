/**
 * WHICH touches count as part of a canvas gesture, and WHICH ONE draws.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ COUNTING CONTACTS IS NOT THE SAME AS COUNTING FINGERS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Two problems live here, and conflating them has broken drawing twice.
 *
 * ## 1. WHERE a touch is — the container filter
 *
 * `CanvasContainer`'s React handlers decide "is this a stroke?" and
 * `useCanvasViewport`'s native listener decides "is this a pinch?". They read
 * different events on different elements, so they must share one predicate or
 * they disagree and the stroke dies mid-slide.
 *
 * - `e.touches` is every touch on the PAGE — too WIDE. A thumb on a rail
 *   slider outside the canvas is not part of a canvas gesture.
 * - `e.targetTouches` is only touches targeting the `<canvas>` — too NARROW.
 *   The floating canvas controls render inside `canvas__viewport` but outside
 *   the `<canvas>`, so a finger there was invisible to the React handler yet
 *   counted as a pinch by the viewport listener.
 * - Touches inside the VIEWPORT container is correct. That is
 *   {@link touchesInContainer}.
 *
 * ## 2. WHAT a touch is — stylus vs finger
 *
 * ⚠️ **A PENCIL AND A RESTING FINGER ARE TWO CONTACTS BUT NOT A PINCH.**
 *
 * ## This became load-bearing only once the native fix landed
 *
 * Honest history, because it explains why this looks over-engineered for the
 * bug it is filed under. This distinction was FIRST written against a wrong
 * diagnosis of the 2026-08-28 "cannot draw while touching the screen" report.
 * That report's real cause was native: UIKit's
 * `requiresExclusiveTouchType` default meant the finger was never delivered to
 * the page at all, so no arbitration here could have mattered — measured, with
 * `touches.length` never exceeding 1.
 *
 * `ios-companion` now clears that flag (`WebView.swift`), and mixed contacts
 * genuinely arrive: **2,387 events carrying `stylus` and `direct` together**
 * in the confirming run. THAT is what makes this module necessary. Counting
 * raw contacts would now genuinely classify a Pencil-plus-finger as a pinch
 * and discard the stroke — the bug this was written to prevent has
 * become reachable, having previously been masked by the platform.
 *
 * A pinch is **two FINGERS**. A stroke is **one stylus, or one finger**. A
 * stylus plus any number of fingers is still a stroke by the stylus — that is
 * the whole point of drawing with your hand on the tablet, and it is what
 * "Other Hand Mode" is for.
 *
 * WebKit exposes `Touch.touchType === "stylus"`, which is how a Pencil is
 * identified. It is a non-standard extension absent from TypeScript's `Touch`,
 * so it is read defensively here — a browser that does not provide it reports
 * every touch as a finger, which degrades to the old count-everything
 * behaviour rather than breaking.
 *
 * Pure: no store, no MobX, no React.
 */

/** The parts of a touch this module needs. Structural, so tests pass literals. */
export interface FilterableTouch {
  target: unknown;
  /**
   * WebKit's `Touch.touchType`. Absent in every non-WebKit browser and in
   * TypeScript's DOM types, hence optional and `unknown`.
   */
  touchType?: unknown;
}

/** The part of the container this filter needs. */
export interface TouchContainer {
  contains: (node: never) => boolean;
}

/**
 * The touches that belong to a gesture on `container`.
 *
 * A touch counts when its target is inside the container — the viewport box,
 * NOT the transformed `<canvas>` within it.
 */
export function touchesInContainer<T extends FilterableTouch>(
  touches: ReadonlyArray<T>,
  container: TouchContainer | null,
): T[] {
  if (!container) return [...touches];
  return touches.filter((t) => container.contains(t.target as never));
}

/** True when the touch was made by an Apple Pencil. */
export function isStylus(touch: FilterableTouch): boolean {
  return touch.touchType === "stylus";
}

/**
 * The touches that count toward a PINCH, i.e. the fingers.
 *
 * A stylus is never part of a pinch: zooming with a Pencil and a finger is not
 * a gesture anyone makes, and treating it as one is what stopped the Pencil
 * drawing whenever a finger was down.
 */
export function pinchTouches<T extends FilterableTouch>(
  touches: ReadonlyArray<T>,
): T[] {
  return touches.filter((t) => !isStylus(t));
}

/**
 * The touch that should DRAW, or `null` when none should.
 *
 * The rule, in priority order:
 *
 * 1. **A stylus always wins.** If a Pencil is down it is the drawing contact,
 *    no matter how many fingers are also touching. This is the case that was
 *    broken: the fingers must not veto the Pencil.
 * 2. **Otherwise a single finger draws** — UNLESS `pencilOnly` is set, which
 *    is rule 2's entire exception; see below. Finger drawing still works for
 *    users without a Pencil.
 * 3. **Two or more fingers draw nothing** — that is a pinch, and the viewport
 *    listener owns it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `pencilOnly` — PENCIL-ONLY INPUT (2026-08-31)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Requested: "In pencil mode, it will assume ALL drawing/edits to the pixel
 * data can ONLY come from the pencil. Otherwise, if the button isn't selected,
 * it will assume it is just touch mode and it will behave how it currently
 * does with touch interactions working like normal."
 *
 * So `pencilOnly` deletes rule 2 and nothing else. A finger returns `null`
 * here, which means it puts no pixel down — and that is the ONLY thing it
 * means. Panning, pinching, and every button and slider are untouched, because
 * none of them consults this function: {@link pinchTouches} decides zooming
 * and it already ignores a stylus, while the rails are ordinary DOM. A hand
 * resting on the glass is exactly what this is for.
 *
 * ⚠️ IT IS OFF BY DEFAULT HERE, and the default is resolved far away. The
 * parameter defaults to `false` so every existing caller and every test keeps
 * the historical behaviour verbatim; the device-dependent default (ON where
 * there is a touch screen) is the container's business, not this pure
 * function's.
 *
 * ⚠️ A browser that does not report `touchType` sees every contact as a
 * finger, so `pencilOnly` there would disable drawing altogether. That is why
 * the toggle is only OFFERED on touch devices — see `HeaderContainer`.
 */
export function drawingTouch<T extends FilterableTouch>(
  touches: ReadonlyArray<T>,
  pencilOnly = false,
): T | null {
  const stylus = touches.find(isStylus);
  if (stylus) return stylus;

  // Pencil-only: a finger may pan and pinch, but it may not paint.
  if (pencilOnly) return null;

  const fingers = touches.filter((t) => !isStylus(t));
  return fingers.length === 1 ? (fingers[0] ?? null) : null;
}
