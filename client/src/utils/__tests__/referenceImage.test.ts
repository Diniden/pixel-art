/**
 * Unit tests for the reference-image GEOMETRY (REFRESH task 29, step 2).
 *
 * ⚠️ These functions could not be tested at all before this task. They lived in
 * `ReferenceImageModal.tsx` and read/wrote a module-level singleton, so any two
 * tests in one process shared state and the "current selection" could not be
 * set from a test without rendering the modal. Splitting the pure geometry out
 * is what makes the table below possible.
 *
 * Every assertion pins OBSERVED behaviour (MASTER.md §10 rule 10), including
 * the two asymmetries that look like bugs and are deliberately preserved:
 * `shiftedSelection` CLAMPS while `sizeSteppedSelection` REFUSES, and a nudge
 * normalises an inverted box while a resize preserves its corner order.
 */
import { describe, expect, it } from "vitest";
import {
  resizedSelection,
  shiftedSelection,
  sizeSteppedSelection,
  type ImageBounds,
  type ReferenceSelectionBox,
} from "@/utils/referenceImage";

const bounds: ImageBounds = { width: 100, height: 80 };

const box = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ReferenceSelectionBox => ({ startX, startY, endX, endY });

describe("shiftedSelection", () => {
  it("translates a box by (dx, dy) and preserves its size", () => {
    expect(shiftedSelection(box(10, 10, 20, 20), bounds, 5, 3)).toEqual(
      box(15, 13, 25, 23),
    );
  });

  it("CLAMPS at the left/top edge rather than refusing the move", () => {
    // Asked to move 50px left from x=10, it lands at 0 — not at -40, and not
    // refused. This is the documented difference from `sizeSteppedSelection`.
    expect(shiftedSelection(box(10, 10, 20, 20), bounds, -50, -50)).toEqual(
      box(0, 0, 10, 10),
    );
  });

  it("CLAMPS at the right/bottom edge, keeping the box fully inside", () => {
    // width 10 → max minX is 100-10 = 90; height 10 → max minY is 80-10 = 70.
    expect(shiftedSelection(box(10, 10, 20, 20), bounds, 500, 500)).toEqual(
      box(90, 70, 100, 80),
    );
  });

  it("NORMALISES an inverted box as a side effect of nudging it", () => {
    // The input's start is bottom-right of its end. The output is always built
    // top-left-first, so the corner order silently flips. Existing behaviour.
    expect(shiftedSelection(box(30, 30, 10, 10), bounds, 0, 0)).toEqual(
      box(10, 10, 30, 30),
    );
  });

  it("treats a zero-area box as movable (no special case)", () => {
    expect(shiftedSelection(box(5, 5, 5, 5), bounds, 2, 2)).toEqual(
      box(7, 7, 7, 7),
    );
  });
});

describe("sizeSteppedSelection", () => {
  it("jumps by exactly one reference width to the right", () => {
    expect(sizeSteppedSelection(box(0, 0, 10, 10), bounds, 1, 0, 10, 10)).toEqual(
      box(10, 0, 20, 10),
    );
  });

  it("REFUSES a partial step rather than clamping it", () => {
    // From minX=95 a 10px step would end at 105 > width 100. The whole point of
    // refusing is sprite-grid alignment: a clamped jump would misalign the box.
    expect(
      sizeSteppedSelection(box(95, 0, 100, 10), bounds, 1, 0, 10, 10),
    ).toBeNull();
  });

  it("REFUSES a step that would cross the top edge", () => {
    expect(
      sizeSteppedSelection(box(0, 0, 10, 10), bounds, 0, -1, 10, 10),
    ).toBeNull();
  });

  it("refuses on EITHER axis when a diagonal step only half-fits", () => {
    // X fits (0→10), Y does not (0→-10). Both must fit or the move is refused.
    expect(
      sizeSteppedSelection(box(0, 0, 10, 10), bounds, 1, -1, 10, 10),
    ).toBeNull();
  });

  it("steps by the REFERENCE size, which need not equal the box size", () => {
    // The box is 10 wide but the step is the reference width (4).
    expect(sizeSteppedSelection(box(0, 0, 10, 10), bounds, 1, 0, 4, 6)).toEqual(
      box(4, 0, 14, 10),
    );
  });
});

describe("resizedSelection", () => {
  it("grows the top edge upward by 1px", () => {
    expect(resizedSelection(box(10, 10, 20, 20), bounds, "up", true)).toEqual(
      box(10, 9, 20, 20),
    );
  });

  it("shrinks the top edge back down by 1px", () => {
    expect(resizedSelection(box(10, 10, 20, 20), bounds, "up", false)).toEqual(
      box(10, 11, 20, 20),
    );
  });

  it("grows and shrinks each of the other three edges", () => {
    expect(resizedSelection(box(10, 10, 20, 20), bounds, "down", true)).toEqual(
      box(10, 10, 20, 21),
    );
    expect(resizedSelection(box(10, 10, 20, 20), bounds, "left", true)).toEqual(
      box(9, 10, 20, 20),
    );
    expect(resizedSelection(box(10, 10, 20, 20), bounds, "right", true)).toEqual(
      box(10, 10, 21, 20),
    );
  });

  it("CLAMPS growth at the image edge instead of exceeding it", () => {
    expect(resizedSelection(box(0, 0, 10, 10), bounds, "up", true)).toEqual(
      box(0, 0, 10, 10),
    );
    expect(
      resizedSelection(box(0, 70, 10, 80), bounds, "down", true),
    ).toEqual(box(0, 70, 10, 80));
  });

  it("REFUSES a shrink that would collapse the box below 1x1", () => {
    // A 1px-tall box shrunk from the top would be 0px tall → null, so the
    // selection can never be reduced to nothing by the arrow buttons.
    expect(resizedSelection(box(10, 10, 20, 11), bounds, "up", false)).toBeNull();
    expect(resizedSelection(box(10, 10, 11, 20), bounds, "left", false)).toBeNull();
  });

  it("PRESERVES an inverted box's corner order, unlike a nudge", () => {
    // start is bottom-right here. Growing 'left' moves minX to 9, and because
    // the original was inverted the result puts maxX in `startX`. This is the
    // `startIsTopLeft` branch, and it is why a resize cannot be implemented by
    // normalising first.
    expect(resizedSelection(box(20, 20, 10, 10), bounds, "left", true)).toEqual(
      box(20, 20, 9, 10),
    );
  });
});
