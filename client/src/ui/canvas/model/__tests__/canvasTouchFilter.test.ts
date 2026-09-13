/**
 * `canvasTouchFilter` — which contacts count, and which one draws.
 *
 * ⭐ The starred tests encode the 2026-08-28 "unable to slide and draw"
 * report: drawing with the Pencil while ONE finger touched the screen did
 * nothing, because every guard counted CONTACTS and a stylus-plus-finger pair
 * read as a two-finger pinch.
 */
import { describe, expect, it } from "vitest";
import {
  drawingTouch,
  isStylus,
  pinchTouches,
  touchesInContainer,
} from "../canvasTouchFilter";

const containerOf = (inside: unknown[]) => ({
  contains: (n: never) => inside.includes(n),
});

const CANVAS = { id: "canvas" };
const VIEW_CONTROL = { id: "view-control" };
const RAIL_SLIDER = { id: "rail-slider" };

const pencil = (target: unknown = CANVAS) => ({
  target,
  touchType: "stylus",
});
const finger = (target: unknown = CANVAS) => ({
  target,
  touchType: "direct",
});

describe("touchesInContainer — WHERE a touch is", () => {
  it("⭐ counts a finger on the floating controls: inside the viewport, outside the canvas", () => {
    // `targetTouches` missed this, so the React handler saw one contact while
    // the pinch listener saw two, and they disagreed.
    const viewport = containerOf([CANVAS, VIEW_CONTROL]);
    const touches = [finger(CANVAS), finger(VIEW_CONTROL)];
    expect(touchesInContainer(touches, viewport)).toHaveLength(2);
  });

  it("excludes a finger on a rail outside the viewport", () => {
    const viewport = containerOf([CANVAS, VIEW_CONTROL]);
    const kept = touchesInContainer([finger(CANVAS), finger(RAIL_SLIDER)], viewport);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.target).toBe(CANVAS);
  });

  it("falls back to every touch when the container is not mounted yet", () => {
    expect(touchesInContainer([finger(), finger(RAIL_SLIDER)], null)).toHaveLength(2);
  });
});

describe("pinchTouches — a pinch is two FINGERS", () => {
  it("⭐ a pencil and one finger are NOT a pinch", () => {
    // THE REGRESSION. Two contacts, but only one finger — this must not read
    // as a pinch, or `isPinching()` goes true and every stroke is discarded.
    expect(pinchTouches([pencil(), finger()])).toHaveLength(1);
  });

  it("two fingers ARE a pinch", () => {
    expect(pinchTouches([finger(), finger()])).toHaveLength(2);
  });

  it("a pencil and several resting fingers still leave only the fingers", () => {
    expect(pinchTouches([pencil(), finger(), finger()])).toHaveLength(2);
  });
});

describe("drawingTouch — which contact draws", () => {
  it("⭐ the pencil draws even with a finger down", () => {
    // The exact reported gesture: holding the Pencil with one finger also
    // touching. The Pencil must win; the finger must not veto it.
    const p = pencil();
    expect(drawingTouch([p, finger()])).toBe(p);
  });

  it("the pencil wins regardless of contact order", () => {
    const p = pencil();
    expect(drawingTouch([finger(), p])).toBe(p);
  });

  it("a lone finger draws, so finger-only users still work", () => {
    const f = finger();
    expect(drawingTouch([f])).toBe(f);
  });

  it("two fingers draw nothing — that is a pinch", () => {
    expect(drawingTouch([finger(), finger()])).toBeNull();
  });

  it("no touches draw nothing", () => {
    expect(drawingTouch([])).toBeNull();
  });
});

describe("isStylus — degradation on browsers without touchType", () => {
  it("treats a touch with no touchType as a finger", () => {
    // `touchType` is a WebKit extension. Elsewhere every touch reads as a
    // finger, which degrades to the old count-everything behaviour rather
    // than breaking drawing outright.
    expect(isStylus({ target: CANVAS })).toBe(false);
    expect(drawingTouch([{ target: CANVAS }])).not.toBeNull();
  });
});

/**
 * Pencil-only input (2026-08-31).
 *
 * Requested: "In pencil mode, it will assume ALL drawing/edits to the pixel
 * data can ONLY come from the pencil. Otherwise ... it will behave how it
 * currently does with touch interactions working like normal."
 */
describe("⭐ pencilOnly — only the Pencil may paint", () => {
  const finger = { target: null, touchType: "direct" };
  const pencil = { target: null, touchType: "stylus" };

  it("a lone finger draws NOTHING when it is on", () => {
    expect(drawingTouch([finger], true)).toBeNull();
  });

  it("the Pencil still draws, through any number of resting fingers", () => {
    // The hand on the glass is the whole reason this mode exists.
    expect(drawingTouch([pencil], true)).toBe(pencil);
    expect(drawingTouch([finger, pencil], true)).toBe(pencil);
    expect(drawingTouch([finger, finger, pencil, finger], true)).toBe(pencil);
  });

  it("two fingers still draw nothing — that was already a pinch", () => {
    expect(drawingTouch([finger, finger], true)).toBeNull();
  });

  it("⭐ OFF is the historical behaviour, verbatim", () => {
    // The owner's "behave how it currently does" half. Every case must match
    // what the function did before the parameter existed.
    expect(drawingTouch([finger], false)).toBe(finger);
    expect(drawingTouch([finger, pencil], false)).toBe(pencil);
    expect(drawingTouch([finger, finger], false)).toBeNull();
    expect(drawingTouch([], false)).toBeNull();
  });

  it("⭐ DEFAULTS to off, so no existing caller changes behaviour", () => {
    // The parameter is opt-in: every call site that does not pass it — the
    // pan and hover-marker lookups in `CanvasContainer` among them — keeps
    // finger input exactly as it was.
    expect(drawingTouch([finger])).toBe(finger);
    expect(drawingTouch([finger, pencil])).toBe(pencil);
  });

  it("does NOT affect what counts as a pinch", () => {
    // Pencil-only removes finger DRAWING and nothing else: panning and
    // zooming go through `pinchTouches`, which never consulted this flag.
    expect(pinchTouches([finger, finger])).toHaveLength(2);
    expect(pinchTouches([finger, pencil])).toHaveLength(1);
  });
});
