/**
 * WHO owns the hover marker, per input device and gesture phase.
 *
 * ## Why this is a module and not three `if`s in the container
 *
 * The marker is written from four places in `CanvasContainer` — mouse move,
 * touch start, touch move, touch end — plus the bridged Pencil hover. The
 * rule they implement between them is not obvious, is asymmetric by device,
 * and has already been shipped WRONG once: the touch path cleared the marker
 * on start and end but never SET it on move, so the marker was permanently
 * null during a touch stroke. Nothing failed; the feature was simply invisible
 * on the hardware it mattered most for (2026-08-28).
 *
 * That bug was untestable where it lived, because the container needs a real
 * canvas and a full store to mount. Expressing the decision as a pure function
 * makes it assertable, so the same mistake fails a test instead of shipping.
 *
 * ## The rule, and why it is asymmetric
 *
 * A MOUSE leaves the cells visible and puts an OS cursor on them, so a marker
 * during a drag only doubles what the stroke already shows → cleared.
 *
 * A FINGER or PENCIL TIP covers the cells it is painting, so during a touch
 * stroke the marker is the only indication of where the edit is landing. It
 * matters most for the eraser, which paints nothing to look at: without the
 * marker there is no feedback under the hand at all → tracked.
 *
 * Pure: no store, no MobX, no DOM.
 */

/** Which device produced the event. */
export type MarkerDevice = "mouse" | "touch" | "pencil-hover";

/** The gesture phase the event belongs to. */
export type MarkerPhase = "start" | "move" | "end";

export interface MarkerDecisionInput {
  device: MarkerDevice;
  phase: MarkerPhase;
  /** True when a stroke is in flight. */
  isDrawing: boolean;
}

/**
 * What the marker should do for this event.
 *
 * - `"track"` — set it to the cell under the pointer.
 * - `"clear"` — set it to null.
 * - `"ignore"` — leave it alone; another writer owns it right now.
 */
export type MarkerAction = "track" | "clear" | "ignore";

export function markerAction({
  device,
  phase,
  isDrawing,
}: MarkerDecisionInput): MarkerAction {
  // A gesture that has ended never leaves a marker behind, on any device:
  // there is no resting pointer position to mark, and a leftover marker reads
  // as a selection rather than as a cursor.
  if (phase === "end") return "clear";

  if (device === "mouse") {
    // Cleared during a stroke — the cursor and the stroke are feedback enough.
    return isDrawing ? "clear" : "track";
  }

  if (device === "touch") {
    // ⚠️ THE CASE THAT REGRESSED. Touch tracks THROUGH the stroke; it does not
    // clear on `isDrawing` the way the mouse does. `start` still clears, so a
    // tap that never moves does not leave a stale pre-touch marker offset from
    // where the tap landed.
    return phase === "start" ? "clear" : "track";
  }

  // Bridged Pencil hover. Suppressed while a stroke is in flight so exactly
  // ONE writer owns the marker: during a stroke the touch handlers own it, and
  // the airborne tip disagrees with the contact point whenever the pencil is
  // tilted — two writers would show as jitter between two cells.
  return isDrawing ? "ignore" : "track";
}
